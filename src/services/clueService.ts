/**
 * Clue Service - 伏笔线索数据服务
 * 提供伏笔线索的 CRUD 操作
 */

import type { Clue } from '../types/storage';
import { getDatabase, generateUUID, getCurrentTimestamp } from './database';

/**
 * 获取指定作品的所有伏笔
 */
export async function getCluesByWorkId(workId: string): Promise<Clue[]> {
  const db = await getDatabase();

  const clues = await db.select<Clue[]>(
    `SELECT * FROM clues
     WHERE work_id = ? AND deleted = 0
     ORDER BY created_at DESC`,
    [workId]
  );

  return clues;
}

/**
 * 根据 ID 获取伏笔
 */
export async function getClueById(id: string): Promise<Clue | null> {
  const db = await getDatabase();

  const clues = await db.select<Clue[]>(
    'SELECT * FROM clues WHERE id = ? AND deleted = 0',
    [id]
  );

  return clues.length > 0 ? clues[0] : null;
}

/**
 * 创建新伏笔
 */
export async function createClue(
  data: Omit<Clue, 'id' | 'created_at' | 'updated_at' | 'synced_at' | 'deleted'>
): Promise<Clue> {
  const db = await getDatabase();

  const now = new Date().toISOString();
  const clue: Clue = {
    ...data,
    id: generateUUID(),
    created_at: now,
    updated_at: now,
    synced_at: null,
    deleted: false,
  };

  await db.execute(
    `INSERT INTO clues
     (id, work_id, name, source, status, setup_scene_id, payoff_scene_id, description, created_at, updated_at, synced_at, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      clue.id,
      clue.work_id,
      clue.name,
      clue.source,
      clue.status,
      clue.setup_scene_id,
      clue.payoff_scene_id,
      clue.description,
      clue.created_at,
      clue.updated_at,
      clue.synced_at,
      clue.deleted ? 1 : 0,
    ]
  );

  console.log('✅ 伏笔创建成功:', clue.name);
  return clue;
}

/**
 * 更新伏笔
 */
export async function updateClue(
  id: string,
  updates: Partial<Omit<Clue, 'id' | 'work_id' | 'created_at' | 'updated_at' | 'synced_at' | 'deleted'>>
): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  const fields: string[] = [];
  const values: any[] = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.source !== undefined) {
    fields.push('source = ?');
    values.push(updates.source);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }
  if (updates.setup_scene_id !== undefined) {
    fields.push('setup_scene_id = ?');
    values.push(updates.setup_scene_id);
  }
  if (updates.payoff_scene_id !== undefined) {
    fields.push('payoff_scene_id = ?');
    values.push(updates.payoff_scene_id);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }

  if (fields.length === 0) return;

  fields.push('updated_at = ?');
  values.push(now);

  fields.push('synced_at = ?');
  values.push(null);

  values.push(id);

  await db.execute(
    `UPDATE clues SET ${fields.join(', ')} WHERE id = ?`,
    values
  );

  console.log('✅ 伏笔更新成功:', id);
}

/**
 * 删除伏笔（软删除）
 */
export async function deleteClue(id: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  await db.execute(
    'UPDATE clues SET deleted = 1, updated_at = ?, synced_at = ? WHERE id = ?',
    [now, null, id]
  );

  console.log('✅ 伏笔删除成功:', id);
}

/**
 * 根据状态筛选伏笔
 */
export async function getCluesByStatus(
  workId: string,
  status: 'open' | 'resolved'
): Promise<Clue[]> {
  const db = await getDatabase();

  const clues = await db.select<Clue[]>(
    `SELECT * FROM clues
     WHERE work_id = ? AND status = ? AND deleted = 0
     ORDER BY created_at DESC`,
    [workId, status]
  );

  return clues;
}

/**
 * 根据来源筛选伏笔
 */
export async function getCluesBySource(
  workId: string,
  source: 'ai_detected' | 'manual'
): Promise<Clue[]> {
  const db = await getDatabase();

  const clues = await db.select<Clue[]>(
    `SELECT * FROM clues
     WHERE work_id = ? AND source = ? AND deleted = 0
     ORDER BY created_at DESC`,
    [workId, source]
  );

  return clues;
}

/**
 * 获取未回收的伏笔
 */
export async function getUnresolvedClues(workId: string): Promise<Clue[]> {
  const db = await getDatabase();

  const clues = await db.select<Clue[]>(
    `SELECT * FROM clues
     WHERE work_id = ?
       AND status = 'open'
       AND deleted = 0
     ORDER BY created_at DESC`,
    [workId]
  );

  return clues;
}
