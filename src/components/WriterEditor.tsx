/**
 * 文件名：WriterEditor.tsx
 * 模块名称：富文本编辑器核心组件
 *
 * 【核心功能】
 * 1. 提供富文本编辑功能（基于 contentEditable）
 * 2. 自动保存机制（防抖2秒）
 * 3. 实时字数统计
 * 4. 中文输入法支持（IME 输入状态检测）
 * 5. 编辑器工具栏集成
 *
 * 【技术要点】
 * - 使用 contentEditable 实现富文本编辑
 * - 使用 useRef 管理编辑器 DOM 引用
 * - 使用防抖（debounce）避免频繁保存
 * - 监听 composition 事件处理中文输入法
 * - 集成 Zustand store 进行状态管理
 *
 * 【重要注意事项】
 * 1. 中文输入法输入过程中不会触发自动保存
 * 2. 自动保存延迟2秒，避免频繁写入数据库
 * 3. 字数统计基于 innerText，不包含 HTML 标签
 * 4. 编辑器使用 innerHTML 存储内容，支持富文本格式
 * 5. 组件卸载时会清理定时器，避免内存泄漏
 *
 * 【使用示例】
 * ```tsx
 * import WriterEditor from '@/components/WriterEditor';
 *
 * function MyComponent() {
 *   const handleSave = (content: string) => {
 *     console.log('保存内容:', content);
 *   };
 *
 *   const handleShowToast = (message: string, type: 'success' | 'error' | 'warning') => {
 *     alert(`${type}: ${message}`);
 *   };
 *
 *   return (
 *     <WriterEditor
 *       onShowToast={handleShowToast}
 *       onSave={handleSave}
 *     />
 *   );
 * }
 * ```
 */

import { useRef, useEffect, useState } from 'react';
import ScriptToolbar from './ScriptToolbar';
import NovelToolbar from './NovelToolbar';
import { useWriterStore } from '../stores/writerStore';
import { loadConfig } from '../services/configService';

// ============================================================================
// 编辑器外观配置（来自设置页，保存后实时生效）
// ============================================================================

interface EditorAppearance {
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  autoSaveInterval: number; // 秒，0 = 禁用自动保存
  spellCheck: boolean;
}

const DEFAULT_APPEARANCE: EditorAppearance = {
  fontSize: 16,
  fontFamily: "'Segoe UI', 'Microsoft YaHei', sans-serif",
  lineHeight: 1.8,
  autoSaveInterval: 2,
  spellCheck: true,
};

// ============================================================================
// Props 类型定义
// ============================================================================

/**
 * WriterEditor 组件 Props
 *
 * 【说明】
 * - onShowToast: 显示 Toast 消息的回调函数
 * - onSave: 保存内容的回调函数（可选）
 * - editorRef: 外部传入的编辑器引用（可选，用于外部访问编辑器）
 */
interface WriterEditorProps {
  /** 保存内容的回调函数（可选） */
  onSave?: (content: string) => void;

  /** 外部传入的编辑器引用（可选） */
  editorRef?: React.RefObject<HTMLDivElement>;
}

// ============================================================================
// 组件实现
// ============================================================================

/**
 * WriterEditor 组件
 *
 * 【组件结构】
 * 1. 从 Zustand store 读取状态和方法
 * 2. 创建编辑器引用和定时器引用
 * 3. 实现自动保存逻辑（useEffect）
 * 4. 实现输入处理和字数统计
 * 5. 实现中文输入法支持
 * 6. 渲染编辑器界面
 *
 * @param props - WriterEditorProps
 * @returns JSX 元素
 */
