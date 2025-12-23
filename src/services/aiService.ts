/**
 * AI 服务模块
 *
 * 封装 Tauri 后端的 AI 命令调用
 * 提供类型安全的前端 API
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  AIConfig,
  GenerateRequest,
  GenerateResponse,
  AIWritingFunction,
} from '../types/ai';
import {
  DEFAULT_AI_CONFIG,
  AI_WRITING_TEMPLATES,
} from '../types/ai';

/**
 * 流式生成事件类型
 */
export type StreamEvent =
  | { type: 'token'; content: string; token_count: number }
  | { type: 'done'; content: string; tokens_generated: number; stopped_early: boolean }
  | { type: 'error'; message: string };

/**
 * 流式生成回调函数
 */
export interface StreamCallbacks {
  /** 每生成一个 token 时调用 */
  onToken?: (content: string, tokenCount: number) => void;
  /** 生成完成时调用 */
  onDone?: (content: string, tokensGenerated: number, stoppedEarly: boolean) => void;
  /** 发生错误时调用 */
  onError?: (message: string) => void;
}

/**
 * 更新 AI 配置
 */
export async function updateAIConfig(config: AIConfig): Promise<void> {
  await invoke('ai_update_config', { config });
}

/**
 * 获取当前 AI 配置
 */
export async function getAIConfig(): Promise<AIConfig> {
  return await invoke('ai_get_config');
}

/**
 * 加载 AI 模型
 *
 * @throws {string} 如果模型文件不存在或加载失败
 */
export async function loadAIModel(): Promise<void> {
  await invoke('ai_load_model');
}

/**
 * 卸载 AI 模型
 */
export async function unloadAIModel(): Promise<void> {
  await invoke('ai_unload_model');
}

/**
 * 检查模型是否已加载
 */
export async function isAIModelLoaded(): Promise<boolean> {
  return await invoke('ai_is_model_loaded');
}

/**
 * AI 服务状态
 */
export interface AIServiceStatus {
  /** 模型是否已加载 */
  modelLoaded: boolean;
  /** 模型路径（如果已配置） */
  modelPath?: string;
  /** 错误信息（如果有） */
  error?: string;
  /** AI 服务是否可用 */
  available: boolean;
}

/**
 * 获取 AI 服务详细状态
 * 用于启动时检查和状态横幅显示
 */
export async function getAIStatus(): Promise<AIServiceStatus> {
  try {
    const modelLoaded = await isAIModelLoaded();
    const config = await getAIConfig();

    return {
      modelLoaded,
      modelPath: config.model_path,
      available: modelLoaded,
      error: modelLoaded ? undefined : '模型未加载或路径未配置',
    };
  } catch (error: any) {
    return {
      modelLoaded: false,
      available: false,
      error: error?.message || '无法连接到 AI 服务',
    };
  }
}

/**
 * 检查 AI 服务是否可用
 * 简化版本，仅返回布尔值
 */
export async function checkAIService(): Promise<boolean> {
  try {
    return await isAIModelLoaded();
  } catch {
    return false;
  }
}

/**
 * 生成文本
 *
 * @param request 生成请求参数
 * @returns 生成的响应
 * @throws {string} 如果模型未加载或生成失败
 */
export async function generateText(request: GenerateRequest): Promise<GenerateResponse> {
  return await invoke('ai_generate', { request });
}

/**
 * 流式生成文本
 *
 * 通过回调函数实时接收生成的 token。
 *
 * @param request 生成请求参数
 * @param callbacks 流式事件回调
 * @returns 取消函数，调用后可停止生成
 * @throws {string} 如果模型未加载或生成失败
 *
 * @example
 * ```typescript
 * const cancel = await generateStream(
 *   { prompt: '写一个故事' },
 *   {
 *     onToken: (content, count) => {
 *       console.log('Token:', content);
 *       // 实时更新 UI
 *       setGeneratedText(prev => prev + content);
 *     },
 *     onDone: (content, count, early) => {
 *       console.log('完成！总共生成:', count, 'tokens');
 *     },
 *     onError: (error) => {
 *       console.error('生成失败:', error);
 *     }
 *   }
 * );
 *
 * // 如需取消
 * cancel();
 * ```
 */
export async function generateStream(
  request: GenerateRequest,
  callbacks: StreamCallbacks
): Promise<() => void> {
  // 1. 开始流式生成，获取 session_id
  const sessionId = await invoke<string>('ai_generate_stream', { request });

  // 2. 监听流式事件
  const eventName = `ai-stream-${sessionId}`;
  const unlisten = await listen<StreamEvent>(eventName, (event) => {
    const data = event.payload;

    switch (data.type) {
      case 'token':
        callbacks.onToken?.(data.content, data.token_count);
        break;
      case 'done':
        callbacks.onDone?.(data.content, data.tokens_generated, data.stopped_early);
        // 自动清理监听器
        unlisten();
        break;
      case 'error':
        callbacks.onError?.(data.message);
        // 自动清理监听器
        unlisten();
        break;
    }
  });

  // 3. 返回取消函数
  return async () => {
    try {
      await invoke('ai_cancel_stream', { sessionId });
      unlisten();
    } catch (error) {
      console.warn('取消流式生成失败:', error);
    }
  };
}

/**
 * 使用预设模板生成文本
 *
 * @param func AI 写作功能类型
 * @param text 输入文本
 * @param customParams 自定义参数（可选）
 * @returns 生成的响应
 */
