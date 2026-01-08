/**
 * NovelToolbar - 小说专用工具栏
 *
 * 专为小说创作优化的工具栏，提供：
 * 1. 章节结构（章节标题、卷标题、分卷）
 * 2. 段落格式（首行缩进、悬挂缩进、段间距）
 * 3. 对话格式（对话、内心独白、旁白）
 * 4. 叙述工具（引用、强调、注释）
 * 5. 场景转换（时间跳转、场景切换、回忆/梦境）
 * 6. 文学装饰（分隔符、诗歌、题记）
 */

import { useState, useEffect, useRef } from 'react';

interface NovelToolbarProps {
  editorRef: React.RefObject<HTMLDivElement | null>;
  wordCount: number;
}

// 快捷短语
const QUICK_PHRASES = [
  '话音刚落，',
  '与此同时，',
  '片刻之后，',
  '突然，',
  '不知不觉间，',
  '转眼之间，',
  '就在这时，',
  '正当此时，',
  '恍惚之间，',
  '许久之后，',
];

// 分隔符样式
const DIVIDERS = [
  { label: '星号', value: '※　※　※' },
  { label: '方块', value: '■　■　■' },
  { label: '圆点', value: '●　●　●' },
  { label: '菱形', value: '◆　◆　◆' },
  { label: '波浪', value: '～～～' },
  { label: '横线', value: '——————' },
];

// 章节编号格式（保留供未来扩展使用）
// const CHAPTER_FORMATS = [
//   { label: '数字', format: (n: number) => `第${n}章` },
//   { label: '中文', format: (n: number) => `第${['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][n] || n}章` },
//   { label: '罗马', format: (n: number) => `Chapter ${['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n] || n}` },
// ];

// 叙述视角（保留供未来扩展使用）
// const PERSPECTIVES = [
//   '他/她想，',
//   '他/她心想，',
//   '他/她暗自思忖，',
//   '他/她心中一动，',
//   '他/她若有所思地，',
// ];

// 文字颜色选项
const TEXT_COLORS = [
  { name: '黑色', value: '#000000' },
  { name: '深灰', value: '#4B5563' },
  { name: '红色', value: '#EF4444' },
  { name: '橙色', value: '#F97316' },
  { name: '黄色', value: '#EAB308' },
  { name: '绿色', value: '#22C55E' },
  { name: '青色', value: '#06B6D4' },
  { name: '蓝色', value: '#3B82F6' },
  { name: '紫色', value: '#A855F7' },
  { name: '粉色', value: '#EC4899' },
];

// 背景颜色选项
const BG_COLORS = [
  { name: '无', value: 'transparent' },
  { name: '浅灰', value: '#F3F4F6' },
  { name: '浅红', value: '#FEE2E2' },
  { name: '浅橙', value: '#FFEDD5' },
  { name: '浅黄', value: '#FEF9C3' },
  { name: '浅绿', value: '#DCFCE7' },
  { name: '浅青', value: '#CFFAFE' },
  { name: '浅蓝', value: '#DBEAFE' },
  { name: '浅紫', value: '#F3E8FF' },
  { name: '浅粉', value: '#FCE7F3' },
];

