/**
 * Conflict Service - 冲突点数据服务
 * 提供冲突点的 CRUD 操作
 */

import type { Conflict } from '../types/storage';
import { getDatabase, generateUUID } from './database';

/**
 * 获取指定作品的所有冲突点
 */
export async function getConflictsByWorkId(workId: string): Promise<Conflict[]> {
  const db = await getDatabase();

  const conflicts = await db.select<Conflict[]>(
    `SELECT * FROM conflicts
     WHERE work_id = ? AND deleted = 0
     ORDER BY intensity DESC, created_at DESC`,
    [workId]
  );

  return conflicts;
}

/**
 * 根据 ID 获取冲突点
 */
export async function getConflictById(id: string): Promise<Conflict | null> {
  const db = await getDatabase();

  const conflicts = await db.select<Conflict[]>(
    'SELECT * FROM conflicts WHERE id = ? AND deleted = 0',
    [id]
  );

  return conflicts.length > 0 ? conflicts[0] : null;
}

/**
 * 创建新冲突点
 */
export async function createConflict(
  data: Omit<Conflict, 'id' | 'created_at' | 'updated_at' | 'synced_at' | 'deleted'>
): Promise<Conflict> {
  const db = await getDatabase();

  const now = new Date().toISOString();
  const conflict: Conflict = {
    ...data,
    id: generateUUID(),
    created_at: now,
    updated_at: now,
    synced_at: null,
    deleted: false,
  };

  await db.execute(
    `INSERT INTO conflicts
     (id, work_id, name, type, intensity, characters, scene_id, description, resolution, status, created_at, updated_at, synced_at, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      conflict.id,
      conflict.work_id,
      conflict.name,
      conflict.type,
      conflict.intensity,
      conflict.characters,
      conflict.scene_id,
      conflict.description,
      conflict.resolution,
      conflict.status,
      conflict.created_at,
      conflict.updated_at,
      conflict.synced_at,
      conflict.deleted ? 1 : 0,
    ]
  );

  console.log('✅ 冲突点创建成功:', conflict.name);
  return conflict;
}

/**
 * 更新冲突点
 */
export async function updateConflict(
  id: string,
  updates: Partial<Omit<Conflict, 'id' | 'work_id' | 'created_at' | 'updated_at' | 'synced_at' | 'deleted'>>
): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  const fields: string[] = [];
  const values: any[] = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.type !== undefined) {
    fields.push('type = ?');
    values.push(updates.type);
  }
  if (updates.intensity !== undefined) {
    fields.push('intensity = ?');
    values.push(updates.intensity);
  }
  if (updates.characters !== undefined) {
    fields.push('characters = ?');
    values.push(updates.characters);
  }
  if (updates.scene_id !== undefined) {
    fields.push('scene_id = ?');
    values.push(updates.scene_id);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }
  if (updates.resolution !== undefined) {
    fields.push('resolution = ?');
    values.push(updates.resolution);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }

  if (fields.length === 0) return;

  fields.push('updated_at = ?');
  values.push(now);

  fields.push('synced_at = ?');
  values.push(null);

  values.push(id);

  await db.execute(
    `UPDATE conflicts SET ${fields.join(', ')} WHERE id = ?`,
    values
  );

  console.log('✅ 冲突点更新成功:', id);
}

/**
 * 删除冲突点（软删除）
 */
export async function deleteConflict(id: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  await db.execute(
    'UPDATE conflicts SET deleted = 1, updated_at = ?, synced_at = ? WHERE id = ?',
    [now, null, id]
  );

  console.log('✅ 冲突点删除成功:', id);
}

/**
 * 根据类型筛选冲突点
 */
export async function getConflictsByType(
  workId: string,
  type: 'character' | 'environment' | 'internal' | 'social'
): Promise<Conflict[]> {
  const db = await getDatabase();

  const conflicts = await db.select<Conflict[]>(
    `SELECT * FROM conflicts
     WHERE work_id = ? AND type = ? AND deleted = 0
     ORDER BY intensity DESC, created_at DESC`,
    [workId, type]
  );

  return conflicts;
}

/**
 * 根据强度筛选冲突点
 */
export async function getConflictsByIntensity(
  workId: string,
  intensity: 'low' | 'medium' | 'high' | 'critical'
): Promise<Conflict[]> {
  const db = await getDatabase();

  const conflicts = await db.select<Conflict[]>(
    `SELECT * FROM conflicts
     WHERE work_id = ? AND intensity = ? AND deleted = 0
     ORDER BY created_at DESC`,
    [workId, intensity]
  );

  return conflicts;
}

/**
 * 根据状态筛选冲突点
 */
export async function getConflictsByStatus(
  workId: string,
  status: 'active' | 'escalating' | 'resolving' | 'resolved'
): Promise<Conflict[]> {
  const db = await getDatabase();

  const conflicts = await db.select<Conflict[]>(
    `SELECT * FROM conflicts
     WHERE work_id = ? AND status = ? AND deleted = 0
     ORDER BY intensity DESC, created_at DESC`,
    [workId, status]
  );

  return conflicts;
}

/**
 * 获取关键冲突点（高强度和关键强度）
 */
export async function getCriticalConflicts(workId: string): Promise<Conflict[]> {
  const db = await getDatabase();

  const conflicts = await db.select<Conflict[]>(
    `SELECT * FROM conflicts
     WHERE work_id = ?
       AND intensity IN ('high', 'critical')
       AND status IN ('active', 'escalating')
       AND deleted = 0
     ORDER BY intensity DESC, created_at DESC`,
    [workId]
  );

  return conflicts;
}