export default function WriterEditor({ onSave, editorRef: externalEditorRef }: WriterEditorProps) {
  // ==========================================================================
  // 状态读取
  // ==========================================================================

  /**
   * 从 Zustand store 读取编辑器相关状态和方法
   *
   * 【状态说明】
   * - wordCount: 当前字数统计
   * - isComposing: 是否正在输入法组合中（IME 输入状态）
   * - shouldSyncContent: 是否应该同步内容到数据库
   *
   * 【方法说明】
   * - setEditorContent: 更新编辑器内容
   * - setWordCount: 更新字数统计
   * - setIsComposing: 更新输入法状态
   * - setShouldSyncContent: 更新同步标志
   * - getCurrentWork: 获取当前作品对象
   */
  const {
    content: editorContent,
    wordCount,
    isComposing,
    setEditorContent,
    setWordCount,
    setIsComposing,
    getCurrentWork,
  } = useWriterStore();

  // ==========================================================================
  // Ref 创建
  // ==========================================================================

  /**
   * 内部编辑器引用
   *
   * 【用途】
   * - 访问编辑器 DOM 元素
   * - 读取和设置编辑器内容
   * - 如果外部没有传入 editorRef，使用这个内部引用
   */
  const internalEditorRef = useRef<HTMLDivElement>(null);

  /**
   * 最终使用的编辑器引用
   *
   * 【优先级】
   * - 如果外部传入了 editorRef，使用外部引用
   * - 否则使用内部引用
   *
   * 【用途】
   * - 允许外部组件访问编辑器
   * - 例如：AI 生成内容后需要追加到编辑器
   */
  const editorRef = externalEditorRef || internalEditorRef;

  /**
   * 自动保存定时器引用
   *
   * 【用途】
   * - 存储 setTimeout 返回的定时器 ID
   * - 用于清除定时器（防抖）
   * - 组件卸载时清理定时器，避免内存泄漏
   */
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  /**
   * 编辑器外观配置（设置页可改，保存后通过事件实时生效）
   */
  const [appearance, setAppearance] = useState<EditorAppearance>(DEFAULT_APPEARANCE);

  useEffect(() => {
    let cancelled = false;

    const applyConfig = async () => {
      try {
        const config = await loadConfig();
        if (!cancelled) {
          setAppearance({
            fontSize: config.editor.fontSize,
            fontFamily: config.editor.fontFamily,
            lineHeight: config.editor.lineHeight,
            autoSaveInterval: config.editor.autoSaveInterval,
            spellCheck: config.editor.spellCheck,
          });
        }
      } catch {
        // 读取失败时保持默认
      }
    };

    applyConfig();
    window.addEventListener('creative-studio:config-changed', applyConfig);
    return () => {
      cancelled = true;
      window.removeEventListener('creative-studio:config-changed', applyConfig);
    };
  }, []);

  // ==========================================================================
  // 数据获取
  // ==========================================================================

  /**
   * 获取当前作品对象
   *
   * 【用途】
   * - 检查是否选择了作品
   * - 未选择作品时显示提示界面
   * - 获取作品类型（用于工具栏显示）
   */
  const currentWork = getCurrentWork();

  // ==========================================================================
  // 自动保存逻辑
  // ==========================================================================

  /**
   * 自动保存 Effect
   *
   * 【执行逻辑】
   * 1. 监听 editorContent 和 isComposing 状态变化
   * 2. 如果内容有变化且不在输入法组合中：
   *    - 清除之前的定时器（防抖）
   *    - 设置新的定时器（2秒后保存）
   * 3. 定时器触发时：
   *    - 读取编辑器的最新内容（从 DOM）
   *    - 调用 onSave 回调保存到数据库
   * 4. 组件卸载时清理定时器
   *
   * 【防抖说明】
   * - 用户连续输入时，每次输入都重置定时器
   * - 只有停止输入2秒后才触发保存
   * - 避免频繁写入数据库，提升性能
   *
   * 【输入法处理】
   * - 中文输入法输入过程中（isComposing = true）不触发保存
   * - 避免在拼音输入过程中保存不完整的内容
   *
   * 【重要修改】
   * - 不再依赖 shouldSyncContent，改为监听 editorContent
   * - 避免在输入时重新设置 DOM，防止光标丢失
   */
  useEffect(() => {
    // 如果正在输入法组合中，不触发保存
    if (isComposing) return;

    // 如果 editorContent 为空（初始状态或切换章节），不触发保存
    if (!editorContent) return;

    // 自动保存被禁用（间隔为 0）
    if (appearance.autoSaveInterval <= 0) return;

    // 清除之前的定时器（防抖）
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    // 设置新的定时器（按设置的间隔保存）
    saveTimerRef.current = setTimeout(() => {
      // 检查编辑器引用是否存在
      if (editorRef.current) {
        // 【重要】从 DOM 读取最新内容，而不是使用状态中的 editorContent
        // 这样可以确保保存的是用户最新输入的内容
        const newContent = editorRef.current.innerHTML;

        // 调用保存回调
        onSave?.(newContent);
      }
    }, Math.max(1, appearance.autoSaveInterval) * 1000);

    // 清理函数：组件卸载或 effect 重新执行时清除定时器
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [editorContent, isComposing, onSave, appearance.autoSaveInterval]);  // 依赖项：监听内容变化

  // ==========================================================================
  // 事件处理函数
  // ==========================================================================

  /**
   * 处理编辑器输入事件
   *
   * 【触发时机】
   * - 用户在编辑器中输入内容
   * - 用户删除内容
   * - 用户粘贴内容
   * - 格式化文本（加粗、斜体等）
   *
   * 【执行逻辑】
   * 1. 读取编辑器的 innerHTML（包含 HTML 标签）
   * 2. 更新 store 中的 content 状态
   * 3. 读取 innerText（纯文本，不包含 HTML 标签）
   * 4. 计算字数（去除所有空白字符）
   * 5. 更新 store 中的 wordCount 状态
   * 6. 如果不在输入法组合中，标记需要同步
   *
   * 【字数计算规则】
   * - 使用 innerText 获取纯文本
   * - 使用 replace(/\s/g, '') 去除所有空白字符（空格、换行、制表符等）
   * - 统计剩余字符的数量
   *
   * @param e - React.FormEvent<HTMLDivElement> 输入事件
   */
  const handleEditorInput = (e: React.FormEvent<HTMLDivElement>) => {
    // 读取编辑器内容（HTML 格式）
    const newContent = (e.target as HTMLDivElement).innerHTML;

    // 更新编辑器内容状态
    // 【重要】这里更新状态，但 WriterView 中的 useEffect 只在 shouldSyncContent 为 true 时才同步 DOM
    setEditorContent(newContent);

    // 计算字数
    // 【说明】使用 innerText 获取纯文本，去除空白字符后统计
    const text = (e.target as HTMLDivElement).innerText || '';
    const count = text.replace(/\s/g, '').length;

    // 更新字数统计状态
    setWordCount(count);

    // 【重要】用户输入时不标记 shouldSyncContent，避免触发 DOM 同步导致光标丢失
    // shouldSyncContent 只在外部操作（如切换章节）时设为 true
  };

  /**
   * 处理中文输入法开始事件
   *
   * 【触发时机】
   * - 用户开始使用中文输入法输入拼音
   * - 输入法候选框出现
   *
   * 【执行逻辑】
   * - 设置 isComposing 为 true
   * - 阻止自动保存触发
   * - 避免保存拼音过程中的不完整内容
   *
   * 【重要】
   * - 必须与 handleCompositionEnd 配对使用
   * - 确保输入法结束时设置 isComposing 为 false
   */
  const handleCompositionStart = () => {
    setIsComposing(true);
  };

  /**
   * 处理中文输入法结束事件
   *
   * 【触发时机】
   * - 用户从输入法候选框选择了一个汉字或词组
   * - 输入法候选框消失
   *
   * 【执行逻辑】
   * 1. 设置 isComposing 为 false
   * 2. 调用 handleEditorInput 处理最终输入的内容
   * 3. 触发字数统计和同步标志更新
   *
   * 【重要】
   * - 必须与 handleCompositionStart 配对使用
   * - 确保输入法开始和结束状态正确切换
   *
   * @param e - React.CompositionEvent<HTMLDivElement> 组合事件
   */
  const handleCompositionEnd = (e: React.CompositionEvent<HTMLDivElement>) => {
    // 输入法结束，设置为 false
    setIsComposing(false);

    // 处理最终输入的内容
    // 【说明】将 CompositionEvent 转换为 FormEvent，复用输入处理逻辑
    handleEditorInput(e as React.FormEvent<HTMLDivElement>);
  };

  // ==========================================================================
  // 渲染逻辑
  // ==========================================================================

  /**
   * 未选择作品时的空状态界面
   *
   * 【显示条件】
   * - currentWork 为 null 或 undefined
   * - 用户未创建或选择任何作品
   *
   * 【界面内容】
   * - 显示一个文档图标
   * - 提示用户创建或选择作品
   * - 引导用户到侧边栏操作
   *
   * 【样式说明】
   * - 使用 flex 布局居中显示
   * - 使用 surface-primary 背景色
   * - 使用 on-surface-secondary 文字颜色（次要文字）
   */
  if (!currentWork) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface-primary">
        <div className="text-center">
          {/* 文档图标 */}
          <svg className="w-16 h-16 text-on-surface-secondary mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>

          {/* 提示文字 */}
          <p className="text-on-surface-secondary mb-2">请先创建或选择一个作品</p>
          <p className="text-sm text-on-surface-variant">在左侧创建新作品或选择已有作品</p>
        </div>
      </div>
    );
  }

  /**
   * 编辑器主界面
   *
   * 【布局结构】
   * 1. 外层容器：flex 列布局，占满剩余空间
   * 2. 编辑器工具栏：显示在顶部
   * 3. 可编辑内容区域：显示在中间，支持滚动
   *
   * 【样式说明】
   * - 使用 flex-1 占满剩余空间
   * - 使用 overflow-hidden 防止溢出
   * - 使用 surface-primary 背景色
   */
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-surface-primary">
      {/* ========================================================================
          编辑器工具栏 - 根据作品类型显示不同的工具栏
          ========================================================================

          【功能说明】
          - 短剧剧本（script）：显示 ScriptToolbar，提供场景、镜头、对话等专业工具
          - 小说（novel）：显示 NovelToolbar，提供章节、段落、对话等小说创作工具

          【Props 说明】
          - editorRef: 编辑器引用，用于执行格式化命令和插入内容
          - wordCount: 当前字数统计
      */}
      {currentWork.type === 'script' ? (
        <ScriptToolbar
          editorRef={editorRef}
          wordCount={wordCount}
        />
      ) : (
        <NovelToolbar
          editorRef={editorRef}
          wordCount={wordCount}
        />
      )}

      {/* ========================================================================
          可编辑内容区域
          ========================================================================

          【功能说明】
          - 提供富文本编辑功能
          - 支持滚动查看长内容
          - 支持自动保存
          - 支持中文输入法

          【容器说明】
          - flex-1: 占满剩余空间
          - overflow-auto: 内容超出时显示滚动条

          【编辑器说明】
          - max-w-6xl: 最大宽度 96rem（约 1536px），保持良好的阅读体验
          - mx-auto: 水平居中
          - px-12 py-12: 内边距 3rem（48px），提供舒适的阅读空间
          - min-h-full: 最小高度 100%，确保全屏显示
          - focus:outline-none: 聚焦时不显示默认边框
          - text-on-surface: 使用主题文字颜色
          - leading-relaxed: 行高 1.625，提供舒适的阅读体验

          【contentEditable 属性】
          - 启用富文本编辑功能
          - 允许用户直接编辑 HTML 内容

          【suppressContentEditableWarning 属性】
          - 抑制 React 的警告信息
          - contentEditable 与 React 的受控组件机制不完全兼容
          - 使用此属性避免控制台警告

          【事件监听】
          - onInput: 处理输入事件，更新内容和字数统计
          - onCompositionStart: 处理中文输入法开始事件
          - onCompositionEnd: 处理中文输入法结束事件
      */}
      <div className="flex-1 overflow-auto">
        <div
          ref={editorRef}
          className="max-w-6xl mx-auto px-12 py-12 min-h-full focus:outline-none text-on-surface"
          style={{
            fontSize: `${appearance.fontSize}px`,
            fontFamily: appearance.fontFamily,
            lineHeight: appearance.lineHeight,
          }}
          contentEditable
          suppressContentEditableWarning
          spellCheck={appearance.spellCheck}
          onInput={handleEditorInput}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
        />
      </div>
    </div>
  );
}