/**
 * Character Service - 角色数据服务
 * 提供角色的 CRUD 操作
 */

import type { Character } from '../types/storage';
import { getDatabase, generateUUID, getCurrentTimestamp } from './database';

/**
 * 获取指定作品的所有角色
 */
export async function getCharactersByWorkId(workId: string): Promise<Character[]> {
  const db = await getDatabase();

  const characters = await db.select<Character[]>(
    `SELECT * FROM characters
     WHERE work_id = ? AND deleted = 0
     ORDER BY created_at DESC`,
    [workId]
  );

  return characters;
}

/**
 * 根据 ID 获取角色
 */
export async function getCharacterById(id: string): Promise<Character | null> {
  const db = await getDatabase();

  const characters = await db.select<Character[]>(
    'SELECT * FROM characters WHERE id = ? AND deleted = 0',
    [id]
  );

  return characters.length > 0 ? characters[0] : null;
}

/**
 * 创建新角色
 */
export async function createCharacter(
  data: Omit<Character, 'id' | 'created_at' | 'updated_at' | 'synced_at' | 'deleted'>
): Promise<Character> {
  const db = await getDatabase();

  const now = new Date().toISOString();
  const character: Character = {
    ...data,
    id: generateUUID(),
    created_at: now,
    updated_at: now,
    synced_at: null,
    deleted: false,
  };

  await db.execute(
    `INSERT INTO characters
     (id, work_id, name, description, avatar, personality, relationships, created_at, updated_at, synced_at, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      character.id,
      character.work_id,
      character.name,
      character.description,
      character.avatar || null,
      character.personality || null,
      character.relationships || null,
      character.created_at,
      character.updated_at,
      character.synced_at,
      character.deleted ? 1 : 0,
    ]
  );

  console.log('✅ 角色创建成功:', character.name);
  return character;
}

/**
 * 更新角色
 */
export async function updateCharacter(
  id: string,
  updates: Partial<Omit<Character, 'id' | 'work_id' | 'created_at' | 'updated_at' | 'synced_at' | 'deleted'>>
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
  if (updates.avatar !== undefined) {
    fields.push('avatar = ?');
    values.push(updates.avatar);
  }
  if (updates.personality !== undefined) {
    fields.push('personality = ?');
    values.push(updates.personality);
  }
  if (updates.relationships !== undefined) {
    fields.push('relationships = ?');
    values.push(updates.relationships);
  }

  if (fields.length === 0) return;

  fields.push('updated_at = ?');
  values.push(now);

  fields.push('synced_at = ?');
  values.push(null);

  values.push(id);

  await db.execute(
    `UPDATE characters SET ${fields.join(', ')} WHERE id = ?`,
    values
  );

  console.log('✅ 角色更新成功:', id);
}

/**
 * 删除角色（软删除）
 */
export async function deleteCharacter(id: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  await db.execute(
    'UPDATE characters SET deleted = 1, updated_at = ?, synced_at = ? WHERE id = ?',
    [now, null, id]
  );

  console.log('✅ 角色删除成功:', id);
}

/**
 * 按名称搜索角色
 */
export async function searchCharactersByName(workId: string, keyword: string): Promise<Character[]> {
  const db = await getDatabase();

  const characters = await db.select<Character[]>(
    `SELECT * FROM characters
     WHERE work_id = ? AND name LIKE ? AND deleted = 0
     ORDER BY created_at DESC`,
    [workId, `%${keyword}%`]
  );

  return characters;
}
