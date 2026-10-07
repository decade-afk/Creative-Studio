/**
 * WriterView - 创作视图组件（重构版）
 *
 * 【核心功能】
 * 1. 剧本/小说编辑器 - contentEditable 实现的富文本编辑，支持中文输入法
 * 2. 实时自动保存 - 防抖保存（2秒延迟），切换章节前自动保存
 * 3. 作品和章节管理 - 完整的 CRUD 操作（创建/删除），带确认对话框
 * 4. 导出功能 - 支持多种格式（TXT、Markdown、PDF、FDX等）
 * 5. AI智能分镜 - 侧边栏展示分镜预览
 * 6. 移动端预览 - 模拟手机端对话式短剧效果
 *
 * 【技术要点】
 * - 数据库：SQLite 本地存储，软删除模式，支持未来云同步
 * - 自动保存：使用 ref 保存定时器，避免闭包陷阱
 * - 中文输入：处理 compositionstart/end 事件，避免输入法干扰
 * - 竞态条件：使用 isCancelled 标志防止快速切换时的异步冲突
 * - Toast 通知：替代原生 alert，提供更好的用户体验
 * - 确认对话框：危险操作（删除）需要二次确认，防止误操作
 * - 状态管理：使用 Zustand store 管理全局状态
 *
 * 【状态管理】
 * - 使用 writerStore (Zustand) 管理所有状态
 * - 数据状态：works, chapters, currentWorkId, currentChapterId
 * - UI 状态：showDrawer, showExportDialog, deletingItem, sidebarWidth
 * - 编辑器状态：content, wordCount, isComposing, shouldSyncContent
 *
 * 【重要注意事项】
 * 1. 切换章节前会自动触发保存，避免内容丢失
 * 2. 删除作品会级联删除所有章节（数据库外键约束 ON DELETE CASCADE）
 * 3. 删除当前作品/章节会自动切换到列表中的其他项
 * 4. useEffect 的依赖数组经过仔细设计，避免无限循环和闭包陷阱
 * 5. showToast 和 hideToast 使用 useCallback 包裹，引用保持稳定
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import type { WorkType } from '../types/storage';
import type { ExportFormat } from '../types/export';
import { getWorks, createWork, deleteWork } from '../services/workService';
import { getChaptersByWorkId, updateChapter, createChapter, deleteChapter } from '../services/chapterService';
import { exportWork, getWorkExportFormats } from '../services/exportService';
import { getDatabase } from '../services/database';
import { loadConfig, updateConfig } from '../services/configService';

import { useWriterStore } from '../stores/writerStore';
import WriterSidebar from '../components/WriterSidebar';
import WriterEditor from '../components/WriterEditor';
import WriterTopBar from '../components/WriterTopBar';
import AiAssistantPanel from '../components/AiAssistantPanel';
import StoryboardPanel from '../components/StoryboardPanel';
import VersionsDialog from '../components/VersionsDialog';
import { useToast } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';

// 组件属性接口
interface WriterViewProps {
  showSidebar: boolean;              // 侧边栏显示状态（由父组件控制）
  onToggleSidebar: () => void;       // 切换侧边栏的回调（保留以保持接口兼容性）
}

/**
 * WriterView - 创作视图组件
 * 主要功能：剧本/小说编辑、实时预览、AI分镜
 *
 * 集成了本地存储功能：
 * - 从SQLite数据库加载作品和章节
 * - 自动保存编辑内容到数据库
 * - 支持导出为多种格式
 *
 * 状态管理：使用 writerStore (Zustand)
 * UI 组件：WriterSidebar, WriterEditor, WriterTopBar
 */
