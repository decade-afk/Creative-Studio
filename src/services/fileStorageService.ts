/**
 * 文件存储管理服务
 *
 * 负责：
 * 1. 资源文件的物理存储管理
 * 2. 文件路径规范化
 * 3. 文件复制、移动、删除
 * 4. 存储空间统计
 *
 * 存储结构：
 * %APPDATA%/com.creativestudio.desktop/
 * ├── creative-studio.db          # SQLite 数据库
 * ├── config.json                 # 用户配置
 * └── assets/                     # 资源文件目录
 *     ├── images/                 # 图片资源
 *     │   ├── <work_id>/
 *     │   │   └── <file_id>.ext
 *     ├── videos/                 # 视频资源
 *     │   ├── <work_id>/
 *     │   │   └── <file_id>.ext
 *     ├── audio/                  # 音频资源
 *     │   ├── <work_id>/
 *     │   │   └── <file_id>.ext
 *     └── documents/              # 文档资源
 *         ├── <work_id>/
 *         │   └── <file_id>.ext
 */

import { appDataDir, join } from '@tauri-apps/api/path';
import {
  exists,
  mkdir,
  copyFile,
  remove,
  readDir,
  stat,
} from '@tauri-apps/plugin-fs';
import { open, save } from '@tauri-apps/plugin-dialog';
import { generateUUID } from './database';
import type { Asset, AssetType } from '../types/storage';
import { createAsset, deleteAsset } from './assetService';

/**
 * 资源根目录
 */
const ASSETS_DIR = 'assets';

/**
 * 资源类型对应的子目录
 */
const ASSET_TYPE_DIRS: Record<AssetType, string> = {
  image: 'images',
  video: 'videos',
  audio: 'audio',
  document: 'documents',
};

/**
 * 支持的文件类型
 */
const SUPPORTED_EXTENSIONS: Record<AssetType, string[]> = {
  image: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'],
  video: ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.mkv', '.webm'],
  audio: ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'],
  document: ['.pdf', '.doc', '.docx', '.txt', '.md', '.rtf'],
};

/**
 * MIME 类型映射
 */
const MIME_TYPE_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.wmv': 'video/x-ms-wmv',
  '.flv': 'video/x-flv',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.rtf': 'application/rtf',
};

/**
 * 获取资源根目录路径
 */
async function getAssetsDir(): Promise<string> {
  // appDataDir() 不带尾部分隔符，必须用 join 拼接
  return await join(await appDataDir(), ASSETS_DIR);
}

/**
 * 获取指定类型资源的目录路径
 */
async function getAssetTypeDir(type: AssetType): Promise<string> {
  const assetsDir = await getAssetsDir();
  return `${assetsDir}/${ASSET_TYPE_DIRS[type]}`;
}

/**
 * 获取作品资源目录
 */
async function getWorkAssetsDir(workId: string, type: AssetType): Promise<string> {
  const typeDir = await getAssetTypeDir(type);
  return `${typeDir}/${workId}`;
}

/**
 * 确保资源目录存在
 */
async function ensureAssetsDirStructure(): Promise<void> {
  const assetsDir = await getAssetsDir();

  // 创建根目录
  if (!(await exists(assetsDir))) {
    await mkdir(assetsDir, { recursive: true });
    console.log('✅ 创建资源根目录:', assetsDir);
  }

  // 创建各类型子目录
  for (const type of Object.keys(ASSET_TYPE_DIRS) as AssetType[]) {
    const typeDir = await getAssetTypeDir(type);
    if (!(await exists(typeDir))) {
      await mkdir(typeDir, { recursive: true });
      console.log(`✅ 创建 ${type} 资源目录:`, typeDir);
    }
  }
}

/**
 * 确保作品资源目录存在
 */
async function ensureWorkAssetDir(workId: string, type: AssetType): Promise<void> {
  const workDir = await getWorkAssetsDir(workId, type);
  if (!(await exists(workDir))) {
    await mkdir(workDir, { recursive: true });
    console.log(`✅ 创建作品 ${workId} 的 ${type} 资源目录`);
  }
}

/**
 * 从文件扩展名推断资源类型
 */
