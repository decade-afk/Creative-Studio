/**
 * Scene Service - 场景数据服务
 * 提供场景的 CRUD 操作
 */

import type { Scene } from '../types/storage';
import { getDatabase, generateUUID, getCurrentTimestamp } from './database';

/**
 * 获取指定作品的所有场景
 */
export async function getScenesByWorkId(workId: string): Promise<Scene[]> {
  const db = await getDatabase();

  const scenes = await db.select<Scene[]>(
    `SELECT * FROM scenes
     WHERE work_id = ? AND deleted = 0
     ORDER BY created_at DESC`,
    [workId]
  );

  return scenes;
}

/**
 * 根据 ID 获取场景
 */
export async function getSceneById(id: string): Promise<Scene | null> {
  const db = await getDatabase();

  const scenes = await db.select<Scene[]>(
    'SELECT * FROM scenes WHERE id = ? AND deleted = 0',
    [id]
  );

  return scenes.length > 0 ? scenes[0] : null;
}

/**
 * 创建新场景
 */
export async function createScene(
  data: Omit<Scene, 'id' | 'created_at' | 'updated_at' | 'synced_at' | 'deleted'>
): Promise<Scene> {
  const db = await getDatabase();

  const now = new Date().toISOString();
  const scene: Scene = {
    ...data,
    id: generateUUID(),
    created_at: now,
    updated_at: now,
    synced_at: null,
    deleted: false,
  };

  await db.execute(
    `INSERT INTO scenes
     (id, work_id, name, description, location, time_of_day, mood, created_at, updated_at, synced_at, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      scene.id,
      scene.work_id,
      scene.name,
      scene.description,
      scene.location,
      scene.time_of_day,
      scene.mood || null,
      scene.created_at,
      scene.updated_at,
      scene.synced_at,
      scene.deleted ? 1 : 0,
    ]
  );

  console.log('✅ 场景创建成功:', scene.name);
  return scene;
}

/**
 * 更新场景
 */
export async function updateScene(
  id: string,
  updates: Partial<Omit<Scene, 'id' | 'work_id' | 'created_at' | 'updated_at' | 'synced_at' | 'deleted'>>
): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  const fields: string[] = [];
  const values: any[] = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }
  if (updates.location !== undefined) {
    fields.push('location = ?');
    values.push(updates.location);
  }
  if (updates.time_of_day !== undefined) {
    fields.push('time_of_day = ?');
    values.push(updates.time_of_day);
  }
  if (updates.mood !== undefined) {
    fields.push('mood = ?');
    values.push(updates.mood);
  }

  if (fields.length === 0) return;

  fields.push('updated_at = ?');
  values.push(now);

  fields.push('synced_at = ?');
  values.push(null);

  values.push(id);

  await db.execute(
    `UPDATE scenes SET ${fields.join(', ')} WHERE id = ?`,
    values
  );

  console.log('✅ 场景更新成功:', id);
}

/**
 * 删除场景（软删除）
 */
export async function deleteScene(id: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  await db.execute(
    'UPDATE scenes SET deleted = 1, updated_at = ?, synced_at = ? WHERE id = ?',
    [now, null, id]
  );

  console.log('✅ 场景删除成功:', id);
}

/**
 * 根据时间段筛选场景
 */
export async function getScenesByTimeOfDay(
  workId: string,
  timeOfDay: 'morning' | 'noon' | 'evening' | 'night' | 'other'
): Promise<Scene[]> {
  const db = await getDatabase();

  const scenes = await db.select<Scene[]>(
    `SELECT * FROM scenes
     WHERE work_id = ? AND time_of_day = ? AND deleted = 0
     ORDER BY created_at DESC`,
    [workId, timeOfDay]
  );

  return scenes;
}

/**
 * 根据地点筛选场景
 */
export async function getScenesByLocation(workId: string, location: string): Promise<Scene[]> {
  const db = await getDatabase();

  const scenes = await db.select<Scene[]>(
    `SELECT * FROM scenes
     WHERE work_id = ? AND location LIKE ? AND deleted = 0
     ORDER BY created_at DESC`,
    [workId, `%${location}%`]
  );

  return scenes;
}
