/**
 * 数据库服务模块
 *
 * 负责：
 * 1. SQLite数据库初始化和迁移
 * 2. 数据库连接管理
 * 3. 表结构创建和版本控制
 * 4. 为云同步预留接口
 *
 * 设计原则：
 * - 使用UUID作为主键，避免云同步时的ID冲突
 * - 每个表都有created_at、updated_at、synced_at字段
 * - 使用软删除（deleted字段）而非物理删除
 * - SQL语法兼容PostgreSQL/MySQL，便于迁移
 */

import Database from '@tauri-apps/plugin-sql';

/**
 * 数据库实例
 * 使用懒加载模式，第一次访问时初始化
 */
let db: Database | null = null;

/**
 * 数据库文件路径
 * 存储在应用数据目录下的 creative-studio.db
 */
const DB_PATH = 'sqlite:creative-studio.db';

/**
 * 当前数据库schema版本号
 * 每次修改数据库结构时递增
 *
 * v1: works, chapters, characters
 * v2: outline_nodes, scenes, milestones, clues, conflicts, storyboards, assets
 * v3: 修复 outline_nodes.parent_id 外键约束
 */
const CURRENT_DB_VERSION = 3;

/**
 * 获取数据库实例
 * 如果数据库未初始化，则先初始化
 *
 * @returns Promise<Database> 数据库实例
 */
export async function getDatabase(): Promise<Database> {
  // 如果已经初始化，直接返回
  if (db) {
    return db;
  }

  // 首次访问，加载数据库
  try {
    db = await Database.load(DB_PATH);
    console.log('✅ 数据库加载成功:', DB_PATH);

    // 初始化数据库表结构
    await initializeDatabase();

    return db;
  } catch (error) {
    console.error('❌ 数据库加载失败:', error);
    throw new Error(`数据库初始化失败: ${error}`);
  }
}

/**
 * 初始化数据库表结构
 * 创建所有必要的表和索引
 */
async function initializeDatabase(): Promise<void> {
  if (!db) {
    throw new Error('数据库未初始化');
  }

  console.log('🔧 开始初始化数据库表结构...');

  try {
    // 1. 创建版本管理表
    await createVersionTable();

    // 2. 检查当前数据库版本
    const currentVersion = await getDatabaseVersion();
    console.log(`📊 当前数据库版本: ${currentVersion}`);

    // 3. 如果是新数据库或需要升级
    if (currentVersion < CURRENT_DB_VERSION) {
      await migrateDatabase(currentVersion, CURRENT_DB_VERSION);
    }

    console.log('✅ 数据库初始化完成');
  } catch (error) {
    console.error('❌ 数据库初始化失败:', error);
    throw error;
  }
}

/**
 * 创建版本管理表
 * 用于追踪数据库schema版本
 */
