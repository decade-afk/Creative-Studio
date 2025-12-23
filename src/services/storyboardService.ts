/**
 * Storyboard Service - 分镜数据服务
 * 提供分镜的 CRUD 操作
 */

import type { Storyboard } from '../types/storage';
import { getDatabase, generateUUID } from './database';

/**
 * 获取指定作品的所有分镜
 */
export async function getStoryboardsByWorkId(workId: string): Promise<Storyboard[]> {
  const db = await getDatabase();

  const storyboards = await db.select<Storyboard[]>(
    `SELECT * FROM storyboards
     WHERE work_id = ? AND deleted = 0
     ORDER BY "order" ASC`,
    [workId]
  );

  return storyboards;
}

/**
 * 根据 ID 获取分镜
 */
export async function getStoryboardById(id: string): Promise<Storyboard | null> {
  const db = await getDatabase();

  const storyboards = await db.select<Storyboard[]>(
    'SELECT * FROM storyboards WHERE id = ? AND deleted = 0',
    [id]
  );

  return storyboards.length > 0 ? storyboards[0] : null;
}

/**
 * 创建新分镜
 */
export async function createStoryboard(
  data: Omit<Storyboard, 'id' | 'created_at' | 'updated_at' | 'synced_at' | 'deleted'>
): Promise<Storyboard> {
  const db = await getDatabase();

  const now = new Date().toISOString();
  const storyboard: Storyboard = {
    ...data,
    id: generateUUID(),
    created_at: now,
    updated_at: now,
    synced_at: null,
    deleted: false,
  };

  await db.execute(
    `INSERT INTO storyboards
     (id, work_id, chapter_id, scene_id, title, description, shot_type, camera_movement, duration, "order", thumbnail_url, created_at, updated_at, synced_at, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      storyboard.id,
      storyboard.work_id,
      storyboard.chapter_id,
      storyboard.scene_id,
      storyboard.title,
      storyboard.description,
      storyboard.shot_type,
      storyboard.camera_movement,
      storyboard.duration,
      storyboard.order,
      storyboard.thumbnail_url || null,
      storyboard.created_at,
      storyboard.updated_at,
      storyboard.synced_at,
      storyboard.deleted ? 1 : 0,
    ]
  );

  console.log('✅ 分镜创建成功:', storyboard.title);
  return storyboard;
}

/**
 * 更新分镜
 */
export async function updateStoryboard(
  id: string,
  updates: Partial<Omit<Storyboard, 'id' | 'work_id' | 'created_at' | 'updated_at' | 'synced_at' | 'deleted'>>
): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  const fields: string[] = [];
  const values: any[] = [];

  if (updates.chapter_id !== undefined) {
    fields.push('chapter_id = ?');
    values.push(updates.chapter_id);
  }
  if (updates.scene_id !== undefined) {
    fields.push('scene_id = ?');
    values.push(updates.scene_id);
  }
  if (updates.title !== undefined) {
    fields.push('title = ?');
    values.push(updates.title);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }
  if (updates.shot_type !== undefined) {
    fields.push('shot_type = ?');
    values.push(updates.shot_type);
  }
  if (updates.camera_movement !== undefined) {
    fields.push('camera_movement = ?');
    values.push(updates.camera_movement);
  }
  if (updates.duration !== undefined) {
    fields.push('duration = ?');
    values.push(updates.duration);
  }
  if (updates.order !== undefined) {
    fields.push('"order" = ?');
    values.push(updates.order);
  }
  if (updates.thumbnail_url !== undefined) {
    fields.push('thumbnail_url = ?');
    values.push(updates.thumbnail_url);
  }

  if (fields.length === 0) return;

  fields.push('updated_at = ?');
  values.push(now);

  fields.push('synced_at = ?');
  values.push(null);

  values.push(id);

  await db.execute(
    `UPDATE storyboards SET ${fields.join(', ')} WHERE id = ?`,
    values
  );

  console.log('✅ 分镜更新成功:', id);
}

/**
 * 删除分镜（软删除）
 */
export async function deleteStoryboard(id: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  await db.execute(
    'UPDATE storyboards SET deleted = 1, updated_at = ?, synced_at = ? WHERE id = ?',
    [now, null, id]
  );

  console.log('✅ 分镜删除成功:', id);
}

/**
 * 根据章节获取分镜
 */
export async function getStoryboardsByChapterId(
  workId: string,
  chapterId: string
): Promise<Storyboard[]> {
  const db = await getDatabase();

  const storyboards = await db.select<Storyboard[]>(
    `SELECT * FROM storyboards
     WHERE work_id = ? AND chapter_id = ? AND deleted = 0
     ORDER BY "order" ASC`,
    [workId, chapterId]
  );

  return storyboards;
}

/**
 * 根据场景获取分镜
 */
export async function getStoryboardsBySceneId(
  workId: string,
  sceneId: string
): Promise<Storyboard[]> {
  const db = await getDatabase();

  const storyboards = await db.select<Storyboard[]>(
    `SELECT * FROM storyboards
     WHERE work_id = ? AND scene_id = ? AND deleted = 0
     ORDER BY "order" ASC`,
    [workId, sceneId]
  );

  return storyboards;
}

/**
 * 获取总时长
 */
export async function getTotalDuration(workId: string): Promise<number> {
  const db = await getDatabase();

  const result = await db.select<Array<{ total: number }>>(
    `SELECT SUM(duration) as total FROM storyboards
     WHERE work_id = ? AND deleted = 0`,
    [workId]
  );

  return result.length > 0 && result[0].total ? result[0].total : 0;
}
