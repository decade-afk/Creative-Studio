/**
 * WriterTopBar - 编辑器顶部栏组件
 *
 * 拆分自 WriterView，负责显示当前作品/章节路径、字数统计和操作按钮
 */

import { useEffect, useState } from 'react';
import { useWriterStore } from '../stores/writerStore';
import { getWorkTotalWordCount } from '../services/chapterService';
import { loadConfig } from '../services/configService';
import { getTodayWords } from '../utils/dailyWords';

interface WriterTopBarProps {
  onToggleDrawer: () => void;
  onShowExportDialog: () => void;
  /** 切换 AI 助手面板 */
  onToggleAiPanel: () => void;
  /** 打开版本历史 */
  onShowVersions: () => void;
  /** AI 面板是否展开 */
  aiPanelOpen: boolean;
}

export default function WriterTopBar({
  onToggleDrawer,
  onShowExportDialog,
  onToggleAiPanel,
  onShowVersions,
  aiPanelOpen,
}: WriterTopBarProps) {
  const { currentWorkId, currentChapterId, getCurrentWork, getCurrentChapter } = useWriterStore();
  const wordCount = useWriterStore((state) => state.wordCount);

  const currentWork = getCurrentWork();
  const currentChapter = getCurrentChapter();

  // 作品总字数（章节切换/保存后刷新）
  const [totalWords, setTotalWords] = useState<number | null>(null);
  // 每日目标与今日字数
  const [dailyGoal, setDailyGoal] = useState(0);
  const [todayWords, setTodayWords] = useState(0);

  useEffect(() => {
    loadConfig()
      .then((c) => setDailyGoal(c.editor.dailyGoal || 0))
      .catch(() => undefined);
    // 设置保存后实时刷新目标
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
  }, [currentWorkId, wordCount]);

  return (
    <div className="h-16 border-b border-outline flex items-center justify-between px-8 bg-surface-primary flex-shrink-0">
      {/* 左侧：路径与字数 */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2 text-sm min-w-0">
          <span className="text-on-surface-secondary font-medium truncate">
            {currentWork?.title || '未选择作品'}
          </span>
          {currentChapterId && (
            <>
              <svg className="w-4 h-4 text-neutral-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span className="text-on-surface font-semibold truncate">
                {currentChapter?.title || ''}
              </span>
            </>
          )}
        </div>
        {totalWords !== null && (
          <span className="text-xs text-on-surface-secondary whitespace-nowrap">
            本章 {wordCount} 字 · 全书 {totalWords} 字
            {dailyGoal > 0 && (
              <span className={todayWords >= dailyGoal ? 'text-green-600 dark:text-green-400 font-medium' : ''}>
                {' '}· 今日 {todayWords}/{dailyGoal} 字{todayWords >= dailyGoal ? ' 🎉' : ''}
              </span>
            )}
          </span>
        )}
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
            <span>版本</span>
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
            <span>AI 助手</span>
          </button>
          <button
            onClick={onToggleDrawer}
            className="btn whitespace-nowrap h-9"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>分镜</span>
          </button>
          <button
            onClick={onShowExportDialog}
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
  );
}
