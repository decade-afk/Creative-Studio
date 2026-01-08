/**
 * WriterTopBar - 编辑器顶部栏组件
 *
 * 拆分自 WriterView，负责显示当前作品/章节路径和操作按钮
 */

import { useWriterStore } from '../stores/writerStore';

interface WriterTopBarProps {
  onToggleDrawer: () => void;
  onShowExportDialog: () => void;
}

export default function WriterTopBar({ onToggleDrawer, onShowExportDialog }: WriterTopBarProps) {
  const { currentWorkId, currentChapterId, getCurrentWork, getCurrentChapter } = useWriterStore();

  const currentWork = getCurrentWork();
  const currentChapter = getCurrentChapter();

  return (
    <div className="h-16 border-b border-outline flex items-center justify-between px-8 bg-surface-primary flex-shrink-0">
      {/* 左侧：路径显示 */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-on-surface-secondary font-medium">
            {currentWork?.title || '未选择作品'}
          </span>
          {currentChapterId && (
            <>
              <svg className="w-4 h-4 text-neutral-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span className="text-on-surface font-semibold">
                {currentChapter?.title || ''}
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