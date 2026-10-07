/**
 * 文件名：aiService.ts
 * 模块名称：AI 创作服务
 *
 * 【核心功能】
 * 1. 多服务商接入 - 统一封装 OpenAI 兼容的 Chat Completions API
 *    （Kimi / GLM / DeepSeek / OpenAI / OpenRouter / LM Studio / Ollama / 自定义）
 * 2. 流式对话 - 通过 Rust 后端转发请求（绕开 CORS），事件流接收增量内容
 * 3. 创作动作 - 续写 / 润色 / 摘要 / 审稿，内置面向中文创作的提示词
 * 4. 连接管理 - 拉取模型列表、测试连通性、取消进行中的请求
 *
 * 【架构说明】
 * - 前端只组装 messages，HTTP 调用由 Rust (src-tauri/src/ai.rs) 完成，
 *   通过 "ai-chunk" / "ai-error" 事件回传进度
 * - API Key 保存在本地配置文件（config.json），不出本机
 *
 * 【重要注意事项】
 * - 所有动作都会先快照当前章节（版本快照），AI 内容覆盖前可回退
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

// ============================================================================
// 类型定义
// ============================================================================

/** 对话消息 */
export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** AI 服务配置（与 configService 中的 ai 段一致） */
export interface AiConfig {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

/** 流式请求的回调集合 */
export interface AiStreamCallbacks {
  /** 收到增量内容 */
  onDelta: (delta: string) => void;
  /** 流结束（正常完成或取消） */
  onDone?: () => void;
  /** 发生错误 */
  onError?: (message: string) => void;
}

/** 服务商预设 */
export interface AiProviderPreset {
  id: string;
  name: string;
  baseUrl: string;
  /** 常用默认模型（可为空，由用户填写） */
  defaultModel: string;
  /** 是否需要 API Key */
  requiresApiKey: boolean;
  /** 备注（如控制台地址） */
  hint?: string;
}

// ============================================================================
// 服务商预设
// ============================================================================

/**
 * 内置服务商预设
 * 全部使用 OpenAI 兼容协议，填 Base URL + Key + 模型即可接入
 */
export const AI_PROVIDER_PRESETS: AiProviderPreset[] = [
  {
    id: 'kimi',
    name: 'Kimi (Moonshot)',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
    requiresApiKey: true,
    hint: 'platform.moonshot.cn 控制台获取 Key',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    requiresApiKey: true,
    hint: 'platform.deepseek.com 获取 Key',
  },
  {
    id: 'glm',
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-plus',
    requiresApiKey: true,
    hint: 'open.bigmodel.cn 获取 Key',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    requiresApiKey: true,
    hint: 'platform.openai.com 获取 Key',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: '',
    requiresApiKey: true,
    hint: 'openrouter.ai 聚合主流模型',
  },
  {
    id: 'lmstudio',
    name: 'LM Studio (本地)',
    baseUrl: 'http://localhost:1234/v1',
    defaultModel: '',
    requiresApiKey: false,
    hint: 'LM Studio → Local Server → Start',
  },
  {
    id: 'ollama',
    name: 'Ollama (本地)',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: '',
    requiresApiKey: false,
    hint: '需开启 OLLAMA_ORIGINS=* 或使用本应用（后端转发不受限）',
  },
  {
    id: 'custom',
    name: '自定义服务',
    baseUrl: '',
    defaultModel: '',
    requiresApiKey: false,
    hint: '任意 OpenAI 兼容接口',
  },
];

/** 按 ID 获取预设 */
export function getProviderPreset(id: string): AiProviderPreset | undefined {
  return AI_PROVIDER_PRESETS.find((p) => p.id === id);
}

// ============================================================================
// 基础调用
// ============================================================================

/** 进行中的监听器清理函数（按 requestId） */
const activeUnlisteners = new Map<string, UnlistenFn>();

/**
 * 发起流式对话
 *
 * @param config AI 配置
 * @param messages 完整消息列表
 * @param callbacks 流式回调
 * @returns requestId（用于取消）
 */
export async function aiChatStream(
  config: AiConfig,
  messages: AiMessage[],
  callbacks: AiStreamCallbacks
): Promise<string> {
  const requestId = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let unlistenChunk: UnlistenFn | undefined;
  let unlistenError: UnlistenFn | undefined;

  const cleanup = () => {
    unlistenChunk?.();
    unlistenError?.();
    activeUnlisteners.delete(requestId);
  };

  try {
    unlistenChunk = await listen<{
      requestId: string;
      delta: string;
      done: boolean;
    }>('ai-chunk', (event) => {
      const payload = event.payload;
      if (payload.requestId !== requestId) return;
      if (payload.delta) callbacks.onDelta(payload.delta);
      if (payload.done) {
        cleanup();
        callbacks.onDone?.();
      }
    });

    unlistenError = await listen<{ requestId: string; message: string }>(
      'ai-error',
      (event) => {
        const payload = event.payload;
        if (payload.requestId !== requestId) return;
        cleanup();
        callbacks.onError?.(payload.message);
      }
    );

    activeUnlisteners.set(requestId, () => {
      unlistenChunk?.();
      unlistenError?.();
    });

    await invoke('ai_chat_stream', {
      requestId,
      request: {
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
        messages,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
      },
    });

    return requestId;
  } catch (error: any) {
    cleanup();
    callbacks.onError?.(String(error));
    throw error;
  }
}

/**
 * 取消进行中的流式请求
 */
export async function aiCancel(requestId: string): Promise<void> {
  const unlisten = activeUnlisteners.get(requestId);
  unlisten?.();
  activeUnlisteners.delete(requestId);
  try {
    await invoke('ai_cancel', { requestId });
  } catch {
    // 取消失败不影响主流程
  }
}

/**
 * 拉取服务商可用模型列表
 */
export async function aiListModels(baseUrl: string, apiKey: string): Promise<string[]> {
  return await invoke<string[]>('ai_list_models', { baseUrl, apiKey });
}

/**
 * 测试 AI 服务连通性（发送一条极短消息）
 *
 * @returns 返回模型回复的第一句话；失败时抛出异常
 */
export async function aiTestConnection(config: AiConfig): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let result = '';
    aiChatStream(
      config,
      [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: '请只回复两个字：正常' },
      ],
      {
        onDelta: (delta) => {
          result += delta;
        },
        onDone: () => resolve(result.trim() || '连接成功'),
        onError: (message) => reject(new Error(message)),
      }
    ).catch(reject);
  });
}

