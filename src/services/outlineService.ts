/**
 * Outline Service - 大纲节点数据服务
 * 提供大纲节点的 CRUD 操作
 */

import type { OutlineNode } from '../types/storage';
import { getDatabase, generateUUID } from './database';

/**
 * 获取指定作品的所有大纲节点
 */
export async function getOutlineNodesByWorkId(workId: string): Promise<OutlineNode[]> {
  const db = await getDatabase();

  const nodes = await db.select<OutlineNode[]>(
    `SELECT * FROM outline_nodes
     WHERE work_id = ? AND deleted = 0
     ORDER BY "order" ASC`,
    [workId]
  );

  return nodes;
}

/**
 * 获取指定父节点的子节点
 */
export async function getChildNodes(workId: string, parentId: string | null): Promise<OutlineNode[]> {
  const db = await getDatabase();

  const nodes = await db.select<OutlineNode[]>(
    `SELECT * FROM outline_nodes
     WHERE work_id = ? AND parent_id ${parentId === null ? 'IS NULL' : '= ?'} AND deleted = 0
     ORDER BY "order" ASC`,
    parentId === null ? [workId] : [workId, parentId]
  );

  return nodes;
}

/**
 * 根据 ID 获取大纲节点
 */
export async function getOutlineNodeById(id: string): Promise<OutlineNode | null> {
  const db = await getDatabase();

  const nodes = await db.select<OutlineNode[]>(
    'SELECT * FROM outline_nodes WHERE id = ? AND deleted = 0',
    [id]
  );

  return nodes.length > 0 ? nodes[0] : null;
}

/**
 * 创建新的大纲节点
 */
export async function createOutlineNode(
  data: Omit<OutlineNode, 'id' | 'created_at' | 'updated_at' | 'synced_at' | 'deleted'>
): Promise<OutlineNode> {
  const db = await getDatabase();

  const now = new Date().toISOString();
  const node: OutlineNode = {
    ...data,
    id: generateUUID(),
    created_at: now,
    updated_at: now,
    synced_at: null,
    deleted: false,
  };

  await db.execute(
    `INSERT INTO outline_nodes
     (id, work_id, parent_id, title, description, "order", type, created_at, updated_at, synced_at, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      node.id,
      node.work_id,
      node.parent_id,
      node.title,
      node.description,
      node.order,
      node.type,
      node.created_at,
      node.updated_at,
      node.synced_at,
      node.deleted ? 1 : 0,
    ]
  );

  console.log('✅ 大纲节点创建成功:', node.title);
  return node;
}

/**
 * 更新大纲节点
 */
export async function updateOutlineNode(
  id: string,
  updates: Partial<Omit<OutlineNode, 'id' | 'work_id' | 'created_at' | 'updated_at' | 'synced_at' | 'deleted'>>
): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  const fields: string[] = [];
  const values: any[] = [];

  if (updates.parent_id !== undefined) {
    fields.push('parent_id = ?');
    values.push(updates.parent_id);
  }
  if (updates.title !== undefined) {
    fields.push('title = ?');
    values.push(updates.title);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }
  if (updates.order !== undefined) {
    fields.push('"order" = ?');
    values.push(updates.order);
  }
  if (updates.type !== undefined) {
    fields.push('type = ?');
    values.push(updates.type);
  }

  if (fields.length === 0) return;

  fields.push('updated_at = ?');
  values.push(now);

  fields.push('synced_at = ?');
  values.push(null);

  values.push(id);

  await db.execute(
    `UPDATE outline_nodes SET ${fields.join(', ')} WHERE id = ?`,
    values
  );

  console.log('✅ 大纲节点更新成功:', id);
}

/**
 * 删除大纲节点（软删除）
 */
export async function deleteOutlineNode(id: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  await db.execute(
    'UPDATE outline_nodes SET deleted = 1, updated_at = ?, synced_at = ? WHERE id = ?',
    [now, null, id]
  );

  console.log('✅ 大纲节点删除成功:', id);
}

/**
 * 获取节点树（包含所有子节点）
 */
export async function getOutlineTree(workId: string): Promise<OutlineNode[]> {
  const allNodes = await getOutlineNodesByWorkId(workId);

  // 构建树状结构（可以在前端处理，这里返回扁平数组）
  return allNodes;
}
