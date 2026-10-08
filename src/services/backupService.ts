/**
 * 文件名：backupService.ts
 * 模块名称：数据备份服务
 *
 * 【核心功能】
 * 1. 在线备份 - 使用 SQLite 的 VACUUM INTO 生成一致性快照，无需停止应用
 * 2. 备份管理 - 列出、删除备份文件，按配置保留最近 N 个
 * 3. 数据恢复 - 关闭数据库连接后原子替换数据库文件
 * 4. 自动调度 - 按配置的间隔自动备份（应用启动时补齐错过的备份）
 *
 * 【备份位置】
 * - {appDataDir}/backups/creative-studio-YYYYMMDD-HHmmss.db
 *
 * 【设计说明】
 * - VACUUM INTO 是 SQLite 官方的在线备份方式：
 *   即使有活跃连接也能得到完整一致的单文件快照，自动包含 WAL 内容
 * - VACUUM INTO 的目标路径不支持参数绑定，只能内联到 SQL 中，
 *   因此必须对路径做转义（单引号翻倍、反斜杠转正斜杠）
 * - 恢复流程：先复制到临时文件校验完整性，再关闭连接、替换主库，
 *   避免替换失败导致备份和主库同时损坏
 */

import { join } from '@tauri-apps/api/path';
import { copyFile, exists, mkdir, readDir, remove, rename, stat } from '@tauri-apps/plugin-fs';
import { closeDatabase, getDatabase } from './database';
import { loadConfig, updateConfig, getStorageDir } from './configService';

// ============================================================================
// 常量
// ============================================================================

/** 主数据库文件名（与 database.ts 中 DB_PATH 对应） */
const DB_FILE_NAME = 'creative-studio.db';

/** 备份目录名（位于应用数据目录下） */
const BACKUP_DIR_NAME = 'backups';

/** 备份文件名前缀 */
const BACKUP_PREFIX = 'creative-studio-';

// ============================================================================
// 类型定义
// ============================================================================

/** 备份文件信息 */
export interface BackupInfo {
  /** 文件名（不含路径），如 creative-studio-20260107-153000.db */
  name: string;
  /** 完整路径 */
  path: string;
  /** 文件大小（字节） */
  size: number;
}

// ============================================================================
// 路径辅助
// ============================================================================

/**
 * 获取备份目录（不存在则创建）
 *
 * @returns 备份目录完整路径
 */
async function getBackupDir(): Promise<string> {
  const dir = await join(await getStorageDir(), BACKUP_DIR_NAME);
  if (!(await exists(dir))) {
    await mkdir(dir, { recursive: true });
  }
  return dir;
}

/**
 * 生成备份文件名中的时间戳部分
 *
 * 【格式】YYYYMMDD-HHmmss（按文件名排序即按时间排序）
 */
function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/**
 * 将文件大小格式化为可读字符串
 *
 * @param bytes 文件大小（字节）
 */
export function formatBackupSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * 从备份文件名解析创建时间
 *
 * @returns Date 对象；解析失败返回 null
 */
export function parseBackupDate(name: string): Date | null {
  const match = name.match(/(\d{8})-(\d{6})/);
  if (!match) return null;
  const [, ymd, hms] = match;
  const year = Number(ymd.slice(0, 4));
  const month = Number(ymd.slice(4, 6)) - 1;
  const day = Number(ymd.slice(6, 8));
  const hour = Number(hms.slice(0, 2));
  const minute = Number(hms.slice(2, 4));
  const second = Number(hms.slice(4, 6));
  const date = new Date(year, month, day, hour, minute, second);
  return Number.isNaN(date.getTime()) ? null : date;
}

// ============================================================================
// 备份核心操作
// ============================================================================

/**
 * 创建备份
 *
 * 【执行流程】
 * 1. 确保备份目录存在
 * 2. VACUUM INTO 生成一致性快照（目标已存在时先删除，容忍同一秒内的重复调用）
 * 3. 按配置的 keepCount 清理超出数量的旧备份
 * 4. 将 lastBackupAt 写入配置文件
 *
 * @returns 新创建的备份信息
 * @throws 数据库错误或文件系统错误时抛出
 */
