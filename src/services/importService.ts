/**
 * 文件名：importService.ts
 * 模块名称：作品导入服务
 *
 * 【核心功能】
 * 1. 选择本地 TXT / Markdown 文件导入为作品
 * 2. 智能分章 - 识别"第X章/节/回/卷"标题与 Markdown 标题（#/##）
 * 3. 无法识别章节时按字数自动切分（避免出现几万字的单章）
 *
 * 【设计说明】
 * - 章节识别按优先级尝试：数字序号（第1章）→ 中文序号（第一百零八章）→ MD 标题
 * - 文件开头若有大段"前言/楔子"内容且无标题，以"开头"章节收纳
 */

import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { createWork } from './workService';
import { createChapter } from './chapterService';
import type { WorkType } from '../types/storage';

/** 导入结果 */
export interface ImportResult {
  /** 新作品 ID */
  workId: string;
  /** 作品标题 */
  title: string;
  /** 导入的章节数 */
  chapterCount: number;
  /** 总字数（近似） */
  totalChars: number;
}

/** 解析出的章节 */
interface ParsedChapter {
  title: string;
  content: string;
}

/** 单章最大字数（无法识别章节标题时的自动切分阈值） */
const AUTO_SPLIT_SIZE = 6000;

/**
 * 弹出文件选择框并导入作品
 *
 * @param type 作品类型（决定数据库中 type 字段）
 * @returns 导入结果；用户取消返回 null
 */
export async function importWorkFromFile(type: WorkType = 'novel'): Promise<ImportResult | null> {
  const selected = await open({
    title: '导入作品（TXT / Markdown）',
    multiple: false,
    directory: false,
    filters: [
      { name: '文本文档', extensions: ['txt', 'md', 'markdown'] },
      { name: '所有文件', extensions: ['*'] },
    ],
  });

  if (!selected || typeof selected !== 'string') {
    return null;
  }

  const raw = await readTextFile(selected);
  if (!raw.trim()) {
    throw new Error('文件内容为空');
  }

  const fileName = selected.split(/[\\/]/).pop() || '导入作品';
  const title = fileName.replace(/\.(txt|md|markdown)$/i, '');
  const chapters = parseChapters(raw);

  return await createWorkWithChapters(title, type, chapters);
}

/**
 * 将原始文本解析为章节列表
 */
export function parseChapters(raw: string): ParsedChapter[] {
  const text = raw.replace(/\r\n/g, '\n').trim();

  const byNumber = splitByPattern(text, CHAPTER_NUMBER_PATTERN);
  const chapters = byNumber.length > 0 ? byNumber : splitByPattern(text, MD_HEADING_PATTERN);

  if (chapters.length > 0) {
    return chapters;
  }

  // 兜底：按字数自动切分
  return autoSplit(text);
}

/** "第X章/节/回/卷/集" 标题（支持中文与阿拉伯数字，独占一行） */
const CHAPTER_NUMBER_PATTERN =
  /^#{0,3}\s*(第\s*[0-9一二三四五六七八九十百千万零两]+\s*[章节回卷部集幕][^\n]*)$/gm;

/** Markdown 标题（# 或 ##，跳过 # 的一级标题用于书名的情况由调用方处理） */
const MD_HEADING_PATTERN = /^#{1,3}\s+([^\n]+)$/gm;

/**
 * 按标题模式切分章节
 *
 * @returns 章节列表；无匹配时返回空数组
 */
function splitByPattern(text: string, pattern: RegExp): ParsedChapter[] {
  const matches = [...text.matchAll(pattern)];
  if (matches.length < 2) {
    // 少于 2 个标题视为不是章节结构，交给兜底逻辑
    return [];
  }

  const chapters: ParsedChapter[] = [];

  // 第一个标题之前的内容（若有）作为"开头"章节
  const firstIndex = matches[0].index ?? 0;
  if (firstIndex > 0 && text.slice(0, firstIndex).trim().length > 100) {
    chapters.push({ title: '开头', content: text.slice(0, firstIndex).trim() });
  }

  for (let i = 0; i < matches.length; i++) {
    const start = (matches[i].index ?? 0) + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index ?? text.length : text.length;
    const title = cleanChapterTitle(matches[i][1] || matches[i][0]);
    const content = text.slice(start, end).trim();
    chapters.push({ title, content });
  }

  return chapters.filter((c) => c.content.length > 0 || c.title);
}

/**
 * 清理章节标题：去掉 Markdown 记号、包裹符号与多余空白
 */
function cleanChapterTitle(raw: string): string {
  return raw
    .replace(/^#+\s*/, '')
    .replace(/^[《"'「【\*\-_]+|[》"'」】\*\-_]+$/g, '')
    .trim()
    .slice(0, 100);
}

/**
 * 按固定字数自动切分（在段落边界处断开）
 */
function autoSplit(text: string): ParsedChapter[] {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim());
  const chapters: ParsedChapter[] = [];
  let buffer: string[] = [];
  let size = 0;

  const flush = (index: number) => {
    if (buffer.length === 0) return;
    chapters.push({ title: `第${index}章`, content: buffer.join('\n\n') });
    buffer = [];
    size = 0;
  };

  let index = 1;
  for (const paragraph of paragraphs) {
    buffer.push(paragraph.trim());
    size += paragraph.length;
    if (size >= AUTO_SPLIT_SIZE) {
      flush(index++);
    }
  }
  flush(index);

  return chapters.length > 0 ? chapters : [{ title: '正文', content: text }];
}

/**
 * 纯文本转编辑器 HTML
 */
function textToHtml(content: string): string {
  return content
    .split(/\n{2,}/)
    .map((p) => `<p>${p.trim().replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/**
 * 创建作品并批量写入章节
 */
async function createWorkWithChapters(
  title: string,
  type: WorkType,
  chapters: ParsedChapter[]
): Promise<ImportResult> {
  const work = await createWork(title.slice(0, 100), type, '📖', undefined);

  let totalChars = 0;

  // 逐章创建（createChapter 为位置参数签名）
  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];
    totalChars += chapter.content.length;
    await createChapter(
      work.id,
      chapter.title || `第${i + 1}章`,
      textToHtml(chapter.content),
      i + 1
    );
  }

  console.log(`✅ 导入作品「${title}」: ${chapters.length} 章, 约 ${totalChars} 字`);
  return { workId: work.id, title: work.title, chapterCount: chapters.length, totalChars };
}
