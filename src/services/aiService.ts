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
import { STYLE_PRESETS } from './contextAssembly';

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

/**
 * 中文创作系统提示词（v2）
 *
 * 融合多家开源项目的写作方法论：
 * - inkos long-writing：场景要有即时目标-阻力-转折-后果；对话承压；
 *   因果归属（禁止巧合解局）；每段都要改变至少一条叙事轴
 * - inkos story-deslop：语义级去AI味诊断（不靠禁词表，靠功能判断）
 * - 网文创作共识：直接呈现不解释、少用心理独白代替事件
 */
const WRITER_SYSTEM_PROMPT = `你是一位深耕中文长篇叙事的写作者，任务是输出可以直接放进书里的正文。

写法要求：
- 用场景讲故事：每个段落通过行动、对话、感官细节、选择或后果推进，不写梗概式叙述，不做旁白分析
- 展示而非标签：情绪用具体反应呈现（动作、停顿、语气），不直接下"他很紧张""她很伤心"这类结论
- 对话承压：每句有分量的对话都要改变局面——透露信息、施加压力、欠下人情或逼出选择；删掉只为交换信息的寒暄
- 因果归属：转折来自人物在约束下做的选择，不用巧合、无来由的巧合相遇或对手降智解局
- 每段有增量：至少改变一条叙事轴（事情进展、认知、关系、处境、资源、危险），删掉纯填充
- 文笔：多用具体动词与可观察反应，句子节奏贴合场景的物理与情绪运动；比喻服务表达而非装饰

禁止（AI 味来源，审查到即改写）：
- 禁止总结式结尾、上价值说教、人生感悟收束——停在动作、画面、选择或情绪余波上
- 禁止对已演示的情绪再做一遍解释；禁止"深吸一口气"式的空转缓冲（有功能就改成角色当下动作）
- 禁止套话模板："眼中闪过一丝X"（→ 写"他垂下眼/眯起眼"）、"嘴角勾起一抹X"（→ 写"他嘴角一扯/乐了"）
- 禁止虚词缓冲："一丝/一抹/一缕"+情绪、"不禁/竟然/不由得/仿佛"当口头禅——删掉缓冲词让动作直接发生
- 禁止对比定义句式："他要的不是X而是Y""这不是结束而是开始"——用一个具体动作或选择呈现
- 禁止四字成语堆砌充当描写（"惊心动魄、险象环生、千钧一发"）——换成一个具体动作或画面
- 禁止对称排比句式、三段式套话；禁止群众整齐划一反应（"所有人都倒吸一口凉气"）

输出格式：
- 直接输出正文本身，不输出解释、前言、总结或标题
- 使用 <p></p> 段落标签组织正文`;

/** 从风格预设 ID 取提示词（配置层可能的非法值退化为默认） */
export function getStylePresetPrompt(presetId: string): string {
  return STYLE_PRESETS[presetId]?.prompt || '';
}

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

/**
 * 续写：故事上下文（背景/前情/角色/设定/作者注）+ 正文结尾 → 续写一段
 * contextBlock 由 contextAssembly.assembleStoryContext + renderContextBlock 生成
 */
export function buildContinueMessages(
  contextTail: string,
  instruction?: string,
  contextBlock?: string
): AiMessage[] {
  const plain = htmlToPlainText(contextTail).slice(-3000);
  const userParts: string[] = [];
  if (contextBlock) userParts.push(contextBlock);
  if (instruction) userParts.push(`【补充要求】\n${instruction}`);
  // 正文语态文字放在末尾（末位效应）：动笔前最后读到的是正文，避免被设定/大纲的语言污染文风
  userParts.push(
    `接着下面的正文自然续写 400-700 字。衔接处与已有文本的语汇、节奏、氛围保持一致，可以写少量过渡让承接自然，但不复述已覆盖的事件、不重新描写已出现的细节。先明确这一段要完成的 1-3 个节拍（目标-阻力-转折），再动笔：\n\n【正文结尾】\n${plain}`
  );
  return [
    { role: 'system', content: WRITER_SYSTEM_PROMPT },
    { role: 'user', content: userParts.join('\n\n') },
  ];
}

/**
 * 润色：inkos 语义级清理 —— 按功能诊断而非禁词替换，保留作者声音
 */
export function buildPolishMessages(
  selection: string,
  instruction?: string,
  contextBlock?: string
): AiMessage[] {
  return [
    { role: 'system', content: WRITER_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `${contextBlock ? contextBlock + '\n\n' : ''}请修订下面的文字。逐段自问：
1. 这段要完成什么叙事功能？功能是否通过行动/画面/证据可见？
2. 叙述者是否解释了已经演示出来的情绪？删掉解释，保留演示
3. 这句话换成任何角色任何书都成立吗？成立就改写到只属于此场景
4. 对话有动机吗？伪装成对话的说明要么给动机要么改叙述
5. 节奏是否贴合场景的运动？

保留情节事实、人物声音与有力的原句，只修病灶；篇幅与原文接近，直接输出修订后的全文：\n\n【原文】\n${htmlToPlainText(
        selection
      )}${instruction ? `\n\n【补充要求】\n${instruction}` : ''}`,
    },
  ];
}