export default function WriterView({ showSidebar: externalShowSidebar, onToggleSidebar: _ }: WriterViewProps) {
  // ========== 使用 Zustand Store 管理状态 ==========
  const {
    // 数据状态
    chapters,
    currentWorkId,
    currentChapterId,
    exportProgress,
    deletingItem,
    dbReady,

    // UI 状态
    showDrawer,
    showExportDialog,
    showNewWorkDialog,
    showNewChapterDialog,
    showAiPanel,
    selectedIcon,

    // 编辑器状态
    content: editorContent,
    shouldSyncContent,

    // Setters
    setWorks,
    setChapters,
    setCurrentWorkId,
    setCurrentChapterId,
    setDbReady,
    setExportProgress,
    setDeletingItem,
    setShowDrawer,
    setShowExportDialog,
    setShowNewWorkDialog,
    setShowNewChapterDialog,
    setShowAiPanel,
    toggleAiPanel,
    setSelectedIcon,
    setEditorContent,
    setWordCount,
    setShouldSyncContent,

    // 计算属性
    getCurrentWork,
  } = useWriterStore();

  // ========== 本地 Ref ==========
  // 编辑器DOM引用（用于直接操作）
  const editorRef = useRef<HTMLDivElement>(null);
  // 自动保存定时器
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Toast 通知
    const { showToast, ToastComponent } = useToast();

  // 版本历史对话框
  const [showVersionsDialog, setShowVersionsDialog] = useState(false);
  
  /**
     * 计算字数
     *
     * 使用 useCallback 优化：避免每次渲染都重新创建函数，
     * 确保依赖此函数的 useCallback 和 useEffect 的依赖数组稳定。
     */  const calculateWordCount = useCallback((content: string): number => {
    // 移除HTML标签
    const text = content.replace(/<[^>]*>/g, '');
    // 中文字符
    const chineseChars = text.match(/[\u4e00-\u9fa5]/g) || [];
    // 英文单词
    const englishWords = text.match(/[a-zA-Z]+/g) || [];
    return chineseChars.length + englishWords.length;
  }, []); // 空依赖数组：此函数不依赖任何外部状态

  /**
   * 初始化数据库并加载数据
   * 在组件挂载时执行
   *
   * 清理函数：组件卸载时清除自动保存定时器
   */
  useEffect(() => {
    async function initializeData() {
      try {
        // 1. 初始化数据库
        console.log('📦 正在初始化数据库...');
        await getDatabase();
        console.log('✅ 数据库初始化成功');
        setDbReady(true);

        // 2. 加载作品列表
        console.log('📚 正在加载作品列表...');
        const loadedWorks = await getWorks();
        setWorks(loadedWorks);
        console.log(`✅ 加载了 ${loadedWorks.length} 个作品`);

        // 3. 优先恢复上次打开的作品，否则选中第一个
        if (loadedWorks.length > 0) {
          let targetWork = loadedWorks[0];
          try {
            const config = await loadConfig();
            const lastWork = config.lastOpenedWorkId
              ? loadedWorks.find((w) => w.id === config.lastOpenedWorkId)
              : undefined;
            if (lastWork) targetWork = lastWork;
          } catch {
            // 配置读取失败时回退到第一个作品，不阻塞初始化
          }
          setCurrentWorkId(targetWork.id);

          // 4. 加载目标作品的章节
          const loadedChapters = await getChaptersByWorkId(targetWork.id);
          setChapters(loadedChapters);
          console.log(`✅ 加载了 ${loadedChapters.length} 个章节`);

          // 5. 如果有章节，选中第一个并加载内容
          if (loadedChapters.length > 0) {
            const firstChapter = loadedChapters[0];
            setCurrentChapterId(firstChapter.id);
            setShouldSyncContent(true); // 标记需要同步内容
            setEditorContent(firstChapter.content || '');
            setWordCount(calculateWordCount(firstChapter.content || ''));
          }
        }
      } catch (error) {
        console.error('❌ 初始化失败:', error);
        showToast('初始化失败', 'error');
      }
    }

    initializeData();

    // 清理函数：组件卸载时清除定时器
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // showToast 通过 useCallback 保持稳定，可以安全忽略

  /**
   * 当前作品变化时，将其持久化到配置文件的 lastOpenedWorkId
   * 下次启动时由 initializeData 恢复
   *
   * 【说明】
   * - 等待 dbReady，避免数据库尚未就绪时的空 currentWorkId 触发写入
   * - 写入失败只记录警告，不影响创作流程
   */
  useEffect(() => {
    if (!dbReady || !currentWorkId) return;

    updateConfig({ lastOpenedWorkId: currentWorkId }).catch((error) => {
      console.warn('⚠️ 保存最近打开作品失败:', error);
    });
  }, [dbReady, currentWorkId]);

  /**
   * Ctrl+S 立即保存（App 级快捷键派发 creative-studio:save 事件）
   */
  useEffect(() => {
    const handler = async () => {
      if (editorRef.current && currentChapterId) {
        try {
          await updateChapter(currentChapterId, { content: editorRef.current.innerHTML });
          showToast('已保存', 'success');
        } catch (error) {
          console.error('手动保存失败:', error);
          showToast('保存失败', 'error');
        }
      }
    };
    window.addEventListener('creative-studio:save', handler as EventListener);
    return () => window.removeEventListener('creative-studio:save', handler as EventListener);
    // showToast 稳定，editorRef 为引用
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChapterId]);

  /**
   * 当切换作品时，加载对应的章节
   * 使用isCancelled标志防止竞态条件
   */
  useEffect(() => {
    // 防止竞态条件：如果快速切换作品，旧的异步操作不应该更新状态
    let isCancelled = false;

    async function loadChapters() {
      if (!currentWorkId) {
        // 清空章节和编辑器
        setChapters([]);
        setCurrentChapterId('');
        setEditorContent('');
        return;
      }

      try {
        const loadedChapters = await getChaptersByWorkId(currentWorkId);

        // 检查在异步操作期间是否已切换到其他作品
        if (isCancelled) {
          console.log('⚠️ 加载被取消（作品已切换）');
          return;
        }

        setChapters(loadedChapters);

        // 选中第一个章节
                  if (loadedChapters.length > 0) {
                    const firstChapter = loadedChapters[0];
                    setCurrentChapterId(firstChapter.id);
                    setShouldSyncContent(true); // 标记需要同步内容
                    setEditorContent(firstChapter.content || '');
                    setWordCount(calculateWordCount(firstChapter.content || ''));
                  } else {
                    setCurrentChapterId('');
                    setShouldSyncContent(true); // 清空内容时也需要同步
                    setEditorContent('');
                    setWordCount(0);
                  }      } catch (error) {
        if (!isCancelled) {
          console.error('❌ 加载章节失败:', error);
          showToast('加载章节失败', 'error');
        }
      }
    }

    loadChapters();

    // 清理函数：标记操作已取消
    return () => {
      isCancelled = true;
    };
  }, [currentWorkId, showToast]);

  /**
   * 切换章节
   * 在切换前先保存当前章节（如果有待保存的更改）
   * 使用 useCallback 优化性能
   */
  const handleChapterChange = useCallback(async (chapterId: string) => {
    // 如果有待保存的定时器，立即执行保存
    if (saveTimerRef.current && currentChapterId && editorRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;

      try {
        const content = editorRef.current.innerHTML;
        await updateChapter(currentChapterId, { content });
        console.log('💾 切换前自动保存成功');
      } catch (error) {
        console.error('❌ 切换前保存失败:', error);
      }
    }

    // 加载新章节
    const chapter = chapters.find(ch => ch.id === chapterId);
    if (chapter) {
      setCurrentChapterId(chapter.id);
      setShouldSyncContent(true); // 标记需要同步内容
      setEditorContent(chapter.content || '');
      // 更新字数统计
      setWordCount(calculateWordCount(chapter.content || ''));
    }
  }, [chapters, currentChapterId, calculateWordCount, setCurrentChapterId, setShouldSyncContent, setEditorContent, setWordCount]);

  /**
   * 新建作品
   * 使用 useCallback 优化性能
   */
  const handleCreateWork = useCallback(async (title: string, type: WorkType, icon: string) => {
    try {
      const newWork = await createWork(title, type, icon);

      // 重新加载作品列表
      const loadedWorks = await getWorks();
      setWorks(loadedWorks);

      // 自动选中新建的作品
      setCurrentWorkId(newWork.id);
      setChapters([]);
      setCurrentChapterId('');
      setShouldSyncContent(true);
      setEditorContent('');
      setWordCount(0);

      setShowNewWorkDialog(false);
      showToast(`作品「${newWork.title}」创建成功`, 'success');
    } catch (error: any) {
      console.error('❌ 创建作品失败:', error);
      showToast(`创建作品失败: ${error.message}`, 'error');
    }
  }, [showToast, calculateWordCount, setWorks, setCurrentWorkId, setChapters, setCurrentChapterId, setShouldSyncContent, setEditorContent, setWordCount, setShowNewWorkDialog]);

  /**
   * 新建章节
   * 使用 useCallback 优化性能
   */
  const handleCreateChapter = useCallback(async (title: string) => {
    if (!currentWorkId) {
      showToast('请先选择一个作品', 'warning');
      return;
    }

    try {
      // 计算新章节的顺序
      const nextOrder = chapters.length > 0
        ? Math.max(...chapters.map(c => c.order)) + 1
        : 1;

      const newChapter = await createChapter(currentWorkId, title, '', nextOrder);

      // 重新加载章节列表
      const loadedChapters = await getChaptersByWorkId(currentWorkId);
      setChapters(loadedChapters);

      // 自动选中新建的章节
      setCurrentChapterId(newChapter.id);
      setShouldSyncContent(true);
      setEditorContent('');
      setWordCount(0);

      setShowNewChapterDialog(false);
      showToast(`章节「${newChapter.title}」创建成功`, 'success');
    } catch (error: any) {
      console.error('❌ 创建章节失败:', error);
      showToast(`创建章节失败: ${error.message}`, 'error');
    }
  }, [currentWorkId, chapters, showToast, setChapters, setCurrentChapterId, setShouldSyncContent, setEditorContent, setWordCount, setShowNewChapterDialog]);

  /**
   * 确认删除
   * 使用 useCallback 优化性能
   */
  const handleConfirmDelete = useCallback(async () => {
    if (!deletingItem) return;

    try {
      if (deletingItem.type === 'work') {
        await deleteWork(deletingItem.id);

        // 重新加载作品列表
        const loadedWorks = await getWorks();
        setWorks(loadedWorks);

        // 如果删除的是当前作品，切换到另一个作品或清空编辑器
        if (deletingItem.id === currentWorkId) {
          if (loadedWorks.length > 0) {
            // 切换到第一个作品
            const newWork = loadedWorks[0];
            setCurrentWorkId(newWork.id);

            // 立即加载新作品的章节（不依赖 useEffect，更可靠）
            const newChapters = await getChaptersByWorkId(newWork.id);
            setChapters(newChapters);

            // 选中第一个章节（如果有）
            if (newChapters.length > 0) {
              const firstChapter = newChapters[0];
              setCurrentChapterId(firstChapter.id);
              setShouldSyncContent(true);
              setEditorContent(firstChapter.content || '');
              setWordCount(calculateWordCount(firstChapter.content || ''));
            } else {
              // 没有章节，清空编辑器
              setCurrentChapterId('');
              setShouldSyncContent(true);
              setEditorContent('');
              setWordCount(0);
            }
            showToast(`作品已删除，已切换到「${newWork.title}」`, 'success');
          } else {
            // 没有剩余作品，完全清空
            setCurrentWorkId('');
            setChapters([]);
            setCurrentChapterId('');
            setShouldSyncContent(true);
            setEditorContent('');
            setWordCount(0);
            showToast('作品已删除，已清空编辑器', 'success');
          }
        } else {
          // 删除的不是当前作品，只显示删除成功
          showToast('作品已删除', 'success');
        }
      } else if (deletingItem.type === 'chapter') {
        await deleteChapter(deletingItem.id);

        // 重新加载章节列表
        const loadedChapters = await getChaptersByWorkId(currentWorkId);
        setChapters(loadedChapters);

        // 如果删除的是当前章节，切换到第一个章节
        if (deletingItem.id === currentChapterId) {
          if (loadedChapters.length > 0) {
            const firstChapter = loadedChapters[0];
            setCurrentChapterId(firstChapter.id);
            setShouldSyncContent(true);
            setEditorContent(firstChapter.content || '');
            setWordCount(calculateWordCount(firstChapter.content || ''));
            showToast(`章节已删除，已切换到「${firstChapter.title}」`, 'success');
          } else {
            setCurrentChapterId('');
            setShouldSyncContent(true);
            setEditorContent('');
            setWordCount(0);
            showToast('章节已删除，当前作品无剩余章节', 'success');
          }
        } else {
          // 删除的不是当前章节
          showToast('章节已删除', 'success');
        }
      }
    } catch (error: any) {
      console.error('❌ 删除失败:', error);
      showToast(`删除失败: ${error.message}`, 'error');
    } finally {
      setDeletingItem(null);
    }
  }, [deletingItem, currentWorkId, currentChapterId, showToast, calculateWordCount, setWorks, setCurrentWorkId, setChapters, setCurrentChapterId, setShouldSyncContent, setEditorContent, setWordCount, setDeletingItem]);



  /**
   * 处理导出
   * 使用 useCallback 优化性能
   */
  const handleExport = useCallback(async (format: ExportFormat) => {
    if (!currentWorkId) {
      showToast('请先选择一个作品', 'warning');
      return;
    }

    try {
      setExportProgress({ step: '正在准备导出...', progress: 0 });

      const result = await exportWork(
        {
          workId: currentWorkId,
          format,
          includeTOC: true,
        },
        (progress) => {
          setExportProgress(progress);
        }
      );

      setExportProgress(null);

      if (result.success) {
        showToast(`导出成功！文件路径: ${result.filePath}`, 'success');
      } else {
        showToast(`导出失败: ${result.error}`, 'error');
      }

      setShowExportDialog(false);
    } catch (error: any) {
      console.error('❌ 导出失败:', error);
      showToast(`导出失败: ${error.message}`, 'error');
      setExportProgress(null);
    }
  }, [currentWorkId, showToast, setExportProgress, setShowExportDialog]);

  /**
   * 当editorContent状态更新时，同步到DOM
   * 只在外部更新（如切换章节、初始加载）时同步，避免在用户输入时干扰
   */
  useEffect(() => {
    if (editorRef.current && shouldSyncContent) {
      editorRef.current.innerHTML = editorContent;
      setShouldSyncContent(false); // 重置标志
    }
  }, [editorContent, shouldSyncContent, setShouldSyncContent]);

  // 获取当前作品数据
  const currentWorkData = getCurrentWork();
  // 获取当前作品支持的导出格式
  const exportFormats = currentWorkData ? getWorkExportFormats(currentWorkData) : [];

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Toast Notification */}
      {ToastComponent}

      {/* 版本历史对话框 */}
      {showVersionsDialog && (
        <VersionsDialog
          onClose={() => setShowVersionsDialog(false)}
          onRestored={(content) => {
            setEditorContent(content);
            setShouldSyncContent(true);
            setWordCount(calculateWordCount(content));
          }}
        />
      )}

      {/* Confirm Dialog */}
      {deletingItem && (
        <ConfirmDialog
          title={deletingItem.type === 'work' ? '删除作品' : '删除章节'}
          message={
            deletingItem.type === 'work'
              ? '确定要删除这个作品吗？作品下的所有章节也将被删除。此操作不可恢复。'
              : '确定要删除这个章节吗？此操作不可恢复。'
          }
          type="danger"
          confirmText="删除"
          cancelText="取消"
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeletingItem(null)}
        />
      )}

      {/* WriterSidebar Component */}
      <WriterSidebar
        showSidebar={externalShowSidebar}
        onCreateWork={() => {
          setSelectedIcon('');
          setShowNewWorkDialog(true);
        }}
        onCreateChapter={() => setShowNewChapterDialog(true)}
        onChapterChange={handleChapterChange}
        onWorkChange={(workId) => setCurrentWorkId(workId)}
        onDeleteWork={(workId) => setDeletingItem({ type: 'work', id: workId })}
      />

      {/* Editor Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* WriterTopBar Component */}
        <WriterTopBar
          onToggleDrawer={() => setShowDrawer(!showDrawer)}
          onShowExportDialog={() => setShowExportDialog(true)}
          onToggleAiPanel={toggleAiPanel}
          onShowVersions={() => setShowVersionsDialog(true)}
          aiPanelOpen={showAiPanel}
        />

        {/* Main Content Area */}
        <div className="flex-1 flex overflow-hidden relative">
          {/* WriterEditor Component */}
          <WriterEditor
            editorRef={editorRef}
            onSave={async (content) => {
              if (currentChapterId) {
                await updateChapter(currentChapterId, { content });
                console.log('💾 章节已自动保存');
              }
            }}
          />

          {/* AI 创作助手面板 */}
          {showAiPanel && (
            <AiAssistantPanel
              editorRef={editorRef}
              onClose={() => setShowAiPanel(false)}
            />
          )}

          {/* AI 分镜抽屉 */}
          {showDrawer && (
            <StoryboardPanel editorRef={editorRef} onClose={() => setShowDrawer(false)} />
          )}
        </div>
      </div>

      {/* Export Dialog */}
      {showExportDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-2xl w-[500px] max-h-[80vh] overflow-auto">
            {/* Dialog Header */}
            <div className="p-6 border-b border-[#e5ddd2]">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-[#38342e]">导出作品</h2>
                <button
                  onClick={() => setShowExportDialog(false)}
                  className="text-[#7a6e5f] hover:text-[#38342e]"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Dialog Content */}
            <div className="p-6">
              {/* Work Info */}
              <div className="mb-6">
                <div className="text-sm text-[#7a6e5f] mb-1">作品</div>
                <div className="text-base font-medium text-[#38342e]">
                  {currentWorkData?.icon} {currentWorkData?.title}
                </div>
                <div className="text-sm text-[#9a8c79] mt-1">
                  {chapters.length} 个章节
                </div>
              </div>

              {/* Export Formats */}
              <div className="mb-6">
                <div className="text-sm font-semibold text-[#38342e] mb-3">选择导出格式</div>
                <div className="grid grid-cols-2 gap-3">
                  {exportFormats.map((formatInfo) => (
                    <button
                      key={formatInfo.format}
                      onClick={() => handleExport(formatInfo.format as ExportFormat)}
                      className="p-4 border-2 border-[#e5ddd2] rounded-lg hover:border-primary-400 hover:bg-primary-50 transition-all text-left"
                      disabled={!!exportProgress}
                    >
                      <div className="text-2xl mb-2">{formatInfo.icon}</div>
                      <div className="text-sm font-semibold text-[#38342e] mb-1">
                        {formatInfo.displayName}
                      </div>
                      <div className="text-xs text-[#9a8c79]">
                        {formatInfo.description}
                      </div>
                      {formatInfo.isProfessional && (
                        <div className="mt-2 inline-block px-2 py-0.5 bg-primary-100 text-primary-700 text-xs rounded">
                          专业格式
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Export Progress */}
              {exportProgress && (
                <div className="mb-4 p-4 bg-primary-50 rounded-lg">
                  <div className="text-sm text-[#38342e] mb-2">{exportProgress.step}</div>
                  <div className="w-full h-2 bg-white rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary-500 transition-all duration-300"
                      style={{ width: `${exportProgress.progress}%` }}
                    />
                  </div>
                  <div className="text-xs text-[#7a6e5f] mt-1 text-right">
                    {exportProgress.progress}%
                  </div>
                </div>
              )}
            </div>

            {/* Dialog Footer */}
            <div className="p-6 border-t border-[#e5ddd2] flex justify-end gap-3">
              <button
                onClick={() => setShowExportDialog(false)}
                className="btn"
                disabled={!!exportProgress}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Work Dialog */}
      {showNewWorkDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-2xl w-[500px]">
            {/* Dialog Header */}
            <div className="p-6 border-b border-[#e5ddd2]">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-[#38342e]">新建作品</h2>
                <button
                  onClick={() => {
                    setShowNewWorkDialog(false);
                    setSelectedIcon('');
                  }}
                  className="text-[#7a6e5f] hover:text-[#38342e]"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Dialog Content */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const title = formData.get('title') as string;
                const type = formData.get('type') as WorkType;
                const icon = selectedIcon || (type === 'script' ? '🎬' : '📚');
                if (title.trim()) {
                  handleCreateWork(title, type, icon);
                  setSelectedIcon('');
                }
              }}
            >
              <div className="p-6 space-y-4">
                {/* Title */}
                <div>
                  <label className="block text-sm font-medium text-[#38342e] mb-2">作品标题</label>
                  <input
                    type="text"
                    name="title"
                    className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400"
                    placeholder="请输入作品标题"
                    required
                    autoFocus
                  />
                </div>

                {/* Type */}
                <div>
                  <label className="block text-sm font-medium text-[#38342e] mb-2">作品类型</label>
                  <div className="flex gap-3">
                    <label className="flex-1 flex items-center gap-2 p-3 border-2 border-[#e5ddd2] rounded-lg cursor-pointer hover:border-primary-400 has-[:checked]:border-primary-500 has-[:checked]:bg-primary-50">
                      <input type="radio" name="type" value="script" defaultChecked className="text-primary-500" />
                      <span className="text-2xl">🎬</span>
                      <span className="text-sm font-medium">短剧剧本</span>
                    </label>
                    <label className="flex-1 flex items-center gap-2 p-3 border-2 border-[#e5ddd2] rounded-lg cursor-pointer hover:border-primary-400 has-[:checked]:border-primary-500 has-[:checked]:bg-primary-50">
                      <input type="radio" name="type" value="novel" className="text-primary-500" />
                      <span className="text-2xl">📚</span>
                      <span className="text-sm font-medium">小说</span>
                    </label>
                  </div>
                </div>

                {/* Icon (Optional) */}
                <div>
                  <label className="block text-sm font-medium text-[#38342e] mb-2">图标（可选）</label>
                  <input
                    type="hidden"
                    name="icon"
                    value={selectedIcon}
                  />
                  <div className="grid grid-cols-8 gap-2 p-3 border border-[#e5ddd2] rounded-lg bg-[#faf8f6]">
                    {[
                      '🎬', '📚', '✨', '📝', '🎭', '🎨', '📖', '✍️',
                      '🎪', '🎯', '🎲', '🎰', '🎮', '🎻', '🎺', '🎸',
                      '🎤', '🎧', '🎵', '🎶', '📜', '📋', '📄', '📃',
                      '📰', '📑', '🔖', '🏷️', '💡', '🌟', '⭐', '🌙'
                    ].map(icon => (
                      <button
                        key={icon}
                        type="button"
                        onClick={() => setSelectedIcon(icon)}
                        className={`text-2xl p-2 rounded-lg hover:bg-primary-100 transition-colors ${
                          selectedIcon === icon
                            ? 'bg-primary-200 ring-2 ring-primary-500'
                            : 'hover:scale-110'
                        }`}
                        title={icon}
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-[#9a8c79] mt-2">
                    {selectedIcon ? `已选择: ${selectedIcon}` : '点击选择图标，或留空使用默认图标'}
                  </p>
                </div>
              </div>

              {/* Dialog Footer */}
              <div className="p-6 border-t border-[#e5ddd2] flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowNewWorkDialog(false);
                    setSelectedIcon('');
                  }}
                  className="btn"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                >
                  创建
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Chapter Dialog */}
      {showNewChapterDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-2xl w-[500px]">
            {/* Dialog Header */}
            <div className="p-6 border-b border-[#e5ddd2]">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-[#38342e]">新建章节</h2>
                <button
                  onClick={() => setShowNewChapterDialog(false)}
                  className="text-[#7a6e5f] hover:text-[#38342e]"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Dialog Content */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const title = formData.get('title') as string;
                if (title.trim()) {
                  handleCreateChapter(title);
                }
              }}
            >
              <div className="p-6">
                {/* Current Work Info */}
                <div className="mb-4 p-3 bg-[#f2ede7] rounded-lg">
                  <div className="text-xs text-[#7a6e5f] mb-1">当前作品</div>
                  <div className="text-sm font-medium text-[#38342e]">
                    {currentWorkData?.icon} {currentWorkData?.title}
                  </div>
                </div>

                {/* Title */}
                <div>
                  <label className="block text-sm font-medium text-[#38342e] mb-2">章节标题</label>
                  <input
                    type="text"
                    name="title"
                    className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400"
                    placeholder="请输入章节标题"
                    required
                    autoFocus
                  />
                </div>
              </div>

              {/* Dialog Footer */}
              <div className="p-6 border-t border-[#e5ddd2] flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowNewChapterDialog(false)}
                  className="btn"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                >
                  创建
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
