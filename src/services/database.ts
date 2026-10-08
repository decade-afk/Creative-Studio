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
import { join } from '@tauri-apps/api/path';
import { getStorageDir } from './configService';

/**
 * 数据库实例
 * 使用懒加载模式，第一次访问时初始化
 */
let db: Database | null = null;

/**
 * 初始化进行中的 Promise
 *
 * 【作用】并发调用 getDatabase() 时（如 React StrictMode 双挂载），
 * 所有调用共享同一次初始化，避免迁移脚本并发执行导致表损坏
 */
let initPromise: Promise<Database> | null = null;

/**
 * 构建数据库连接串
 *
 * 【存储位置】跟随配置的 storage.dataDir（默认应用数据目录）。
 * plugin-sql 对绝对路径直接透传给 sqlx（相对路径才拼 app_config_dir），
 * 因此自定义目录传绝对路径即可。
 */
async function buildDbPath(): Promise<string> {
  const dir = await getStorageDir();
  const file = await join(dir, 'creative-studio.db');
  // 正斜杠避免连接串解析歧义
  return `sqlite:${file.replace(/\\/g, '/')}`;
}

/**
 * 当前数据库schema版本号
 * 每次修改数据库结构时递增
 *
 * v1: works, chapters, characters
 * v2: outline_nodes, scenes, milestones, clues, conflicts, storyboards, assets
 * v3: 修复 outline_nodes.parent_id 外键约束
 * v4: 乐观锁 version 字段 + chapter_versions 章节版本快照表
 * v5: submissions 投递台账表
 * v6: chapters.summary 章节记忆摘要列（AI 上下文组装的前情链数据源）
 */
const CURRENT_DB_VERSION = 6;

/**
 * 获取数据库实例
 * 如果数据库未初始化，则先初始化
 *
 * 【并发安全】初始化过程通过 initPromise 串行化：
 * 并发调用（React StrictMode 会双挂载组件）只会触发一次初始化
 *
 * @returns Promise<Database> 数据库实例
 */
export async function getDatabase(): Promise<Database> {
  // 已经初始化完成，直接返回
  if (db) {
    return db;
  }

  // 初始化进行中：等待同一次初始化（而不是再次执行迁移）
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      // 首次访问，加载数据库（路径由存储配置决定）
      const dbPath = await buildDbPath();
      const instance = await Database.load(dbPath);
      console.log('✅ 数据库加载成功:', dbPath);

      // 初始化数据库表结构
      await initializeDatabase(instance);

      db = instance;
      return instance;
    } catch (error) {
      console.error('❌ 数据库加载失败:', error);
      // 失败时清空 promise，允许下次调用重试
      initPromise = null;
      throw new Error(`数据库初始化失败: ${error}`);
    }
  })();

  return initPromise;
}

/**
 * 初始化数据库表结构
 * 创建所有必要的表和索引
 */
