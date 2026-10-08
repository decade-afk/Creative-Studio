/**
 * 文件名：updateService.ts
 * 模块名称：软件更新服务
 *
 * 【核心功能】
 * 1. 检查更新（tauri-plugin-updater，源为 GitHub Releases 的 latest.json）
 * 2. 下载并安装（含进度回调），安装后自动重启
 * 3. 打开 Releases 页面（签名链未就绪时的兜底路径）
 *
 * 【签名说明】
 * 更新包由 CI 用 TAURI_SIGNING_PRIVATE_KEY 签名，应用内置公钥校验——
 * 密钥未配置前 CI 产出的包没有签名数据，此时走"浏览器下载"兜底。
 */

import { check, type Update, type DownloadEvent } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { openUrl } from '@tauri-apps/plugin-opener';

const RELEASES_URL = 'https://github.com/decade-afk/Creative-Studio/releases';

/** 更新检查结果 */
export interface UpdateCheckResult {
  available: boolean;
  version?: string;
  notes?: string;
  update?: Update;
}

/**
 * 检查是否有新版本
 *（不抛错——网络失败等返回 available:false，由调用方决定兜底）
 */
export async function checkForUpdates(): Promise<UpdateCheckResult> {
  try {
    const update = await check();
    if (update) {
      return {
        available: true,
        version: update.version,
        notes: update.body,
        update,
      };
    }
    return { available: false };
  } catch (error) {
    console.warn('检查更新失败:', error);
    return { available: false };
  }
}

/**
 * 下载并安装更新（含进度回调），完成后自动重启
 */
export async function downloadAndInstall(
  update: Update,
  onProgress?: (received: number, total: number | undefined) => void
): Promise<void> {
  let received = 0;
  let total: number | undefined;

  await update.downloadAndInstall((event: DownloadEvent) => {
    switch (event.event) {
      case 'Started':
        total = event.data.contentLength;
        onProgress?.(0, total);
        break;
      case 'Progress':
        received += event.data.chunkLength;
        onProgress?.(received, total);
        break;
      case 'Finished':
        onProgress?.(total ?? received, total);
        break;
    }
  });

  // 安装完成，重启生效
  await relaunch();
}

/** 在浏览器打开 Releases 页面（兜底下载路径） */
export async function openReleasesPage(): Promise<void> {
  await openUrl(RELEASES_URL);
}
