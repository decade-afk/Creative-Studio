/**
 * EditorToolbar - 编辑器工具栏组件 (完整增强版)
 *
 * 功能：
 * 1. 基础文本格式化（加粗、斜体、下划线、标题）
 * 2. 短剧专用工具（场景、对话、旁白、镜头、转场、音效）
 * 3. 小说专用工具（段落、引用、对话、独白、章节）
 * 4. 通用工具（列表、颜色、高亮、模板）
 * 5. 辅助功能（撤销/重做、清除格式、字数统计）
 */

import { useState, useEffect, useRef } from 'react';
import type { WorkType } from '../types/storage';

interface EditorToolbarProps {
  workType: WorkType;
  editorRef: React.RefObject<HTMLDivElement | null>;
  wordCount: number;
}

// 快捷文本模板
const QUICK_TEMPLATES = {
  script: [
    { label: '画外音', value: '（画外音）' },
    { label: '旁白', value: '（旁白）' },
    { label: '电话中', value: '（电话中）' },
    { label: '同时', value: '与此同时——' },
    { label: '片刻后', value: '片刻之后——' },
  ],
  novel: [
    { label: '话音刚落', value: '话音刚落，' },
    { label: '与此同时', value: '与此同时，' },
    { label: '片刻之后', value: '片刻之后，' },
    { label: '突然', value: '突然，' },
    { label: '分隔符', value: '※　※　※' },
  ],
};

// 镜头类型
const CAMERA_SHOTS = [
  { label: '特写 (CU)', value: '【特写】' },
  { label: '近景 (MS)', value: '【近景】' },
  { label: '中景 (MLS)', value: '【中景】' },
  { label: '全景 (LS)', value: '【全景】' },
  { label: '远景 (ELS)', value: '【远景】' },
  { label: '推镜', value: '【推镜】' },
  { label: '拉镜', value: '【拉镜】' },
  { label: '摇镜', value: '【摇镜】' },
  { label: '跟镜', value: '【跟镜】' },
  { label: '俯拍', value: '【俯拍】' },
  { label: '仰拍', value: '【仰拍】' },
];

// 转场类型
const TRANSITIONS = [
  { label: '切至', value: '切至：' },
  { label: '淡入', value: '淡入' },
  { label: '淡出', value: '淡出' },
  { label: '溶入', value: '溶入' },
  { label: '叠化', value: '叠化' },
  { label: '划入', value: '划入' },
  { label: '划出', value: '划出' },
];

// 颜色选项
const COLORS = [
  { label: '红色', value: '#fee2e2' },
  { label: '黄色', value: '#fef3c7' },
  { label: '绿色', value: '#d1fae5' },
  { label: '蓝色', value: '#dbeafe' },
  { label: '紫色', value: '#e9d5ff' },
  { label: '粉色', value: '#fce7f3' },
];