async function initializeDatabase(instance: Database): Promise<void> {
  console.log('🔧 开始初始化数据库表结构...');

  try {
    // 1. 创建版本管理表
    await createVersionTable(instance);

    // 2. 检查当前数据库版本
    const currentVersion = await getDatabaseVersion(instance);
    console.log(`📊 当前数据库版本: ${currentVersion}`);

    // 3. 如果是新数据库或需要升级
    if (currentVersion < CURRENT_DB_VERSION) {
      await migrateDatabase(instance, currentVersion, CURRENT_DB_VERSION);
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
async function createVersionTable(instance: Database): Promise<void> {
  await instance.execute(`
    CREATE TABLE IF NOT EXISTS db_version (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // 如果表为空，插入初始版本
  const result = await instance.select<Array<{ count: number }>>(
    'SELECT COUNT(*) as count FROM db_version'
  );

  if (result[0].count === 0) {
    await instance.execute(
      'INSERT INTO db_version (id, version) VALUES (1, 0)'
    );
  }
}

/**
 * 获取当前数据库版本
 *
 * @returns Promise<number> 数据库版本号
 */
async function getDatabaseVersion(instance: Database): Promise<number> {
  const result = await instance.select<Array<{ version: number }>>(
    'SELECT version FROM db_version WHERE id = 1'
  );

  return result[0]?.version || 0;
}

/**
 * 数据库迁移
 * 从旧版本升级到新版本
 *
 * @param instance 数据库实例
 * @param fromVersion 当前版本
 * @param toVersion 目标版本
 */
async function migrateDatabase(instance: Database, fromVersion: number, toVersion: number): Promise<void> {
  console.log(`🔄 开始数据库迁移: v${fromVersion} -> v${toVersion}`);

  // 执行各版本的迁移脚本
  for (let version = fromVersion + 1; version <= toVersion; version++) {
    console.log(`📝 应用迁移 v${version}...`);

    switch (version) {
      case 1:
        await migrateToV1(instance);
        break;
      case 2:
        await migrateToV2(instance);
        break;
      case 3:
        await migrateToV3(instance);
        break;
      case 4:
        await migrateToV4(instance);
        break;
      case 5:
        await migrateToV5(instance);
        break;
      case 6:
        await migrateToV6(instance);
        break;
      default:
        throw new Error(`未知的迁移版本: ${version}`);
    }

    // 更新版本号
    await instance.execute(
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
async function migrateToV1(instance: Database): Promise<void> {


  // ========================================
  // 1. 创建作品表 (works)
  // ========================================
  await instance.execute(`
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
  await instance.execute(`
    CREATE INDEX IF NOT EXISTS idx_works_type
    ON works(type)
  `);

  // 创建索引：加速按创建时间排序
  await instance.execute(`
    CREATE INDEX IF NOT EXISTS idx_works_created_at
    ON works(created_at DESC)
  `);

  // ========================================
  // 2. 创建章节表 (chapters)
  // ========================================
  await instance.execute(`
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
  await instance.execute(`
    CREATE INDEX IF NOT EXISTS idx_chapters_work_id
    ON chapters(work_id)
  `);

  // 创建索引：加速章节排序
  await instance.execute(`
    CREATE INDEX IF NOT EXISTS idx_chapters_order
    ON chapters(work_id, chapter_order)
  `);

  // ========================================
  // 3. 创建角色表 (characters)
  // ========================================
  await instance.execute(`
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
  await instance.execute(`
    CREATE INDEX IF NOT EXISTS idx_characters_work_id
    ON characters(work_id)
  `);

  console.log('✅ V1表结构创建完成');
}

/**
 * 迁移到V2 - 创建 Planner 和 Director 视图表
 * 包括：outline_nodes, scenes, milestones, clues, conflicts, storyboards, assets
 */
async function migrateToV2(instance: Database): Promise<void> {


  // ========================================
  // 1. 创建大纲节点表 (outline_nodes)
  // ========================================
  await instance.execute(`
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

  await instance.execute(`
    CREATE INDEX IF NOT EXISTS idx_outline_nodes_work_id
    ON outline_nodes(work_id)
  `);

  await instance.execute(`
    CREATE INDEX IF NOT EXISTS idx_outline_nodes_parent_id
    ON outline_nodes(parent_id)
  `);

  // ========================================
  // 2. 创建场景表 (scenes)
  // ========================================
  await instance.execute(`
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

  await instance.execute(`
    CREATE INDEX IF NOT EXISTS idx_scenes_work_id
    ON scenes(work_id)
  `);

  // ========================================
  // 3. 创建里程碑表 (milestones)
  // ========================================
  await instance.execute(`
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

  await instance.execute(`
    CREATE INDEX IF NOT EXISTS idx_milestones_work_id
    ON milestones(work_id)
  `);

  await instance.execute(`
    CREATE INDEX IF NOT EXISTS idx_milestones_status
    ON milestones(status)
  `);

  // ========================================
  // 4. 创建伏笔表 (clues)
  // ========================================
  await instance.execute(`
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

  await instance.execute(`
    CREATE INDEX IF NOT EXISTS idx_clues_work_id
    ON clues(work_id)
  `);

  await instance.execute(`
    CREATE INDEX IF NOT EXISTS idx_clues_status
    ON clues(status)
  `);

  // ========================================
  // 5. 创建冲突点表 (conflicts)
  // ========================================
  await instance.execute(`
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

  await instance.execute(`
    CREATE INDEX IF NOT EXISTS idx_conflicts_work_id
    ON conflicts(work_id)
  `);

  await instance.execute(`
    CREATE INDEX IF NOT EXISTS idx_conflicts_type
    ON conflicts(type)
  `);

  await instance.execute(`
    CREATE INDEX IF NOT EXISTS idx_conflicts_intensity
    ON conflicts(intensity)
  `);

  // ========================================
  // 6. 创建分镜表 (storyboards)
  // ========================================
  await instance.execute(`
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

  await instance.execute(`
    CREATE INDEX IF NOT EXISTS idx_storyboards_work_id
    ON storyboards(work_id)
  `);

  await instance.execute(`
    CREATE INDEX IF NOT EXISTS idx_storyboards_chapter_id
    ON storyboards(chapter_id)
  `);

  // ========================================
  // 7. 创建素材表 (assets)
  // ========================================
  await instance.execute(`
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

  await instance.execute(`
    CREATE INDEX IF NOT EXISTS idx_assets_work_id
    ON assets(work_id)
  `);

  await instance.execute(`
    CREATE INDEX IF NOT EXISTS idx_assets_type
    ON assets(type)
  `);

  console.log('✅ V2表结构创建完成');
}

/**
 * 检查表是否存在
 */
async function tableExists(instance: Database, tableName: string): Promise<boolean> {
  const result = await instance.select<Array<{ name: string }>>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
    [tableName]
  );
  return result.length > 0;
}

/**
 * 数据库迁移 v2 -> v3
 * 修复 outline_nodes 表的 parent_id 外键约束
 *
 * 【幂等性说明】
 * 旧版本存在并发迁移 bug：outline_nodes 已被删除但 outline_nodes_new
 * 未能转正，数据库卡在中间状态。此处对残留状态做恢复处理，
 * 保证迁移可以重复执行直至成功。
 */
async function migrateToV3(instance: Database): Promise<void> {
  console.log('🔧 修复 outline_nodes 表外键约束...');

  // SQLite 不支持 ALTER TABLE ADD CONSTRAINT
  // 需要重建表

  const hasOld = await tableExists(instance, 'outline_nodes');
  const hasNew = await tableExists(instance, 'outline_nodes_new');

  if (!hasOld && hasNew) {
    // 恢复路径：此前迁移中断，旧表已删但新表未转正
    console.log('⚠️ 检测到未完成的 v3 迁移，恢复 outline_nodes_new 表...');
    await instance.execute(`DROP TABLE IF EXISTS outline_nodes`);
    await instance.execute(`ALTER TABLE outline_nodes_new RENAME TO outline_nodes`);
  } else if (hasOld && hasNew) {
    // 恢复路径：数据复制后中断，两张表并存（以旧表数据为准重做）
    console.log('⚠️ 检测到迁移残留的 outline_nodes_new 表，清理后重做迁移...');
    await instance.execute(`DROP TABLE outline_nodes_new`);

    await rebuildOutlineNodesTable(instance);
  } else if (hasOld) {
    // 正常路径：重建表以添加 parent_id 外键约束
    await rebuildOutlineNodesTable(instance);
  } else {
    // 两表都不存在：v2 迁移未执行过却进入了 v3，直接建新表
    console.log('⚠️ outline_nodes 表不存在，直接创建带外键约束的新表...');
    await createOutlineNodesTable(instance);
  }

  // 重建索引
  await instance.execute(`
    CREATE INDEX IF NOT EXISTS idx_outline_nodes_work_id
    ON outline_nodes(work_id)
  `);

  await instance.execute(`
    CREATE INDEX IF NOT EXISTS idx_outline_nodes_parent_id
    ON outline_nodes(parent_id)
  `);

  console.log('✅ outline_nodes 表外键约束修复完成');
}

/**
 * 重建 outline_nodes 表（带 parent_id 外键约束）
 * 原表数据完整迁移
 */
async function rebuildOutlineNodesTable(instance: Database): Promise<void> {
  // 1. 创建新表，添加 parent_id 外键约束
  await createOutlineNodesTable(instance, 'outline_nodes_new');

  // 2. 复制数据
  await instance.execute(`
    INSERT INTO outline_nodes_new
    SELECT * FROM outline_nodes
  `);

  // 3. 删除旧表
  await instance.execute(`DROP TABLE outline_nodes`);

  // 4. 重命名新表
  await instance.execute(`ALTER TABLE outline_nodes_new RENAME TO outline_nodes`);
}

/**
 * 创建 outline_nodes 表
 *
 * @param instance 数据库实例
 * @param tableName 表名（默认 outline_nodes，重建时传 outline_nodes_new）
 */
async function createOutlineNodesTable(instance: Database, tableName = 'outline_nodes'): Promise<void> {
  await instance.execute(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
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
      FOREIGN KEY (parent_id) REFERENCES ${tableName}(id) ON DELETE CASCADE
    )
  `);
}

/**
 * 数据库迁移 v3 -> v4
 * 为所有表添加 version 字段，实现乐观锁（并发控制）
 */
async function migrateToV4(instance: Database): Promise<void> {
  console.log('🔧 添加 version 字段与章节版本快照表...');

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
      await instance.execute(`
        ALTER TABLE ${table}
        ADD COLUMN version INTEGER NOT NULL DEFAULT 1
      `);
      console.log(`  ✅ ${table} 表添加 version 字段成功`);
    } catch (error) {
      // 如果字段已存在，忽略错误
      console.log(`  ⚠️ ${table} 表可能已有 version 字段，跳过`);
    }
  }

  // 章节版本快照表（手动/关键操作前自动保存，支持恢复）
  await instance.execute(`
    CREATE TABLE IF NOT EXISTS chapter_versions (
      id TEXT PRIMARY KEY NOT NULL,
      chapter_id TEXT NOT NULL,
      work_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      word_count INTEGER NOT NULL DEFAULT 0,
      label TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
      FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
    )
  `);

  await instance.execute(`
    CREATE INDEX IF NOT EXISTS idx_chapter_versions_chapter
    ON chapter_versions(chapter_id, created_at DESC)
  `);

  console.log('✅ v4 迁移完成（乐观锁 + 章节版本快照）');
}

/**
 * 数据库迁移 v4 -> v5
 * 投递台账：记录章节向各平台（起点/番茄）的投递历史
 */
async function migrateToV5(instance: Database): Promise<void> {
  console.log('🔧 创建投递台账表...');

  await instance.execute(`
    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY NOT NULL,
      work_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      platform TEXT NOT NULL CHECK (platform IN ('qidian', 'fanqie')),
      chapter_title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'submitted',
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE,
      FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
    )
  `);

  await instance.execute(`
    CREATE INDEX IF NOT EXISTS idx_submissions_work
    ON submissions(work_id, created_at DESC)
  `);

  // world_settings 表此前由前端服务懒创建，纳入迁移保证 API/全新环境可用
  await instance.execute(`
    CREATE TABLE IF NOT EXISTS world_settings (
      id TEXT PRIMARY KEY NOT NULL,
      work_id TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'location',
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      icon_type TEXT,
      icon_color TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      related_characters TEXT NOT NULL DEFAULT '[]',
      related_settings TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0
    )
  `);

  console.log('✅ v5 迁移完成（投递台账 + world_settings 兜底）');
}

/**
 * 数据库迁移 v5 -> v6
 * chapters.summary：章节记忆摘要。
 * AI 摘要动作的结果落库，作为后续章节续写/审稿时"前情记忆链"的数据源
 * （参考 SillyTavern/KoboldAI 的滚动记忆与 inkos 的状态投影思想）
 */
async function migrateToV6(instance: Database): Promise<void> {
  console.log('🔧 为 chapters 添加 summary 记忆列...');

  // SQLite ALTER TABLE 无 IF NOT EXISTS，先查列是否存在
  const columns = await instance.select<Array<{ name: string }>>(
    `PRAGMA table_info(chapters)`
  );
  if (!columns.some((c) => c.name === 'summary')) {
    await instance.execute(
      `ALTER TABLE chapters ADD COLUMN summary TEXT NOT NULL DEFAULT ''`
    );
    console.log('  ✅ chapters.summary 已添加');
  } else {
    console.log('  ℹ️ chapters.summary 已存在，跳过');
  }

  console.log('✅ v6 迁移完成（章节记忆摘要列）');
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


/**
 * 重置数据库连接（不关闭——供存储迁移后强制下次重新加载新路径用）
 * 迁移流程：先 closeDatabase() 落盘，移动文件，再调用本函数清空缓存
 */
export function resetDatabaseConnection(): void {
  db = null;
  initPromise = null;
  console.log('♻️ 数据库连接缓存已重置（下次 getDatabase 按新存储路径加载）');
}
