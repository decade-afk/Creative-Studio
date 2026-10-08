/**
 * contextAssembly - AI 上下文组装器
 *
 * 借鉴多家开源项目的长篇一致性方案，在每次 AI 创作请求前组装完整故事上下文：
 * - 世界书（Lorebook）：参考 SillyTavern / NovelAI 的 World Info 机制，
 *   按关键词扫描正文，只注入被提及的设定条目（省 token 且不干扰未涉及内容）
 * - 前情记忆链（Rolling Memory）：参考 KoboldAI 的 Memory + inkos 的状态投影，
 *   逐章携带"章节摘要"，缺失摘要时退化为上一章结尾
 * - 角色卡（Story Bible）：被正文提及的角色给全卡，其余只报名字与性格
 * - 作者注（Author's Note）：参考 KoboldAI/NovelAI，贯穿全书的风格指令 +
 *   风格预设，注入所有创作类请求
 */

import { getWorkById } from './workService';
import { getChaptersByWorkId } from './chapterService';
import { getCharactersByWorkId } from './characterService';
import { getWorldSettings } from './worldSettingService';
import { getOutlineTree } from './outlineService';
import { loadConfig } from './configService';

/** 风格预设：注入创作类系统提示词的笔调约束 */
export const STYLE_PRESETS: Record<string, { label: string; prompt: string }> = {
  default: { label: '默认（跟随正文）', prompt: '' },
  casual: {
    label: '休闲日常',
    prompt:
      '整体笔调松弛，重生活细节与人物互动；冲突轻量化，靠趣味、信息差与小心愿推动；允许闲笔，但每段仍要有可读的信息或情绪增量。',
  },
  drama: {
    label: '严肃正剧',
    prompt:
      '笔调沉稳克制，重因果与代价；情感表达收敛，靠选择与后果制造张力；避免煽情形容词，让事件本身承载情绪。',
  },
  humor: {
    label: '轻松幽默',
    prompt:
      '语感轻快，幽默从人物性格与情境错位中自然生长，不硬抖机灵、不堆段子；允许适度吐槽与反差，但保持叙事推进。',
  },
  suspense: {
    label: '悬疑紧张',
    prompt:
      '信息释放克制，悬念前置；节奏紧凑，短句制造压迫感；线索只给证据不给结论，不提前泄底。',
  },
};

export interface StoryContext {
  /** 作品类型 + 简介 + 大纲（故事圣经） */
  storyBible: string;
  /** 角色卡（提及者全卡，其余名字+性格） */
  characterCards: string;
  /** 世界书：关键词命中的设定条目 */
  lorebook: string;
  /** 前情记忆：各章摘要链 + 上一章结尾 */
  memory: string;
  /** 作者注 + 风格预设（空字符串表示无） */
  authorNote: string;
  /** 是否拿到了任何非空上下文 */
  hasContext: boolean;
}

/** 提取 HTML 纯文本（与 aiService 保持一致的段落换行规则） */
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

/** 世界书：最多注入条目数与字符预算 */
const LOREBOOK_MAX_ENTRIES = 8;
const LOREBOOK_CHAR_BUDGET = 1600;
const LOREBOOK_ENTRY_MAX = 300;

/** 角色卡字符预算 */
const CHARACTER_CHAR_BUDGET = 1500;

/** 前情记忆链：最多回看的章节数 */
const MEMORY_MAX_CHAPTERS = 8;
/** 上一章结尾携带的字符数 */
const PREV_TAIL_CHARS = 600;

/**
 * 组装完整故事上下文
 *
 * @param workId 作品 ID
 * @param currentChapterId 当前章节 ID（用于截取"它之前"的章节做记忆链）
 * @param visibleText 当前章正文（HTML 或纯文本均可）——世界书与角色卡的扫描对象
 */
