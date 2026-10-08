/**
 * 章节服务模块
 *
 * 提供章节的CRUD操作：
 * - 创建新章节
 * - 读取章节列表
 * - 更新章节内容
 * - 删除章节
 * - 章节排序
 *
 * 设计特点：
 * - 章节按order字段排序
 * - 支持自动保存功能
 * - 章节内容使用HTML格式存储
 */

import { getDatabase, generateUUID, transaction, getCurrentTimestamp } from './database';
import type { Chapter } from '../types/storage';

/**
 * 创建新章节
 *
 * @param workId 所属作品ID
 * @param title 章节标题
 * @param content 章节内容（HTML格式）
 * @param order 章节顺序（可选，默认追加到最后）
 * @returns Promise<Chapter> 创建的章节对象
 */
export async function createChapter(
  workId: string,
  title: string,
  content: string = '',
  order?: number
): Promise<Chapter> {
  const db = await getDatabase();

  // 如果未指定顺序，获取当前最大顺序+1
  let chapterOrder = order;
  if (chapterOrder === undefined) {
    const result = await db.select<Array<{ max_order: number | null }>>(
      'SELECT MAX(chapter_order) as max_order FROM chapters WHERE work_id = $1',
      [workId]
    );
    chapterOrder = (result[0]?.max_order || 0) + 1;
  }

  // 创建章节对象
  const chapter: Chapter = {
    id: generateUUID(),
    work_id: workId,
    title,
    content,
    order: chapterOrder,
    summary: '',
    created_at: getCurrentTimestamp(),
    updated_at: getCurrentTimestamp(),
    synced_at: null,
    deleted: false,
  };

  // 插入数据库
  await db.execute(
    `INSERT INTO chapters (id, work_id, title, content, chapter_order, created_at, updated_at, synced_at, deleted)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      chapter.id,
      chapter.work_id,
      chapter.title,
      chapter.content,
      chapter.order,
      chapter.created_at,
      chapter.updated_at,
      chapter.synced_at,
      chapter.deleted ? 1 : 0,
    ]
  );

  console.log('✅ 章节创建成功:', chapter.title);
  return chapter;
}

/**
 * 获取指定作品的所有章节
 * 按order字段排序
 *
 * @param workId 作品ID
 * @param includeDeleted 是否包含已删除的章节（默认false）
 * @returns Promise<Chapter[]> 章节列表
 */
export async function getChaptersByWorkId(
  workId: string,
  includeDeleted: boolean = false
): Promise<Chapter[]> {
  const db = await getDatabase();

  let sql = 'SELECT * FROM chapters WHERE work_id = $1';
  if (!includeDeleted) {
    sql += ' AND deleted = 0';
  }
  sql += ' ORDER BY chapter_order ASC';

  const rows = await db.select<Array<{
    id: string;
    work_id: string;
    title: string;
    content: string;
    chapter_order: number;
    summary: string;
    created_at: string;
    updated_at: string;
    synced_at: string | null;
    deleted: number;
  }>>(sql, [workId]);

  const chapters: Chapter[] = rows.map((row: any) => ({
    id: row.id,
    work_id: row.work_id,
    title: row.title,
    content: row.content,
    order: row.chapter_order,
    summary: row.summary || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
    synced_at: row.synced_at,
    deleted: row.deleted === 1,
  }));

  console.log(`📖 获取到 ${chapters.length} 个章节`);
  return chapters;
}

/**
 * 根据ID获取单个章节
 *
 * @param id 章节ID
 * @returns Promise<Chapter | null> 章节对象，不存在则返回null
 */
export async function getChapterById(id: string): Promise<Chapter | null> {
  const db = await getDatabase();

  const rows = await db.select<Array<{
    id: string;
    work_id: string;
    title: string;
    content: string;
    chapter_order: number;
    summary: string;
    created_at: string;
    updated_at: string;
    synced_at: string | null;
    deleted: number;
  }>>(
    'SELECT * FROM chapters WHERE id = $1 AND deleted = 0',
    [id]
  );

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  return {
    id: row.id,
    work_id: row.work_id,
    title: row.title,
    content: row.content,
    order: row.chapter_order,
    summary: row.summary || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
    synced_at: row.synced_at,
    deleted: row.deleted === 1,
  };
}

/**
 * 更新章节信息
 *
 * @param id 章节ID
 * @param updates 要更新的字段
 * @returns Promise<boolean> 是否更新成功
 */
export async function updateChapter(
  id: string,
  updates: Partial<Pick<Chapter, 'title' | 'content' | 'order' | 'summary'>>
): Promise<boolean> {
  const db = await getDatabase();

  const updateFields: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (updates.title !== undefined) {
    updateFields.push(`title = $${paramIndex++}`);
    params.push(updates.title);
  }

  if (updates.content !== undefined) {
    updateFields.push(`content = $${paramIndex++}`);
    params.push(updates.content);
  }

  if (updates.order !== undefined) {
    updateFields.push(`chapter_order = $${paramIndex++}`);
    params.push(updates.order);
  }

  if (updates.summary !== undefined) {
    updateFields.push(`summary = $${paramIndex++}`);
    params.push(updates.summary);
  }

  if (updateFields.length === 0) {
    return false;
  }

  // 更新updated_at和synced_at
  updateFields.push(`updated_at = $${paramIndex++}`);
  params.push(getCurrentTimestamp());

  updateFields.push(`synced_at = $${paramIndex++}`);
  params.push(null);

  params.push(id);

  const result = await db.execute(
    `UPDATE chapters SET ${updateFields.join(', ')} WHERE id = $${paramIndex} AND deleted = 0`,
    params
  );

  console.log('✅ 章节更新成功:', id);
  return result.rowsAffected > 0;
}

/**
 * 删除章节（软删除）
 *
 * @param id 章节ID
 * @returns Promise<boolean> 是否删除成功
 */
export async function deleteChapter(id: string): Promise<boolean> {
  const db = await getDatabase();

  const result = await db.execute(
    `UPDATE chapters
     SET deleted = 1,
         updated_at = $1,
         synced_at = NULL
     WHERE id = $2`,
    [getCurrentTimestamp(), id]
  );

  console.log('🗑️ 章节已删除:', id);
  return result.rowsAffected > 0;
}

/**
 * 重新排序章节
 * 接收新的章节ID顺序数组，更新所有章节的order字段
 *
 * @param workId 作品ID
 * @param chapterIds 新的章节ID顺序数组
 * @returns Promise<boolean> 是否更新成功
 */
export async function reorderChapters(
  workId: string,
  chapterIds: string[]
): Promise<boolean> {
  try {
    // 使用事务批量更新章节顺序
    await transaction(async (db: any) => {
      const timestamp = getCurrentTimestamp();
      for (let i = 0; i < chapterIds.length; i++) {
        await db.execute(
          `UPDATE chapters
           SET chapter_order = ?,
               updated_at = ?,
               synced_at = NULL
           WHERE id = ? AND work_id = ?`,
          [i + 1, timestamp, chapterIds[i], workId]
        );
      }
    });

    console.log('✅ 章节重新排序成功');
    return true;
  } catch (error) {
    console.error('❌ 章节排序失败:', error);
    return false;
  }
}

/**
 * 获取章节字数统计
 *
 * @param id 章节ID
 * @returns Promise<number> 字数（纯文本，不包含HTML标签）
 */
export async function getChapterWordCount(id: string): Promise<number> {
  const chapter = await getChapterById(id);
  if (!chapter) {
    return 0;
  }

  // 移除HTML标签，计算纯文本字数
  const text = chapter.content.replace(/<[^>]*>/g, '');
  // 中文字符按1个字符计算，英文单词按空格分割计算
  const chineseChars = text.match(/[\u4e00-\u9fa5]/g) || [];
  const englishWords = text.match(/[a-zA-Z]+/g) || [];

  return chineseChars.length + englishWords.length;
}

/**
 * 获取作品的总字数
 *
 * @param workId 作品ID
 * @returns Promise<number> 总字数
 */
export async function getWorkTotalWordCount(workId: string): Promise<number> {
  const chapters = await getChaptersByWorkId(workId);

  let totalWords = 0;
  for (const chapter of chapters) {
    const text = chapter.content.replace(/<[^>]*>/g, '');
    const chineseChars = text.match(/[\u4e00-\u9fa5]/g) || [];
    const englishWords = text.match(/[a-zA-Z]+/g) || [];
    totalWords += chineseChars.length + englishWords.length;
  }

  return totalWords;
}

// ============================================================================
// 章节版本快照
// ============================================================================

/** 章节版本快照 */
export interface ChapterVersion {
  id: string;
  chapter_id: string;
  work_id: string;
  title: string;
  content: string;
  word_count: number;
  label: string;
  created_at: string;
}

/** 每章保留的版本上限（超出自动清理最旧的） */
const MAX_VERSIONS_PER_CHAPTER = 20;

/**
 * 保存章节版本快照
 *
 * 用于手动"保存版本"以及 AI 改写、版本恢复等关键操作前的安全快照
 *
 * @param chapterId 章节 ID
 * @param label 版本说明（如"AI 续写前"、"手动备份"）
 * @param contentOverride 可选，显式指定内容（默认读取当前章节内容）
 */
export async function saveChapterVersion(
  chapterId: string,
  label: string = '',
  contentOverride?: string
): Promise<ChapterVersion> {
  const db = await getDatabase();

  const chapter = await getChapterById(chapterId);
  if (!chapter) {
    throw new Error('章节不存在');
  }

  const content = contentOverride ?? chapter.content;
  const text = content.replace(/<[^>]*>/g, '');
  const wordCount =
    (text.match(/[\u4e00-\u9fa5]/g) || []).length + (text.match(/[a-zA-Z]+/g) || []).length;

  const version: ChapterVersion = {
    id: generateUUID(),
    chapter_id: chapterId,
    work_id: chapter.work_id,
    title: chapter.title,
    content,
    word_count: wordCount,
    label,
    created_at: getCurrentTimestamp(),
  };

  await db.execute(
    `INSERT INTO chapter_versions (id, chapter_id, work_id, title, content, word_count, label, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      version.id,
      version.chapter_id,
      version.work_id,
      version.title,
      version.content,
      version.word_count,
      version.label,
      version.created_at,
    ]
  );

  await pruneChapterVersions(chapterId);
  return version;
}

