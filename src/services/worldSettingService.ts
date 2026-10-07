/**
 * 世界观设定服务模块
 *
 * 功能说明:
 * - 管理作品的世界观设定(地点、组织、事件、文化、科技、魔法等)
 * - 提供 CRUD 操作(创建、读取、更新、删除)
 * - 支持分类筛选和搜索功能
 *
 * 【实现说明】
 * - 通过 tauri-plugin-sql 直接访问 SQLite（与其它服务一致）
 * - world_settings 表在本服务首次访问时自动创建（IF NOT EXISTS 幂等）
 * - 软删除（deleted 标记），与全局数据约定保持一致
 *
 * @module worldSettingService
 */

import { getDatabase, generateUUID, getCurrentTimestamp } from './database';

/**
 * 世界观设定分类
 */
export type WorldSettingCategory =
  | 'location'      // 地点
  | 'organization'  // 组织
  | 'event'         // 事件
  | 'culture'       // 文化
  | 'technology'    // 科技
  | 'magic';        // 魔法

/**
 * 世界观设定接口
 */
export interface WorldSetting {
  id: string;
  work_id: string;
  category: WorldSettingCategory;
  title: string;
  content: string;
  icon_type?: string;
  icon_color?: string;
  tags?: string[];
  related_characters?: string[];
  related_settings?: string[];
  created_at: string;
  updated_at: string;
}

/**
 * 创建世界观设定的输入参数
 */
export interface CreateWorldSettingInput {
  work_id: string;
  category: WorldSettingCategory;
  title: string;
  content: string;
  icon_type?: string;
  icon_color?: string;
  tags?: string[];
  related_characters?: string[];
  related_settings?: string[];
}

/**
 * 更新世界观设定的输入参数
 */
export interface UpdateWorldSettingInput {
  title?: string;
  content?: string;
  icon_type?: string;
  icon_color?: string;
  tags?: string[];
  related_characters?: string[];
  related_settings?: string[];
}

/**
 * 分类图标映射
 */
export const CATEGORY_ICONS: Record<WorldSettingCategory, { icon: string; color: string; label: string }> = {
  location: {
    icon: '🏙️',
    color: '#3B82F6', // blue-500
    label: '地点'
  },
  organization: {
    icon: '🏢',
    color: '#8B5CF6', // violet-500
    label: '组织'
  },
  event: {
    icon: '📅',
    color: '#EF4444', // red-500
    label: '事件'
  },
  culture: {
    icon: '🎭',
    color: '#F59E0B', // amber-500
    label: '文化'
  },
  technology: {
    icon: '🔬',
    color: '#10B981', // emerald-500
    label: '科技'
  },
  magic: {
    icon: '✨',
    color: '#EC4899', // pink-500
    label: '魔法'
  }
};

/** 建表标志（进程内幂等） */
let tableReady: Promise<void> | null = null;

/**
 * 确保 world_settings 表存在
 */
async function ensureTable(): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      const db = await getDatabase();
      await db.execute(`
        CREATE TABLE IF NOT EXISTS world_settings (
          id TEXT PRIMARY KEY NOT NULL,
          work_id TEXT NOT NULL,
          category TEXT NOT NULL CHECK (category IN ('location', 'organization', 'event', 'culture', 'technology', 'magic')),
          title TEXT NOT NULL,
          content TEXT NOT NULL DEFAULT '',
          icon_type TEXT,
          icon_color TEXT,
          tags TEXT NOT NULL DEFAULT '[]',
          related_characters TEXT NOT NULL DEFAULT '[]',
          related_settings TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
        )
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_world_settings_work
        ON world_settings(work_id)
      `);
    })();
  }
  return tableReady;
}