export async function assembleStoryContext(
  workId: string | null,
  currentChapterId?: string | null,
  visibleText?: string
): Promise<StoryContext> {
  const empty: StoryContext = {
    storyBible: '',
    characterCards: '',
    lorebook: '',
    memory: '',
    authorNote: '',
    hasContext: false,
  };
  if (!workId) return empty;

  try {
    const [work, chapters, characters, worldSettings, outline, config] = await Promise.all([
      getWorkById(workId),
      getChaptersByWorkId(workId),
      getCharactersByWorkId(workId),
      getWorldSettings(workId).catch(() => []),
      getOutlineTree(workId).catch(() => []),
      loadConfig(),
    ]);

    const plainText = visibleText ? htmlToPlainText(visibleText) : '';

    // ---- 故事圣经：类型 + 简介 + 大纲 ----
    const bibleParts: string[] = [];
    if (work) {
      bibleParts.push(`作品《${work.title}》（${work.type === 'script' ? '剧本' : '小说'}）`);
      if (work.description?.trim()) bibleParts.push(`简介：${work.description.trim()}`);
    }
    if (outline.length > 0) {
      const outlineLines = outline
        .slice(0, 30)
        .map((n) => `- ${n.title}${n.description ? `：${n.description.slice(0, 120)}` : ''}`);
      bibleParts.push(`故事大纲：\n${outlineLines.join('\n')}`);
    }
    const storyBible = bibleParts.join('\n');

    // ---- 世界书：关键词命中注入（SillyTavern World Info 的简化实现） ----
    const loreParts: string[] = [];
    if (plainText && worldSettings.length > 0) {
      let budget = LOREBOOK_CHAR_BUDGET;
      for (const entry of worldSettings) {
        if (loreParts.length >= LOREBOOK_MAX_ENTRIES || budget <= 0) break;
        const keys = [entry.title, ...(entry.tags || [])]
          .filter((k): k is string => !!k && k.trim().length > 0)
          .map((k) => k.trim());
        // 标题或任一标签在正文中出现即触发
        const hit = keys.some((k) => plainText.includes(k));
        if (!hit) continue;
        const text = `【${entry.title}】${(entry.content || '').slice(0, LOREBOOK_ENTRY_MAX)}`;
        if (text.length > budget) break;
        loreParts.push(text);
        budget -= text.length;
      }
    }
    const lorebook = loreParts.join('\n');

    // ---- 角色卡：被正文提及的给全卡，其余只报名字+性格 ----
    const charParts: string[] = [];
    if (characters.length > 0) {
      let budget = CHARACTER_CHAR_BUDGET;
      const mentioned = plainText
        ? characters.filter((c) => c.name && plainText.includes(c.name))
        : [];
      const rest = characters.filter((c) => !mentioned.includes(c));
      const lines: string[] = [];
      for (const c of mentioned) {
        const bits = [c.name, c.personality && `性格：${c.personality}`, c.description && `设定：${c.description}`]
          .filter(Boolean)
          .join('，');
        if (bits.length > budget) break;
        lines.push(bits);
        budget -= bits.length;
      }
      for (const c of rest) {
        const bits = c.personality ? `${c.name}（${c.personality}）` : c.name;
        if (bits.length > budget) break;
        lines.push(bits);
        budget -= bits.length;
      }
      charParts.push(...lines);
    }
    const characterCards = charParts.length > 0 ? `出场与相关角色：\n${charParts.join('\n')}` : '';

    // ---- 前情记忆链：各章摘要 + 上一章结尾 ----
    const memParts: string[] = [];
    const idx = chapters.findIndex((c) => c.id === currentChapterId);
    // 当前章之前的章节（最多回看 MEMORY_MAX_CHAPTERS 章）
    const prevChapters = idx > 0 ? chapters.slice(Math.max(0, idx - MEMORY_MAX_CHAPTERS), idx) : [];
    for (const ch of prevChapters) {
      if (ch.summary?.trim()) {
        memParts.push(`《${ch.title}》：${ch.summary.trim()}`);
      } else if (ch.id === prevChapters[prevChapters.length - 1]?.id) {
        // 紧邻上一章没有摘要时，退化为正文结尾
        const tail = htmlToPlainText(ch.content || '').slice(-PREV_TAIL_CHARS);
        if (tail) memParts.push(`《${ch.title}》结尾：\n${tail}`);
      }
    }
    const memory = memParts.length > 0 ? `前情提要（按章节顺序）：\n${memParts.join('\n')}` : '';

    // ---- 作者注 + 风格预设 ----
    const preset = STYLE_PRESETS[config.ai.stylePreset] || STYLE_PRESETS.default;
    const noteParts: string[] = [];
    if (preset.prompt) noteParts.push(`【全书笔调】${preset.prompt}`);
    if (config.ai.authorNote?.trim()) noteParts.push(`【作者注】${config.ai.authorNote.trim()}`);
    const authorNote = noteParts.join('\n');

    return {
      storyBible,
      characterCards,
      lorebook,
      memory,
      authorNote,
      hasContext: !!(storyBible || characterCards || lorebook || memory || authorNote),
    };
  } catch (error) {
    console.error('上下文组装失败，降级为无上下文模式:', error);
    return empty;
  }
}

/**
 * 把上下文块拼成一段可嵌入 user 消息的上下文文本
 */
export function renderContextBlock(ctx: StoryContext): string {
  if (!ctx.hasContext) return '';
  const blocks: string[] = [];
  if (ctx.storyBible) blocks.push(`【故事背景】\n${ctx.storyBible}`);
  if (ctx.memory) blocks.push(ctx.memory);
  if (ctx.characterCards) blocks.push(ctx.characterCards);
  if (ctx.lorebook) blocks.push(`【相关设定】\n${ctx.lorebook}`);
  if (ctx.authorNote) blocks.push(ctx.authorNote);
  return blocks.join('\n\n');
}
