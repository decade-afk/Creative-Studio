/**
 * 文件名：FindReplacePanel.tsx
 * 模块名称：查找替换浮动面板
 *
 * 【核心功能】
 * 1. 在当前章节正文（contentEditable）中查找关键词，实时显示匹配数
 * 2. 逐个定位（滚动 + 选区高亮）
 * 3. 单处替换 / 全部替换 —— 只修改文本节点，不破坏富文本结构
 *
 * 【实现要点】
 * - 用 TreeWalker 遍历编辑器文本节点；跨标签的关键词不参与匹配
 *   （保证替换只改文字、绝不动标签）
 * - 大小写不敏感匹配；替换后自动触发 input 事件让自动保存与字数统计生效
 */

import { useState, useEffect, useCallback, useRef } from 'react';

interface FindReplacePanelProps {
  /** 编辑器 DOM 引用 */
  editorRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
}

/** 收集编辑器内全部文本节点 */
function getTextNodes(root: HTMLElement): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    nodes.push(current as Text);
    current = walker.nextNode();
  }
  return nodes;
}

/** 转义正则特殊字符 */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default function FindReplacePanel({ editorRef, onClose }: FindReplacePanelProps) {
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [matchCount, setMatchCount] = useState(0);
  const [current, setCurrent] = useState(0);
  const findInputRef = useRef<HTMLInputElement>(null);
  const stateRef = useRef({ current: 0 });

  // 打开时聚焦查找框
  useEffect(() => {
    findInputRef.current?.focus();
    findInputRef.current?.select();
  }, []);

  // ESC 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  /** 统计匹配数（大小写不敏感） */
  const recount = useCallback((keyword: string) => {
    const editor = editorRef.current;
    if (!editor || !keyword) {
      setMatchCount(0);
      setCurrent(0);
      stateRef.current.current = 0;
      return;
    }
    const regex = new RegExp(escapeRegExp(keyword), 'gi');
    let count = 0;
    for (const node of getTextNodes(editor)) {
      const matches = node.nodeValue?.match(regex);
      if (matches) count += matches.length;
    }
    setMatchCount(count);
    setCurrent(count > 0 ? 1 : 0);
    stateRef.current.current = 1;
  }, [editorRef]);

  /** 关键词变化时重新统计 */
  useEffect(() => {
    recount(findText);
  }, [findText, recount]);

  /** 定位第 index 处匹配：用选区选中并滚动到可见 */
  const locate = useCallback((index: number) => {
    const editor = editorRef.current;
    const keyword = findText.trim();
    if (!editor || !keyword) return;

    const regex = new RegExp(escapeRegExp(keyword), 'gi');
    let seen = 0;
    for (const node of getTextNodes(editor)) {
      const text = node.nodeValue || '';
      regex.lastIndex = 0;
      let match = regex.exec(text);
      while (match) {
        seen++;
        if (seen === index) {
          const range = document.createRange();
          range.setStart(node, match.index);
          range.setEnd(node, match.index + keyword.length);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
          // 滚动到匹配位置
          const rect = range.getBoundingClientRect();
          const container = editor.closest('.overflow-auto');
          if (container && rect.top < 100) {
            (container as HTMLElement).scrollTop += rect.top - 200;
          }
          return;
        }
        match = regex.exec(text);
      }
    }
  }, [editorRef, findText]);

  /** 查找下一处 */
  const handleFindNext = useCallback(() => {
    if (matchCount === 0) return;
    const next = stateRef.current.current >= matchCount ? 1 : stateRef.current.current + 1;
    stateRef.current.current = next;
    setCurrent(next);
    locate(next);
  }, [matchCount, locate]);

  /** 替换当前定位处 */
  const handleReplaceCurrent = useCallback(() => {
    const editor = editorRef.current;
    const keyword = findText.trim();
    const selection = window.getSelection();
    if (!editor || !keyword || !selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (range.toString().toLowerCase() === keyword.toLowerCase() && editor.contains(range.commonAncestorContainer)) {
      const node = range.startContainer as Text;
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.nodeValue || '';
        const start = range.startOffset;
        node.nodeValue = text.slice(0, start) + replaceText + text.slice(start + keyword.length);
        editor.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
    recount(findText);
  }, [editorRef, findText, replaceText, recount]);

  /** 全部替换（仅文本节点内） */
  const handleReplaceAll = useCallback(() => {
    const editor = editorRef.current;
    const keyword = findText.trim();
    if (!editor || !keyword) return;

    const regex = new RegExp(escapeRegExp(keyword), 'gi');
    let replaced = 0;
    for (const node of getTextNodes(editor)) {
      const text = node.nodeValue || '';
      if (regex.test(text)) {
        regex.lastIndex = 0;
        replaced += (text.match(regex) || []).length;
        node.nodeValue = text.replace(regex, replaceText);
      }
      regex.lastIndex = 0;
    }

    if (replaced > 0) {
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    }
    recount(findText);
    return replaced;
  }, [editorRef, findText, replaceText, recount]);

  return (
    <div className="absolute top-2 right-4 z-40 w-80 bg-surface-primary rounded-lg shadow-2xl border border-surface-border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-on-surface">查找替换</span>
        <div className="flex items-center gap-2">
          {findText.trim() && (
            <span className="text-xs text-on-surface-secondary">
              {matchCount > 0 ? `${current}/${matchCount}` : '无匹配'}
            </span>
          )}
          <button onClick={onClose} className="text-on-surface-secondary hover:text-on-surface text-xs">✕</button>
        </div>
      </div>

      <input
        ref={findInputRef}
        type="text"
        value={findText}
        onChange={(e) => setFindText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) {
              // Shift+Enter：上一处（简化为从头再定位）
              stateRef.current.current = 1;
              setCurrent(1);
              locate(1);
            } else {
              handleFindNext();
            }
          }
        }}
        placeholder="查找（Enter 下一处，不区分大小写）"
        className="w-full px-2.5 py-1.5 text-sm bg-surface-secondary border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-on-surface"
      />

      <input
        type="text"
        value={replaceText}
        onChange={(e) => setReplaceText(e.target.value)}
        placeholder="替换为"
        className="w-full px-2.5 py-1.5 text-sm bg-surface-secondary border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-on-surface"
      />

      <div className="flex gap-2">
        <button
          onClick={handleFindNext}
          disabled={!findText.trim() || matchCount === 0}
          className="flex-1 px-2 py-1.5 text-xs rounded-lg border border-outline text-on-surface hover:bg-surface-secondary disabled:opacity-40 transition-colors"
        >
          下一处
        </button>
        <button
          onClick={handleReplaceCurrent}
          disabled={!findText.trim() || matchCount === 0}
          className="flex-1 px-2 py-1.5 text-xs rounded-lg border border-outline text-on-surface hover:bg-surface-secondary disabled:opacity-40 transition-colors"
        >
          替换
        </button>
        <button
          onClick={() => {
            const n = handleReplaceAll();
            if (typeof n === 'number' && n > 0) {
              // 替换完成的反馈由匹配数归零体现
            }
          }}
          disabled={!findText.trim() || matchCount === 0}
          className="flex-1 px-2 py-1.5 text-xs rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-40 transition-colors"
        >
          全部替换
        </button>
      </div>
    </div>
  );
}
