/**
 * 文件名：AiAssistantPanel.tsx
 * 模块名称：AI 创作助手侧边面板
 *
 * 【核心功能】
 * 1. 四个创作动作：续写 / 润色 / 摘要 / 审稿
 * 2. 流式输出显示（打字机效果），可随时停止
 * 3. 结果操作：插入正文（追加/替换选区）、复制、重新生成
 * 4. 补充要求输入框（对 AI 的附加指令）
 *
 * 【数据流】
 * - 由 WriterView 挂载，通过 props 获取编辑器引用与当前章节信息
 * - AI 配置从 configService 读取；未配置时引导用户去设置
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useWriterStore } from '../stores/writerStore';
import { useToast } from './Toast';
import { loadConfig } from '../services/configService';
import {
  aiChatStream,
  aiCancel,
  aiTestConnection,
  buildContinueMessages,
  buildPolishMessages,
  buildExpandMessages,
  buildSummaryMessages,
  buildReviewMessages,
  textToParagraphHtml,
  type AiConfig,
} from '../services/aiService';
import { saveChapterVersion, updateChapter } from '../services/chapterService';
import { copyText } from '../services/copyService';
import { assembleStoryContext, renderContextBlock } from '../services/contextAssembly';

/** 动作类型 */
export type AiAction = 'continue' | 'polish' | 'expand' | 'summary' | 'review';

/** 动作元信息 */
const ACTION_META: Record<AiAction, { label: string; icon: string; hint: string }> = {
  continue: { label: '续写', icon: '✍️', hint: '结合前情/设定/角色，从正文结尾继续写作' },
  polish: { label: '润色', icon: '✨', hint: '改写选中的文字（未选中则处理当前章节）' },
  expand: { label: '扩写', icon: '📈', hint: '给选中文字增加事件与波折，一波三折（需选中）' },
  summary: { label: '摘要', icon: '📋', hint: '生成本章记忆摘要并存档，供后续章节续写引用' },
  review: { label: '审稿', icon: '🔍', hint: '逻辑/时间线/人物一致性/连载节奏/伏笔/AI味' },
};

interface AiAssistantPanelProps {
  /** 编辑器 DOM 引用（读取内容与选区、插入结果） */
  editorRef: React.RefObject<HTMLDivElement | null>;
  /** 关闭面板 */
  onClose: () => void;
}

/**
 * AI 助手侧边面板组件
 */