async function createVersionTable(): Promise<void> {
  if (!db) return;

  await db.execute(`
    CREATE TABLE IF NOT EXISTS db_version (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // 如果表为空，插入初始版本
  const result = await db.select<Array<{ count: number }>>(
    'SELECT COUNT(*) as count FROM db_version'
  );

  if (result[0].count === 0) {
    await db.execute(
      'INSERT INTO db_version (id, version) VALUES (1, 0)'
    );
  }
}

/**
 * 获取当前数据库版本
 *
 * @returns Promise<number> 数据库版本号
 */
async function getDatabaseVersion(): Promise<number> {
  if (!db) return 0;

  const result = await db.select<Array<{ version: number }>>(
    'SELECT version FROM db_version WHERE id = 1'
  );

  return result[0]?.version || 0;
}

/**
 * 数据库迁移
 * 从旧版本升级到新版本
 *
 * @param fromVersion 当前版本
 * @param toVersion 目标版本
 */
async function migrateDatabase(fromVersion: number, toVersion: number): Promise<void> {
  if (!db) return;

  console.log(`🔄 开始数据库迁移: v${fromVersion} -> v${toVersion}`);

  // 执行各版本的迁移脚本
  for (let version = fromVersion + 1; version <= toVersion; version++) {
    console.log(`📝 应用迁移 v${version}...`);

    switch (version) {
      case 1:
        await migrateToV1();
        break;
      case 2:
        await migrateToV2();
        break;
      case 3:
        await migrateToV3();
        break;
      case 4:
        await migrateToV4();
        break;
      default:
        throw new Error(`未知的迁移版本: ${version}`);
    }

    // 更新版本号
    await db.execute(
      `UPDATE db_version SET version = ?, updated_at = datetime('now') WHERE id = 1`,
      [version]
    );

    console.log(`✅ 迁移到 v${version} 完成`);
  }
}

/**
 * 迁移到V1 - 创建基础表结构
 * 包括：works（作品）、chapters（章节）、characters（角色）
 */
async function migrateToV1(): Promise<void> {
  if (!db) return;

  // ========================================
  // 1. 创建作品表 (works)
  // ========================================
  await db.execute(`
    CREATE TABLE IF NOT EXISTS works (
      -- 主键：UUID格式的字符串
      id TEXT PRIMARY KEY NOT NULL,

      -- 作品标题
      title TEXT NOT NULL,

      -- 作品类型：script(短剧) 或 novel(小说)
      type TEXT NOT NULL CHECK (type IN ('script', 'novel')),

      -- 图标emoji
      icon TEXT NOT NULL DEFAULT '📝',

      -- 作品描述
      description TEXT,

      -- 创建时间 (ISO 8601格式)
      created_at TEXT NOT NULL DEFAULT (datetime('now')),

      -- 最后更新时间
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),

      -- 最后同步到云端的时间 (NULL表示从未同步)
      synced_at TEXT,

      -- 软删除标记 (0=未删除, 1=已删除)
      deleted INTEGER NOT NULL DEFAULT 0
    )
  `);

  // 创建索引：加速按类型查询
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_works_type
    ON works(type)
  `);

  // 创建索引：加速按创建时间排序
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_works_created_at
    ON works(created_at DESC)
  `);

  // ========================================
  // 2. 创建章节表 (chapters)
  // ========================================
  await db.execute(`
    CREATE TABLE IF NOT EXISTS chapters (
      -- 主键：UUID格式的字符串
      id TEXT PRIMARY KEY NOT NULL,

      -- 外键：所属作品ID
      work_id TEXT NOT NULL,

      -- 章节标题
      title TEXT NOT NULL,

      -- 章节内容 (HTML格式)
      content TEXT NOT NULL DEFAULT '',

      -- 章节顺序（从1开始）
      chapter_order INTEGER NOT NULL DEFAULT 1,

      -- 创建时间
      created_at TEXT NOT NULL DEFAULT (datetime('now')),

      -- 最后更新时间
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),

      -- 最后同步时间
      synced_at TEXT,

      -- 软删除标记
      deleted INTEGER NOT NULL DEFAULT 0,

      -- 外键约束：章节必须属于某个作品
      FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
    )
  `);

  // 创建索引：加速按作品ID查询章节
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_chapters_work_id
    ON chapters(work_id)
  `);

  // 创建索引：加速章节排序
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_chapters_order
    ON chapters(work_id, chapter_order)
  `);

  // ========================================
  // 3. 创建角色表 (characters)
  // ========================================
  await db.execute(`
    CREATE TABLE IF NOT EXISTS characters (
      -- 主键：UUID
      id TEXT PRIMARY KEY NOT NULL,

      -- 外键：所属作品ID
      work_id TEXT NOT NULL,

      -- 角色名称
      name TEXT NOT NULL,

      -- 角色描述
      description TEXT NOT NULL DEFAULT '',

      -- 角色头像 (URL或emoji)
      avatar TEXT,

      -- 角色性格
      personality TEXT,

      -- 角色关系
      relationships TEXT,

      -- 创建时间
      created_at TEXT NOT NULL DEFAULT (datetime('now')),

      -- 最后更新时间
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),

      -- 最后同步时间
      synced_at TEXT,

      -- 软删除标记
      deleted INTEGER NOT NULL DEFAULT 0,

      -- 外键约束
      FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
    )
  `);

  // 创建索引：加速按作品ID查询角色
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_characters_work_id
    ON characters(work_id)
  `);

  console.log('✅ V1表结构创建完成');
}

