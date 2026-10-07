/**
 * 文件名：SearchPanel.tsx
 * 模块名称：全局搜索面板（模态覆盖层）
 *
 * 【核心功能】
 * 跨作品、跨章节检索标题与正文，点击结果跳转到对应章节并尝试滚动定位。
 * 由 Ctrl+Shift+F 快捷键或工具栏按钮触发。
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { searchChapters, type SearchResult } from '../services/searchService';
import { useWriterStore } from '../stores/writerStore';

interface SearchPanelProps {
  /** 关闭面板 */
  onClose: () => void;
  /** 跳转到指定章节（由 WriterView 提供：切换作品/章节） */
  onOpenChapter: (workId: string, chapterId: string, keyword: string) => void;
}

/**
 * 全局搜索面板
 */
export default function SearchPanel({ onClose, onOpenChapter }: SearchPanelProps) {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const works = useWriterStore((state) => state.works);
  const workTitleById = new Map(works.map((w) => [w.id, w.title]));

  // 打开时聚焦输入框
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ESC 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  /** 防抖搜索（300ms） */
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    const trimmed = keyword.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }

    searchTimerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const found = await searchChapters(trimmed);
        setResults(found);
      } catch (error) {
        console.error('搜索失败:', error);
        setResults([]);
      } finally {
        setSearching(false);
        setSearched(true);
      }
    }, 300);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [keyword]);

  /** 点击结果 */
  const handleOpen = useCallback(
    (result: SearchResult) => {
      onOpenChapter(result.workId, result.chapterId, keyword.trim());
      onClose();
    },
    [onOpenChapter, onClose, keyword]
  );

  /** 渲染高亮片段 */
  const renderSnippet = (snippet: string) => {
    // snippet 中 <mark> 标签由 searchService 生成，此处安全渲染
    const parts = snippet.split(/(<mark>|<\/mark>)/);
    let highlighted = false;
    return parts.map((part, i) => {
      if (part === '<mark>') {
        highlighted = true;
        return null;
      }
      if (part === '</mark>') {
        highlighted = false;
        return null;
      }
      return highlighted ? (
        <mark key={i} className="bg-yellow-200 dark:bg-yellow-700 rounded px-0.5">{part}</mark>
      ) : (
        <span key={i}>{part}</span>
      );
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-[560px] max-h-[70vh] bg-surface-primary rounded-xl shadow-2xl border border-surface-border flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 搜索框 */}
        <div className="flex items-center gap-2 p-3 border-b border-surface-border">
          <svg className="w-4 h-4 text-on-surface-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索全部作品的章节与正文…（至少 2 个字符）"
            className="flex-1 bg-transparent outline-none text-sm text-on-surface"
          />
          <button onClick={onClose} className="text-xs text-on-surface-secondary hover:text-on-surface shrink-0">
            ESC
          </button>
        </div>

        {/* 结果列表 */}
        <div className="flex-1 overflow-y-auto">
          {searching && (
            <p className="text-center text-sm text-on-surface-secondary py-8">搜索中…</p>
          )}

          {!searching && searched && results.length === 0 && (
            <p className="text-center text-sm text-on-surface-secondary py-8">
              没有找到包含「{keyword.trim()}」的内容
            </p>
          )}

          {results.map((result) => (
            <button
              key={result.chapterId}
              onClick={() => handleOpen(result)}
              className="w-full text-left px-4 py-3 hover:bg-surface-secondary border-b border-surface-border last:border-0 transition-colors"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-on-surface truncate">
                  {result.chapterTitle}
                </span>
                <span className="text-xs text-on-surface-secondary shrink-0 ml-2">
                  {result.matchCount} 处
                </span>
              </div>
              <p className="text-xs text-on-surface-secondary mb-1 truncate">
                {workTitleById.get(result.workId) || result.workTitle}
              </p>
              <p className="text-xs text-on-surface line-clamp-2 leading-relaxed">
                {renderSnippet(result.snippet)}
              </p>
            </button>
          ))}
        </div>

        {/* 底部提示 */}
        <div className="px-3 py-2 border-t border-surface-border text-xs text-on-surface-secondary">
          回车跳转第一个结果 · 点击任意结果打开章节
        </div>
      </div>
    </div>
  );
}