export default function AiAssistantPanel({ editorRef, onClose }: AiAssistantPanelProps) {
  const { showToast } = useToast();
  const currentChapterId = useWriterStore((state) => state.currentChapterId);
  const currentWorkId = useWriterStore((state) => state.currentWorkId);
  const chapters = useWriterStore((state) => state.chapters);

  const [config, setConfig] = useState<AiConfig | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [action, setAction] = useState<AiAction>('continue');
  const [instruction, setInstruction] = useState('');
  const [output, setOutput] = useState('');
  const [running, setRunning] = useState(false);
  const [testing, setTesting] = useState(false);

  const requestIdRef = useRef<string | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef(false);

  const currentChapter = chapters.find((c) => c.id === currentChapterId);

  // 加载 AI 配置
  useEffect(() => {
    loadConfig()
      .then((c) => setConfig(c.ai))
      .catch(() => undefined)
      .finally(() => setConfigLoaded(true));
  }, []);

  // 输出变化时自动滚动到底部
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  /** 读取编辑器选区 HTML（无选区返回 null） */
  const getSelectionHtml = (): string | null => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    // 仅当选区位于编辑器内部时使用
    if (!editorRef.current?.contains(range.commonAncestorContainer)) return null;
    const container = document.createElement('div');
    container.appendChild(range.cloneContents());
    const html = container.innerHTML;
    return html.trim().length > 0 ? html : null;
  };

  /** 编辑器内容转纯文本（限制长度） */
  const editorPlainTail = (): string => {
    return editorRef.current?.innerHTML || '';
  };

  /**
   * 执行选定的 AI 动作
   */
  const handleRun = useCallback(async () => {
    if (!config || !config.baseUrl || !config.model) {
      showToast('请先在设置中配置 AI 服务', 'warning');
      return;
    }
    if (!currentChapter) {
      showToast('请先选择章节', 'warning');
      return;
    }

    // 组装上下文（故事背景/前情记忆/角色卡/世界书/作者注），失败自动降级
    let contextBlock = '';
    try {
      const ctx = await assembleStoryContext(currentWorkId, currentChapterId, editorPlainTail());
      contextBlock = renderContextBlock(ctx);
    } catch {
      // 无上下文也能继续（纯尾部续写模式）
    }

    // 组装消息
    let messages;
    try {
      switch (action) {
        case 'continue':
          messages = buildContinueMessages(editorPlainTail(), instruction.trim() || undefined, contextBlock);
          break;
        case 'polish': {
          const selection = getSelectionHtml();
          if (selection) {
            messages = buildPolishMessages(selection, instruction.trim() || undefined, contextBlock);
          } else {
            showToast('润色需要先在正文中选中一段文字', 'info');
            return;
          }
          break;
        }
        case 'expand': {
          const selection = getSelectionHtml();
          if (selection) {
            messages = buildExpandMessages(selection, instruction.trim() || undefined, contextBlock);
          } else {
            showToast('扩写需要先在正文中选中一段文字', 'info');
            return;
          }
          break;
        }
        case 'summary':
          messages = buildSummaryMessages(currentChapter.title, editorPlainTail(), contextBlock);
          break;
        case 'review':
          messages = buildReviewMessages(currentChapter.title, editorPlainTail(), contextBlock);
          break;
      }
    } catch (error: any) {
      showToast(error.message || '准备内容失败', 'error');
      return;
    }

    setRunning(true);
    setOutput('');
    abortRef.current = false;

    // 改写类动作前先快照，AI 内容覆盖前可回退
    if (action === 'continue' || action === 'polish' || action === 'expand') {
      try {
        await saveChapterVersion(currentChapterId, `AI ${ACTION_META[action].label}前`);
      } catch {
        // 快照失败不阻塞
      }
    }

    let accumulated = '';
    try {
      const requestId = await new Promise<string>((resolve, reject) => {
        aiChatStream(config, messages, {
          onDelta: (delta) => {
            accumulated += delta;
            setOutput(accumulated);
          },
          onError: (message) => reject(new Error(message)),
        })
          .then(resolve)
          .catch(reject);
      });
      requestIdRef.current = requestId;
    } catch (error: any) {
      if (!accumulated) {
        showToast(error.message || 'AI 请求失败', 'error');
      } else {
        showToast('流式中断，已保留部分结果', 'warning');
      }
    } finally {
      setRunning(false);
      requestIdRef.current = null;
    }

    // 摘要成功生成后落库到 chapters.summary，供后续章节的前情记忆链使用
    if (action === 'summary' && accumulated.trim() && currentChapterId) {
      try {
        await updateChapter(currentChapterId, { summary: accumulated.trim() });
        showToast('本章记忆已保存，后续章节续写时会自动携带', 'success');
      } catch {
        // 摘要落库失败不影响结果展示
      }
    }
    // showToast / loadConfig 稳定，currentChapter 随 store 变化
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, action, instruction, currentChapter, currentChapterId]);

  /** 停止生成 */
  const handleStop = useCallback(() => {
    abortRef.current = true;
    if (requestIdRef.current) {
      aiCancel(requestIdRef.current);
    }
    setRunning(false);
  }, []);

  /** 将结果插入正文 */
  const handleInsert = useCallback(() => {
    const editor = editorRef.current;
    if (!editor || !output.trim()) return;

    if (action === 'review' || action === 'summary') {
      // 审稿/摘要结果不直接进正文，复制即可
      copyText(output).then(
        () => showToast('已复制到剪贴板', 'success'),
        () => showToast('复制失败，请手动选择文本', 'error')
      );
      return;
    }

    // 润色/扩写：替换选区；续写：追加到光标处/文末
    const selection = window.getSelection();
    const html = textToParagraphHtml(output);

    if ((action === 'polish' || action === 'expand') && selection && selection.rangeCount > 0 && editor.contains(selection.getRangeAt(0).commonAncestorContainer)) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const fragment = range.createContextualFragment(html);
      range.insertNode(fragment);
    } else {
      editor.insertAdjacentHTML('beforeend', html);
    }

    // 触发 input 事件让自动保存与字数统计生效
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    showToast(`已${action === 'polish' ? '替换选区' : action === 'expand' ? '替换为扩写结果' : '插入正文'}，可随时从版本历史恢复`, 'success');
  }, [action, output, editorRef, showToast]);

  /** 测试连接 */
  const handleTest = useCallback(async () => {
    if (!config) return;
    setTesting(true);
    try {
      const reply = await aiTestConnection(config);
      showToast(`连接正常，模型回复：${reply.slice(0, 30)}`, 'success');
    } catch (error: any) {
      showToast(error.message || '连接失败', 'error');
    } finally {
      setTesting(false);
    }
  }, [config, showToast]);

  const isConfigured = configLoaded && config && config.baseUrl && config.model;

  return (
    <div className="w-96 flex flex-col bg-surface-secondary border-l border-surface-border h-full">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
        <h3 className="text-sm font-semibold text-on-surface flex items-center gap-2">
          <span>🤖</span> AI 创作助手
        </h3>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-surface-tertiary text-on-surface-secondary"
          title="关闭"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* 未配置引导 */}
      {!isConfigured && configLoaded && (
        <div className="m-4 p-4 bg-primary-50 border border-primary-200 rounded-lg text-sm text-on-surface-secondary">
          <p className="font-medium text-on-surface mb-2">尚未配置 AI 服务</p>
          <p className="mb-3">在「设置 → AI 服务」中填入 API 地址、Key 和模型即可启用续写、润色、审稿等能力。支持 Kimi、DeepSeek、GLM、OpenAI 及 LM Studio / Ollama 本地模型。</p>
          <button
            onClick={() => {
              // 触发设置面板由 App 级快捷键/按钮完成；此处复制路径提示
              showToast('请通过左侧导航栏的设置按钮打开设置', 'info');
            }}
            className="text-primary-600 hover:underline text-xs"
          >
            如何配置？
          </button>
        </div>
      )}

      {isConfigured && (
        <>
          {/* 动作选择 */}
          <div className="grid grid-cols-4 gap-1 p-3 border-b border-surface-border">
            {(Object.keys(ACTION_META) as AiAction[]).map((key) => (
              <button
                key={key}
                onClick={() => setAction(key)}
                disabled={running}
                title={ACTION_META[key].hint}
                className={`flex flex-col items-center gap-1 py-2 rounded-lg text-xs transition-colors ${
                  action === key
                    ? 'bg-primary-600 text-white'
                    : 'bg-surface-primary text-on-surface-secondary hover:bg-surface-tertiary'
                } disabled:opacity-50`}
              >
                <span className="text-base">{ACTION_META[key].icon}</span>
                {ACTION_META[key].label}
              </button>
            ))}
          </div>

          {/* 补充要求 */}
          {(action === 'continue' || action === 'polish') && (
            <div className="px-3 pt-3">
              <input
                type="text"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="补充要求（可选），如：更口语化、加入环境描写"
                className="form-input text-xs"
              />
            </div>
          )}

          {/* 操作栏 */}
          <div className="flex items-center gap-2 p-3">
            {running ? (
              <button
                onClick={handleStop}
                className="flex-1 px-3 py-1.5 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
              >
                ■ 停止生成
              </button>
            ) : (
              <button
                onClick={handleRun}
                className="flex-1 px-3 py-1.5 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors"
              >
                {ACTION_META[action].label}（{config!.model}）
              </button>
            )}
            <button
              onClick={handleTest}
              disabled={testing || running}
              className="px-3 py-1.5 text-xs rounded-lg border border-surface-border text-on-surface-secondary hover:bg-surface-tertiary disabled:opacity-50"
              title="测试 AI 服务连通性"
            >
              {testing ? '测试中…' : '测试连接'}
            </button>
          </div>

          {/* 输出区 */}
          <div className="flex-1 min-h-0 overflow-hidden px-3 pb-3 flex flex-col">
            <div
              ref={outputRef}
              className="flex-1 min-h-0 overflow-y-auto p-3 bg-surface-primary rounded-lg border border-surface-border text-sm text-on-surface whitespace-pre-wrap leading-relaxed"
            >
              {output || (
                <span className="text-on-surface-secondary">
                  {running ? '正在生成…' : `${ACTION_META[action].hint}`}
                </span>
              )}
              {running && <span className="animate-pulse">▍</span>}
            </div>

            {/* 结果操作 */}
            {!running && output && (
              <div className="flex items-center gap-2 mt-2">
                {(action === 'continue' || action === 'polish') && (
                  <button
                    onClick={handleInsert}
                    className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-primary-600 text-white hover:bg-primary-700"
                  >
                    {action === 'polish' ? '替换选区' : '插入正文'}
                  </button>
                )}
                <button
                  onClick={() => copyText(output).then(() => showToast('已复制', 'success'))}
                  className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-surface-border text-on-surface hover:bg-surface-tertiary"
                >
                  复制
                </button>
                <button
                  onClick={handleRun}
                  className="px-3 py-1.5 text-xs rounded-lg border border-surface-border text-on-surface hover:bg-surface-tertiary"
                >
                  重新生成
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