function inferAssetType(filePath: string): AssetType | null {
  const ext = getFileExtension(filePath).toLowerCase();

  for (const [type, extensions] of Object.entries(SUPPORTED_EXTENSIONS)) {
    if (extensions.includes(ext)) {
      return type as AssetType;
    }
  }

  return null;
}

/**
 * 获取文件扩展名
 */
function getFileExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf('.');
  return lastDot > -1 ? filePath.substring(lastDot) : '';
}

/**
 * 获取文件名（不含扩展名）
 */
function getFileNameWithoutExtension(filePath: string): string {
  const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  const fileName = lastSlash > -1 ? filePath.substring(lastSlash + 1) : filePath;
  const lastDot = fileName.lastIndexOf('.');
  return lastDot > -1 ? fileName.substring(0, lastDot) : fileName;
}

/**
 * 获取 MIME 类型
 */
function getMimeType(filePath: string): string {
  const ext = getFileExtension(filePath).toLowerCase();
  return MIME_TYPE_MAP[ext] || 'application/octet-stream';
}

/**
 * 导入资源文件
 * 将外部文件复制到应用资源目录，并创建数据库记录
 *
 * @param workId 作品ID
 * @param sourcePath 源文件路径
 * @param name 资源名称（可选，默认使用文件名）
 * @param tags 标签列表
 * @returns Promise<Asset> 创建的资源记录
 */
export async function importAsset(
  workId: string,
  sourcePath: string,
  name?: string,
  tags: string[] = []
): Promise<Asset> {
  // 确保资源目录存在
  await ensureAssetsDirStructure();

  // 检查源文件是否存在
  if (!(await exists(sourcePath))) {
    throw new Error(`源文件不存在: ${sourcePath}`);
  }

  // 推断资源类型
  const type = inferAssetType(sourcePath);
  if (!type) {
    const ext = getFileExtension(sourcePath);
    throw new Error(`不支持的文件类型: ${ext}`);
  }

  // 确保作品资源目录存在
  await ensureWorkAssetDir(workId, type);

  // 生成新的文件ID和路径
  const fileId = generateUUID();
  const ext = getFileExtension(sourcePath);
  const workDir = await getWorkAssetsDir(workId, type);
  const destPath = `${workDir}/${fileId}${ext}`;

  // 复制文件
  await copyFile(sourcePath, destPath);
  console.log(`✅ 文件复制成功: ${sourcePath} -> ${destPath}`);

  // 获取文件信息
  const fileInfo = await stat(destPath);
  const fileSize = fileInfo.size;

  // 创建数据库记录
  const assetName = name || getFileNameWithoutExtension(sourcePath);
  const mimeType = getMimeType(sourcePath);

  const asset = await createAsset({
    work_id: workId,
    name: assetName,
    type,
    file_path: destPath,
    file_size: fileSize,
    mime_type: mimeType,
    tags: tags,  // 传递数组，createAsset 会处理 JSON.stringify
  });

  return asset;
}

/**
 * 通过对话框选择并导入资源
 *
 * @param workId 作品ID
 * @param type 资源类型（可选，用于过滤文件类型）
 * @returns Promise<Asset | null> 导入的资源，如果取消则返回 null
 */
export async function importAssetWithDialog(
  workId: string,
  type?: AssetType
): Promise<Asset | null> {
  // 构建文件过滤器
  const filters = type
    ? [
        {
          name: `${type} 文件`,
          extensions: SUPPORTED_EXTENSIONS[type].map((ext) => ext.substring(1)),
        },
      ]
    : [
        {
          name: '所有支持的文件',
          extensions: Object.values(SUPPORTED_EXTENSIONS)
            .flat()
            .map((ext) => ext.substring(1)),
        },
      ];

  // 打开文件选择对话框
  const selected = await open({
    multiple: false,
    filters,
  });

  if (!selected || typeof selected !== 'string') {
    return null;
  }

  // 导入文件
  return await importAsset(workId, selected);
}

/**
 * 删除资源文件
 * 删除物理文件和数据库记录
 *
 * @param asset 资源记录
 * @returns Promise<void>
 */
