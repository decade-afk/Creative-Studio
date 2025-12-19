/**
 * WriterView - 创作视图组件（完整重构版）
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
 *
 * 【状态管理】
 * - 数据状态：works（作品列表）, chapters（章节列表）, currentWorkId, currentChapterId
 * - UI 状态：showDrawer, showExportDialog, deletingItem, sidebarWidth
 * - 编辑器状态：editorContent, wordCount, isComposing（输入法状态）, shouldSyncContent（同步标志）
 *
 * 【重要注意事项】
 * 1. 切换章节前会自动触发保存，避免内容丢失
 * 2. 删除作品会级联删除所有章节（数据库外键约束 ON DELETE CASCADE）
 * 3. 删除当前作品/章节会自动切换到列表中的其他项
 * 4. useEffect 的依赖数组经过仔细设计，避免无限循环和闭包陷阱
 * 5. showToast 和 hideToast 使用 useCallback 包裹，引用保持稳定
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import type { Work, Chapter, WorkType } from '../types/storage';
import type { ExportFormat } from '../types/export';
import { getWorks, createWork, deleteWork } from '../services/workService';
import { getChaptersByWorkId, updateChapter, createChapter, deleteChapter } from '../services/chapterService';
import { exportWork, getWorkExportFormats } from '../services/exportService';
import { getDatabase } from '../services/database';

import EditorToolbar from '../components/EditorToolbar';
import { useToast } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';

// 组件属性接口
interface WriterViewProps {
  showSidebar: boolean;              // 侧边栏显示状态（由父组件控制）
  onToggleSidebar: () => void;       // 切换侧边栏的回调
}

type DeletingItem = { type: 'work'; id: string } | { type: 'chapter'; id: string } | null;

/**
 * WriterView - 创作视图组件
 * 主要功能：剧本/小说编辑、实时预览、AI分镜
 *
 * 集成了本地存储功能：
 * - 从SQLite数据库加载作品和章节
 * - 自动保存编辑内容到数据库
 * - 支持导出为多种格式
 */