export async function generateWithTemplate(
  func: AIWritingFunction,
  text: string,
  customParams?: Partial<GenerateRequest>
): Promise<GenerateResponse> {
  const template = AI_WRITING_TEMPLATES[func];

  // 替换模板中的变量
  const userPrompt = template.user_prompt_template.replace('{text}', text);

  // 构建请求
  const request: GenerateRequest = {
    prompt: userPrompt,
    system_prompt: template.system_prompt,
    max_tokens: template.recommended_params?.max_tokens,
    temperature: template.recommended_params?.temperature,
    ...customParams,
  };

  return await generateText(request);
}

/**
 * 初始化 AI 服务
 * 加载保存的配置或使用默认配置
 */
export async function initializeAIService(): Promise<AIConfig> {
  try {
    // 尝试获取已保存的配置
    const config = await getAIConfig();
    console.log('✅ AI 配置已加载:', config);
    return config;
  } catch (error) {
    console.warn('⚠️ 无法加载 AI 配置，使用默认值:', error);
    // 如果没有配置，使用默认值
    // 注意：DEFAULT_AI_CONFIG 需要从 types/ai.ts 导入
    return { ...DEFAULT_AI_CONFIG } as unknown as AIConfig;
  }
}

/**
 * 保存 AI 配置到本地存储
 * （可选：也可以考虑使用 Tauri 的文件系统 API 持久化）
 */
export async function saveAIConfig(config: AIConfig): Promise<void> {
  await updateAIConfig(config);
  console.log('💾 AI 配置已保存');
}

/**
 * 智能续写 - 快捷方法
 */
export async function continueWriting(text: string, maxTokens?: number): Promise<string> {
  const response = await generateWithTemplate('continue', text, { max_tokens: maxTokens });
  return response.content;
}

/**
 * 内容扩写 - 快捷方法
 */
export async function expandContent(text: string, maxTokens?: number): Promise<string> {
  const response = await generateWithTemplate('expand', text, { max_tokens: maxTokens });
  return response.content;
}

/**
 * 文字润色 - 快捷方法
 */
export async function polishText(text: string): Promise<string> {
  const response = await generateWithTemplate('polish', text);
  return response.content;
}

/**
 * 生成摘要 - 快捷方法
 */
export async function summarizeText(text: string): Promise<string> {
  const response = await generateWithTemplate('summarize', text);
  return response.content;
}

/**
 * 头脑风暴 - 快捷方法
 */
export async function brainstormIdeas(topic: string): Promise<string> {
  const response = await generateWithTemplate('brainstorm', topic);
  return response.content;
}

/**
 * 生成对话 - 快捷方法
 */
export async function generateDialogue(scene: string): Promise<string> {
  const response = await generateWithTemplate('dialogue', scene);
  return response.content;
}

/**
 * 场景描述 - 快捷方法
 */
export async function describeScene(scene: string): Promise<string> {
  const response = await generateWithTemplate('description', scene);
  return response.content;
}

/**
 * 流式续写 - 快捷方法
 *
 * @example
 * ```typescript
 * const cancel = await continueWritingStream(
 *   '他走进房间，发现...',
 *   {
 *     onToken: (content) => {
 *       // 实时显示生成的内容
 *       appendToEditor(content);
 *     },
 *     onDone: () => {
 *       console.log('续写完成');
 *     }
 *   }
 * );
 * ```
 */
export async function continueWritingStream(
  text: string,
  callbacks: StreamCallbacks,
  maxTokens?: number
): Promise<() => void> {
  const template = AI_WRITING_TEMPLATES['continue'];
  const userPrompt = template.user_prompt_template.replace('{text}', text);

  const request: GenerateRequest = {
    prompt: userPrompt,
    system_prompt: template.system_prompt,
    max_tokens: maxTokens || template.recommended_params?.max_tokens,
    temperature: template.recommended_params?.temperature,
  };

  return await generateStream(request, callbacks);
}

/**
 * 流式扩写 - 快捷方法
 */
export async function expandContentStream(
  text: string,
  callbacks: StreamCallbacks,
  maxTokens?: number
): Promise<() => void> {
  const template = AI_WRITING_TEMPLATES['expand'];
  const userPrompt = template.user_prompt_template.replace('{text}', text);

  const request: GenerateRequest = {
    prompt: userPrompt,
    system_prompt: template.system_prompt,
    max_tokens: maxTokens || template.recommended_params?.max_tokens,
    temperature: template.recommended_params?.temperature,
  };

  return await generateStream(request, callbacks);
}

/**
 * 流式润色 - 快捷方法
 */
export async function polishTextStream(
  text: string,
  callbacks: StreamCallbacks
): Promise<() => void> {
  const template = AI_WRITING_TEMPLATES['polish'];
  const userPrompt = template.user_prompt_template.replace('{text}', text);

  const request: GenerateRequest = {
    prompt: userPrompt,
    system_prompt: template.system_prompt,
    max_tokens: template.recommended_params?.max_tokens,
    temperature: template.recommended_params?.temperature,
  };

  return await generateStream(request, callbacks);
}

/**
 * 流式对话生成 - 快捷方法
 */
export async function generateDialogueStream(
  scene: string,
  callbacks: StreamCallbacks
): Promise<() => void> {
  const template = AI_WRITING_TEMPLATES['dialogue'];
  const userPrompt = template.user_prompt_template.replace('{text}', scene);

  const request: GenerateRequest = {
    prompt: userPrompt,
    system_prompt: template.system_prompt,
    max_tokens: template.recommended_params?.max_tokens,
    temperature: template.recommended_params?.temperature,
  };

  return await generateStream(request, callbacks);
}