/**
 * 迁移到V2 - 创建 Planner 和 Director 视图表
 * 包括：outline_nodes, scenes, milestones, clues, conflicts, storyboards, assets
 */
async function migrateToV2(): Promise<void> {
  if (!db) return;

  // ========================================
  // 1. 创建大纲节点表 (outline_nodes)
  // ========================================
  await db.execute(`
    CREATE TABLE IF NOT EXISTS outline_nodes (
      id TEXT PRIMARY KEY NOT NULL,
      work_id TEXT NOT NULL,
      parent_id TEXT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      "order" INTEGER NOT NULL DEFAULT 0,
      type TEXT NOT NULL CHECK (type IN ('act', 'scene', 'event')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      synced_at TEXT,
      deleted INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_outline_nodes_work_id
    ON outline_nodes(work_id)
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_outline_nodes_parent_id
    ON outline_nodes(parent_id)
  `);

  // ========================================
  // 2. 创建场景表 (scenes)
  // ========================================
  await db.execute(`
    CREATE TABLE IF NOT EXISTS scenes (
      id TEXT PRIMARY KEY NOT NULL,
      work_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      time_of_day TEXT NOT NULL CHECK (time_of_day IN ('morning', 'noon', 'evening', 'night', 'other')),
      mood TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      synced_at TEXT,
      deleted INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_scenes_work_id
    ON scenes(work_id)
  `);

  // ========================================
  // 3. 创建里程碑表 (milestones)
  // ========================================
  await db.execute(`
    CREATE TABLE IF NOT EXISTS milestones (
      id TEXT PRIMARY KEY NOT NULL,
      work_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      due_date TEXT,
      status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      synced_at TEXT,
      deleted INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_milestones_work_id
    ON milestones(work_id)
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_milestones_status
    ON milestones(status)
  `);

  // ========================================
  // 4. 创建伏笔表 (clues)
  // ========================================
  await db.execute(`
    CREATE TABLE IF NOT EXISTS clues (
      id TEXT PRIMARY KEY NOT NULL,
      work_id TEXT NOT NULL,
      name TEXT NOT NULL,
      source TEXT NOT NULL CHECK (source IN ('ai_detected', 'manual')),
      status TEXT NOT NULL CHECK (status IN ('open', 'resolved')),
      setup_scene_id TEXT,
      payoff_scene_id TEXT,
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      synced_at TEXT,
      deleted INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_clues_work_id
    ON clues(work_id)
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_clues_status
    ON clues(status)
  `);

  // ========================================
  // 5. 创建冲突点表 (conflicts)
  // ========================================
  await db.execute(`
    CREATE TABLE IF NOT EXISTS conflicts (
      id TEXT PRIMARY KEY NOT NULL,
      work_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('character', 'environment', 'internal', 'social')),
      intensity TEXT NOT NULL CHECK (intensity IN ('low', 'medium', 'high', 'critical')),
      characters TEXT NOT NULL DEFAULT '',
      scene_id TEXT,
      description TEXT NOT NULL DEFAULT '',
      resolution TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK (status IN ('active', 'escalating', 'resolving', 'resolved')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      synced_at TEXT,
      deleted INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_conflicts_work_id
    ON conflicts(work_id)
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_conflicts_type
    ON conflicts(type)
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_conflicts_intensity
    ON conflicts(intensity)
  `);

  // ========================================
  // 6. 创建分镜表 (storyboards)
  // ========================================
  await db.execute(`
    CREATE TABLE IF NOT EXISTS storyboards (
      id TEXT PRIMARY KEY NOT NULL,
      work_id TEXT NOT NULL,
      chapter_id TEXT,
      scene_id TEXT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      shot_type TEXT NOT NULL CHECK (shot_type IN ('wide', 'medium', 'close', 'extreme_close')),
      camera_movement TEXT NOT NULL CHECK (camera_movement IN ('static', 'pan', 'tilt', 'zoom', 'dolly', 'crane')),
      duration INTEGER NOT NULL DEFAULT 0,
      "order" INTEGER NOT NULL DEFAULT 0,
      thumbnail_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      synced_at TEXT,
      deleted INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_storyboards_work_id
    ON storyboards(work_id)
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_storyboards_chapter_id
    ON storyboards(chapter_id)
  `);

  // ========================================
  // 7. 创建素材表 (assets)
  // ========================================
  await db.execute(`
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY NOT NULL,
      work_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('image', 'video', 'audio', 'document')),
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      mime_type TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      synced_at TEXT,
      deleted INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_assets_work_id
    ON assets(work_id)
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_assets_type
    ON assets(type)
  `);

  console.log('✅ V2表结构创建完成');
}

