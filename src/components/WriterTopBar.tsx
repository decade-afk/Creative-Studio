/**
 * WriterTopBar - 编辑器顶部栏组件
 *
 * 功能：
 * 1. 作品/章节快速切换下拉（面包屑样式，点击弹出面板选择）
 * 2. 字数统计（本章/全书/今日目标）
 * 3. 标题/内容复制快捷按钮
 * 4. 版本历史、AI 助手、分镜、导出入口
 */

import { useEffect, useState, useRef } from 'react';
import { useWriterStore } from '../stores/writerStore';
import { getWorkTotalWordCount, updateChapter } from '../services/chapterService';
import { loadConfig } from '../services/configService';
import { getTodayWords } from '../utils/dailyWords';
import { calculateWordCount } from '../utils/wordCount';
interface WriterTopBarProps {
  onToggleDrawer: () => void;
  onShowExportDialog: () => void;
  /** 切换 AI 助手面板 */
  onToggleAiPanel: () => void;
  /** 打开版本历史 */
  onShowVersions: () => void;
  /** AI 面板是否展开 */
  aiPanelOpen: boolean;
  /** 复制章节标题 */
  onCopyTitle: () => void;
  /** 复制本章内容 */
  onCopyContent: () => void;
  /** 编辑器引用（切换章节前保存正文用） */
  editorRef?: React.RefObject<HTMLDivElement | null>;
}