export async function removeAsset(asset: Asset): Promise<void> {
  // 删除物理文件
  try {
    if (await exists(asset.file_path)) {
      await remove(asset.file_path);
      console.log(`✅ 删除资源文件: ${asset.file_path}`);
    }
  } catch (error) {
    console.error('❌ 删除资源文件失败:', error);
  }

  // 删除数据库记录（软删除）
  await deleteAsset(asset.id);
}

/**
 * 导出资源文件
 * 将资源文件复制到用户指定的位置
 *
 * @param asset 资源记录
 * @param destPath 目标路径（可选，如果不提供则弹出对话框）
 * @returns Promise<string | null> 导出的文件路径，如果取消则返回 null
 */
export async function exportAsset(
  asset: Asset,
  destPath?: string
): Promise<string | null> {
  // 检查源文件是否存在
  if (!(await exists(asset.file_path))) {
    throw new Error(`资源文件不存在: ${asset.file_path}`);
  }

  let targetPath = destPath;

  // 如果没有提供目标路径，弹出保存对话框
  if (!targetPath) {
    const ext = getFileExtension(asset.file_path);
    const defaultPath = `${asset.name}${ext}`;

    const selectedPath = await save({
      defaultPath,
      filters: [
        {
          name: `${asset.type} 文件`,
          extensions: [ext.substring(1)],
        },
      ],
    });

    if (!selectedPath) {
      return null; // 用户取消
    }

    targetPath = selectedPath;
  }

  // 复制文件
  await copyFile(asset.file_path, targetPath);
  console.log(`✅ 资源导出成功: ${asset.file_path} -> ${targetPath}`);

  return targetPath;
}

/**
 * 获取作品的资源存储统计
 *
 * @param workId 作品ID
 * @returns Promise<Record<AssetType, { count: number; size: number }>>
 */
export async function getWorkStorageStats(
  workId: string
): Promise<Record<AssetType, { count: number; size: number }>> {
  const stats: Record<AssetType, { count: number; size: number }> = {
    image: { count: 0, size: 0 },
    video: { count: 0, size: 0 },
    audio: { count: 0, size: 0 },
    document: { count: 0, size: 0 },
  };

  for (const type of Object.keys(stats) as AssetType[]) {
    const workDir = await getWorkAssetsDir(workId, type);

    if (!(await exists(workDir))) {
      continue;
    }

    try {
      const entries = await readDir(workDir);

      for (const entry of entries) {
        if (entry.isFile) {
          const filePath = `${workDir}/${entry.name}`;
          const fileInfo = await stat(filePath);
          stats[type].count++;
          stats[type].size += fileInfo.size;
        }
      }
    } catch (error) {
      console.error(`❌ 读取目录失败 ${workDir}:`, error);
    }
  }

  return stats;
}

/**
 * 清理作品的所有资源文件
 * 删除作品目录下的所有资源文件
 *
 * @param workId 作品ID
 * @returns Promise<void>
 */
export async function cleanWorkAssets(workId: string): Promise<void> {
  for (const type of Object.keys(ASSET_TYPE_DIRS) as AssetType[]) {
    const workDir = await getWorkAssetsDir(workId, type);

    if (await exists(workDir)) {
      try {
        await remove(workDir, { recursive: true });
        console.log(`✅ 清理作品 ${workId} 的 ${type} 资源目录`);
      } catch (error) {
        console.error(`❌ 清理目录失败 ${workDir}:`, error);
      }
    }
  }
}

/**
 * 获取支持的文件类型列表
 *
 * @param type 资源类型（可选）
 * @returns string[] 支持的扩展名列表
 */
export function getSupportedExtensions(type?: AssetType): string[] {
  if (type) {
    return [...SUPPORTED_EXTENSIONS[type]];
  }

  return Object.values(SUPPORTED_EXTENSIONS).flat();
}

/**
 * 验证文件类型是否支持
 *
 * @param filePath 文件路径
 * @param type 期望的资源类型（可选）
 * @returns boolean 是否支持
 */
export function isFileSupported(filePath: string, type?: AssetType): boolean {
  const ext = getFileExtension(filePath).toLowerCase();

  if (type) {
    return SUPPORTED_EXTENSIONS[type].includes(ext);
  }

  return getSupportedExtensions().includes(ext);
}

/**
 * 格式化文件大小
 *
 * @param bytes 字节数
 * @returns string 格式化后的文件大小
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`;
}
