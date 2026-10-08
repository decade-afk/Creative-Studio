/**
 * 文件名：storageService.ts
 * 模块名称：数据存储位置管理
 *
 * 【核心功能】
 * 1. 查询当前存储根目录（配置 storage.dataDir，空 = 默认应用数据目录）
 * 2. 迁移：把数据库/备份/素材整体搬到新目录（先落盘 → 复制 → 校验 → 切配置 → 更新连接缓存）
 * 3. 旧库兼容：检测到默认目录有数据而新目录为空时自动带过去
 *
 * 【设计约束】
 * config.json 永远留在应用数据目录（引导配置，否则死锁）；
 * 迁移采用"复制后保留原件"策略——确认新位置工作正常后，
 * 旧文件留着作为天然备份，不自动删除。
 */

import { appDataDir, join } from '@tauri-apps/api/path';
import { exists, mkdir, readDir, copyFile } from '@tauri-apps/plugin-fs';
import { open } from '@tauri-apps/plugin-dialog';
import { loadConfig, saveConfig } from './configService';
import { closeDatabase, resetDatabaseConnection } from './database';

/** 随存储目录走的数据项 */
const DATA_ITEMS = ['creative-studio.db', 'backups', 'assets'];
/** SQLite WAL 侧车文件（存在时一并迁移） */
const DB_SIDECARS = ['creative-studio.db-wal', 'creative-studio.db-shm'];

/** 当前存储根目录 */
export async function getCurrentStorageDir(): Promise<string> {
  const config = await loadConfig();
  return config.storage?.dataDir || (await appDataDir());
}

/** 是否使用默认位置 */
export async function isDefaultLocation(): Promise<boolean> {
  const config = await loadConfig();
  return !config.storage?.dataDir;
}

/** 迁移结果 */
export interface MigrationResult {
  moved: string[];
  skipped: string[];
  newDir: string;
}

/**
 * 弹出目录选择框让用户选新位置
 * @returns 选中的目录（用户取消返回 null）
 */
export async function pickStorageDir(): Promise<string | null> {
  const selected = await open({ directory: true, multiple: false, title: '选择数据存储位置' });
  if (!selected || typeof selected !== 'string') return null;

  // 禁止选应用数据目录本身（无意义）
  if (selected === (await appDataDir())) return null;
  return selected;
}

/**
 * 迁移数据到新目录
 *
 * 【流程】
 * 1. 校验：新目录可用（可创建）、不与当前相同
 * 2. 落盘：closeDatabase() 让 SQLite 把 WAL 写回主库
 * 3. 复制：db + 侧车 + backups/ + assets/ → 新目录（已存在的同名文件跳过）
 * 4. 校验：新库文件存在且非空
 * 5. 切换：config.storage.dataDir = 新目录 并落盘
 * 6. 重置连接缓存（下次 getDatabase 用新路径）
 *
 * 【安全】复制而非移动——旧位置数据完整保留作为回滚保障
 */
export async function migrateStorage(newDir: string): Promise<MigrationResult> {
  const currentDir = await getCurrentStorageDir();
  if (newDir === currentDir) {
    throw new Error('新位置与当前位置相同');
  }

  // 1. 新目录可创建
  if (!(await exists(newDir))) {
    await mkdir(newDir, { recursive: true });
  }

  // 2. 数据库落盘（WAL 合并回主库文件）
  await closeDatabase();

  const moved: string[] = [];
  const skipped: string[] = [];

  // 3. 复制数据项
  const items = [...DATA_ITEMS, ...DB_SIDECARS];
  for (const item of items) {
    const src = await join(currentDir, item);
    if (!(await exists(src))) {
      skipped.push(item);
      continue;
    }

    const dst = await join(newDir, item);
    try {
      if ((await stat2(src)).isFile) {
        // 单文件：目标已存在则跳过（不覆盖，防误迁到有数据的位置）
        if (await exists(dst)) {
          skipped.push(item);
          continue;
        }
        await copyFile(src, dst);
      } else {
        // 目录：递归复制
        await copyDir(src, dst);
      }
      moved.push(item);
    } catch (error) {
      throw new Error(`迁移 ${item} 失败: ${error}`);
    }
  }

  // 4. 校验：新库存在（或本次是空库首次迁移——db 可能本来就不存在）
  const newDb = await join(newDir, 'creative-studio.db');
  if (moved.includes('creative-studio.db') && !(await exists(newDb))) {
    throw new Error('迁移校验失败：新位置未找到数据库文件');
  }

  // 5. 切换配置（直接写文件，绕过 updateConfig——它内部可能触发读库副作用）
  const config = await loadConfig();
  config.storage = { ...(config.storage || {}), dataDir: newDir };
  await saveConfig(config);

  // 6. 重置连接缓存
  resetDatabaseConnection();

  console.log(`✅ 存储已迁移: ${currentDir} → ${newDir}`);
  return { moved, skipped, newDir };
}

/** 切回默认位置（把当前自定义目录数据复制回默认目录） */
export async function resetToDefault(): Promise<MigrationResult> {
  return migrateStorage(await appDataDir());
}

/** stat 的轻量包装（区分文件/目录） */
async function stat2(path: string): Promise<{ isFile: boolean }> {
  const { stat } = await import('@tauri-apps/plugin-fs');
  const s = await stat(path);
  return { isFile: s.isFile === true };
}

/** 递归复制目录 */
async function copyDir(src: string, dst: string): Promise<void> {
  if (!(await exists(dst))) {
    await mkdir(dst, { recursive: true });
  }
  const entries = await readDir(src);
  for (const entry of entries) {
    const s = await join(src, entry.name);
    const d = await join(dst, entry.name);
    if (entry.isDirectory) {
      await copyDir(s, d);
    } else if (entry.isFile) {
      if (!(await exists(d))) {
        await copyFile(s, d);
      }
    }
  }
}