/**
 * 摘要：生成"状态投影"式章节记忆（inkos state-projection）——
 * 输出的摘要会存入 chapters.summary，作为后续章节 AI 请求的前情链
 */
export function buildSummaryMessages(
  chapterTitle: string,
  chapterHtml: string,
  contextBlock?: string
): AiMessage[] {
  return [
    {
      role: 'system',
      content:
        '你是长篇小说的连续性编辑，负责为已完成的章节生成"记忆摘要"。摘要供作者续写后续章节时做前情参考，事实必须来自本章，不得推测。直接输出摘要，不要前言。',
    },
    {
      role: 'user',
      content: `请为章节「${chapterTitle}」生成 200 字以内的记忆摘要，按以下要素选取本章**新建立/新变化**的事实：
- 关键事件（谁做了什么，导致什么后果）
- 人物状态与关系变化（含每人**知道了什么/不知道什么**）
- 新出现的地点、物品、规则、称谓
- 未解决的悬念与新埋的伏笔
只记录确定的、可被后续章节引用的事实：\n\n${htmlToPlainText(chapterHtml).slice(0, 8000)}${
        contextBlock ? `\n\n【既有设定参考】\n${contextBlock}` : ''
      }`,
    },
  ];
}

/**
 * 审稿：结构化审校 + 长篇一致性专项（融合 inkos 审稿与连续性检查）
 */
export function buildReviewMessages(
  chapterTitle: string,
  chapterHtml: string,
  contextBlock?: string
): AiMessage[] {
  return [
    {
      role: 'system',
      content: `你是严格而专业的中文小说审稿编辑。按以下分类输出审稿意见（纯文本，短横线列表，每条引用原文短语定位）：
【逻辑硬伤】情节自相矛盾、因果不成立之处；特别检查：是否有巧合解局、对手无故降智、人物知道了他不该知道的信息
【时间线】时间顺序、时长、事件发生与被发现的时间是否混乱
【人物一致性】言行、性格、称谓前后不一致；人物反应是否符合其动机与处境；配角是否只按主角需要行动而没有自己的利益逻辑
【叙事效率】梗概式叙述替代场景、重复解释、无信息增量的段落
【连载节奏】开篇是否尽快进入压力事件（而非背景铺陈）；千字内有无情绪起伏点；章尾钩子是落在材料性变化/新压力上，还是总结式收尾（"就这样…""他终于明白…"）
【伏笔与悬念】已埋伏笔、未回收的悬念、本章新埋钩子是否清晰
【文笔建议】具体到句子的修改建议（AI味专项：总结腔、对称排比、情绪标签化、"一丝/一抹"缓冲词、成语堆砌）
仅列出确实存在的问题；若某类没有问题，写"无明显问题"。`,
    },
    {
      role: 'user',
      content: `${contextBlock ? contextBlock + '\n\n' : ''}请审稿章节「${chapterTitle}」：\n\n${htmlToPlainText(
        chapterHtml
      ).slice(0, 8000)}`,
    },
  ];
}

/**
 * 大纲生成：叙事引擎方法论（inkos foundation-design）——
 * 表线（可见的 foreground story）由里线（background causal story）驱动，
 * 每卷有可观察的终态与不可逆变化，钩子区分休眠与激活
 */
export function buildOutlineMessages(
  premise: string,
  chapterCount: number,
  contextBlock?: string
): AiMessage[] {
  return [
    {
      role: 'system',
      content: `你是专业的长篇故事策划。设计大纲时遵循：
- 叙事引擎：找到主题压力与不可调和的动机冲突，让可见的前台故事由更深的后台因果驱动；对手要有自己的利益逻辑，不是主角的送件人
- 分卷思维：每一卷有独立的戏剧目的、可观察的终态和一次不可逆的变化；短期钩子挂到全书主线上
- 人物弧光：主角有具体的起点状态、内/外目的地和必须支付的代价；配角有独立理由去合作、抵抗、误读或离开
- 钩子管理：区分"已激活的钩子"与"休眠的未来种子"；承重钩子只留少数几个，其余按需休眠
- 开篇契约：第一章用具体的扰动/风险/未解事实建立阅读压力，第二章让主角的独特杠杆可见地用一次，第三章让短期目标清晰可辨
直接输出大纲内容，不要前言与总结。`,
    },
    {
      role: 'user',
      content: `基于以下创意生成 ${chapterCount} 章的故事大纲。每章一段，格式为：
第N章 标题：章节梗概（谁要什么、什么阻力、如何转折）[伏笔：埋设X/回收Y/强化Z，无则写"无"]（章末钩子一句话）
要求：
- 每章梗概必须包含至少一条叙事轴的推进（事情/认知/关系/处境）
- 章末钩子落在材料性变化或新压力上，不用机械悬念公式
- 合理安排悬念节奏：每 3-5 章构成一个张弛单元，紧后要有缓冲
- 主要人物要有独立动机，反派按自己的利益行动

【创意】
${premise}${contextBlock ? `\n\n【既有设定】\n${contextBlock}` : ''}`,
    },
  ];
}

