/**
 * 文件名：submissionService.ts
 * 模块名称：作品投递服务
 *
 * 【核心功能】
 * 1. 投递台账：记录章节向平台（起点/番茄）的投递历史
 * 2. 章节格式化：HTML 正文 → 平台编辑器友好的纯文本（保留段落）
 * 3. 平台元数据：后台地址、填充配置
 *
 * 【平台说明】
 * 两家平台均无公开投稿 API，投递采用三层策略：
 * - 保底：格式化章节复制到剪贴板 + 打开作家后台（用户粘贴）
 * - 进阶：内嵌 Webview 窗口打开后台，evaluate_script 自动填充（尽力而为）
 * - 台账：无论哪种方式完成投递，都记录一条历史
 */

import { getDatabase, generateUUID, getCurrentTimestamp } from './database';

/** 支持的投递平台 */
export type SubmissionPlatform = 'qidian' | 'fanqie';

/** 平台元数据 */
export const SUBMISSION_PLATFORMS: Record<
  SubmissionPlatform,
  { id: SubmissionPlatform; name: string; icon: string; consoleUrl: string; hint: string }
> = {
  qidian: {
    id: 'qidian',
    name: '起点中文网',
    icon: '📚',
    consoleUrl: 'https://write.qq.com',
    hint: '起点作家助手网页版（write.qq.com），登录后进入作品章节发布页',
  },
  fanqie: {
    id: 'fanqie',
    name: '番茄小说',
    icon: '🍅',
    consoleUrl: 'https://writer.fanqienovel.com',
    hint: '番茄作家后台（writer.fanqienovel.com），登录后进入章节编辑页',
  },
};

/** 投递记录 */
export interface Submission {
  id: string;
  work_id: string;
  chapter_id: string;
  platform: SubmissionPlatform;
  chapter_title: string;
  status: string;
  note: string;
  created_at: string;
}

/**
 * HTML 正文 → 平台编辑器纯文本
 *
 * 块级标签转换行、去实体；段落之间空一行（网文平台通用格式）
 */
export function formatChapterForSubmission(html: string): string {
  return html
    .replace(/<\/(p|div|h[1-6])>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 复制文本到剪贴板
 *
 * 【说明】走 Rust 剪贴板插件：WebView 的 navigator.clipboard 会触发
 * 系统权限弹窗（首体验差），Rust 侧写入无弹窗且必成功
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
    await writeText(text);
    return true;
  } catch (error) {
    console.error('剪贴板写入失败:', error);
    return false;
  }
}

/**
 * 记录一次投递
 */
export async function recordSubmission(
  workId: string,
  chapterId: string,
  chapterTitle: string,
  platform: SubmissionPlatform,
  note: string = ''
): Promise<Submission> {
  const db = await getDatabase();
  const record: Submission = {
    id: generateUUID(),
    work_id: workId,
    chapter_id: chapterId,
    platform,
    chapter_title: chapterTitle,
    status: 'submitted',
    note,
    created_at: getCurrentTimestamp(),
  };

  await db.execute(
    `INSERT INTO submissions (id, work_id, chapter_id, platform, chapter_title, status, note, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      record.id,
      record.work_id,
      record.chapter_id,
      record.platform,
      record.chapter_title,
      record.status,
      record.note,
      record.created_at,
    ]
  );

  return record;
}

/**
 * 作品的投递历史（按时间倒序）
 */
export async function getSubmissionsByWorkId(workId: string): Promise<Submission[]> {
  const db = await getDatabase();
  return await db.select<Submission[]>(
    `SELECT * FROM submissions WHERE work_id = $1 ORDER BY created_at DESC`,
    [workId]
  );
}

/**
 * 判断章节是否已投递到平台（用于标记"已投"）
 */
export async function isChapterSubmitted(
  chapterId: string,
  platform: SubmissionPlatform
): Promise<boolean> {
  const db = await getDatabase();
  const rows = await db.select<Array<{ count: number }>>(
    `SELECT COUNT(*) as count FROM submissions WHERE chapter_id = $1 AND platform = $2`,
    [chapterId, platform]
  );
  return (rows[0]?.count || 0) > 0;
}

/**
 * 删除投递记录
 */
export async function deleteSubmission(id: string): Promise<void> {
  const db = await getDatabase();
  await db.execute('DELETE FROM submissions WHERE id = $1', [id]);
}
