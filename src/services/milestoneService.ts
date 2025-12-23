/**
 * Milestone Service - 里程碑数据服务
 * 提供里程碑的 CRUD 操作
 */

import type { Milestone } from '../types/storage';
import { getDatabase, generateUUID } from './database';

/**
 * 获取指定作品的所有里程碑
 */
export async function getMilestonesByWorkId(workId: string): Promise<Milestone[]> {
  const db = await getDatabase();

  const milestones = await db.select<Milestone[]>(
    `SELECT * FROM milestones
     WHERE work_id = ? AND deleted = 0
     ORDER BY due_date ASC NULLS LAST, created_at DESC`,
    [workId]
  );

  return milestones;
}

/**
 * 根据 ID 获取里程碑
 */
export async function getMilestoneById(id: string): Promise<Milestone | null> {
  const db = await getDatabase();

  const milestones = await db.select<Milestone[]>(
    'SELECT * FROM milestones WHERE id = ? AND deleted = 0',
    [id]
  );

  return milestones.length > 0 ? milestones[0] : null;
}

/**
 * 创建新里程碑
 */
export async function createMilestone(
  data: Omit<Milestone, 'id' | 'created_at' | 'updated_at' | 'synced_at' | 'deleted'>
): Promise<Milestone> {
  const db = await getDatabase();

  const now = new Date().toISOString();
  const milestone: Milestone = {
    ...data,
    id: generateUUID(),
    created_at: now,
    updated_at: now,
    synced_at: null,
    deleted: false,
  };

  await db.execute(
    `INSERT INTO milestones
     (id, work_id, title, description, due_date, status, created_at, updated_at, synced_at, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      milestone.id,
      milestone.work_id,
      milestone.title,
      milestone.description,
      milestone.due_date,
      milestone.status,
      milestone.created_at,
      milestone.updated_at,
      milestone.synced_at,
      milestone.deleted ? 1 : 0,
    ]
  );

  console.log('✅ 里程碑创建成功:', milestone.title);
  return milestone;
}

/**
 * 更新里程碑
 */
export async function updateMilestone(
  id: string,
  updates: Partial<Omit<Milestone, 'id' | 'work_id' | 'created_at' | 'updated_at' | 'synced_at' | 'deleted'>>
): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  const fields: string[] = [];
  const values: any[] = [];

  if (updates.title !== undefined) {
    fields.push('title = ?');
    values.push(updates.title);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }
  if (updates.due_date !== undefined) {
    fields.push('due_date = ?');
    values.push(updates.due_date);
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
    `UPDATE milestones SET ${fields.join(', ')} WHERE id = ?`,
    values
  );

  console.log('✅ 里程碑更新成功:', id);
}

/**
 * 删除里程碑（软删除）
 */
export async function deleteMilestone(id: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  await db.execute(
    'UPDATE milestones SET deleted = 1, updated_at = ?, synced_at = ? WHERE id = ?',
    [now, null, id]
  );

  console.log('✅ 里程碑删除成功:', id);
}

/**
 * 根据状态筛选里程碑
 */
export async function getMilestonesByStatus(
  workId: string,
  status: 'pending' | 'in_progress' | 'completed'
): Promise<Milestone[]> {
  const db = await getDatabase();

  const milestones = await db.select<Milestone[]>(
    `SELECT * FROM milestones
     WHERE work_id = ? AND status = ? AND deleted = 0
     ORDER BY due_date ASC NULLS LAST`,
    [workId, status]
  );

  return milestones;
}

/**
 * 获取即将到期的里程碑
 */
export async function getUpcomingMilestones(workId: string, days: number = 7): Promise<Milestone[]> {
  const db = await getDatabase();
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);
  const futureDateStr = futureDate.toISOString();

  const milestones = await db.select<Milestone[]>(
    `SELECT * FROM milestones
     WHERE work_id = ?
       AND due_date IS NOT NULL
       AND due_date <= ?
       AND status != 'completed'
       AND deleted = 0
     ORDER BY due_date ASC`,
    [workId, futureDateStr]
  );

  return milestones;
}
