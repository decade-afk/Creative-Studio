/**
 * 文件名：searchService.ts
 * 模块名称：全局搜索服务
 *
 * 【核心功能】
 * 跨作品、跨章节全文检索标题与正文，返回带上下文片段的结果。
 *
 * 【实现说明】
 * - SQL 侧先用 LIKE 粗筛（命中 title 或 content），TS 侧对正文
 *   去除 HTML 标签后精确定位关键词位置，生成片段高亮信息
 * - 数据量为中型作品库（数百章）时性能足够；后续可升级 FTS5
 */

import { getDatabase } from './database';

/** 单条搜索结果 */
export interface SearchResult {
  /** 章节ID */
  chapterId: string;
  /** 作品ID */
  workId: string;
  /** 作品标题 */
  workTitle: string;
  /** 章节标题 */
  chapterTitle: string;
  /** 关键词在正文中的出现次数 */
  matchCount: number;
  /** 上下文片段（关键词以 <mark> 包裹） */
  snippet: string;
}

/** 单个章节最多返回的结果片段数 */
const MAX_SNIPPETS_PER_CHAPTER = 3;

/** 片段前后各保留的字符数 */
const SNIPPET_CONTEXT = 40;

/**
 * 全局搜索章节内容与标题
 *
 * @param keyword 关键词（不区分大小写）
 * @param workId 可选，限定作品范围
 * @param limit 最多返回的章节结果数（默认 50）
 */
export async function searchChapters(
  keyword: string,
  workId?: string,
  limit = 50
): Promise<SearchResult[]> {
  const trimmed = keyword.trim();
  if (trimmed.length < 2) {
    return [];
  }

  const db = await getDatabase();

  const rows = await db.select<Array<{ id: string; work_id: string; title: string; content: string }>>(
    `SELECT c.id, c.work_id, c.title, c.content
     FROM chapters c
     JOIN works w ON w.id = c.work_id
     WHERE c.deleted = 0 AND w.deleted = 0
       AND (c.title LIKE $1 OR c.content LIKE $1)
       ${workId ? 'AND c.work_id = $2' : ''}
     ORDER BY w.title, c.chapter_order
     LIMIT 300`,
    workId ? [`%${trimmed}%`, workId] : [`%${trimmed}%`]
  );

  const results: SearchResult[] = [];

  for (const row of rows) {
    const plain = stripHtml(row.content);
    const matches = findMatches(plain, trimmed);

    if (matches.length === 0 && !row.title.toLowerCase().includes(trimmed.toLowerCase())) {
      continue;
    }

    results.push({
      chapterId: row.id,
      workId: row.work_id,
      workTitle: await getWorkTitle(row.work_id),
      chapterTitle: row.title,
      matchCount: matches.length,
      snippet: buildSnippet(plain, matches.slice(0, MAX_SNIPPETS_PER_CHAPTER), trimmed),
    });

    if (results.length >= limit) break;
  }

  return results;
}

/** 作品标题缓存（搜索结果批量查询时避免重复查询） */
const workTitleCache = new Map<string, string>();

async function getWorkTitle(workId: string): Promise<string> {
  const cached = workTitleCache.get(workId);
  if (cached) return cached;

  const db = await getDatabase();
  const rows = await db.select<Array<{ title: string }>>('SELECT title FROM works WHERE id = $1', [workId]);
  const title = rows[0]?.title || '';
  workTitleCache.set(workId, title);
  return title;
}

/** 清空作品标题缓存（作品增删改时调用） */
export function clearSearchCache(): void {
  workTitleCache.clear();
}

/** 去除 HTML 标签与实体 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 在纯文本中查找所有关键词位置（不区分大小写） */
function findMatches(text: string, keyword: string): number[] {
  const positions: number[] = [];
  const lowerText = text.toLowerCase();
  const lowerKeyword = keyword.toLowerCase();
  let pos = lowerText.indexOf(lowerKeyword);

  while (pos !== -1) {
    positions.push(pos);
    pos = lowerText.indexOf(lowerKeyword, pos + keyword.length);
  }
  return positions;
}

/**
 * 生成高亮片段（关键词以 <mark> 标记，由 UI 渲染）
 */
function buildSnippet(text: string, positions: number[], keyword: string): string {
  if (positions.length === 0) {
    return text.slice(0, SNIPPET_CONTEXT * 2) + (text.length > SNIPPET_CONTEXT * 2 ? '...' : '');
  }

  const parts: string[] = [];
  let cursor = 0;

  for (const pos of positions) {
    const start = Math.max(0, pos - SNIPPET_CONTEXT);
    const end = Math.min(text.length, pos + keyword.length + SNIPPET_CONTEXT);

    parts.push((start > cursor ? '...' : '') + escapeHtml(text.slice(start, pos)));
    parts.push('<mark>' + escapeHtml(text.slice(pos, pos + keyword.length)) + '</mark>');
    parts.push(escapeHtml(text.slice(pos + keyword.length, end)));
    cursor = end;

    if (end < text.length) {
      parts.push('');
    }
  }

  return parts.join('') + (cursor < text.length ? '...' : '');
}

/** HTML 转义片段中的特殊字符 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
