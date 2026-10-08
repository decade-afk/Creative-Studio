/**
 * ScriptToolbar - 短剧剧本专用工具栏
 *
 * 专为短剧创作优化的工具栏，提供：
 * 1. 场景管理（场景标题、内外景、时间）
 * 2. 镜头语言（特写、全景、推拉摇等）
 * 3. 人物对话（角色名、对话、动作指示）
 * 4. 转场特效（切至、淡入淡出、溶入叠化）
 * 5. 音效音乐标注
 * 6. 剧本专业格式
 */

import { useState, useEffect, useRef } from 'react';

interface ScriptToolbarProps {
  editorRef: React.RefObject<HTMLDivElement | null>;
  wordCount: number;
}

// 镜头类型（完整的电影镜头语言）
const CAMERA_SHOTS = [
  { label: '远景 (ELS)', value: '【远景】', desc: '展现环境全貌' },
  { label: '全景 (LS)', value: '【全景】', desc: '人物全身' },
  { label: '中景 (MS)', value: '【中景】', desc: '膝盖以上' },
  { label: '近景 (MCU)', value: '【近景】', desc: '胸部以上' },
  { label: '特写 (CU)', value: '【特写】', desc: '面部' },
  { label: '大特写 (ECU)', value: '【大特写】', desc: '局部细节' },
];

// 镜头运动
const CAMERA_MOVEMENTS = [
  { label: '推镜', value: '【推镜】', desc: '镜头向前推进' },
  { label: '拉镜', value: '【拉镜】', desc: '镜头向后拉远' },
  { label: '摇镜', value: '【摇镜】', desc: '镜头左右摇动' },
  { label: '跟镜', value: '【跟镜】', desc: '跟随人物移动' },
  { label: '升降镜头', value: '【升降】', desc: '垂直升降' },
  { label: '环绕镜头', value: '【环绕】', desc: '围绕拍摄' },
];

// 镜头角度
const CAMERA_ANGLES = [
  { label: '平视', value: '【平视】' },
  { label: '俯拍', value: '【俯拍】' },
  { label: '仰拍', value: '【仰拍】' },
  { label: '倾斜镜头', value: '【倾斜】' },
  { label: '主观镜头', value: '【主观】' },
  { label: '客观镜头', value: '【客观】' },
];

// 转场类型（专业版）
const TRANSITIONS = [
  { label: '切至', value: '切至：', icon: '✂️' },
  { label: '淡入', value: '淡入', icon: '🌅' },
  { label: '淡出', value: '淡出', icon: '🌆' },
  { label: '溶入', value: '溶入', icon: '💫' },
  { label: '叠化', value: '叠化', icon: '🎞️' },
  { label: '划入', value: '划入', icon: '➡️' },
  { label: '划出', value: '划出', icon: '⬅️' },
  { label: '闪白', value: '闪白', icon: '⚡' },
  { label: '闪黑', value: '闪黑', icon: '🌑' },
];

// 场景时间
const SCENE_TIMES = ['日', '晚', '夜', '黎明', '黄昏', '凌晨', '傍晚', '午后'];

// 快捷短语
const QUICK_PHRASES = [
  '（画外音）',
  '（旁白）',
  '（电话中）',
  '（回忆）',
  '（梦境）',
  '（插叙）',
  '（倒叙）',
  '与此同时——',
  '片刻之后——',
  '同一时间——',
];

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