export default function WriterView({ showSidebar: externalShowSidebar, onToggleSidebar }: WriterViewProps) {
  // ========== 数据库相关状态 ==========
  // 作品列表（从数据库加载）
  const [works, setWorks] = useState<Work[]>([]);
  // 章节列表（从数据库加载）
  const [chapters, setChapters] = useState<Chapter[]>([]);
  // 当前选中的作品ID
  const [currentWorkId, setCurrentWorkId] = useState<string>('');
  // 当前选中的章节ID
  const [currentChapterId, setCurrentChapterId] = useState<string>('');
  // 数据库是否已初始化
  const [dbReady, setDbReady] = useState(false);

  // ========== UI状态 ==========
  // 是否显示AI分镜抽屉
  const [showDrawer, setShowDrawer] = useState(false);
  // 是否显示导出对话框
  const [showExportDialog, setShowExportDialog] = useState(false);
  // 导出进度
  const [exportProgress, setExportProgress] = useState<{ step: string; progress: number } | null>(null);
  // 是否显示新建作品对话框
  const [showNewWorkDialog, setShowNewWorkDialog] = useState(false);
  // 新建作品时选中的图标
  const [selectedIcon, setSelectedIcon] = useState('');
  // 是否显示新建章节对话框
  const [showNewChapterDialog, setShowNewChapterDialog] = useState(false);
  // 侧边栏宽度和显示状态
  const [sidebarWidth, setSidebarWidth] = useState(256); // 默认 w-64 = 256px
  const [isResizing, setIsResizing] = useState(false);
  // 删除状态
  const [deletingItem, setDeletingItem] = useState<DeletingItem>(null);
  // Toast 通知
  const { showToast, ToastComponent } = useToast();

  // ========== 编辑器状态 ==========
  // 编辑器内容状态
  const [editorContent, setEditorContent] = useState('');
  // 编辑器DOM引用
  const editorRef = useRef<HTMLDivElement>(null);
  // 自动保存定时器
  const saveTimerRef = useRef<number | null>(null);
  // 字数统计
  const [wordCount, setWordCount] = useState(0);
  // 输入法composition状态标记（用于处理中文输入法）
  const isComposingRef = useRef(false);
  // 标记是否需要同步内容到DOM（用于切换章节等外部更新）
  const shouldSyncContentRef = useRef(false);

  /**
   * 计算字数
   *
   * 使用 useCallback 优化：避免每次渲染都重新创建函数，
   * 确保依赖此函数的 useCallback 和 useEffect 的依赖数组稳定。
   */
  const calculateWordCount = useCallback((content: string): number => {
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

        // 3. 如果有作品，选中第一个
        if (loadedWorks.length > 0) {
          const firstWork = loadedWorks[0];
          setCurrentWorkId(firstWork.id);

          // 4. 加载第一个作品的章节
          const loadedChapters = await getChaptersByWorkId(firstWork.id);
          setChapters(loadedChapters);
          console.log(`✅ 加载了 ${loadedChapters.length} 个章节`);

          // 5. 如果有章节，选中第一个并加载内容
          if (loadedChapters.length > 0) {
            const firstChapter = loadedChapters[0];
            setCurrentChapterId(firstChapter.id);
            shouldSyncContentRef.current = true; // 标记需要同步内容
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
          shouldSyncContentRef.current = true; // 标记需要同步内容
          setEditorContent(firstChapter.content || '');
          setWordCount(calculateWordCount(firstChapter.content || ''));
        } else {
          setCurrentChapterId('');
          shouldSyncContentRef.current = true; // 清空内容时也需要同步
          setEditorContent('');
          setWordCount(0);
        }
      } catch (error) {
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
   * 处理编辑器内容变化
   * 使用input事件而非change事件，确保实时捕获内容变化
   * 实现防抖自动保存（2秒后保存）
   * 注意：在输入法composition期间不处理，避免中文输入问题
   */
  /**
   * 处理编辑器内容变化
   * 使用 useCallback 优化，避免每次渲染都创建新函数
   */
  const handleEditorInput = useCallback(() => {
    // 如果正在使用输入法（composition），则不处理
    if (isComposingRef.current) {
      return;
    }

    if (editorRef.current) {
      const newContent = editorRef.current.innerHTML;
      setEditorContent(newContent);

      // 更新字数统计（无论是否有章节都更新）
      const newWordCount = calculateWordCount(newContent);
      setWordCount(newWordCount);

      // 只有选中章节时才自动保存
      if (currentChapterId) {
        // 清除之前的定时器
        if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current);
        }

        // 设置新的定时器（2秒后保存）
        saveTimerRef.current = window.setTimeout(async () => {
          try {
            await updateChapter(currentChapterId, { content: newContent });
            console.log('💾 章节已自动保存');
          } catch (error) {
            console.error('❌ 自动保存失败:', error);
          }
        }, 2000);
      }
    }
  }, [currentChapterId, calculateWordCount]);

  /**
   * 处理输入法composition开始
   */
  const handleCompositionStart = () => {
    isComposingRef.current = true;
  };

  /**
   * 处理输入法composition结束
   * 输入法确认输入后，再处理内容
   */
  const handleCompositionEnd = () => {
    isComposingRef.current = false;
    // composition结束后，立即处理一次input
    handleEditorInput();
  };

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
      shouldSyncContentRef.current = true; // 标记需要同步内容
      setEditorContent(chapter.content || '');
      // 更新字数统计
      setWordCount(calculateWordCount(chapter.content || ''));
    }
  }, [chapters, currentChapterId, calculateWordCount]);

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
      shouldSyncContentRef.current = true;
      setEditorContent('');
      setWordCount(0);

      setShowNewWorkDialog(false);
      showToast(`作品「${newWork.title}」创建成功`, 'success');
    } catch (error: any) {
      console.error('❌ 创建作品失败:', error);
      showToast(`创建作品失败: ${error.message}`, 'error');
    }
  }, [showToast, calculateWordCount]);

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
      shouldSyncContentRef.current = true;
      setEditorContent('');
      setWordCount(0);

      setShowNewChapterDialog(false);
      showToast(`章节「${newChapter.title}」创建成功`, 'success');
    } catch (error: any) {
      console.error('❌ 创建章节失败:', error);
      showToast(`创建章节失败: ${error.message}`, 'error');
    }
  }, [currentWorkId, chapters, showToast]);

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
              shouldSyncContentRef.current = true;
              setEditorContent(firstChapter.content || '');
              setWordCount(calculateWordCount(firstChapter.content || ''));
            } else {
              // 没有章节，清空编辑器
              setCurrentChapterId('');
              shouldSyncContentRef.current = true;
              setEditorContent('');
              setWordCount(0);
            }
            showToast(`作品已删除，已切换到「${newWork.title}」`, 'success');
          } else {
            // 没有剩余作品，完全清空
            setCurrentWorkId('');
            setChapters([]);
            setCurrentChapterId('');
            shouldSyncContentRef.current = true;
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
            shouldSyncContentRef.current = true;
            setEditorContent(firstChapter.content || '');
            setWordCount(calculateWordCount(firstChapter.content || ''));
            showToast(`章节已删除，已切换到「${firstChapter.title}」`, 'success');
          } else {
            setCurrentChapterId('');
            shouldSyncContentRef.current = true;
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
  }, [deletingItem, currentWorkId, currentChapterId, showToast, calculateWordCount]);



  /**
   * 处理侧边栏拖拽调整宽度
   */
  const MIN_SIDEBAR_WIDTH = 180; // 最小宽度
  const MAX_SIDEBAR_WIDTH = 480; // 最大宽度
  const HIDE_THRESHOLD = 120;    // 小于此宽度时隐藏

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const newWidth = e.clientX;

      // 如果拖到隐藏阈值以下，隐藏侧边栏
      if (newWidth < HIDE_THRESHOLD) {
        onToggleSidebar(); // 通知父组件隐藏侧边栏
        setIsResizing(false);
        return;
      }

      // 限制宽度在最小和最大值之间
      if (newWidth <= MAX_SIDEBAR_WIDTH) {
        // 如果小于最小宽度，固定为最小宽度
        setSidebarWidth(Math.max(newWidth, MIN_SIDEBAR_WIDTH));
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, onToggleSidebar]);

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
  }, [currentWorkId, showToast]);

  /**
   * 当editorContent状态更新时，同步到DOM
   * 只在外部更新（如切换章节、初始加载）时同步，避免在用户输入时干扰
   */
  useEffect(() => {
    if (editorRef.current && shouldSyncContentRef.current) {
      editorRef.current.innerHTML = editorContent;
      shouldSyncContentRef.current = false; // 重置标志
    }
  }, [editorContent]);

  // 获取当前作品数据
  const currentWorkData = works.find(w => w.id === currentWorkId);
  // 获取当前作品支持的导出格式
  const exportFormats = currentWorkData ? getWorkExportFormats(currentWorkData) : [];

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Toast Notification */}
      {ToastComponent}

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

      {/* Project Tree Sidebar */}
      {externalShowSidebar && (
        <aside
          className="bg-[#f2ede7] border-r border-[#e5ddd2] flex flex-col overflow-hidden relative"
          style={{ width: `${sidebarWidth}px` }}
        >
          {/* 拖拽手柄 */}
          <div
            className="absolute top-0 right-0 bottom-0 w-2 cursor-ew-resize hover:bg-primary-300/30 transition-all z-10 group"
            onMouseDown={handleMouseDown}
          >
            {/* 视觉指示器 */}
            <div className="absolute top-1/2 right-0 transform translate-x-1/2 -translate-y-1/2 w-1.5 h-16 bg-[#d1c3b4] rounded-full group-hover:bg-primary-500 group-hover:h-20 transition-all shadow-sm" />
          </div>
        {/* Works Section */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-[#38342e]">作品库 (Works)</span>
            <button
              onClick={() => {
                setSelectedIcon('');
                setShowNewWorkDialog(true);
              }}
              className="w-7 h-7 rounded-lg bg-[#8b6342] text-white flex items-center justify-center hover:bg-[#6f4d34] transition-all"
              title="新建作品"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
          <div className="space-y-1">
            {works.length === 0 && dbReady && (
              <div className="text-center py-4">
                <div className="text-sm text-[#9a8c79]">
                  暂无作品，点击上方 + 创建新作品
                </div>
              </div>
            )}
            {works.map(work => (
              <div
                key={work.id}
                onClick={() => setCurrentWorkId(work.id)}
                className={`tree-item group ${currentWorkId === work.id ? 'active' : ''}`}
              >
                <span>{work.icon}</span>
                <span className="flex-1 truncate">{work.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeletingItem({ type: 'work', id: work.id });
                  }}
                  className="p-1 text-red-500 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  title="删除作品"
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Chapters Section */}
        <div className="p-4 border-t border-[#e5ddd2]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-[#38342e]">当前作品</span>
            <button
              onClick={() => setShowNewChapterDialog(true)}
              disabled={!currentWorkId}
              className="w-7 h-7 rounded-lg bg-[#8b6342] text-white flex items-center justify-center hover:bg-[#6f4d34] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              title={currentWorkId ? "新建章节" : "请先选择作品"}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
          <div className="space-y-1">
            {chapters.length === 0 && currentWorkId && (
              <div className="text-sm text-[#9a8c79] text-center py-4">
                暂无章节，点击上方 + 创建
              </div>
            )}
            {chapters.map(chapter => (
              <div
                key={chapter.id}
                onClick={() => handleChapterChange(chapter.id)}
                className={`tree-item group ${currentChapterId === chapter.id ? 'active' : ''}`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="flex-1 truncate">{chapter.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeletingItem({ type: 'chapter', id: chapter.id });
                  }}
                  className="p-1 text-red-500 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  title="删除章节"
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Characters Section */}
        <div className="p-4 border-t border-[#e5ddd2]">
          <div className="text-sm font-semibold text-[#38342e] mb-3">Characters</div>
          <div className="tree-item">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span>顾川 (男主)</span>
          </div>
        </div>
        </aside>
      )}

      {/* Editor Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Top Bar */}
        <div className="h-16 border-b border-[#e5ddd2] flex items-center justify-between px-8 bg-[#faf8f5] flex-shrink-0">
          {/* 左侧：路径显示 */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-[#9a8c79] font-medium">{currentWorkData?.title || '未选择作品'}</span>
              {currentChapterId && (
                <>
                  <svg className="w-4 h-4 text-[#d1c3b4]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="text-[#38342e] font-semibold">
                    {chapters.find(ch => ch.id === currentChapterId)?.title || ''}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* 右侧：操作按钮 */}
          <div className="flex items-center gap-4">
            {/* 操作按钮组 */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowDrawer(!showDrawer)}
                className="btn whitespace-nowrap h-9"
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>分镜</span>
              </button>
              <button
                onClick={() => setShowExportDialog(true)}
                className="btn btn-primary whitespace-nowrap h-9"
                disabled={!currentWorkId}
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                <span>导出</span>
              </button>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex overflow-hidden relative">
          {/* 编辑器容器 - 极简无背景 */}
          <div className="flex-1 flex flex-col overflow-hidden bg-[#faf8f5]">
            {/* 编辑器工具栏 - 即使没有作品也显示基础工具 */}
            <EditorToolbar
              workType={currentWorkData?.type || 'script'}
              editorRef={editorRef}
              wordCount={wordCount}
              onShowToast={showToast}
            />

            {/* 可编辑内容区域 */}
            <div className="flex-1 overflow-auto">
              <div
                ref={editorRef}
                className="max-w-6xl mx-auto px-12 py-12 min-h-full focus:outline-none text-[#2d2a26] leading-relaxed"
                contentEditable
                suppressContentEditableWarning
                onInput={handleEditorInput}
                onCompositionStart={handleCompositionStart}
                onCompositionEnd={handleCompositionEnd}
              />
            </div>
          </div>

          {/* AI Drawer (conditional) */}
          {showDrawer && (
            <div className="w-96 bg-[#f2ede7] border-l border-[#e5ddd2] flex flex-col">
              <div className="h-12 border-b border-[#e5ddd2] flex items-center justify-between px-4">
                <span className="text-sm font-semibold text-[#38342e] flex items-center gap-2">
                  <svg className="w-4 h-4 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                  AI 智能分镜
                </span>
                <button onClick={() => setShowDrawer(false)} className="text-[#7a6e5f] hover:text-[#38342e]">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-auto p-4">
                <div className="grid grid-cols-1 gap-4">
                  {/* Add Shot Button */}
                  <div className="aspect-video border-2 border-dashed border-[#d1c3b4] rounded-lg flex flex-col items-center justify-center gap-2 text-[#9a8c79] hover:border-primary-400 hover:text-primary-500 cursor-pointer transition-colors">
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span className="text-sm">生成分镜</span>
                  </div>
                  {/* Example Shot */}
                  <div className="rounded-lg overflow-hidden shadow-md">
                    <div className="aspect-video bg-gray-300 relative">
                      <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                        <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    </div>
                    <div className="p-2 bg-white text-xs text-[#7a6e5f]">#1 全景 办公室</div>
                  </div>
                </div>
              </div>
            </div>
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