export default function NovelToolbar({ editorRef, wordCount }: NovelToolbarProps) {
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set());
  const [showDropdown, setShowDropdown] = useState<string | null>(null);
  const [showChapterDialog, setShowChapterDialog] = useState(false);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [showFindReplaceDialog, setShowFindReplaceDialog] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  /**
   * 执行格式化命令
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
   * 更新激活格式
   */
  const updateActiveFormats = () => {
    const formats = new Set<string>();
    if (document.queryCommandState('bold')) formats.add('bold');
    if (document.queryCommandState('italic')) formats.add('italic');
    if (document.queryCommandState('underline')) formats.add('underline');
    if (document.queryCommandState('strikeThrough')) formats.add('strikeThrough');
    setActiveFormats(formats);
  };

  /**
   * 插入章节标题
   */
  const insertChapterTitle = (chapterNum: string, title: string, hasSubtitle: boolean, subtitle?: string) => {
    let html = `<h2 class="my-8 text-2xl font-bold text-center text-[#38342e] tracking-wider">第${chapterNum}章 ${title}</h2>`;

    if (hasSubtitle && subtitle) {
      html += `<div class="text-center text-base text-[#7a6e5f] mb-6 italic">${subtitle}</div>`;
    }

    insertHTML(html);
    setShowChapterDialog(false);
  };

  /**
   * 插入卷标题
   */
  const insertVolumeTitle = () => {
    const html = `<h1 class="my-12 text-3xl font-bold text-center text-[#38342e] tracking-widest">第一卷 卷名</h1>`;
    insertHTML(html);
  };

  /**
   * 插入段落（首行缩进）
   */
  const insertParagraph = () => {
    const html = `<p class="mb-4 text-[#38342e] leading-loose indent-8">段落内容</p>`;
    insertHTML(html);
  };

  /**
   * 插入对话
   */
  const insertDialogue = () => {
    const html = `<p class="mb-3 text-[#38342e] leading-loose indent-8">"<span contenteditable="true">对话内容</span>"某人<span contenteditable="true">说道</span>。</p>`;
    insertHTML(html);
  };

  /**
   * 插入内心独白
   */
  const insertMonologue = () => {
    const html = `<p class="mb-3 text-[#5d554a] leading-loose indent-8 italic">内心独白内容</p>`;
    insertHTML(html);
  };

  /**
   * 插入旁白/作者注
   */
  const insertNarration = () => {
    const html = `<div class="my-4 px-4 py-2 bg-[#f2ede7] border-l-4 border-primary-300 text-[#7a6e5f] text-sm italic rounded-r">（作者注：旁白或注释内容）</div>`;
    insertHTML(html);
  };

  /**
   * 插入引用/题记
   */
  const insertQuote = () => {
    const html = `<blockquote class="my-6 pl-6 border-l-4 border-primary-300 text-[#5d554a] italic leading-loose">
  <p class="mb-2">引用内容或题记</p>
  <footer class="text-sm text-[#9a8c79] text-right">—— 出处</footer>
</blockquote>`;
    insertHTML(html);
  };

  /**
   * 插入强调文本
   */
  const insertEmphasis = () => {
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) {
      execCommand('bold');
      execCommand('italic');
    } else {
      const html = `<strong class="italic text-primary-700">强调内容</strong>`;
      insertHTML(html);
    }
  };

  /**
   * 插入诗歌/歌词
   */
  const insertPoem = () => {
    const html = `<div class="my-6 text-center text-[#38342e] leading-loose italic">
  <p>诗歌第一行</p>
  <p>诗歌第二行</p>
  <p>诗歌第三行</p>
</div>`;
    insertHTML(html);
  };

  /**
   * 插入分隔符
   */
  const insertDivider = (divider: string) => {
    const html = `<div class="my-8 text-center text-[#9a8c79] text-lg tracking-widest">${divider}</div>`;
    insertHTML(html);
  };

  /**
   * 插入场景转换
   */
  const insertSceneTransition = (type: string) => {
    const transitions: Record<string, string> = {
      time: '<div class="my-6 text-center text-[#7a6e5f] font-semibold">【三天后】</div>',
      place: '<div class="my-6 text-center text-[#7a6e5f] font-semibold">【另一边】</div>',
      flashback: '<div class="my-6 text-center text-[#7a6e5f] font-semibold italic">【回忆】</div>',
      dream: '<div class="my-6 text-center text-[#7a6e5f] font-semibold italic">【梦境】</div>',
    };
    insertHTML(transitions[type] || transitions.time);
  };

  /**
   * 插入环境描写
   */
  const insertEnvironment = () => {
    const html = `<p class="mb-4 text-[#5d554a] leading-loose indent-8 bg-[#faf8f5] py-1">环境描写：天气、景色、氛围等</p>`;
    insertHTML(html);
  };

  /**
   * 插入心理描写
   */
  const insertPsychology = () => {
    const html = `<p class="mb-3 text-[#5d554a] leading-loose indent-8 italic">他心想，这究竟是怎么回事？</p>`;
    insertHTML(html);
  };

  /**
   * 插入快捷短语
   */
  const insertPhrase = (phrase: string) => {
    insertHTML(phrase);
  };

  /**
   * 切换下拉菜单
   */
  const toggleDropdown = (name: string) => {
    setShowDropdown(showDropdown === name ? null : name);
  };

  /**
   * 插入链接
   */
  const insertLink = () => {
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) {
      setShowLinkDialog(true);
    } else {
      const url = prompt('请输入链接地址:');
      if (url) {
        execCommand('createLink', url);
      }
    }
  };

  /**
   * 确认插入链接
   */
  const confirmInsertLink = () => {
    if (linkUrl) {
      execCommand('createLink', linkUrl);
      setShowLinkDialog(false);
      setLinkUrl('');
    }
  };

  /**
   * 查找文本
   */
  const findInEditor = () => {
    if (!findText || !editorRef.current) return;

    const selection = window.getSelection();
    if (!selection) return;

    // 使用浏览器的查找功能
    const found = (window as any).find?.(findText);
    if (!found) {
      // 如果浏览器不支持，则手动查找
      const text = editorRef.current.textContent || '';
      const index = text.indexOf(findText);
      if (index !== -1) {
        const range = document.createRange();
        const walker = document.createTreeWalker(
          editorRef.current,
          NodeFilter.SHOW_TEXT,
          null
        );

        let currentPos = 0;
        let node;
        while ((node = walker.nextNode())) {
          const nodeLength = node.textContent?.length || 0;
          if (currentPos + nodeLength > index) {
            range.setStart(node, index - currentPos);
            range.setEnd(node, index - currentPos + findText.length);
            selection.removeAllRanges();
            selection.addRange(range);
            break;
          }
          currentPos += nodeLength;
        }
      }
    }
  };

  /**
   * 替换文本
   */
  const replaceInEditor = () => {
    if (!findText || !replaceText || !editorRef.current) return;

    const content = editorRef.current.innerHTML;
    const newContent = content.replace(new RegExp(findText, 'g'), replaceText);
    editorRef.current.innerHTML = newContent;
  };

  /**
   * 监听选择变化
   */
  useEffect(() => {
    const handleSelectionChange = () => {
      updateActiveFormats();
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
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
    <>
      <div className="h-14 border-b border-[#e5ddd2] flex items-center px-4 bg-gradient-to-r from-[#faf8f5] to-[#f5ede3] gap-2 overflow-x-auto relative shadow-sm" ref={dropdownRef}>
        {/* 章节结构工具组 */}
        <div className="flex items-center gap-1 pr-3 border-r border-[#d1c3b4]">
          <button
            onClick={() => setShowChapterDialog(true)}
            className="toolbar-btn-text bg-amber-50 hover:bg-amber-100 border border-amber-200"
            title="插入章节标题（快捷键：Ctrl+Shift+C）"
          >
            <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <span className="text-xs font-semibold">章节</span>
          </button>

          <button onClick={insertVolumeTitle} className="toolbar-btn-text" title="插入卷标题">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <span className="text-xs">分卷</span>
          </button>
        </div>

        {/* 段落工具组 */}
        <div className="flex items-center gap-1 pr-3 border-r border-[#d1c3b4]">
          <button onClick={insertParagraph} className="toolbar-btn-text bg-blue-50 hover:bg-blue-100 border border-blue-200" title="插入段落（首行缩进）">
            <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-xs font-semibold">段落</span>
          </button>

          <button onClick={insertEnvironment} className="toolbar-btn-text" title="插入环境描写">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
            </svg>
            <span className="text-xs">环境</span>
          </button>
        </div>

        {/* 对话工具组 */}
        <div className="flex items-center gap-1 pr-3 border-r border-[#d1c3b4]">
          <button onClick={insertDialogue} className="toolbar-btn-text bg-green-50 hover:bg-green-100 border border-green-200" title="插入人物对话">
            <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <span className="text-xs font-semibold">对话</span>
          </button>

          <button onClick={insertMonologue} className="toolbar-btn-text" title="插入内心独白">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs">独白</span>
          </button>

          <button onClick={insertPsychology} className="toolbar-btn-text" title="插入心理描写">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <span className="text-xs">心理</span>
          </button>
        </div>

        {/* 叙述工具组 */}
        <div className="flex items-center gap-1 pr-3 border-r border-[#d1c3b4]">
          <button onClick={insertQuote} className="toolbar-btn-text" title="插入引用/题记">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
            <span className="text-xs">引用</span>
          </button>

          <button onClick={insertEmphasis} className="toolbar-btn-text" title="插入强调">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
            <span className="text-xs">强调</span>
          </button>

          <button onClick={insertNarration} className="toolbar-btn-text" title="插入旁白/注释">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
            <span className="text-xs">旁白</span>
          </button>

          <button onClick={insertPoem} className="toolbar-btn-text" title="插入诗歌/歌词">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
            <span className="text-xs">诗歌</span>
          </button>
        </div>

        {/* 场景转换工具组 */}
        <div className="flex items-center gap-1 pr-3 border-r border-[#d1c3b4] relative">
          <button onClick={() => toggleDropdown('transition')} className="toolbar-btn-text" title="场景转换">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs">转换</span>
          </button>

          {showDropdown === 'transition' && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-[#e5ddd2] rounded-lg shadow-xl py-1 z-50 w-32">
              <button onClick={() => insertSceneTransition('time')} className="w-full px-3 py-1.5 text-left text-xs hover:bg-primary-50 text-[#38342e]">
                ⏰ 时间跳转
              </button>
              <button onClick={() => insertSceneTransition('place')} className="w-full px-3 py-1.5 text-left text-xs hover:bg-primary-50 text-[#38342e]">
                📍 地点切换
              </button>
              <button onClick={() => insertSceneTransition('flashback')} className="w-full px-3 py-1.5 text-left text-xs hover:bg-primary-50 text-[#38342e]">
                🔄 回忆场景
              </button>
              <button onClick={() => insertSceneTransition('dream')} className="w-full px-3 py-1.5 text-left text-xs hover:bg-primary-50 text-[#38342e]">
                💭 梦境场景
              </button>
            </div>
          )}
        </div>

        {/* 分隔符工具组 */}
        <div className="flex items-center gap-1 pr-3 border-r border-[#d1c3b4] relative">
          <button onClick={() => toggleDropdown('divider')} className="toolbar-btn-text" title="插入分隔符">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" />
            </svg>
            <span className="text-xs">分隔</span>
          </button>

          {showDropdown === 'divider' && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-[#e5ddd2] rounded-lg shadow-xl py-1 z-50 w-32">
              {DIVIDERS.map((div) => (
                <button
                  key={div.value}
                  onClick={() => insertDivider(div.value)}
                  className="w-full px-3 py-1.5 text-left text-xs hover:bg-primary-50 text-[#38342e]"
                >
                  {div.label} {div.value}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 快捷短语 */}
        <div className="flex items-center gap-1 pr-3 border-r border-[#d1c3b4] relative">
          <button onClick={() => toggleDropdown('phrase')} className="toolbar-btn-text" title="快捷短语">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span className="text-xs">短语</span>
          </button>

          {showDropdown === 'phrase' && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-[#e5ddd2] rounded-lg shadow-xl py-1 z-50 w-36">
              {QUICK_PHRASES.map((phrase) => (
                <button
                  key={phrase}
                  onClick={() => insertPhrase(phrase)}
                  className="w-full px-3 py-1.5 text-left text-xs hover:bg-primary-50 text-[#38342e]"
                >
                  {phrase}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 基础格式化工具 */}
        <div className="flex items-center gap-1 pr-3 border-r border-[#d1c3b4]">
          <button
            onClick={() => execCommand('bold')}
            className={`toolbar-btn ${activeFormats.has('bold') ? 'active' : ''}`}
            title="加粗"
          >
            <strong className="text-sm">B</strong>
          </button>

          <button
            onClick={() => execCommand('italic')}
            className={`toolbar-btn ${activeFormats.has('italic') ? 'active' : ''}`}
            title="斜体"
          >
            <em className="text-sm">I</em>
          </button>

          <button
            onClick={() => execCommand('underline')}
            className={`toolbar-btn ${activeFormats.has('underline') ? 'active' : ''}`}
            title="下划线"
          >
            <span className="text-sm underline">U</span>
          </button>

          <button
            onClick={() => execCommand('strikeThrough')}
            className={`toolbar-btn ${activeFormats.has('strikeThrough') ? 'active' : ''}`}
            title="删除线"
          >
            <span className="text-sm line-through">S</span>
          </button>

          <button
            onClick={() => execCommand('formatBlock', 'blockquote')}
            className="toolbar-btn"
            title="引用块"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
          </button>
        </div>

        {/* 对齐工具 */}
        <div className="flex items-center gap-1 pr-3 border-r border-[#d1c3b4]">
          <button onClick={() => execCommand('justifyLeft')} className="toolbar-btn" title="左对齐 (Ctrl+Shift+L)">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h10M4 18h16" />
            </svg>
          </button>

          <button onClick={() => execCommand('justifyCenter')} className="toolbar-btn" title="居中对齐 (Ctrl+Shift+E)">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h12M4 18h16" />
            </svg>
          </button>

          <button onClick={() => execCommand('justifyRight')} className="toolbar-btn" title="右对齐 (Ctrl+Shift+R)">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M10 12h10M4 18h16" />
            </svg>
          </button>

          <button onClick={() => execCommand('justifyFull')} className="toolbar-btn" title="两端对齐 (Ctrl+Shift+J)">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        {/* 列表工具 */}
        <div className="flex items-center gap-1 pr-3 border-r border-[#d1c3b4]">
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

        {/* 缩进工具 */}
        <div className="flex items-center gap-1 pr-3 border-r border-[#d1c3b4]">
          <button onClick={() => execCommand('indent')} className="toolbar-btn" title="增加缩进 (Tab)">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>

          <button onClick={() => execCommand('outdent')} className="toolbar-btn" title="减少缩进 (Shift+Tab)">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
        </div>

        {/* 清除格式 */}
        <div className="flex items-center gap-1 pr-3 border-r border-[#d1c3b4]">
          <button onClick={() => execCommand('removeFormat')} className="toolbar-btn" title="清除格式 (Ctrl+\)">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 标题和字号选择器 */}
        <div className="flex items-center gap-1 pr-3 border-r border-[#d1c3b4] relative">
          <select
            onChange={(e) => {
              if (e.target.value) {
                execCommand('formatBlock', e.target.value);
                e.target.value = '';
              }
            }}
            className="text-xs border border-[#d1c3b4] rounded px-2 py-1 bg-white hover:bg-[#f5ede3] focus:outline-none focus:ring-1 focus:ring-primary-400"
            defaultValue=""
            title="段落格式"
          >
            <option value="">正文</option>
            <option value="h1">标题 1</option>
            <option value="h2">标题 2</option>
            <option value="h3">标题 3</option>
            <option value="h4">标题 4</option>
            <option value="h5">标题 5</option>
            <option value="h6">标题 6</option>
          </select>

          <select
            onChange={(e) => {
              if (e.target.value) {
                execCommand('fontSize', e.target.value);
                e.target.value = '';
              }
            }}
            className="text-xs border border-[#d1c3b4] rounded px-2 py-1 bg-white hover:bg-[#f5ede3] focus:outline-none focus:ring-1 focus:ring-primary-400 w-16"
            defaultValue=""
            title="字号"
          >
            <option value="">字号</option>
            <option value="1">极小</option>
            <option value="2">小</option>
            <option value="3">中</option>
            <option value="4">偏大</option>
            <option value="5">大</option>
            <option value="6">较大</option>
            <option value="7">极大</option>
          </select>
        </div>

        {/* 颜色工具 */}
        <div className="flex items-center gap-1 pr-3 border-r border-[#d1c3b4] relative">
          <button onClick={() => toggleDropdown('textColor')} className="toolbar-btn" title="文字颜色">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
            </svg>
          </button>

          {showDropdown === 'textColor' && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-[#e5ddd2] rounded-lg shadow-xl p-2 z-50 w-48">
              <div className="grid grid-cols-5 gap-1">
                {TEXT_COLORS.map((color) => (
                  <button
                    key={color.value}
                    onClick={() => {
                      execCommand('foreColor', color.value);
                      setShowDropdown(null);
                    }}
                    className="w-8 h-8 rounded border border-gray-300 hover:scale-110 transition-transform"
                    style={{ backgroundColor: color.value }}
                    title={color.name}
                  />
                ))}
              </div>
            </div>
          )}

          <button onClick={() => toggleDropdown('bgColor')} className="toolbar-btn" title="背景颜色">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
              <rect x="7" y="17" width="10" height="4" fill="currentColor" opacity="0.5" />
            </svg>
          </button>

          {showDropdown === 'bgColor' && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-[#e5ddd2] rounded-lg shadow-xl p-2 z-50 w-48">
              <div className="grid grid-cols-5 gap-1">
                {BG_COLORS.map((color) => (
                  <button
                    key={color.value}
                    onClick={() => {
                      execCommand('hiliteColor', color.value);
                      setShowDropdown(null);
                    }}
                    className="w-8 h-8 rounded border border-gray-300 hover:scale-110 transition-transform"
                    style={{ backgroundColor: color.value }}
                    title={color.name}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 高级格式工具 */}
        <div className="flex items-center gap-1 pr-3 border-r border-[#d1c3b4]">
          <button onClick={() => execCommand('superscript')} className="toolbar-btn" title="上标">
            <span className="text-xs">X<sup>2</sup></span>
          </button>

          <button onClick={() => execCommand('subscript')} className="toolbar-btn" title="下标">
            <span className="text-xs">X<sub>2</sub></span>
          </button>

          <button
            onClick={() => {
              const selection = window.getSelection();
              if (selection && !selection.isCollapsed) {
                const code = document.createElement('code');
                code.className = 'px-1 py-0.5 bg-gray-100 rounded text-sm font-mono';
                const range = selection.getRangeAt(0);
                range.surroundContents(code);
              }
            }}
            className="toolbar-btn"
            title="代码"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </button>
        </div>

        {/* 插入和查找工具 */}
        <div className="flex items-center gap-1 pr-3 border-r border-[#d1c3b4]">
          <button onClick={insertLink} className="toolbar-btn" title="插入链接 (Ctrl+K)">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </button>

          <button onClick={() => setShowFindReplaceDialog(true)} className="toolbar-btn" title="查找替换 (Ctrl+F)">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
        </div>

        {/* 通用工具 */}
        <div className="flex items-center gap-1">
          <button onClick={() => execCommand('undo')} className="toolbar-btn" title="撤销">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          </button>

          <button onClick={() => execCommand('redo')} className="toolbar-btn" title="重做">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6" />
            </svg>
          </button>
        </div>

        {/* 字数统计 */}
        <div className="ml-auto flex items-center gap-2 px-3 py-1.5 bg-white/50 rounded-lg border border-[#e5ddd2]">
          <svg className="w-4 h-4 text-[#7a6e5f]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="text-xs font-mono text-[#38342e] font-semibold">{wordCount.toLocaleString()}</span>
          <span className="text-xs text-[#9a8c79]">字</span>
        </div>
      </div>

      {/* 章节对话框 */}
      {showChapterDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-2xl w-[500px]">
            <div className="p-6 border-b border-[#e5ddd2]">
              <h3 className="text-lg font-semibold text-[#38342e]">插入章节标题</h3>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                insertChapterTitle(
                  formData.get('chapterNum') as string,
                  formData.get('title') as string,
                  formData.get('hasSubtitle') === 'on',
                  formData.get('subtitle') as string
                );
              }}
            >
              <div className="p-6 space-y-4">
                {/* 章节号 */}
                <div>
                  <label className="block text-sm font-medium text-[#38342e] mb-2">章节号</label>
                  <input
                    type="text"
                    name="chapterNum"
                    className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400"
                    placeholder="一"
                    defaultValue="一"
                    required
                    autoFocus
                  />
                  <p className="text-xs text-[#9a8c79] mt-1">可输入中文数字（一、二、三）或阿拉伯数字（1、2、3）</p>
                </div>

                {/* 章节标题 */}
                <div>
                  <label className="block text-sm font-medium text-[#38342e] mb-2">章节标题</label>
                  <input
                    type="text"
                    name="title"
                    className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400"
                    placeholder="章节标题"
                    required
                  />
                </div>

                {/* 副标题（可选） */}
                <div>
                  <label className="flex items-center gap-2 mb-2">
                    <input
                      type="checkbox"
                      name="hasSubtitle"
                      className="text-primary-500"
                    />
                    <span className="text-sm font-medium text-[#38342e]">添加副标题</span>
                  </label>
                  <input
                    type="text"
                    name="subtitle"
                    className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400"
                    placeholder="副标题（可选）"
                  />
                </div>
              </div>

              <div className="p-6 border-t border-[#e5ddd2] flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowChapterDialog(false)}
                  className="btn"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                >
                  插入
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 插入链接对话框 */}
      {showLinkDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-2xl w-[400px]">
            <div className="p-6 border-b border-[#e5ddd2]">
              <h3 className="text-lg font-semibold text-[#38342e]">插入链接</h3>
            </div>

            <div className="p-6">
              <label className="block text-sm font-medium text-[#38342e] mb-2">链接地址</label>
              <input
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400"
                placeholder="https://example.com"
                autoFocus
              />
            </div>

            <div className="p-6 border-t border-[#e5ddd2] flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowLinkDialog(false);
                  setLinkUrl('');
                }}
                className="btn"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmInsertLink}
                className="btn btn-primary"
              >
                插入
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 查找替换对话框 */}
      {showFindReplaceDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-2xl w-[500px]">
            <div className="p-6 border-b border-[#e5ddd2]">
              <h3 className="text-lg font-semibold text-[#38342e]">查找和替换</h3>
            </div>

            <div className="p-6 space-y-4">
              {/* 查找 */}
              <div>
                <label className="block text-sm font-medium text-[#38342e] mb-2">查找内容</label>
                <input
                  type="text"
                  value={findText}
                  onChange={(e) => setFindText(e.target.value)}
                  className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400"
                  placeholder="输入要查找的文本"
                  autoFocus
                />
              </div>

              {/* 替换 */}
              <div>
                <label className="block text-sm font-medium text-[#38342e] mb-2">替换为</label>
                <input
                  type="text"
                  value={replaceText}
                  onChange={(e) => setReplaceText(e.target.value)}
                  className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400"
                  placeholder="输入替换后的文本"
                />
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={findInEditor}
                  className="btn flex-1"
                >
                  查找下一个
                </button>
                <button
                  type="button"
                  onClick={replaceInEditor}
                  className="btn btn-primary flex-1"
                >
                  全部替换
                </button>
              </div>
            </div>

            <div className="p-6 border-t border-[#e5ddd2] flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowFindReplaceDialog(false);
                  setFindText('');
                  setReplaceText('');
                }}
                className="btn"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