/**
 * 数据库迁移 v2 -> v3
 * 修复 outline_nodes 表的 parent_id 外键约束
 */
async function migrateToV3(): Promise<void> {
  const db = await getDatabase();

  console.log('🔧 修复 outline_nodes 表外键约束...');

  // SQLite 不支持 ALTER TABLE ADD CONSTRAINT
  // 需要重建表

  // 1. 创建新表，添加 parent_id 外键约束
  await db.execute(`
    CREATE TABLE IF NOT EXISTS outline_nodes_new (
      id TEXT PRIMARY KEY NOT NULL,
      work_id TEXT NOT NULL,
      parent_id TEXT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      "order" INTEGER NOT NULL DEFAULT 0,
      type TEXT NOT NULL CHECK (type IN ('act', 'scene', 'event')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      synced_at TEXT,
      deleted INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES outline_nodes_new(id) ON DELETE CASCADE
    )
  `);

  // 2. 复制数据
  await db.execute(`
    INSERT INTO outline_nodes_new
    SELECT * FROM outline_nodes
  `);

  // 3. 删除旧表
  await db.execute(`DROP TABLE outline_nodes`);

  // 4. 重命名新表
  await db.execute(`ALTER TABLE outline_nodes_new RENAME TO outline_nodes`);

  // 5. 重建索引
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_outline_nodes_work_id
    ON outline_nodes(work_id)
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_outline_nodes_parent_id
    ON outline_nodes(parent_id)
  `);

  console.log('✅ outline_nodes 表外键约束修复完成');
}

/**
 * 数据库迁移 v3 -> v4
 * 为所有表添加 version 字段，实现乐观锁（并发控制）
 */
async function migrateToV4(): Promise<void> {
  const db = await getDatabase();

  console.log('🔧 添加 version 字段以实现乐观锁...');

  // 需要添加 version 字段的表列表
  const tables = [
    'works',
    'chapters',
    'characters',
    'outline_nodes',
    'scenes',
    'milestones',
    'clues',
    'conflicts',
    'storyboards',
    'assets'
  ];

  // 为每个表添加 version 字段
  for (const table of tables) {
    try {
      await db.execute(`
        ALTER TABLE ${table}
        ADD COLUMN version INTEGER NOT NULL DEFAULT 1
      `);
      console.log(`  ✅ ${table} 表添加 version 字段成功`);
    } catch (error) {
      // 如果字段已存在，忽略错误
      console.log(`  ⚠️ ${table} 表可能已有 version 字段，跳过`);
    }
  }

  console.log('✅ 乐观锁字段添加完成');
}

/**
 * 关闭数据库连接
 * 应用退出时调用
 */
export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.close();
    db = null;
    console.log('🔒 数据库连接已关闭');
  }
}

/**
 * 生成UUID (v4)
 * 用于新记录的主键
 *
 * 优先使用浏览器原生的加密安全随机数生成器 (crypto.randomUUID)，
 * 如果不可用则降级到基于 Math.random() 的实现。
 *
 * @returns string UUID字符串
 */
export function generateUUID(): string {
  // 优先使用浏览器原生 API（加密安全）
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  // 降级方案：使用 Math.random()（非加密安全，但足够日常使用）
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * 获取当前ISO 8601格式的时间戳
 *
 * @returns string ISO 8601格式的时间字符串
 */
export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * 事务辅助函数
 * 自动处理事务的开始、提交和回滚
 *
 * @param callback 事务中要执行的操作
 * @returns Promise<T> 回调函数的返回值
 * @throws 如果事务失败，会自动回滚并抛出错误
 *
 * @example
 * await transaction(async (db) => {
 *   await db.execute('INSERT INTO works ...');
 *   await db.execute('INSERT INTO chapters ...');
 * });
 */
export async function transaction<T>(
  callback: (db: Database) => Promise<T>
): Promise<T> {
  const db = await getDatabase();

  try {
    // 开始事务
    await db.execute('BEGIN TRANSACTION');
    console.log('🔄 事务开始');

    // 执行回调中的操作
    const result = await callback(db);

    // 提交事务
    await db.execute('COMMIT');
    console.log('✅ 事务提交成功');

    return result;
  } catch (error) {
    // 发生错误，回滚事务
    try {
      await db.execute('ROLLBACK');
      console.log('↩️ 事务已回滚');
    } catch (rollbackError) {
      console.error('❌ 事务回滚失败:', rollbackError);
    }

    // 重新抛出原始错误
    console.error('❌ 事务执行失败:', error);
    throw error;
  }
}

/**
 * 乐观锁更新错误
 * 当版本号不匹配时抛出此错误
 */
export class OptimisticLockError extends Error {
  constructor(message: string = '数据已被其他用户修改，请刷新后重试') {
    super(message);
    this.name = 'OptimisticLockError';
  }
}

/**
 * 使用乐观锁更新记录
 * 检查版本号，只有版本号匹配时才执行更新，并自动递增版本号
 *
 * @param table 表名
 * @param id 记录ID
 * @param currentVersion 当前版本号
 * @param updates 要更新的字段和值（不包括 version 和 updated_at）
 * @returns Promise<boolean> 是否更新成功
 * @throws OptimisticLockError 如果版本号不匹配
 *
 * @example
 * try {
 *   await updateWithOptimisticLock('works', workId, currentVersion, {
 *     title: 'New Title',
 *     description: 'New Description'
 *   });
 * } catch (error) {
 *   if (error instanceof OptimisticLockError) {
 *     console.error('数据已被修改，请刷新');
 *   }
 * }
 */
export async function updateWithOptimisticLock(
  table: string,
  id: string,
  currentVersion: number,
  updates: Record<string, any>
): Promise<boolean> {
  const db = await getDatabase();

  // 构建 SET 子句
  const setFields: string[] = [];
  const params: any[] = [];

  for (const [key, value] of Object.entries(updates)) {
    setFields.push(`${key} = ?`);
    params.push(value);
  }

  // 添加 version 和 updated_at
  setFields.push('version = ?');
  params.push(currentVersion + 1);

  setFields.push('updated_at = ?');
  params.push(getCurrentTimestamp());

  // 添加 WHERE 条件参数
  params.push(id);
  params.push(currentVersion);

  // 执行更新
  const result = await db.execute(
    `UPDATE ${table}
     SET ${setFields.join(', ')}
     WHERE id = ? AND version = ?`,
    params
  );

  // 检查是否更新成功
  if (result.rowsAffected === 0) {
    throw new OptimisticLockError();
  }

  console.log(`✅ 使用乐观锁更新 ${table} 成功 (v${currentVersion} -> v${currentVersion + 1})`);
  return true;
}
