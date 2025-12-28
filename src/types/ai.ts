/**
 * AI 相关类型定义
 *
 * 这些类型需要与 Rust 后端的类型保持一致
 */

/**
 * AI 配置参数
 */
export interface AIConfig {
  /** 模型文件路径 */
  model_path: string;
  /** 上下文大小（token 数量） */
  context_size: number;
  /** GPU 层数（0 = 仅 CPU） */
  gpu_layers: number;
  /** 线程数 */
  threads: number;
  /** 温度参数（控制随机性，0.0-2.0） */
  temperature: number;
  /** Top-P 采样 */
  top_p: number;
  /** Top-K 采样 */
  top_k: number;
  /** 重复惩罚 */
  repeat_penalty: number;
}

/**
 * AI 生成请求
 */
export interface GenerateRequest {
  /** 输入提示词 */
  prompt: string;
  /** 系统提示词（可选） */
  system_prompt?: string;
  /** 最大生成 token 数 */
  max_tokens?: number;
  /** 温度（覆盖配置） */
  temperature?: number;
  /** 停止词 */
  stop_words?: string[];
}

/**
 * AI 生成响应
 */
export interface GenerateResponse {
  /** 生成的文本 */
  content: string;
  /** 生成的 token 数量 */
  tokens_generated: number;
  /** 是否因停止词停止 */
  stopped_early: boolean;
}

/**
 * AI 模型状态
 */
export type ModelStatus = 'unloaded' | 'loading' | 'loaded' | 'error';

/**
 * AI 预设提示词模板
 */
export interface AIPromptTemplate {
  /** 模板ID */
  id: string;
  /** 模板名称 */
  name: string;
  /** 模板描述 */
  description: string;
  /** 系统提示词 */
  system_prompt: string;
  /** 用户提示词模板（可包含变量） */
  user_prompt_template: string;
  /** 推荐参数（包含配置和生成参数） */
  recommended_params?: Partial<AIConfig> & Partial<Pick<GenerateRequest, 'max_tokens'>>;
}

/**
 * AI 写作助手功能
 */
export type AIWritingFunction =
  | 'continue'       // 续写
  | 'expand'         // 扩写
  | 'polish'         // 润色
  | 'summarize'      // 摘要
  | 'rewrite'        // 改写
  | 'brainstorm'     // 头脑风暴
  | 'dialogue'       // 对话生成
  | 'description';   // 场景描述

/**
 * 默认 AI 配置
 *
 * 模型路径配置说明:
 * 1. 优先使用环境变量 CREATIVE_STUDIO_MODEL_PATH (如果设置)
 * 2. 否则使用默认路径 D:/models/qwen-7b-q4.gguf (可根据实际修改)
 * 3. 如果都不存在,用户需要在设置中手动配置
 */
export const DEFAULT_AI_CONFIG: AIConfig = {
  model_path: '',
  context_size: 4096,
  gpu_layers: 0,
  threads: 4,
  temperature: 0.7,
  top_p: 0.9,
  top_k: 40,
  repeat_penalty: 1.1,
};

/**
 * AI 写作预设模板
 */
export const AI_WRITING_TEMPLATES: Record<AIWritingFunction, AIPromptTemplate> = {
  continue: {
    id: 'continue',
    name: '智能续写',
    description: '根据上下文自动续写内容',
    system_prompt: '你是一位专业的小说/剧本创作助手，擅长根据上下文进行自然流畅的续写。',
    user_prompt_template: '请根据以下内容进行续写（保持风格一致）：\n\n{text}\n\n续写内容：',
    recommended_params: {
      temperature: 0.8,
      max_tokens: 500,
    },
  },
  expand: {
    id: 'expand',
    name: '内容扩写',
    description: '将简短内容扩展为详细描述',
    system_prompt: '你是一位专业的创意写作助手，擅长将简洁的想法扩展为生动详细的描述。',
    user_prompt_template: '请将以下内容扩写，增加细节和描写：\n\n{text}\n\n扩写内容：',
    recommended_params: {
      temperature: 0.7,
      max_tokens: 600,
    },
  },
  polish: {
    id: 'polish',
    name: '文字润色',
    description: '优化文字表达，提升可读性',
    system_prompt: '你是一位专业的文字编辑，擅长优化语言表达，使其更加流畅自然。',
    user_prompt_template: '请润色以下内容，使其更加流畅优美：\n\n{text}\n\n润色后：',
    recommended_params: {
      temperature: 0.5,
      max_tokens: 500,
    },
  },
  summarize: {
    id: 'summarize',
    name: '内容摘要',
    description: '提取核心内容，生成摘要',
    system_prompt: '你是一位专业的内容分析师，擅长提取文本的核心要点。',
    user_prompt_template: '请为以下内容生成简洁的摘要：\n\n{text}\n\n摘要：',
    recommended_params: {
      temperature: 0.3,
      max_tokens: 200,
    },
  },
  rewrite: {
    id: 'rewrite',
    name: '内容改写',
    description: '用不同方式重新表达',
    system_prompt: '你是一位创意写作专家，擅长用不同的方式表达相同的内容。',
    user_prompt_template: '请用不同的方式改写以下内容：\n\n{text}\n\n改写后：',
    recommended_params: {
      temperature: 0.8,
      max_tokens: 500,
    },
  },
  brainstorm: {
    id: 'brainstorm',
    name: '头脑风暴',
    description: '生成创意想法和灵感',
    system_prompt: '你是一位创意策划专家，擅长发散思维和创意联想。',
    user_prompt_template: '请围绕以下主题进行头脑风暴，提供3-5个创意想法：\n\n{text}\n\n创意想法：',
    recommended_params: {
      temperature: 0.9,
      max_tokens: 400,
    },
  },
  dialogue: {
    id: 'dialogue',
    name: '对话生成',
    description: '生成角色对话',
    system_prompt: '你是一位剧本对话专家，擅长创作生动自然的角色对话。',
    user_prompt_template: '请根据以下场景生成对话：\n\n{text}\n\n对话：',
    recommended_params: {
      temperature: 0.8,
      max_tokens: 400,
    },
  },
  description: {
    id: 'description',
    name: '场景描述',
    description: '生成场景和环境描写',
    system_prompt: '你是一位场景描写专家，擅长用文字描绘生动的画面。',
    user_prompt_template: '请为以下场景创作详细的描写：\n\n{text}\n\n场景描述：',
    recommended_params: {
      temperature: 0.7,
      max_tokens: 500,
    },
  },
};