/**
 * 扩写：Long-Novel-GPT 式的波折扩充——不注水，靠增加具体事件与阻力拉出波澜
 */
export function buildExpandMessages(
  selection: string,
  instruction?: string,
  contextBlock?: string
): AiMessage[] {
  return [
    { role: 'system', content: WRITER_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `${contextBlock ? contextBlock + '\n\n' : ''}请扩充下面的文字：在原有走向中引入更多具体事件、阻力与反应，使其一波三折、跌宕起伏，更有故事性。
注意：
- 扩的是"事件与变化"，不是形容词语气词的注水；每处新增内容都要有叙事功能
- 保留原文的关键事实与结局走向，篇幅可为原文的 1.5-3 倍
- 直接输出扩充后的全文：\n\n【原文】\n${htmlToPlainText(selection)}${
        instruction ? `\n\n【补充要求】\n${instruction}` : ''
      }`,
    },
  ];
}

/**
 * 分镜生成：从章节正文生成分镜镜头列表
 */
export function buildStoryboardMessages(chapterTitle: string, chapterHtml: string): AiMessage[] {
  return [
    {
      role: 'system',
      content: `你是专业影视分镜师。只输出一个 JSON 数组，不要任何解释、代码块标记或其它文字。
每个镜头格式：
{"title":"镜头标题","description":"画面内容描述","shot_type":"wide|medium|close|extreme_close","camera_movement":"static|pan|tilt|zoom|dolly|crane","duration":秒数}
要求：8-12 个镜头，覆盖章节关键节拍；shot_type 与 camera_movement 只能取给定枚举值；duration 为 2-15 的数字。`,
    },
    {
      role: 'user',
      content: `为章节「${chapterTitle}」设计分镜：\n\n${htmlToPlainText(chapterHtml).slice(0, 8000)}`,
    },
  ];
}

/**
 * 解析 AI 输出中的分镜 JSON 数组
 *
 * 容忍 markdown 代码块包裹与前后杂文本；非法字段自动剔除
 */
export function parseStoryboardJson(text: string): ParsedStoryboard[] {
  // 提取第一个 '[' 到最后一个 ']' 之间的内容
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end <= start) return [];

  let parsed: any[];
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const SHOT_TYPES = new Set(['wide', 'medium', 'close', 'extreme_close']);
  const MOVES = new Set(['static', 'pan', 'tilt', 'zoom', 'dolly', 'crane']);

  return parsed
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      title: String(item.title || '未命名镜头').slice(0, 100),
      description: String(item.description || ''),
      shot_type: SHOT_TYPES.has(item.shot_type) ? item.shot_type : 'medium',
      camera_movement: MOVES.has(item.camera_movement) ? item.camera_movement : 'static',
      duration: Math.max(1, Math.min(60, Math.round(Number(item.duration) || 5))),
    }));
}

/** 解析出的单条分镜 */
export interface ParsedStoryboard {
  title: string;
  description: string;
  shot_type: 'wide' | 'medium' | 'close' | 'extreme_close';
  camera_movement: 'static' | 'pan' | 'tilt' | 'zoom' | 'dolly' | 'crane';
  duration: number;
}

/**
 * 解析 AI 大纲文本为章节列表
 *
 * 识别"第N章 标题：梗概"（支持中文数字、全角冒号）
 */
export function parseOutlineText(text: string): ParsedOutlineChapter[] {
  const result: ParsedOutlineChapter[] = [];
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  // 第N章（阿拉伯或中文数字），后接标题，可选冒号 + 梗概
  const pattern = /^第\s*([0-9一二三四五六七八九十百千零两]+)\s*章\s*[:：]?\s*(.*)$/;

  for (const line of lines) {
    const match = line.match(pattern);
    if (!match) continue;

    const rest = match[2];
    const sepIndex = rest.search(/[：:]/);
    const title = (sepIndex === -1 ? rest : rest.slice(0, sepIndex)).trim() || `第${match[1]}章`;
    const description = sepIndex === -1 ? '' : rest.slice(sepIndex + 1).trim();

    result.push({ title: title.slice(0, 100), description });
  }

  return result;
}