/**
 * 列出章节的版本快照（按时间倒序，不含内容正文以减小传输）
 */
export async function listChapterVersions(
  chapterId: string
): Promise<Omit<ChapterVersion, 'content'>[]> {
  const db = await getDatabase();
  return await db.select<Omit<ChapterVersion, 'content'>[]>(
    `SELECT id, chapter_id, work_id, title, word_count, label, created_at
     FROM chapter_versions WHERE chapter_id = $1
     ORDER BY created_at DESC`,
    [chapterId]
  );
}

/**
 * 读取某个版本的完整内容
 */
export async function getChapterVersionContent(versionId: string): Promise<ChapterVersion | null> {
  const db = await getDatabase();
  const rows = await db.select<ChapterVersion[]>(
    'SELECT * FROM chapter_versions WHERE id = $1',
    [versionId]
  );
  return rows[0] || null;
}

/**
 * 恢复章节到指定版本
 *
 * 恢复前会先将当前内容保存为快照（label="恢复前"），防止误操作无法回退
 */
export async function restoreChapterVersion(versionId: string): Promise<Chapter> {
  const db = await getDatabase();
  const version = await getChapterVersionContent(versionId);
  if (!version) {
    throw new Error('版本不存在');
  }

  // 恢复前保存当前状态
  await saveChapterVersion(version.chapter_id, '恢复前');

  await db.execute(
    `UPDATE chapters SET content = $1, updated_at = $2 WHERE id = $3`,
    [version.content, getCurrentTimestamp(), version.chapter_id]
  );

  const chapter = await getChapterById(version.chapter_id);
  if (!chapter) {
    throw new Error('章节不存在');
  }
  return chapter;
}