// ============================================================================
// 创作动作（内置提示词）
// ============================================================================

/** 中文创作系统提示词 */
const WRITER_SYSTEM_PROMPT = `你是一位专业的中文小说与剧本创作助手，擅长长篇连载、短篇、剧本与分镜创作。
要求：
- 输出为简体中文正文，风格与用户提供的上下文保持一致
- 直接输出创作内容本身，不要输出解释、前言或总结
- 使用 <p></p> 段落标签组织正文，保持简洁排版`;

/** 提取 HTML 中的纯文本（保留段落换行） */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<\/(p|div|h[1-6])>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 纯文本转 AI 返回用的段落 HTML */
export function textToParagraphHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/**
 * 构建各创作动作的消息列表
 */

/** 续写：基于正文结尾续写一段 */
export function buildContinueMessages(contextTail: string, instruction?: string): AiMessage[] {
  const plain = htmlToPlainText(contextTail).slice(-3000);
  return [
    { role: 'system', content: WRITER_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `请接着下面的正文自然续写 300-500 字，保持人物、语气与叙事节奏连贯，不要重复已有内容：\n\n【正文结尾】\n${plain}${
        instruction ? `\n\n【补充要求】\n${instruction}` : ''
      }`,
    },
  ];
}

/** 润色：改写选中内容 */
export function buildPolishMessages(selection: string, instruction?: string): AiMessage[] {
  return [
    { role: 'system', content: WRITER_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `请润色下面的文字：修正语病、提升文采、增强画面感，保持原意与篇幅接近，直接输出润色后的全文：\n\n【原文】\n${htmlToPlainText(
        selection
      )}${instruction ? `\n\n【补充要求】\n${instruction}` : ''}`,
    },
  ];
}

/** 摘要：生成章节梗概 */
export function buildSummaryMessages(chapterTitle: string, chapterHtml: string): AiMessage[] {
  return [
    {
      role: 'system',
      content: '你是专业的中文编辑，擅长提炼故事梗概。直接输出摘要内容，不要前言。',
    },
    {
      role: 'user',
      content: `请为章节「${chapterTitle}」生成 150 字以内的故事梗概，涵盖关键事件、人物动机与结尾悬念：\n\n${htmlToPlainText(
        chapterHtml
      ).slice(0, 8000)}`,
    },
  ];
}

/**
 * 审稿：inkos 式的结构化审校
 * 输出按 逻辑硬伤 / 时间线 / 人物一致性 / 伏笔与悬念 / 文笔建议 分类
 */
export function buildReviewMessages(chapterTitle: string, chapterHtml: string, outlineContext?: string): AiMessage[] {
  return [
    {
      role: 'system',
      content: `你是严格而专业的中文小说审稿编辑。按以下分类输出审稿意见（纯文本，可用短横线列表）：
【逻辑硬伤】情节自相矛盾、因果不成立之处
【时间线】时间顺序或时长不合理之处
【人物一致性】言行、性格、称谓前后不一致之处
【伏笔与悬念】已埋伏笔、未回收的悬念、建议
【文笔建议】具体到句子的修改建议
仅列出确实存在的问题并引用原文短语定位；若某类没有问题，写"无明显问题"。`,
    },
    {
      role: 'user',
      content: `请审稿章节「${chapterTitle}」：\n\n${htmlToPlainText(chapterHtml).slice(0, 8000)}${
        outlineContext ? `\n\n【大纲参考】\n${outlineContext}` : ''
      }`,
    },
  ];
}

/**
 * 大纲生成：从一句话创意生成章节大纲
 */
export function buildOutlineMessages(premise: string, chapterCount: number): AiMessage[] {
  return [
    {
      role: 'system',
      content: '你是专业的故事策划。直接输出大纲内容，不要前言与总结。',
    },
    {
      role: 'user',
      content: `基于以下创意生成 ${chapterCount} 章的故事大纲。每章一段，格式为"第N章 标题：200字以内的章节梗概（起因、冲突、钩子）"。\n\n【创意】\n${premise}`,
    },
  ];
}

// 便于测试与调试导出
export const __internals = { htmlToPlainText };