export async function createBackup(): Promise<BackupInfo> {
  const db = await getDatabase();
  const dir = await getBackupDir();

  const name = `${BACKUP_PREFIX}${formatTimestamp(new Date())}.db`;
  const path = await join(dir, name);

  // VACUUM INTO 要求目标文件不存在；同一秒内重复备份时先移除旧目标
  if (await exists(path)) {
    await remove(path);
  }

  // 路径内联进 SQL：单引号翻倍转义，反斜杠转正斜杠（SQLite 兼容）
  const escapedPath = path.replace(/\\/g, '/').replace(/'/g, "''");
  await db.execute(`VACUUM INTO '${escapedPath}'`);

  const fileStat = await stat(path);
  const info: BackupInfo = { name, path, size: fileStat.size };

  // 更新配置中的备份时间，并按保留数量清理旧备份
  const config = await loadConfig();
  await updateConfig({
    backup: { ...config.backup, lastBackupAt: new Date().toISOString() },
  });
  await enforceRetention(config.backup.keepCount);

  console.log(`✅ 备份创建成功: ${name} (${formatBackupSize(info.size)})`);
  return info;
}

/**
 * 列出所有备份（按时间倒序，最新的在前）
 */
export async function listBackups(): Promise<BackupInfo[]> {
  const dir = await getBackupDir();
  const entries = await readDir(dir);

  const backups: BackupInfo[] = [];
  for (const entry of entries) {
    if (!entry.isFile || !entry.name.endsWith('.db')) continue;
    const path = await join(dir, entry.name);
    const fileStat = await stat(path);
    backups.push({ name: entry.name, path, size: fileStat.size });
  }

  // 文件名以时间戳编码，字典序倒序即时间倒序
  backups.sort((a, b) => b.name.localeCompare(a.name));
  return backups;
}

/**
 * 删除指定备份
 *
 * @param name 备份文件名
 */
export async function deleteBackup(name: string): Promise<void> {
  const dir = await getBackupDir();
  const path = await join(dir, name);
  if (!(await exists(path))) {
    throw new Error(`备份不存在: ${name}`);
  }
  await remove(path);
  console.log(`🗑️ 备份已删除: ${name}`);
}

/**
 * 按保留数量清理旧备份
 *
 * @param keepCount 保留的备份数量
 */
async function enforceRetention(keepCount: number): Promise<void> {
  if (keepCount < 1) return;
  const backups = await listBackups();
  const excess = backups.slice(keepCount);
  for (const backup of excess) {
    await remove(backup.path);
    console.log(`🗑️ 超出保留数量，删除旧备份: ${backup.name}`);
  }
}

/**
 * 从备份恢复数据库
 *
 * 【执行流程】
 * 1. 关闭当前数据库连接
 * 2. 备份文件先复制为 .restoring 临时文件（校验来源可读）
 * 3. 删除主库及可能存在的 WAL/SHM 侧车文件
 * 4. 临时文件重命名为主库文件
 *
 * 【重要】
 * 恢复完成后内存中的作品/章节数据已失效，调用方必须重启应用
 * （window.location.reload()）让 store 重新初始化
 *
 * @param name 备份文件名
 */
export async function restoreBackup(name: string): Promise<void> {
  const dir = await getBackupDir();
  const sourcePath = await join(dir, name);
  if (!(await exists(sourcePath))) {
    throw new Error(`备份不存在: ${name}`);
  }

  // 1. 关闭数据库连接，释放文件句柄
  await closeDatabase();

  const dbPath = await join(await getStorageDir(), DB_FILE_NAME);
  const restoringPath = `${dbPath}.restoring`;

  try {
    // 2. 先复制到临时文件（此时任何失败都不影响现有数据）
    if (await exists(restoringPath)) {
      await remove(restoringPath);
    }
    await copyFile(sourcePath, restoringPath);

    // 3. 移除主库及 WAL/SHM 侧车文件（残留的 WAL 会导致恢复后数据错乱）
    for (const file of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
      if (await exists(file)) {
        await remove(file);
      }
    }

    // 4. 临时文件转正
    await rename(restoringPath, dbPath);
    console.log(`✅ 已从备份恢复数据库: ${name}`);
  } catch (error) {
    // 恢复中途失败时清理临时文件；主库状态交由上层提示用户
    if (await exists(restoringPath)) {
      await remove(restoringPath).catch(() => undefined);
    }
    throw error;
  }
}

// ============================================================================
// 自动备份调度
// ============================================================================

/** 定时器句柄（null 表示调度器未运行） */
let schedulerTimer: ReturnType<typeof setInterval> | null = null;

/**
 * 停止自动备份调度器
 */
export function stopAutoBackupScheduler(): void {
  if (schedulerTimer !== null) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    console.log('⏹️ 自动备份调度器已停止');
  }
}

/**
 * 启动（或重启）自动备份调度器
 *
 * 【执行流程】
 * 1. 停止已有调度器（幂等，可安全重复调用）
 * 2. 读取配置；未启用则直接返回
 * 3. 启动时检查：距上次备份已超过间隔（或从未备份）则立即补一次
 * 4. 按间隔注册定时备份
 *
 * 配置变更后重新调用本函数即可应用新设置。
 */
export async function startAutoBackupScheduler(): Promise<void> {
  stopAutoBackupScheduler();

  const config = await loadConfig();
  if (!config.backup.enabled) {
    console.log('ℹ️ 自动备份未启用');
    return;
  }

  const intervalMs = Math.max(1, config.backup.interval) * 60 * 60 * 1000;

  // 启动补齐：错过间隔（或从未备份）时立即执行一次
  const lastBackupMs = config.backup.lastBackupAt
    ? Date.parse(config.backup.lastBackupAt)
    : 0;
  if (Number.isNaN(lastBackupMs) || Date.now() - lastBackupMs >= intervalMs) {
    try {
      await createBackup();
    } catch (error) {
      console.error('❌ 启动备份失败（将在下个周期重试）:', error);
    }
  }

  schedulerTimer = setInterval(() => {
    createBackup().catch((error) => {
      console.error('❌ 自动备份失败:', error);
    });
  }, intervalMs);

  console.log(
    `⏱️ 自动备份调度器已启动（每 ${config.backup.interval} 小时，保留 ${config.backup.keepCount} 个）`
  );
}