export default function WriterTopBar({
  onToggleDrawer,
  onShowExportDialog,
  onToggleAiPanel,
  onShowVersions,
  aiPanelOpen,
  onCopyTitle,
  onCopyContent,
  editorRef,
}: WriterTopBarProps) {
  const {
    works,
    chapters,
    currentWorkId,
    currentChapterId,
    getCurrentWork,
    getCurrentChapter,
    setCurrentWorkId,
    setCurrentChapterId,
    setShouldSyncContent,
    setEditorContent,
    setWordCount,
  } = useWriterStore();
  const wordCount = useWriterStore((state) => state.wordCount);

  const currentWork = getCurrentWork();
  const currentChapter = getCurrentChapter();

  // 作品/章节快速切换下拉
  const [openMenu, setOpenMenu] = useState<'work' | 'chapter' | null>(null);
  const menuWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuWrapRef.current && !menuWrapRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, []);

  /** 切换作品：换 id 即可，WriterView 的 effect 会加载章节 */
  const handleWorkSwitch = (workId: string) => {
    if (workId !== currentWorkId) setCurrentWorkId(workId);
    setOpenMenu(null);
  };

  /** 切换章节：带切换前保存逻辑同侧栏 */
  const handleChapterSwitch = (chapterId: string) => {
    if (chapterId === currentChapterId) { setOpenMenu(null); return; }
    if (editorRef?.current && currentChapterId) {
      const content = editorRef.current.innerHTML;
      updateChapter(currentChapterId, { content }).catch(() => undefined);
    }
    const ch = chapters.find(c => c.id === chapterId);
    if (ch) {
      setCurrentChapterId(ch.id);
      setShouldSyncContent(true);
      setEditorContent(ch.content || '');
      setWordCount(calculateWordCount(ch.content || ''));
    }
    setOpenMenu(null);
  };

  // 作品总字数（章节切换/保存后刷新）
  const [totalWords, setTotalWords] = useState<number | null>(null);
  // 每日目标与今日字数
  const [dailyGoal, setDailyGoal] = useState(0);
  // 保存完成信号（配合 creative-studio:saved 事件刷新全书字数）
  const [saveTick, setSaveTick] = useState(0);
  const [todayWords, setTodayWords] = useState(0);

  useEffect(() => {
    loadConfig()
      .then((c) => setDailyGoal(c.editor.dailyGoal || 0))
      .catch(() => undefined);
    const handler = () => {
      loadConfig()
        .then((c) => setDailyGoal(c.editor.dailyGoal || 0))
        .catch(() => undefined);
    };
    window.addEventListener('creative-studio:config-changed', handler);
    return () => window.removeEventListener('creative-studio:config-changed', handler);
  }, []);

  useEffect(() => {
    if (!currentWorkId) {
      setTotalWords(null);
      return;
    }
    let cancelled = false;
    getWorkTotalWordCount(currentWorkId)
      .then((count) => {
        if (!cancelled) {
          setTotalWords(count);
          setTodayWords(getTodayWords(count));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [currentWorkId, wordCount, saveTick]);

  // 自动保存完成后刷新全书字数
  useEffect(() => {
    const handler = () => setSaveTick((t) => t + 1);
    window.addEventListener('creative-studio:saved', handler);
    return () => window.removeEventListener('creative-studio:saved', handler);
  }, []);

  const chevron = (open: boolean) => (
    <svg
      className={`w-3 h-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );

  return (
    <div className="relative h-16 border-b border-outline flex items-center justify-between px-8 bg-surface-primary flex-shrink-0">
      {/* 左侧：面包屑 + 字数 + 复制 */}
      <div ref={menuWrapRef} className="flex items-center gap-3 min-w-0 relative">
        {/* 作品下拉触发 */}
        <button
          onClick={() => setOpenMenu(openMenu === 'work' ? null : 'work')}
          disabled={works.length === 0}
          className="flex items-center gap-1.5 text-sm text-on-surface-secondary font-medium hover:text-on-surface transition-colors disabled:opacity-50 max-w-[110px] min-[1150px]:max-w-[180px]"
          title="切换作品"
        >
          <span className="truncate">{currentWork?.title || '未选择作品'}</span>
          {chevron(openMenu === 'work')}
        </button>

        {currentChapterId && (
          <>
            <svg className="w-4 h-4 text-neutral-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            {/* 章节下拉触发 */}
            <button
              onClick={() => setOpenMenu(openMenu === 'chapter' ? null : 'chapter')}
              className="flex items-center gap-1 text-on-surface font-semibold hover:text-primary-600 transition-colors max-w-[120px] min-[1150px]:max-w-[200px]"
              title="切换章节"
            >
              <span className="truncate">{currentChapter?.title || ''}</span>
              {chevron(openMenu === 'chapter')}
            </button>
          </>
        )}

        {totalWords !== null && (
          <span className="hidden min-[1000px]:inline text-xs text-on-surface-secondary whitespace-nowrap">
            本章 {wordCount} 字 · 全书 {totalWords} 字
            {dailyGoal > 0 && (
              <span className={todayWords >= dailyGoal ? 'text-green-600 dark:text-green-400 font-medium' : ''}>
                {' '}· 今日 {todayWords}/{dailyGoal} 字{todayWords >= dailyGoal ? ' 🎉' : ''}
              </span>
            )}
          </span>
        )}

        {/* 标题 / 内容 复制 */}
        <span className="flex items-center gap-1 whitespace-nowrap shrink-0">
          <button
            onClick={onCopyTitle}
            disabled={!currentChapter}
            className="p-1.5 text-on-surface-secondary hover:text-on-surface hover:bg-surface-tertiary rounded transition-colors disabled:opacity-40"
            title="复制章节标题"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h10v10H7z M7 7V3h10v4 M5 21h14a2 2 0 002-2V9a2 2 0 00-2-2" />
            </svg>
          </button>
          <button
            onClick={onCopyContent}
            disabled={!currentChapter}
            className="p-1.5 text-on-surface-secondary hover:text-on-surface hover:bg-surface-tertiary rounded transition-colors disabled:opacity-40"
            title="复制本章内容"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
            </svg>
          </button>
        </span>
      </div>

      {/* 右侧：操作按钮 */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {/* 版本历史 */}
          <button
            onClick={onShowVersions}
            className="btn whitespace-nowrap h-9"
            disabled={!currentChapterId}
            title="版本历史"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="hidden min-[1150px]:inline">版本</span>
          </button>
          {/* AI 助手 */}
          <button
            onClick={onToggleAiPanel}
            className={`btn whitespace-nowrap h-9 ${aiPanelOpen ? 'btn-primary' : ''}`}
            disabled={!currentChapterId}
            title="AI 创作助手（续写 / 润色 / 摘要 / 审稿）"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span className="hidden min-[1150px]:inline">AI 助手</span>
          </button>
          <button
            onClick={onToggleDrawer}
            className="btn whitespace-nowrap h-9"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="hidden min-[1150px]:inline">分镜</span>
          </button>
          <button
            onClick={onShowExportDialog}
            className="btn btn-primary whitespace-nowrap h-9"
            disabled={!currentWorkId}
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632 3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            <span className="hidden min-[1150px]:inline">导出</span>
          </button>
        </div>
      </div>

      {/* 作品切换面板 */}
      {openMenu === 'work' && (
        <div className="absolute top-full left-8 mt-1 w-64 max-h-80 overflow-y-auto bg-surface-primary border border-outline rounded-lg shadow-lg z-50 py-1">
          {works.length === 0 && (
            <p className="text-sm text-on-surface-secondary text-center py-4">暂无作品</p>
          )}
          {works.map((w) => (
            <button
              key={w.id}
              onClick={() => handleWorkSwitch(w.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                w.id === currentWorkId
                  ? 'bg-primary-50 text-primary-700 font-medium'
                  : 'text-on-surface hover:bg-surface-secondary'
              }`}
            >
              <span>{w.icon}</span>
              <span className="flex-1 truncate">{w.title}</span>
              {w.id === currentWorkId && <span className="text-primary-600">✓</span>}
            </button>
          ))}
        </div>
      )}

      {/* 章节切换面板 */}
      {openMenu === 'chapter' && (
        <div className="absolute top-full left-8 mt-9 w-72 max-h-80 overflow-y-auto bg-surface-primary border border-outline rounded-lg shadow-lg z-50 py-1">
          {chapters.length === 0 && (
            <p className="text-sm text-on-surface-secondary text-center py-4">当前作品暂无章节</p>
          )}
          {chapters.map((c) => (
            <button
              key={c.id}
              onClick={() => handleChapterSwitch(c.id)}
              className={`w-full flex items-center justify-between px-3 py-2 text-left text-sm transition-colors ${
                c.id === currentChapterId
                  ? 'bg-primary-50 text-primary-700 font-medium'
                  : 'text-on-surface hover:bg-surface-secondary'
              }`}
            >
              <span className="truncate">{c.title}</span>
              {c.id === currentChapterId && <span className="text-primary-600">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