export default function ScriptToolbar({ editorRef, wordCount }: ScriptToolbarProps) {
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set());
  const [showDropdown, setShowDropdown] = useState<string | null>(null);
  const [showSceneDialog, setShowSceneDialog] = useState(false);
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
    setActiveFormats(formats);
  };

  /**
   * 插入场景标题（FDX格式）
   */
  const insertSceneHeader = (sceneNum: string, location: string, time: string, interior: boolean) => {
    const html = `<div class="mb-6 mt-8 font-mono text-base font-bold text-primary-700 uppercase">
  场 ${sceneNum}. ${interior ? '内' : '外'}. ${location} - ${time}
</div>`;
    insertHTML(html);
    setShowSceneDialog(false);
  };

  /**
   * 插入人物对话（专业格式）
   */
  const insertDialogue = () => {
    const html = `<div class="my-4">
  <div class="font-bold text-[#38342e] text-center mb-1 uppercase tracking-wide">角色名</div>
  <div class="text-[#38342e] text-center leading-relaxed max-w-2xl mx-auto">对话内容</div>
</div>`;
    insertHTML(html);
  };

  /**
   * 插入动作指示（Parenthetical）
   */
  const insertParenthetical = () => {
    const html = `<div class="text-center text-[#7a6e5f] italic text-sm my-1">(动作/表情)</div>`;
    insertHTML(html);
  };

  /**
   * 插入场景描述（Action）
   */
  const insertAction = () => {
    const html = `<div class="mb-4 text-[#38342e] leading-relaxed">场景描述或动作说明</div>`;
    insertHTML(html);
  };

  /**
   * 插入镜头指示
   */
  const insertCameraShot = (shot: string) => {
    const html = `<div class="my-2 text-primary-600 font-semibold text-sm tracking-wide">${shot}</div>`;
    insertHTML(html);
  };

  /**
   * 插入转场
   */
  const insertTransition = (transition: string) => {
    const html = `<div class="my-4 text-right text-[#38342e] font-bold uppercase tracking-widest">${transition}</div>`;
    insertHTML(html);
  };

  /**
   * 插入音效/音乐
   */
  const insertSound = (type: 'music' | 'effect') => {
    const prefix = type === 'music' ? '♪ ' : '';
    const label = type === 'music' ? '背景音乐' : '音效';
    const html = `<div class="my-2 text-[#8b6342] text-sm italic">[${prefix}${label}]</div>`;
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
      <div className="min-h-14 border-b border-[#e5ddd2] flex flex-wrap items-center px-4 py-1 bg-gradient-to-r from-[#faf8f5] to-[#f5f0e8] gap-x-2 gap-y-1 relative shadow-sm" ref={dropdownRef}>
        {/* 场景工具组 */}
        <div className="flex items-center gap-1 pr-3 border-r border-[#d1c3b4]">
          <button
            onClick={() => setShowSceneDialog(true)}
            className="toolbar-btn-text bg-primary-50 hover:bg-primary-100 border border-primary-200"
            title="插入场景标题（快捷键：Ctrl+Shift+S）"
          >
            <svg className="w-4 h-4 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span className="text-xs font-semibold">场景</span>
          </button>

          <button onClick={insertAction} className="toolbar-btn-text" title="插入场景描述（快捷键：Ctrl+Shift+A）">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-xs">描述</span>
          </button>
        </div>

        {/* 对话工具组 */}
        <div className="flex items-center gap-1 pr-3 border-r border-[#d1c3b4]">
          <button onClick={insertDialogue} className="toolbar-btn-text bg-blue-50 hover:bg-blue-100 border border-blue-200" title="插入人物对话（快捷键：Ctrl+Shift+D）">
            <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <span className="text-xs font-semibold">对话</span>
          </button>

          <button onClick={insertParenthetical} className="toolbar-btn-text" title="插入动作指示（快捷键：Ctrl+Shift+P）">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs">动作</span>
          </button>
        </div>

        {/* 镜头工具组 */}
        <div className="flex items-center gap-1 pr-3 border-r border-[#d1c3b4] relative">
          <button onClick={() => toggleDropdown('shots')} className="toolbar-btn-text" title="镜头景别">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-xs">景别</span>
          </button>

          <button onClick={() => toggleDropdown('movements')} className="toolbar-btn-text" title="镜头运动">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span className="text-xs">运动</span>
          </button>

          <button onClick={() => toggleDropdown('angles')} className="toolbar-btn-text" title="镜头角度">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            <span className="text-xs">角度</span>
          </button>

          {/* 镜头景别下拉菜单 */}
          {showDropdown === 'shots' && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-[#e5ddd2] rounded-lg shadow-xl py-1 z-50 w-48">
              {CAMERA_SHOTS.map((shot) => (
                <button
                  key={shot.value}
                  onClick={() => insertCameraShot(shot.value)}
                  className="w-full px-3 py-2 text-left hover:bg-primary-50 transition-colors"
                >
                  <div className="text-sm font-medium text-[#38342e]">{shot.label}</div>
                  <div className="text-xs text-[#9a8c79]">{shot.desc}</div>
                </button>
              ))}
            </div>
          )}

          {/* 镜头运动下拉菜单 */}
          {showDropdown === 'movements' && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-[#e5ddd2] rounded-lg shadow-xl py-1 z-50 w-48">
              {CAMERA_MOVEMENTS.map((movement) => (
                <button
                  key={movement.value}
                  onClick={() => insertCameraShot(movement.value)}
                  className="w-full px-3 py-2 text-left hover:bg-primary-50 transition-colors"
                >
                  <div className="text-sm font-medium text-[#38342e]">{movement.label}</div>
                  <div className="text-xs text-[#9a8c79]">{movement.desc}</div>
                </button>
              ))}
            </div>
          )}

          {/* 镜头角度下拉菜单 */}
          {showDropdown === 'angles' && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-[#e5ddd2] rounded-lg shadow-xl py-1 z-50 w-32">
              {CAMERA_ANGLES.map((angle) => (
                <button
                  key={angle.value}
                  onClick={() => insertCameraShot(angle.value)}
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-primary-50 text-[#38342e]"
                >
                  {angle.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 转场工具组 */}
        <div className="flex items-center gap-1 pr-3 border-r border-[#d1c3b4] relative">
          <button onClick={() => toggleDropdown('transition')} className="toolbar-btn-text" title="插入转场">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
            <span className="text-xs">转场</span>
          </button>

          {showDropdown === 'transition' && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-[#e5ddd2] rounded-lg shadow-xl py-1 z-50 w-36">
              {TRANSITIONS.map((trans) => (
                <button
                  key={trans.value}
                  onClick={() => insertTransition(trans.value)}
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-primary-50 text-[#38342e] flex items-center gap-2"
                >
                  <span>{trans.icon}</span>
                  <span>{trans.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 音效工具组 */}
        <div className="flex items-center gap-1 pr-3 border-r border-[#d1c3b4]">
          <button onClick={() => insertSound('music')} className="toolbar-btn-text" title="插入背景音乐">
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
            title="加粗 (Ctrl+B)"
          >
            <strong className="text-sm">B</strong>
          </button>

          <button
            onClick={() => execCommand('italic')}
            className={`toolbar-btn ${activeFormats.has('italic') ? 'active' : ''}`}
            title="斜体 (Ctrl+I)"
          >
            <em className="text-sm">I</em>
          </button>

          <button
            onClick={() => execCommand('underline')}
            className={`toolbar-btn ${activeFormats.has('underline') ? 'active' : ''}`}
            title="下划线 (Ctrl+U)"
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

          <button onClick={() => execCommand('justifyFull')} className="toolbar-btn" title="两端对齐">
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

        {/* 通用工具 */}
        <div className="flex items-center gap-1 pr-3 border-r border-[#d1c3b4]">
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
            className="text-xs border border-[#d1c3b4] rounded px-2 py-1 bg-white hover:bg-[#f5f0e8] focus:outline-none focus:ring-1 focus:ring-primary-400"
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
            className="text-xs border border-[#d1c3b4] rounded px-2 py-1 bg-white hover:bg-[#f5f0e8] focus:outline-none focus:ring-1 focus:ring-primary-400 w-16"
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

          <button onClick={() => execCommand('insertHorizontalRule')} className="toolbar-btn" title="插入分隔线">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" />
            </svg>
          </button>

          <button onClick={() => setShowFindReplaceDialog(true)} className="toolbar-btn" title="查找替换 (Ctrl+F)">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
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

      {/* 场景对话框 */}
      {showSceneDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-2xl w-[500px]">
            <div className="p-6 border-b border-[#e5ddd2]">
              <h3 className="text-lg font-semibold text-[#38342e]">插入场景标题</h3>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                insertSceneHeader(
                  formData.get('sceneNum') as string,
                  formData.get('location') as string,
                  formData.get('time') as string,
                  formData.get('interior') === 'interior'
                );
              }}
            >
              <div className="p-6 space-y-4">
                {/* 场次 */}
                <div>
                  <label className="block text-sm font-medium text-[#38342e] mb-2">场次</label>
                  <input
                    type="text"
                    name="sceneNum"
                    className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400"
                    placeholder="1"
                    defaultValue="1"
                    required
                    autoFocus
                  />
                </div>

                {/* 内/外景 */}
                <div>
                  <label className="block text-sm font-medium text-[#38342e] mb-2">内/外景</label>
                  <div className="flex gap-3">
                    <label className="flex-1 flex items-center gap-2 p-3 border-2 border-[#e5ddd2] rounded-lg cursor-pointer hover:border-primary-400 has-[:checked]:border-primary-500 has-[:checked]:bg-primary-50">
                      <input type="radio" name="interior" value="interior" defaultChecked className="text-primary-500" />
                      <span className="text-sm font-medium">内景</span>
                    </label>
                    <label className="flex-1 flex items-center gap-2 p-3 border-2 border-[#e5ddd2] rounded-lg cursor-pointer hover:border-primary-400 has-[:checked]:border-primary-500 has-[:checked]:bg-primary-50">
                      <input type="radio" name="interior" value="exterior" className="text-primary-500" />
                      <span className="text-sm font-medium">外景</span>
                    </label>
                  </div>
                </div>

                {/* 地点 */}
                <div>
                  <label className="block text-sm font-medium text-[#38342e] mb-2">地点</label>
                  <input
                    type="text"
                    name="location"
                    className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400"
                    placeholder="办公室"
                    defaultValue="办公室"
                    required
                  />
                </div>

                {/* 时间 */}
                <div>
                  <label className="block text-sm font-medium text-[#38342e] mb-2">时间</label>
                  <select
                    name="time"
                    className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400"
                    defaultValue="日"
                  >
                    {SCENE_TIMES.map(time => (
                      <option key={time} value={time}>{time}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="p-6 border-t border-[#e5ddd2] flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowSceneDialog(false)}
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