/** 数据库行 → WorldSetting（解析 JSON 字段） */
function rowToSetting(row: any): WorldSetting {
  const parse = (v: any): string[] => {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };
  return {
    id: row.id,
    work_id: row.work_id,
    category: row.category,
    title: row.title,
    content: row.content,
    icon_type: row.icon_type ?? undefined,
    icon_color: row.icon_color ?? undefined,
    tags: parse(row.tags),
    related_characters: parse(row.related_characters),
    related_settings: parse(row.related_settings),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * 获取作品的所有世界观设定
 */
export async function getWorldSettings(workId: string): Promise<WorldSetting[]> {
  await ensureTable();
  const db = await getDatabase();
  const rows = await db.select<any[]>(
    'SELECT * FROM world_settings WHERE work_id = $1 AND deleted = 0 ORDER BY created_at DESC',
    [workId]
  );
  return rows.map(rowToSetting);
}

/**
 * 根据分类获取世界观设定
 */
export async function getWorldSettingsByCategory(
  workId: string,
  category: WorldSettingCategory
): Promise<WorldSetting[]> {
  await ensureTable();
  const db = await getDatabase();
  const rows = await db.select<any[]>(
    'SELECT * FROM world_settings WHERE work_id = $1 AND category = $2 AND deleted = 0 ORDER BY created_at DESC',
    [workId, category]
  );
  return rows.map(rowToSetting);
}

/**
 * 根据 ID 获取世界观设定
 */
export async function getWorldSettingById(id: string): Promise<WorldSetting | null> {
  await ensureTable();
  const db = await getDatabase();
  const rows = await db.select<any[]>('SELECT * FROM world_settings WHERE id = $1 AND deleted = 0', [id]);
  return rows.length > 0 ? rowToSetting(rows[0]) : null;
}

/**
 * 创建世界观设定
 */
export async function createWorldSetting(input: CreateWorldSettingInput): Promise<WorldSetting> {
  await ensureTable();
  const db = await getDatabase();

  const id = generateUUID();
  const now = getCurrentTimestamp();

  // 默认图标与颜色取自分类定义
  const defaultIcon = CATEGORY_ICONS[input.category];
  const iconType = input.icon_type || defaultIcon.icon;
  const iconColor = input.icon_color || defaultIcon.color;

  await db.execute(
    `INSERT INTO world_settings (
      id, work_id, category, title, content,
      icon_type, icon_color, tags, related_characters, related_settings,
      created_at, updated_at, deleted
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 0)`,
    [
      id,
      input.work_id,
      input.category,
      input.title,
      input.content,
      iconType,
      iconColor,
      JSON.stringify(input.tags || []),
      JSON.stringify(input.related_characters || []),
      JSON.stringify(input.related_settings || []),
      now,
      now,
    ]
  );

  return {
    id,
    work_id: input.work_id,
    category: input.category,
    title: input.title,
    content: input.content,
    icon_type: iconType,
    icon_color: iconColor,
    tags: input.tags || [],
    related_characters: input.related_characters || [],
    related_settings: input.related_settings || [],
    created_at: now,
    updated_at: now,
  };
}

/**
 * 更新世界观设定
 */
export async function updateWorldSetting(
  id: string,
  input: UpdateWorldSettingInput
): Promise<WorldSetting> {
  await ensureTable();
  const db = await getDatabase();
  const now = getCurrentTimestamp();

  const updates: string[] = [];
  const params: any[] = [];

  if (input.title !== undefined) {
    updates.push('title = ?');
    params.push(input.title);
  }
  if (input.content !== undefined) {
    updates.push('content = ?');
    params.push(input.content);
  }
  if (input.icon_type !== undefined) {
    updates.push('icon_type = ?');
    params.push(input.icon_type);
  }
  if (input.icon_color !== undefined) {
    updates.push('icon_color = ?');
    params.push(input.icon_color);
  }
  if (input.tags !== undefined) {
    updates.push('tags = ?');
    params.push(JSON.stringify(input.tags));
  }
  if (input.related_characters !== undefined) {
    updates.push('related_characters = ?');
    params.push(JSON.stringify(input.related_characters));
  }
  if (input.related_settings !== undefined) {
    updates.push('related_settings = ?');
    params.push(JSON.stringify(input.related_settings));
  }

  updates.push('updated_at = ?');
  params.push(now);
  params.push(id);

  await db.execute(`UPDATE world_settings SET ${updates.join(', ')} WHERE id = ?`, params);

  const updated = await getWorldSettingById(id);
  if (!updated) {
    throw new Error('更新世界观设定失败：记录不存在');
  }
  return updated;
}

/**
 * 删除世界观设定（软删除）
 */
export async function deleteWorldSetting(id: string): Promise<void> {
  await ensureTable();
  const db = await getDatabase();
  await db.execute('UPDATE world_settings SET deleted = 1, updated_at = ? WHERE id = ?', [
    getCurrentTimestamp(),
    id,
  ]);
}

/**
 * 搜索世界观设定
 */
export async function searchWorldSettings(
  workId: string,
  searchText: string
): Promise<WorldSetting[]> {
  await ensureTable();
  const db = await getDatabase();
  const rows = await db.select<any[]>(
    `SELECT * FROM world_settings
     WHERE work_id = $1 AND deleted = 0
     AND (title LIKE $2 OR content LIKE $2)
     ORDER BY created_at DESC`,
    [workId, `%${searchText}%`]
  );
  return rows.map(rowToSetting);
}