/** 解析出的大纲章节 */
export interface ParsedOutlineChapter {
  title: string;
  description: string;
}

// ============================================================================
// 角色生成
// ============================================================================

/** AI 生成角色提示词 */
export function buildCharacterMessages(workTitle: string, premise: string, count: number): AiMessage[] {
  return [
    {
      role: 'system',
      content: `你是专业的小说人物架构师。只输出一个 JSON 数组，不要任何解释或代码块标记。
每个角色格式：
{"name":"角色名","avatar":"一个贴合角色的emoji","description":"80字以内的人物简介","personality":"性格特点","relationships":"与其他角色的关系"}
生成 ${count} 个立体、有张力的角色，关系之间要能形成戏剧冲突。`,
    },
    {
      role: 'user',
      content: `为作品《${workTitle}》设计角色。作品创意：${premise}`,
    },
  ];
}

/** 解析出的角色 */
export interface ParsedCharacter {
  name: string;
  avatar: string;
  description: string;
  personality: string;
  relationships: string;
}

/** 解析 AI 输出中的角色 JSON 数组（容忍代码块包裹，剔除非法字段） */
export function parseCharacterJson(text: string): ParsedCharacter[] {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end <= start) return [];
  let parsed: any[];
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((item) => item && typeof item === 'object' && item.name)
    .map((item) => ({
      name: String(item.name).slice(0, 50),
      avatar: String(item.avatar || '').slice(0, 4),
      description: String(item.description || ''),
      personality: String(item.personality || ''),
      relationships: String(item.relationships || ''),
    }));
}

// ============================================================================
// 场景生成
// ============================================================================

/** AI 生成场景提示词 */
export function buildSceneMessages(workTitle: string, premise: string, count: number): AiMessage[] {
  return [
    {
      role: 'system',
      content: `你是专业的美术指导。只输出一个 JSON 数组，不要任何解释或代码块标记。
每个场景格式：
{"name":"场景名","location":"具体地点","time_of_day":"morning|noon|evening|night|other","mood":"氛围关键词","description":"80字以内的画面描述"}
生成 ${count} 个有画面感的场景，time_of_day 只能取给定枚举值。`,
    },
    {
      role: 'user',
      content: `为作品《${workTitle}》设计场景。作品创意：${premise}`,
    },
  ];
}

/** 解析出的场景 */
export interface ParsedScene {
  name: string;
  location: string;
  time_of_day: 'morning' | 'noon' | 'evening' | 'night' | 'other';
  mood: string;
  description: string;
}

const TIME_OF_DAY = new Set(['morning', 'noon', 'evening', 'night', 'other']);

/** 解析 AI 输出中的场景 JSON 数组 */
export function parseSceneJson(text: string): ParsedScene[] {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end <= start) return [];
  let parsed: any[];
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((item) => item && typeof item === 'object' && item.name)
    .map((item) => ({
      name: String(item.name).slice(0, 80),
      location: String(item.location || ''),
      time_of_day: (TIME_OF_DAY.has(item.time_of_day) ? item.time_of_day : 'other') as ParsedScene['time_of_day'],
      mood: String(item.mood || ''),
      description: String(item.description || ''),
    }));
}

// ============================================================================
// 伏笔 AI 检测
// ============================================================================

/** 伏笔检测提示词：基于已有章节内容找出伏笔与未回收悬念 */
export function buildClueDetectionMessages(
  chapters: { title: string; content: string }[]
): AiMessage[] {
  const body = chapters
    .map((c) => `【${c.title}】\n${htmlToPlainText(c.content).slice(0, 3000)}`)
    .join('\n\n')
    .slice(0, 12000);

  return [
    {
      role: 'system',
      content: `你是严谨的中文小说编辑，擅长从正文中发现伏笔与悬念。只输出一个 JSON 数组，不要任何解释或代码块标记。
每条伏笔格式：
{"name":"伏笔简称","description":"埋设位置与暗示的内容（引用原文关键短语）"}
只列出确实存在于正文中的伏笔（3-8 条）；没有则输出空数组 []。`,
    },
    {
      role: 'user',
      content: `请从以下章节中检测伏笔与未回收悬念：\n\n${body}`,
    },
  ];
}

/** 解析出的伏笔 */
export interface ParsedClue {
  name: string;
  description: string;
}

/** 解析 AI 输出中的伏笔 JSON 数组（空数组是合法结果） */
export function parseClueJson(text: string): ParsedClue[] {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end <= start) return [];
  let parsed: any[];
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((item) => item && typeof item === 'object' && item.name)
    .map((item) => ({
      name: String(item.name).slice(0, 80),
      description: String(item.description || ''),
    }));
}

// 便于测试与调试导出
export const __internals = { htmlToPlainText };
