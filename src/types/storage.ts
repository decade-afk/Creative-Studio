/**
 * 本地存储数据类型定义
 *
 * 这些类型定义设计时考虑了未来与云数据库的同步：
 * - 每个实体都有 id、created_at、updated_at
 * - 添加了 synced_at 字段用于云同步标记
 * - 使用 UUID 作为主键，避免主键冲突
 */

/**
 * 作品类型
 * script: 短剧剧本
 * novel: 小说
 */
export type WorkType = 'script' | 'novel';

/**
 * 作品数据结构
 * 主实体：表示一个创作项目
 */
export interface Work {
  /** 唯一标识符 (UUID) */
  id: string;

  /** 作品标题 */
  title: string;

  /** 作品类型 */
  type: WorkType;

  /** 图标 emoji */
  icon: string;

  /** 作品描述 */
  description?: string;

  /** 创建时间 (ISO 8601) */
  created_at: string;

  /** 最后更新时间 (ISO 8601) */
  updated_at: string;

  /** 最后同步到云端的时间 (ISO 8601) - null表示从未同步 */
  synced_at: string | null;

  /** 是否已删除（软删除） */
  deleted: boolean;
}

/**
 * 章节数据结构
 * 子实体：隶属于某个作品
 */
export interface Chapter {
  /** 唯一标识符 (UUID) */
  id: string;

  /** 所属作品ID */
  work_id: string;

  /** 章节标题 */
  title: string;

  /** 章节内容 (HTML) */
  content: string;

  /** 章节顺序（从1开始） */
  order: number;

  /** 章节记忆摘要（AI 生成，用于后续章节的前情上下文） */
  summary: string;

  /** 创建时间 (ISO 8601) */
  created_at: string;

  /** 最后更新时间 (ISO 8601) */
  updated_at: string;

  /** 最后同步到云端的时间 (ISO 8601) */
  synced_at: string | null;

  /** 是否已删除（软删除） */
  deleted: boolean;
}

/**
 * 角色数据结构
 * 子实体：隶属于某个作品
 */
export interface Character {
  /** 唯一标识符 (UUID) */
  id: string;

  /** 所属作品ID */
  work_id: string;

  /** 角色名称 */
  name: string;

  /** 角色描述 */
  description: string;

  /** 角色头像URL或emoji */
  avatar?: string;

  /** 角色性格 */
  personality?: string;

  /** 角色关系 */
  relationships?: string;

  /** 创建时间 (ISO 8601) */
  created_at: string;

  /** 最后更新时间 (ISO 8601) */
  updated_at: string;

  /** 最后同步到云端的时间 (ISO 8601) */
  synced_at: string | null;

  /** 是否已删除（软删除） */
  deleted: boolean;
}

/**
 * 本地存储数据库结构
 * 包含所有实体的集合
 */
export interface LocalDatabase {
  /** 作品列表 */
  works: Work[];

  /** 章节列表 */
  chapters: Chapter[];

  /** 角色列表 */
  characters: Character[];

  /** 大纲节点列表（Planner） */
  outlineNodes: OutlineNode[];

  /** 场景列表（Planner） */
  scenes: Scene[];

  /** 里程碑列表（Planner） */
  milestones: Milestone[];

  /** 伏笔线索列表（Director） */
  clues: Clue[];

  /** 冲突点列表（Director） */
  conflicts: Conflict[];

  /** 分镜列表（Director） */
  storyboards: Storyboard[];

  /** 素材列表（Director） */
  assets: Asset[];

  /** 数据库版本号 */
  version: number;

  /** 最后修改时间 */
  last_modified: string;
}

/**
 * 云同步状态
 * 用于追踪本地数据与云端的同步状态
 */
export interface SyncStatus {
  /** 未同步的作品数量 */
  unsyncedWorks: number;

  /** 未同步的章节数量 */
  unsyncedChapters: number;

  /** 未同步的角色数量 */
  unsyncedCharacters: number;

  /** 最后同步时间 */
  lastSyncTime: string | null;

  /** 同步状态 */
  status: 'idle' | 'syncing' | 'error';

  /** 错误信息 */
  error?: string;
}

/**
 * ========== PlannerView 数据结构 ==========
 */

/**
 * 大纲节点数据结构
 * 用于故事大纲的层级结构管理
 */
export interface OutlineNode {
  /** 唯一标识符 (UUID) */
  id: string;

  /** 所属作品ID */
  work_id: string;

  /** 父节点ID（顶层节点为null） */
  parent_id: string | null;

  /** 标题 */
  title: string;

  /** 描述 */
  description: string;

  /** 顺序（同级排序） */
  order: number;

  /** 节点类型 */
  type: 'act' | 'scene' | 'event';

  /** 创建时间 (ISO 8601) */
  created_at: string;

  /** 最后更新时间 (ISO 8601) */
  updated_at: string;

  /** 最后同步到云端的时间 (ISO 8601) */
  synced_at: string | null;

  /** 是否已删除（软删除） */
  deleted: boolean;
}

/**
 * 场景数据结构
 * 用于故事场景管理
 */
export interface Scene {
  /** 唯一标识符 (UUID) */
  id: string;

  /** 所属作品ID */
  work_id: string;

  /** 场景名称 */
  name: string;

  /** 场景描述 */
  description: string;

  /** 地点 */
  location: string;

  /** 时间（早晨、中午、傍晚、夜晚） */
  time_of_day: 'morning' | 'noon' | 'evening' | 'night' | 'other';

  /** 场景氛围标签 */
  mood?: string;

  /** 创建时间 (ISO 8601) */
  created_at: string;

  /** 最后更新时间 (ISO 8601) */
  updated_at: string;