/**
 * 删除版本快照
 */
export async function deleteChapterVersion(versionId: string): Promise<void> {
  const db = await getDatabase();
  await db.execute('DELETE FROM chapter_versions WHERE id = $1', [versionId]);
}

/**
 * 清理超出数量上限的旧版本
 */
async function pruneChapterVersions(chapterId: string): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `DELETE FROM chapter_versions WHERE chapter_id = $1 AND id NOT IN (
       SELECT id FROM chapter_versions WHERE chapter_id = $1
       ORDER BY created_at DESC LIMIT $2
     )`,
    [chapterId, MAX_VERSIONS_PER_CHAPTER]
  );
}

// ============================================================================
// 回收站（软删除章节的恢复与彻底删除）
// ============================================================================

/**
 * 列出作品的已删除章节（回收站视图用）
 */
export async function getDeletedChaptersByWorkId(workId: string): Promise<Chapter[]> {
  const db = await getDatabase();
  return await db.select<Chapter[]>(
    `SELECT * FROM chapters WHERE work_id = $1 AND deleted = 1 ORDER BY updated_at DESC`,
    [workId]
  );
}

/**
 * 列出全部已删除章节（跨作品，回收站视图用）
 */
export async function getAllDeletedChapters(): Promise<Chapter[]> {
  const db = await getDatabase();
  return await db.select<Chapter[]>(
    `SELECT * FROM chapters WHERE deleted = 1 ORDER BY updated_at DESC`
  );
}

/**
 * 恢复已删除的章节
 */
export async function restoreChapter(id: string): Promise<boolean> {
  const db = await getDatabase();
  await db.execute(
    `UPDATE chapters SET deleted = 0, updated_at = $1 WHERE id = $2`,
    [getCurrentTimestamp(), id]
  );
  console.log('♻️ 章节已恢复:', id);
  return true;
}

/**
 * 彻底删除章节（物理删除，含其版本快照）
 */
export async function permanentlyDeleteChapter(id: string): Promise<boolean> {
  const db = await getDatabase();
  await db.execute('DELETE FROM chapter_versions WHERE chapter_id = $1', [id]);
  await db.execute('DELETE FROM chapters WHERE id = $1', [id]);
  console.log('🔥 章节已彻底删除:', id);
  return true;
}
