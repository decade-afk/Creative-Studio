/**
 * Asset Service - 素材数据服务
 * 提供素材的 CRUD 操作
 */

import type { Asset } from '../types/storage';
import { getDatabase, generateUUID, getCurrentTimestamp } from './database';

/**
 * 获取指定作品的所有素材
 */
export async function getAssetsByWorkId(workId: string): Promise<Asset[]> {
  const db = await getDatabase();

  const assets = await db.select<Asset[]>(
    `SELECT * FROM assets
     WHERE work_id = ? AND deleted = 0
     ORDER BY created_at DESC`,
    [workId]
  );

  return assets;
}

/**
 * 根据 ID 获取素材
 */
export async function getAssetById(id: string): Promise<Asset | null> {
  const db = await getDatabase();

  const assets = await db.select<Asset[]>(
    'SELECT * FROM assets WHERE id = ? AND deleted = 0',
    [id]
  );

  return assets.length > 0 ? assets[0] : null;
}

/**
 * 创建新素材
 */
export async function createAsset(
  data: Omit<Asset, 'id' | 'created_at' | 'updated_at' | 'synced_at' | 'deleted'>
): Promise<Asset> {
  const db = await getDatabase();

  const now = new Date().toISOString();
  const asset: Asset = {
    ...data,
    id: generateUUID(),
    created_at: now,
    updated_at: now,
    synced_at: null,
    deleted: false,
  };

  await db.execute(
    `INSERT INTO assets
     (id, work_id, name, type, file_path, file_size, mime_type, tags, created_at, updated_at, synced_at, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      asset.id,
      asset.work_id,
      asset.name,
      asset.type,
      asset.file_path,
      asset.file_size,
      asset.mime_type,
      JSON.stringify(asset.tags),
      asset.created_at,
      asset.updated_at,
      asset.synced_at,
      asset.deleted ? 1 : 0,
    ]
  );

  console.log('✅ 素材创建成功:', asset.name);
  return asset;
}

/**
 * 更新素材
 */
export async function updateAsset(
  id: string,
  updates: Partial<Omit<Asset, 'id' | 'work_id' | 'created_at' | 'updated_at' | 'synced_at' | 'deleted'>>
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
  if (updates.file_path !== undefined) {
    fields.push('file_path = ?');
    values.push(updates.file_path);
  }
  if (updates.file_size !== undefined) {
    fields.push('file_size = ?');
    values.push(updates.file_size);
  }
  if (updates.mime_type !== undefined) {
    fields.push('mime_type = ?');
    values.push(updates.mime_type);
  }
  if (updates.tags !== undefined) {
    fields.push('tags = ?');
    values.push(JSON.stringify(updates.tags));
  }

  if (fields.length === 0) return;

  fields.push('updated_at = ?');
  values.push(now);

  fields.push('synced_at = ?');
  values.push(null);

  values.push(id);

  await db.execute(
    `UPDATE assets SET ${fields.join(', ')} WHERE id = ?`,
    values
  );

  console.log('✅ 素材更新成功:', id);
}

/**
 * 删除素材（软删除）
 */
export async function deleteAsset(id: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  await db.execute(
    'UPDATE assets SET deleted = 1, updated_at = ?, synced_at = ? WHERE id = ?',
    [now, null, id]
  );

  console.log('✅ 素材删除成功:', id);
}

/**
 * 根据类型筛选素材
 */
export async function getAssetsByType(
  workId: string,
  type: 'image' | 'video' | 'audio' | 'document'
): Promise<Asset[]> {
  const db = await getDatabase();

  const assets = await db.select<Asset[]>(
    `SELECT * FROM assets
     WHERE work_id = ? AND type = ? AND deleted = 0
     ORDER BY created_at DESC`,
    [workId, type]
  );

  return assets;
}

/**
 * 根据标签搜索素材
 */
export async function searchAssetsByTag(workId: string, tag: string): Promise<Asset[]> {
  const db = await getDatabase();

  const assets = await db.select<Asset[]>(
    `SELECT * FROM assets
     WHERE work_id = ? AND deleted = 0
     ORDER BY created_at DESC`,
    [workId]
  );

  // 在内存中过滤标签
  return assets.filter((asset) => {
    try {
      const tags = JSON.parse(asset.tags as any);
      return tags.includes(tag);
    } catch {
      return false;
    }
  });
}

/**
 * 搜索素材（按名称）
 */
export async function searchAssetsByName(workId: string, keyword: string): Promise<Asset[]> {
  const db = await getDatabase();

  const assets = await db.select<Asset[]>(
    `SELECT * FROM assets
     WHERE work_id = ? AND name LIKE ? AND deleted = 0
     ORDER BY created_at DESC`,
    [workId, `%${keyword}%`]
  );

  return assets;
}

/**
 * 获取素材总大小
 */
export async function getTotalAssetSize(workId: string): Promise<number> {
  const db = await getDatabase();

  const result = await db.select<Array<{ total: number }>>(
    `SELECT SUM(file_size) as total FROM assets
     WHERE work_id = ? AND deleted = 0`,
    [workId]
  );

  return result.length > 0 && result[0].total ? result[0].total : 0;
}