  /** 最后同步到云端的时间 (ISO 8601) */
  synced_at: string | null;

  /** 是否已删除（软删除） */
  deleted: boolean;
}

/**
 * 里程碑数据结构
 * 用于项目进度管理
 */
export interface Milestone {
  /** 唯一标识符 (UUID) */
  id: string;

  /** 所属作品ID */
  work_id: string;

  /** 里程碑标题 */
  title: string;

  /** 描述 */
  description: string;

  /** 截止日期 (ISO 8601) */
  due_date: string | null;

  /** 状态 */
  status: 'pending' | 'in_progress' | 'completed';

  /** 创建时间 (ISO 8601) */
  created_at: string;

  /** 最后更新时间 (ISO 8601) */
  updated_at: string;

  /** 最后同步到云端的时间 (ISO 8601) */
  synced_at: string | null;

  /** 是否已删除（软删除） */
  deleted: boolean;
}

/**
 * ========== DirectorView 数据结构 ==========
 */

/**
 * 伏笔来源类型
 */
export type ClueSource = 'ai_detected' | 'manual';

/**
 * 伏笔状态
 */
export type ClueStatus = 'open' | 'resolved';

/**
 * 伏笔线索数据结构
 * 用于追踪剧情伏笔和回收
 */
export interface Clue {
  /** 唯一标识符 (UUID) */
  id: string;

  /** 所属作品ID */
  work_id: string;

  /** 伏笔名称 */
  name: string;

  /** 来源（AI检测/手动标记） */
  source: ClueSource;

  /** 状态（未解决/已解决） */
  status: ClueStatus;

  /** 埋下伏笔的场景ID */
  setup_scene_id: string | null;

  /** 回收伏笔的场景ID */
  payoff_scene_id: string | null;

  /** 描述 */
  description: string;

  /** 创建时间 (ISO 8601) */
  created_at: string;

  /** 最后更新时间 (ISO 8601) */
  updated_at: string;

  /** 最后同步到云端的时间 (ISO 8601) */
  synced_at: string | null;

  /** 是否已删除（软删除） */
  deleted: boolean;
}

/**
 * 冲突类型
 */
export type ConflictType = 'character' | 'environment' | 'internal' | 'social';

/**
 * 冲突强度
 */
export type ConflictIntensity = 'low' | 'medium' | 'high' | 'critical';

/**
 * 冲突状态
 */
export type ConflictStatus = 'active' | 'escalating' | 'resolving' | 'resolved';

/**
 * 冲突点数据结构
 * 用于剧情冲突管理和分析
 */
export interface Conflict {
  /** 唯一标识符 (UUID) */
  id: string;

  /** 所属作品ID */
  work_id: string;

  /** 冲突名称 */
  name: string;

  /** 冲突类型 */
  type: ConflictType;

  /** 冲突强度 */
  intensity: ConflictIntensity;

  /** 涉及角色（逗号分隔） */
  characters: string;

  /** 所属场景ID */
  scene_id: string | null;

  /** 冲突描述 */
  description: string;

  /** 解决方案 */
  resolution: string;

  /** 状态 */
  status: ConflictStatus;

  /** 创建时间 (ISO 8601) */
  created_at: string;

  /** 最后更新时间 (ISO 8601) */
  updated_at: string;

  /** 最后同步到云端的时间 (ISO 8601) */
  synced_at: string | null;

  /** 是否已删除（软删除） */
  deleted: boolean;
}

/**
 * 分镜类型
 */
export type ShotType = 'wide' | 'medium' | 'close' | 'extreme_close';

/**
 * 镜头运动类型
 */
export type CameraMovement = 'static' | 'pan' | 'tilt' | 'zoom' | 'dolly' | 'crane';

/**
 * 分镜数据结构
 * 用于视频分镜脚本管理
 */
export interface Storyboard {
  /** 唯一标识符 (UUID) */
  id: string;

  /** 所属作品ID */
  work_id: string;

  /** 所属章节ID（可选） */
  chapter_id: string | null;

  /** 所属场景ID（可选） */
  scene_id: string | null;

  /** 分镜标题 */
  title: string;

  /** 分镜描述 */
  description: string;

  /** 镜头类型 */
  shot_type: ShotType;

  /** 镜头运动 */
  camera_movement: CameraMovement;

  /** 时长（秒） */
  duration: number;

  /** 顺序 */
  order: number;

  /** 缩略图URL（可选） */
  thumbnail_url?: string;

  /** 创建时间 (ISO 8601) */
  created_at: string;

  /** 最后更新时间 (ISO 8601) */
  updated_at: string;

  /** 最后同步到云端的时间 (ISO 8601) */
  synced_at: string | null;

  /** 是否已删除（软删除） */
  deleted: boolean;
}

/**
 * 素材类型
 */
export type AssetType = 'image' | 'video' | 'audio' | 'document';

/**
 * 素材数据结构
 * 用于素材库管理
 */
export interface Asset {
  /** 唯一标识符 (UUID) */
  id: string;

  /** 所属作品ID */
  work_id: string;

  /** 素材名称 */
  name: string;

  /** 素材类型 */
  type: AssetType;

  /** 文件路径（本地）或URL（云端） */
  file_path: string;

  /** 文件大小（字节） */
  file_size: number;

  /** MIME类型 */
  mime_type: string;

  /** 标签（用于分类） */
  tags: string[];

  /** 创建时间 (ISO 8601) */
  created_at: string;

  /** 最后更新时间 (ISO 8601) */
  updated_at: string;

  /** 最后同步到云端的时间 (ISO 8601) */
  synced_at: string | null;

  /** 是否已删除（软删除） */
  deleted: boolean;
}
