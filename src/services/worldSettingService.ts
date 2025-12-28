/**
 * 世界观设定服务模块
 *
 * 功能说明:
 * - 管理作品的世界观设定(地点、组织、事件、文化、科技、魔法等)
 * - 提供 CRUD 操作(创建、读取、更新、删除)
 * - 支持分类筛选和搜索功能
 * - 管理设定之间的关联关系
 *
 * 数据结构:
 * - 支持 6 种分类: location, organization, event, culture, technology, magic
 * - 每个设定可关联角色和其他设定
 * - 支持标签系统
 * - 支持自定义图标和颜色
 *
 * @module worldSettingService
 */

import { invoke } from '@tauri-apps/api/core';

/**
 * 生成符合 RFC 4122 v4 标准的 UUID
 *
 * @returns {string} UUID 字符串
 * @example
 * const id = generateUUID(); // "550e8400-e29b-41d4-a716-446655440000"
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

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

/**
 * 获取作品的所有世界观设定
 */
export async function getWorldSettings(workId: string): Promise<WorldSetting[]> {
  try {
    const result = await invoke<any[]>('execute_query', {
      query: 'SELECT * FROM world_settings WHERE work_id = $1 ORDER BY created_at DESC',
      params: [workId]
    });

    return result.map((row: any) => ({
      id: row.id,
      work_id: row.work_id,
      category: row.category,
      title: row.title,
      content: row.content,
      icon_type: row.icon_type,
      icon_color: row.icon_color,
      tags: row.tags ? JSON.parse(row.tags) : [],
      related_characters: row.related_characters ? JSON.parse(row.related_characters) : [],
      related_settings: row.related_settings ? JSON.parse(row.related_settings) : [],
      created_at: row.created_at,
      updated_at: row.updated_at
    }));
  } catch (error) {
    console.error('Failed to get world settings:', error);
    throw error;
  }
}

/**
 * 根据分类获取世界观设定
 */
export async function getWorldSettingsByCategory(
  workId: string,
  category: WorldSettingCategory
): Promise<WorldSetting[]> {
  try {
    const result = await invoke<any[]>('execute_query', {
      query: 'SELECT * FROM world_settings WHERE work_id = $1 AND category = $2 ORDER BY created_at DESC',
      params: [workId, category]
    });

    return result.map((row: any) => ({
      id: row.id,
      work_id: row.work_id,
      category: row.category,
      title: row.title,
      content: row.content,
      icon_type: row.icon_type,
      icon_color: row.icon_color,
      tags: row.tags ? JSON.parse(row.tags) : [],
      related_characters: row.related_characters ? JSON.parse(row.related_characters) : [],
      related_settings: row.related_settings ? JSON.parse(row.related_settings) : [],
      created_at: row.created_at,
      updated_at: row.updated_at
    }));
  } catch (error) {
    console.error('Failed to get world settings by category:', error);
    throw error;
  }
}

/**
 * 根据 ID 获取世界观设定
 */
export async function getWorldSettingById(id: string): Promise<WorldSetting | null> {
  try {
    const result = await invoke<any[]>('execute_query', {
      query: 'SELECT * FROM world_settings WHERE id = $1',
      params: [id]
    });

    if (result.length === 0) {
      return null;
    }

    const row = result[0];
    return {
      id: row.id,
      work_id: row.work_id,
      category: row.category,
      title: row.title,
      content: row.content,
      icon_type: row.icon_type,
      icon_color: row.icon_color,
      tags: row.tags ? JSON.parse(row.tags) : [],
      related_characters: row.related_characters ? JSON.parse(row.related_characters) : [],
      related_settings: row.related_settings ? JSON.parse(row.related_settings) : [],
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  } catch (error) {
    console.error('Failed to get world setting by id:', error);
    throw error;
  }
}

/**
 * 创建世界观设定
 */
export async function createWorldSetting(input: CreateWorldSettingInput): Promise<WorldSetting> {
  const id = generateUUID();
  const now = new Date().toISOString();
  
  // 获取默认图标和颜色
  const defaultIcon = CATEGORY_ICONS[input.category];
  const iconType = input.icon_type || defaultIcon.icon;
  const iconColor = input.icon_color || defaultIcon.color;

  try {
    await invoke('execute_query', {
      query: `
        INSERT INTO world_settings (
          id, work_id, category, title, content,
          icon_type, icon_color, tags, related_characters, related_settings,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `,
      params: [
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
        now
      ]
    });

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
      updated_at: now
    };
  } catch (error) {
    console.error('Failed to create world setting:', error);
    throw error;
  }
}

/**
 * 更新世界观设定
 */
export async function updateWorldSetting(
  id: string,
  input: UpdateWorldSettingInput
): Promise<WorldSetting> {
  const now = new Date().toISOString();

  try {
    // 构建动态更新语句
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (input.title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      params.push(input.title);
    }
    if (input.content !== undefined) {
      updates.push(`content = $${paramIndex++}`);
      params.push(input.content);
    }
    if (input.icon_type !== undefined) {
      updates.push(`icon_type = $${paramIndex++}`);
      params.push(input.icon_type);
    }
    if (input.icon_color !== undefined) {
      updates.push(`icon_color = $${paramIndex++}`);
      params.push(input.icon_color);
    }
    if (input.tags !== undefined) {
      updates.push(`tags = $${paramIndex++}`);
      params.push(JSON.stringify(input.tags));
    }
    if (input.related_characters !== undefined) {
      updates.push(`related_characters = $${paramIndex++}`);
      params.push(JSON.stringify(input.related_characters));
    }
    if (input.related_settings !== undefined) {
      updates.push(`related_settings = $${paramIndex++}`);
      params.push(JSON.stringify(input.related_settings));
    }

    updates.push(`updated_at = $${paramIndex++}`);
    params.push(now);

    params.push(id);

    await invoke('execute_query', {
      query: `UPDATE world_settings SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      params
    });

    const updated = await getWorldSettingById(id);
    if (!updated) {
      throw new Error('Failed to get updated world setting');
    }

    return updated;
  } catch (error) {
    console.error('Failed to update world setting:', error);
    throw error;
  }
}

/**
 * 删除世界观设定
 */
export async function deleteWorldSetting(id: string): Promise<void> {
  try {
    await invoke('execute_query', {
      query: 'DELETE FROM world_settings WHERE id = $1',
      params: [id]
    });
  } catch (error) {
    console.error('Failed to delete world setting:', error);
    throw error;
  }
}

/**
 * 搜索世界观设定
 */
export async function searchWorldSettings(
  workId: string,
  searchText: string
): Promise<WorldSetting[]> {
  try {
    const result = await invoke<any[]>('execute_query', {
      query: `
        SELECT * FROM world_settings 
        WHERE work_id = $1 
        AND (title LIKE $2 OR content LIKE $2)
        ORDER BY created_at DESC
      `,
      params: [workId, `%${searchText}%`]
    });

    return result.map((row: any) => ({
      id: row.id,
      work_id: row.work_id,
      category: row.category,
      title: row.title,
      content: row.content,
      icon_type: row.icon_type,
      icon_color: row.icon_color,
      tags: row.tags ? JSON.parse(row.tags) : [],
      related_characters: row.related_characters ? JSON.parse(row.related_characters) : [],
      related_settings: row.related_settings ? JSON.parse(row.related_settings) : [],
      created_at: row.created_at,
      updated_at: row.updated_at
    }));
  } catch (error) {
    console.error('Failed to search world settings:', error);
    throw error;
  }
}
