/**
 * 作品服务模块
 *
 * 提供作品的CRUD操作：
 * - 创建新作品
 * - 读取作品列表
 * - 更新作品信息
 * - 删除作品（软删除）
 *
 * 设计特点：
 * - 所有操作返回Promise，支持async/await
 * - 使用软删除，不会物理删除数据
 * - 自动更新updated_at时间戳
 * - 为云同步预留synced_at字段
 */

import { getDatabase, generateUUID, getCurrentTimestamp } from './database';
import type { Work, WorkType } from '../types/storage';

/**
 * 创建新作品
 *
 * @param title 作品标题
 * @param type 作品类型（script/novel）
 * @param icon 图标emoji（可选，默认根据类型选择）
 * @param description 作品描述（可选）
 * @returns Promise<Work> 创建的作品对象
 */
export async function createWork(
  title: string,
  type: WorkType,
  icon?: string,
  description?: string
): Promise<Work> {
  const db = await getDatabase();

  // 生成新作品对象
  const work: Work = {
    id: generateUUID(),
    title,
    type,
    icon: icon || (type === 'script' ? '🎬' : '📚'),
    description,
    created_at: getCurrentTimestamp(),
    updated_at: getCurrentTimestamp(),
    synced_at: null,  // 新创建的作品未同步
    deleted: false,
  };

  // 插入数据库
  await db.execute(
    `INSERT INTO works (id, title, type, icon, description, created_at, updated_at, synced_at, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      work.id,
      work.title,
      work.type,
      work.icon,
      work.description || null,
      work.created_at,
      work.updated_at,
      work.synced_at,
      work.deleted ? 1 : 0,
    ]
  );

  console.log('✅ 作品创建成功:', work.title);
  return work;
}

/**
 * 获取所有作品列表
 * 不包括已删除的作品
 *
 * @param type 可选：按类型筛选（script/novel）
 * @returns Promise<Work[]> 作品列表
 */
export async function getWorks(type?: WorkType): Promise<Work[]> {
  const db = await getDatabase();

  // 构建SQL查询
  let sql = 'SELECT * FROM works WHERE deleted = 0';
  const params: any[] = [];

  // 如果指定了类型，添加筛选条件
  if (type) {
    sql += ' AND type = ?';
    params.push(type);
  }

  // 按创建时间倒序排列
  sql += ' ORDER BY created_at DESC';

  // 执行查询
  const rows = await db.select<Array<{
    id: string;
    title: string;
    type: string;
    icon: string;
    description: string | null;
    created_at: string;
    updated_at: string;
    synced_at: string | null;
    deleted: number;
  }>>(sql, params);

  // 转换数据库行为Work对象
  const works: Work[] = rows.map((row: any) => ({
    id: row.id,
    title: row.title,
    type: row.type as WorkType,
    icon: row.icon,
    description: row.description || undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
    synced_at: row.synced_at,
    deleted: row.deleted === 1,
  }));

  console.log(`📚 获取到 ${works.length} 个作品`);
  return works;
}

/**
 * 根据ID获取单个作品
 *
 * @param id 作品ID
 * @returns Promise<Work | null> 作品对象，不存在则返回null
 */
export async function getWorkById(id: string): Promise<Work | null> {
  const db = await getDatabase();

  const rows = await db.select<Array<{
    id: string;
    title: string;
    type: string;
    icon: string;
    description: string | null;
    created_at: string;
    updated_at: string;
    synced_at: string | null;
    deleted: number;
  }>>(
    'SELECT * FROM works WHERE id = ? AND deleted = 0',
    [id]
  );

  // 如果没有找到
  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  return {
    id: row.id,
    title: row.title,
    type: row.type as WorkType,
    icon: row.icon,
    description: row.description || undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
    synced_at: row.synced_at,
    deleted: row.deleted === 1,
  };
}

/**
 * 更新作品信息
 *
 * @param id 作品ID
 * @param updates 要更新的字段
 * @returns Promise<boolean> 是否更新成功
 */
export async function updateWork(
  id: string,
  updates: Partial<Pick<Work, 'title' | 'icon' | 'description'>>
): Promise<boolean> {
  const db = await getDatabase();

  // 构建更新语句
  const updateFields: string[] = [];
  const params: any[] = [];

  if (updates.title !== undefined) {
    updateFields.push(`title = ?`);
    params.push(updates.title);
  }

  if (updates.icon !== undefined) {
    updateFields.push(`icon = ?`);
    params.push(updates.icon);
  }

  if (updates.description !== undefined) {
    updateFields.push(`description = ?`);
    params.push(updates.description);
  }

  // 如果没有要更新的字段
  if (updateFields.length === 0) {
    return false;
  }

  // 始终更新updated_at，并清空synced_at（表示需要重新同步）
  updateFields.push(`updated_at = ?`);
  params.push(getCurrentTimestamp());

  updateFields.push(`synced_at = ?`);
  params.push(null);

  // 添加WHERE条件的参数
  params.push(id);

  // 执行更新
  const result = await db.execute(
    `UPDATE works SET ${updateFields.join(', ')} WHERE id = ? AND deleted = 0`,
    params
  );

  console.log('✅ 作品更新成功:', id);
  return result.rowsAffected > 0;
}

/**
 * 删除作品（软删除）
 * 只标记为已删除，不物理删除数据
 *
 * @param id 作品ID
 * @returns Promise<boolean> 是否删除成功
 */
export async function deleteWork(id: string): Promise<boolean> {
  const db = await getDatabase();

  // 软删除：设置deleted=1
  const result = await db.execute(
    `UPDATE works
     SET deleted = 1,
         updated_at = $1,
         synced_at = NULL
     WHERE id = $2`,
    [getCurrentTimestamp(), id]
  );

  console.log('🗑️ 作品已删除:', id);
  return result.rowsAffected > 0;
}

/**
 * 永久删除作品（物理删除）
 * ⚠️ 警告：此操作不可恢复！
 * 会级联删除所有章节和角色
 *
 * @param id 作品ID
 * @returns Promise<boolean> 是否删除成功
 */
export async function permanentlyDeleteWork(id: string): Promise<boolean> {
  const db = await getDatabase();

  // 物理删除（由于外键约束，会自动删除关联的章节和角色）
  const result = await db.execute(
    'DELETE FROM works WHERE id = ?',
    [id]
  );

  console.log('⚠️ 作品已永久删除:', id);
  return result.rowsAffected > 0;
}

/**
 * 恢复已删除的作品
 *
 * @param id 作品ID
 * @returns Promise<boolean> 是否恢复成功
 */
export async function restoreWork(id: string): Promise<boolean> {
  const db = await getDatabase();

  const result = await db.execute(
    `UPDATE works
     SET deleted = 0,
         updated_at = $1,
         synced_at = NULL
     WHERE id = $2`,
    [getCurrentTimestamp(), id]
  );

  console.log('♻️ 作品已恢复:', id);
  return result.rowsAffected > 0;
}

/**
 * 获取作品统计信息
 *
 * @returns Promise<{ total: number; scripts: number; novels: number }>
 */
export async function getWorkStats(): Promise<{
  total: number;
  scripts: number;
  novels: number;
}> {
  const db = await getDatabase();

  const rows = await db.select<Array<{
    type: string;
    count: number;
  }>>(
    `SELECT type, COUNT(*) as count
     FROM works
     WHERE deleted = 0
     GROUP BY type`
  );

  let scripts = 0;
  let novels = 0;

  rows.forEach((row: any) => {
    if (row.type === 'script') {
      scripts = row.count;
    } else if (row.type === 'novel') {
      novels = row.count;
    }
  });

  return {
    total: scripts + novels,
    scripts,
    novels,
  };
}

// ============================================================================
// 回收站（软删除作品的列出与清理；恢复/彻底删除见上方已有实现）
// ============================================================================

/**
 * 列出全部已删除作品（回收站视图用）
 */
export async function getDeletedWorks(): Promise<Work[]> {
  const db = await getDatabase();
  return await db.select<Work[]>(
    `SELECT * FROM works WHERE deleted = 1 ORDER BY updated_at DESC`
  );
}
