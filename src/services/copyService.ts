/**
 * 文件名：copyService.ts
 * 模块名称：复制服务
 *
 * 【核心功能】
 * 统一的剪贴板复制出口：
 * 1. copyText —— 纯文本（走 Rust 剪贴板插件，无浏览器权限弹窗）
 * 2. copyChapterTitle / copyChapterContent —— 章节标题与正文（正文自动去 HTML）
 * 3. copyWorkOverview —— 作品概览（书名 + 全部章节标题）
 *
 * 【说明】统一走 Rust 插件：WebView 的 navigator.clipboard 会触发系统
 * 权限弹窗（首体验差），Rust 侧写入无弹窗且必成功。
 */

import { invoke } from '@tauri-apps/api/core';

/** 复制纯文本到剪贴板 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await invoke('plugin:clipboard-manager|write_text', { text });
    return true;
  } catch (error) {
    console.error('剪贴板写入失败:', error);
    return false;
  }
}

/** HTML → 纯文本（与投递格式化一致：块级转行、去实体） */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<\/(p|div|h[1-6])>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
