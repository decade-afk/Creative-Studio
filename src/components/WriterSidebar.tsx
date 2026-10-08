/**
 * WriterSidebar - WriterView 侧边栏组件
 *
 * 拆分自 WriterView，负责显示作品和章节列表
 * 支持可调整宽度、拖拽调整大小
 */

import { useRef, useEffect, useState } from 'react';
import { useWriterStore } from '../stores/writerStore';
import { getCharactersByWorkId } from '../services/characterService';

interface WriterSidebarProps {
  showSidebar: boolean;
  onCreateWork: () => void;
  onCreateChapter: () => void;
  onChapterChange: (chapterId: string) => void;
  onWorkChange: (workId: string) => void;
  onDeleteWork: (workId: string) => void;
}

export default function WriterSidebar({
  showSidebar,
  onCreateWork,
  onCreateChapter,
  onChapterChange,
  onWorkChange,
  onDeleteWork,
}: WriterSidebarProps) {
  const {
    works,
    chapters,
    currentWorkId,
    currentChapterId,
    sidebarWidth,
    isResizing,
    setSidebarWidth,
    setIsResizing,
    setDeletingItem,
  } = useWriterStore();

  const sidebarRef = useRef<HTMLDivElement>(null);
  const [characters, setCharacters] = useState<Array<{ id: string; name: string; avatar?: string; description?: string }>>([]);

  // 当前作品的角色列表（跟随作品切换）
  useEffect(() => {
    if (!currentWorkId) {
      setCharacters([]);
      return;
    }
    let cancelled = false;
    getCharactersByWorkId(currentWorkId)
      .then((list) => {
        if (!cancelled) setCharacters(list);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [currentWorkId]);

  // 处理拖拽调整侧边栏宽度
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);

    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = startWidth + (e.clientX - startX);
      const clampedWidth = Math.max(200, Math.min(500, newWidth)); // 限制在 200-500px 之间
      setSidebarWidth(clampedWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  if (!showSidebar) return null;

  return (
    <aside
      ref={sidebarRef}
      className="bg-surface-secondary border-r border-outline flex flex-col overflow-hidden relative"
      style={{ width: `${sidebarWidth}px` }}
    >
      {/* 拖拽手柄 */}
      <div
        className={`absolute top-1/2 right-0 transform translate-x-1/2 -translate-y-1/2 w-1.5 h-16 bg-neutral-300 rounded-full group-hover:bg-primary-500 group-hover:h-20 transition-all shadow-sm cursor-ew-resize z-10 ${isResizing ? 'bg-primary-500' : ''}`}
        onMouseDown={handleMouseDown}
        title="拖拽调整宽度"
      />

      {/* Works Section */}
      <div className="p-4 border-b border-outline">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-on-surface">作品</div>
          <button
            onClick={onCreateWork}
            className="w-7 h-7 rounded-lg bg-primary-500 text-white flex items-center justify-center hover:bg-primary-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            title="新建作品"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
        <div className="space-y-1">
          {works.map((work) => (
            <div
              key={work.id}
              onClick={() => onWorkChange(work.id)}
              className={`tree-item group ${currentWorkId === work.id ? 'active' : ''}`}
            >
              <span className="text-lg">{work.icon}</span>
              <span className="flex-1 truncate">{work.title}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteWork(work.id);
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
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="p-4 border-b border-outline">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold text-on-surface">章节</div>
            <button
              onClick={onCreateChapter}
              className="w-7 h-7 rounded-lg bg-primary-500 text-white flex items-center justify-center hover:bg-primary-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!currentWorkId}
              title="新建章节"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        </div>

        {/* 章节列表 */}
        <div className="flex-1 overflow-auto px-4 pb-4 space-y-1">
          {chapters.length === 0 && currentWorkId && (
            <div className="text-sm text-on-surface-secondary text-center py-4">
              暂无章节，点击上方 + 创建
            </div>
          )}
          {chapters.map((chapter) => (
            <div
              key={chapter.id}
              onClick={() => onChapterChange(chapter.id)}
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

      {/* Characters Section（真实数据：当前作品的角色） */}
      <div className="p-4 border-t border-outline">
        <div className="text-sm font-semibold text-on-surface mb-3">角色</div>
        {characters.length === 0 && (
          <div className="text-xs text-on-surface-secondary">
            暂无角色，可在「规划 → 角色」中创建
          </div>
        )}
        {characters.map((c) => (
          <div key={c.id} className="tree-item" title={c.description || c.name}>
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="flex-1 truncate">
              {c.avatar && !c.avatar.startsWith('http') ? c.avatar + ' ' : ''}{c.name}
            </span>
          </div>
        ))}
      </div>
    </aside>
  );
}