export default function EditorToolbar({ workType, editorRef, wordCount }: EditorToolbarProps) {
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set());
  const [showDropdown, setShowDropdown] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  /**
   * 执行文本格式化命令
   */
  const execCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    updateActiveFormats();
  };

  /**
   * 插入HTML内容
   */
  const insertHTML = (html: string) => {
    document.execCommand('insertHTML', false, html);
    editorRef.current?.focus();
    setShowDropdown(null);
  };

  /**
   * 更新当前激活的格式
   */
  const updateActiveFormats = () => {
    const formats = new Set<string>();
    if (document.queryCommandState('bold')) formats.add('bold');
    if (document.queryCommandState('italic')) formats.add('italic');
    if (document.queryCommandState('underline')) formats.add('underline');
    setActiveFormats(formats);
  };

  /**
   * 插入短剧场景标题
   */
  const insertSceneHeader = (sceneNum?: string, location?: string, time?: string, interior?: boolean) => {
    const num = sceneNum || '1';
    const loc = location || '办公室';
    const t = time || '日';
    const int = interior !== false;

    const html = `<div class="mb-4 font-mono text-sm font-bold text-primary-700">
  第${num}场. ${loc} - ${t} - ${int ? '内' : '外'}
</div>`;
    insertHTML(html);
  };

  /**
   * 插入短剧人物对话
   */
  const insertDialogue = (character?: string, dialogue?: string) => {
    const char = character || '角色名';
    const dial = dialogue || '对话内容';

    const html = `<div class="mb-2 font-semibold text-[#38342e] text-center">${char}</div>
<div class="mb-4 text-[#38342e] text-center italic">${dial}</div>`;
    insertHTML(html);
  };

  /**
   * 插入场景描述/旁白
   */
  const insertAction = (action?: string) => {
    const act = action || '场景描述或旁白内容';
    const html = `<div class="mb-4 text-[#5d554a] leading-relaxed">${act}</div>`;
    insertHTML(html);
  };

  /**
   * 插入人物动作指示（Parenthetical）
   */
  const insertParenthetical = (text?: string) => {
    const content = text || '动作/表情';
    const html = `<span class="text-[#5d554a] italic text-sm"> (${content}) </span>`;
    insertHTML(html);
  };

  /**
   * 插入镜头指示
   */
  const insertCameraShot = (shot: string) => {
    const html = `<div class="my-2 text-primary-600 font-semibold text-sm">${shot}</div>`;
    insertHTML(html);
  };

  /**
   * 插入转场
   */
  const insertTransition = (transition: string) => {
    const html = `<div class="my-3 text-right text-[#38342e] font-semibold">${transition}</div>`;
    insertHTML(html);
  };

  /**
   * 插入音效/配乐标注
   */
  const insertSound = (type: 'music' | 'effect', text?: string) => {
    const content = text || (type === 'music' ? '背景音乐' : '音效');
    const prefix = type === 'music' ? '♪ ' : '';
    const html = `<div class="my-2 text-[#8b6342] text-sm italic">[${prefix}${content}]</div>`;
    insertHTML(html);
  };

  /**
   * 插入小说段落（带首行缩进）
   */
  const insertNovelParagraph = (text?: string) => {
    const content = text || '段落内容';
    const html = `<p class="mb-4 text-[#38342e] leading-relaxed indent-8">${content}</p>`;
    insertHTML(html);
  };

  /**
   * 插入小说对话
   */
  const insertNovelDialogue = (character?: string, dialogue?: string) => {
    const char = character || '某人';
    const dial = dialogue || '说的话';
    const html = `<p class="mb-2 text-[#38342e] leading-relaxed indent-8">"${dial}"${char}说。</p>`;
    insertHTML(html);
  };

  /**
   * 插入内心独白
   */
  const insertMonologue = (text?: string) => {
    const content = text || '内心独白内容';
    const html = `<p class="mb-2 text-[#5d554a] leading-relaxed italic indent-8">${content}</p>`;
    insertHTML(html);
  };

  /**
   * 插入章节标题
   */
  const insertChapterTitle = (chapterNum?: string, title?: string) => {
    const num = chapterNum || '一';
    const t = title || '章节标题';
    const html = `<h2 class="my-6 text-2xl font-bold text-center text-[#38342e]">第${num}章 ${t}</h2>`;
    insertHTML(html);
  };

  /**
   * 插入引用文本
   */
  const insertQuote = (quote?: string) => {
    const content = quote || '引用内容';
    const html = `<blockquote class="mb-4 pl-4 border-l-4 border-primary-300 text-[#5d554a] italic">${content}</blockquote>`;
    insertHTML(html);
  };

  /**
   * 插入分隔线
   */
  const insertDivider = () => {
    const html = '<hr class="my-8 border-t border-[#e5ddd2]" />';
    insertHTML(html);
  };

  /**
   * 插入快捷模板
   */
  const insertTemplate = (template: string) => {
    insertHTML(template);
  };

  /**
   * 应用颜色高亮
   */
  const applyHighlight = (color: string) => {
    execCommand('hiliteColor', color);
    setShowDropdown(null);
  };

  /**
   * 切换下拉菜单
   */
  const toggleDropdown = (name: string) => {
    setShowDropdown(showDropdown === name ? null : name);
  };

  /**
   * 监听选择变化，更新激活状态
   * 使用防抖优化性能，避免频繁触发
   */
  useEffect(() => {
    let debounceTimer: number | null = null;

    const handleSelectionChange = () => {
      // 清除之前的定时器
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
      }

      // 设置新的定时器（100ms防抖）
      debounceTimer = window.setTimeout(() => {
        updateActiveFormats();
        debounceTimer = null;
      }, 100);
    };

    document.addEventListener('selectionchange', handleSelectionChange);

    // 清理函数
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      // 清除待执行的定时器
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
      }
    };
  }, []);

  /**
   * 点击外部关闭下拉菜单
   */
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className="h-12 border-b border-[#e5ddd2] flex items-center px-4 bg-[#faf8f5] gap-2 overflow-x-auto relative" ref={dropdownRef}>
      {/* 基础格式化工具 */}
      <div className="flex items-center gap-1 pr-2 border-r border-[#e5ddd2]">
        <button
          onClick={() => execCommand('bold')}
          className={`toolbar-btn ${activeFormats.has('bold') ? 'active' : ''}`}
          title="加粗 (Ctrl+B)"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
          </svg>
        </button>

        <button
          onClick={() => execCommand('italic')}
          className={`toolbar-btn ${activeFormats.has('italic') ? 'active' : ''}`}
          title="斜体 (Ctrl+I)"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 4h7M7 20h7m0-16l-4 16" />
          </svg>
        </button>

        <button
          onClick={() => execCommand('underline')}
          className={`toolbar-btn ${activeFormats.has('underline') ? 'active' : ''}`}
          title="下划线 (Ctrl+U)"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v6a5 5 0 0 0 10 0V4M5 21h14" />
          </svg>
        </button>
      </div>

      {/* 标题工具 */}
      <div className="flex items-center gap-1 pr-2 border-r border-[#e5ddd2]">
        <select
          onChange={(e) => execCommand('formatBlock', e.target.value)}
          className="toolbar-select"
          defaultValue=""
        >
          <option value="">正文</option>
          <option value="h1">标题 1</option>
          <option value="h2">标题 2</option>
          <option value="h3">标题 3</option>
        </select>
      </div>

      {/* 对齐工具 */}
      <div className="flex items-center gap-1 pr-2 border-r border-[#e5ddd2]">
        <button onClick={() => execCommand('justifyLeft')} className="toolbar-btn" title="左对齐">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h10M4 18h16" />
          </svg>
        </button>

        <button onClick={() => execCommand('justifyCenter')} className="toolbar-btn" title="居中对齐">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M7 12h10M4 18h16" />
          </svg>
        </button>

        <button onClick={() => execCommand('justifyRight')} className="toolbar-btn" title="右对齐">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M10 12h10M4 18h16" />
          </svg>
        </button>
      </div>

      {/* 列表工具 */}
      <div className="flex items-center gap-1 pr-2 border-r border-[#e5ddd2]">
        <button onClick={() => execCommand('insertUnorderedList')} className="toolbar-btn" title="无序列表">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            <circle cx="2" cy="6" r="1" fill="currentColor" />
            <circle cx="2" cy="12" r="1" fill="currentColor" />
            <circle cx="2" cy="18" r="1" fill="currentColor" />
          </svg>
        </button>

        <button onClick={() => execCommand('insertOrderedList')} className="toolbar-btn" title="有序列表">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {/* 颜色/高亮工具 */}
      <div className="flex items-center gap-1 pr-2 border-r border-[#e5ddd2] relative">
        <button
          onClick={() => toggleDropdown('highlight')}
          className="toolbar-btn"
          title="高亮颜色"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10M12 3v18M6 12l6-6 6 6" />
          </svg>
        </button>

        {/* 颜色下拉菜单 */}
        {showDropdown === 'highlight' && (
          <div className="absolute top-full left-0 mt-1 bg-white border border-[#e5ddd2] rounded-lg shadow-lg p-2 z-50 flex gap-1">
            {COLORS.map((color) => (
              <button
                key={color.value}
                onClick={() => applyHighlight(color.value)}
                className="w-6 h-6 rounded border border-gray-300 hover:scale-110 transition-transform"
                style={{ backgroundColor: color.value }}
                title={color.label}
              />
            ))}
            <button
              onClick={() => applyHighlight('transparent')}
              className="w-6 h-6 rounded border border-gray-300 hover:scale-110 transition-transform flex items-center justify-center"
              title="清除高亮"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* 短剧专用工具 */}
      {workType === 'script' && (
        <>
          <div className="flex items-center gap-1 pr-2 border-r border-[#e5ddd2]">
            <button onClick={() => insertSceneHeader()} className="toolbar-btn-text" title="插入场景标注">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span className="text-xs">场景</span>
            </button>

            <button onClick={() => insertDialogue()} className="toolbar-btn-text" title="插入人物对话">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span className="text-xs">对话</span>
            </button>

            <button onClick={() => insertAction()} className="toolbar-btn-text" title="插入场景描述">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="text-xs">描述</span>
            </button>

            <button onClick={() => insertParenthetical()} className="toolbar-btn-text" title="插入动作指示">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-xs">动作</span>
            </button>
          </div>

          {/* 镜头工具 */}
          <div className="flex items-center gap-1 pr-2 border-r border-[#e5ddd2] relative">
            <button onClick={() => toggleDropdown('camera')} className="toolbar-btn-text" title="插入镜头指示">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-xs">镜头</span>
            </button>

            {showDropdown === 'camera' && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-[#e5ddd2] rounded-lg shadow-lg py-1 z-50 w-32">
                {CAMERA_SHOTS.map((shot) => (
                  <button
                    key={shot.value}
                    onClick={() => insertCameraShot(shot.value)}
                    className="w-full px-3 py-1.5 text-left text-xs hover:bg-primary-50 text-[#38342e]"
                  >
                    {shot.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 转场工具 */}
          <div className="flex items-center gap-1 pr-2 border-r border-[#e5ddd2] relative">
            <button onClick={() => toggleDropdown('transition')} className="toolbar-btn-text" title="插入转场">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="text-xs">转场</span>
            </button>

            {showDropdown === 'transition' && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-[#e5ddd2] rounded-lg shadow-lg py-1 z-50 w-24">
                {TRANSITIONS.map((trans) => (
                  <button
                    key={trans.value}
                    onClick={() => insertTransition(trans.value)}
                    className="w-full px-3 py-1.5 text-left text-xs hover:bg-primary-50 text-[#38342e]"
                  >
                    {trans.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 音效工具 */}
          <div className="flex items-center gap-1 pr-2 border-r border-[#e5ddd2]">
            <button onClick={() => insertSound('music')} className="toolbar-btn-text" title="插入音乐">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
              <span className="text-xs">音乐</span>
            </button>

            <button onClick={() => insertSound('effect')} className="toolbar-btn-text" title="插入音效">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
              <span className="text-xs">音效</span>
            </button>
          </div>
        </>
      )}

      {/* 小说专用工具 */}
      {workType === 'novel' && (
        <div className="flex items-center gap-1 pr-2 border-r border-[#e5ddd2]">
          <button onClick={() => insertNovelParagraph()} className="toolbar-btn-text" title="插入段落（首行缩进）">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-xs">段落</span>
          </button>

          <button onClick={() => insertNovelDialogue()} className="toolbar-btn-text" title="插入对话">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <span className="text-xs">对话</span>
          </button>

          <button onClick={() => insertMonologue()} className="toolbar-btn-text" title="插入内心独白">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs">独白</span>
          </button>

          <button onClick={() => insertChapterTitle()} className="toolbar-btn-text" title="插入章节标题">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
            <span className="text-xs">章节</span>
          </button>

          <button onClick={() => insertQuote()} className="toolbar-btn-text" title="插入引用">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs">引用</span>
          </button>
        </div>
      )}

      {/* 快捷模板 */}
      <div className="flex items-center gap-1 pr-2 border-r border-[#e5ddd2] relative">
        <button onClick={() => toggleDropdown('template')} className="toolbar-btn-text" title="快捷文本">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span className="text-xs">模板</span>
        </button>

        {showDropdown === 'template' && (
          <div className="absolute top-full left-0 mt-1 bg-white border border-[#e5ddd2] rounded-lg shadow-lg py-1 z-50 w-32">
            {QUICK_TEMPLATES[workType].map((template) => (
              <button
                key={template.value}
                onClick={() => insertTemplate(template.value)}
                className="w-full px-3 py-1.5 text-left text-xs hover:bg-primary-50 text-[#38342e]"
              >
                {template.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 通用工具 */}
      <div className="flex items-center gap-1 pr-2 border-r border-[#e5ddd2]">
        <button onClick={() => execCommand('undo')} className="toolbar-btn" title="撤销 (Ctrl+Z)">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
        </button>

        <button onClick={() => execCommand('redo')} className="toolbar-btn" title="重做 (Ctrl+Y)">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6" />
          </svg>
        </button>

        <button onClick={insertDivider} className="toolbar-btn" title="插入分隔线">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" />
          </svg>
        </button>

        <button onClick={() => execCommand('removeFormat')} className="toolbar-btn" title="清除格式">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* 字数统计 */}
      <div className="ml-auto flex items-center gap-2 text-xs text-[#9a8c79]">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span className="font-mono">{wordCount.toLocaleString()} 字</span>
      </div>
    </div>
  );
}
