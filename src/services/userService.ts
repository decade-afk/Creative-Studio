/**
 * 用户信息服务
 *
 * 管理用户资料的读取、保存和头像处理
 */

import { open } from '@tauri-apps/plugin-dialog';

export interface UserProfile {
  username: string;
  email: string;
  avatarPath?: string;
  avatarData?: string; // Base64 编码的头像数据
}

const PROFILE_KEY = 'user-profile';
const DEFAULT_PROFILE: UserProfile = {
  username: '创作者',
  email: '',
};

/**
 * 获取用户资料
 */
export async function getUserProfile(): Promise<UserProfile> {
  try {
    const saved = localStorage.getItem(PROFILE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (error) {
    console.error('读取用户资料失败:', error);
  }
  return { ...DEFAULT_PROFILE };
}

/**
 * 保存用户资料
 */
export async function saveUserProfile(profile: UserProfile): Promise<void> {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch (error) {
    console.error('保存用户资料失败:', error);
    throw new Error('保存失败');
  }
}

/**
 * 选择并上传头像
 *
 * 注意：由于 Tauri 2.0 的文件系统限制，这里采用简化方案：
 * 仅保存文件路径，前端使用 convertFileSrc 来显示图片
 */
export async function selectAvatar(): Promise<{ path: string; data: string } | null> {
  try {
    const selected = await open({
      title: '选择头像图片',
      filters: [
        {
          name: 'Image',
          extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'],
        },
      ],
    });

    if (!selected || typeof selected !== 'string') {
      return null;
    }

    // Tauri 2.0: 直接返回路径，前端使用 convertFileSrc 转换
    // 这样可以避免使用 plugin-fs
    return {
      path: selected,
      data: selected, // 临时方案：直接存储路径，稍后可改用 Base64
    };
  } catch (error) {
    console.error('选择头像失败:', error);
    return null;
  }
}

/**
 * 验证邮箱格式
 */
export function validateEmail(email: string): boolean {
  if (!email) return true; // 允许空邮箱
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * 验证用户名
 */
export function validateUsername(username: string): { valid: boolean; error?: string } {
  if (!username || username.trim().length === 0) {
    return { valid: false, error: '用户名不能为空' };
  }

  if (username.length < 2) {
    return { valid: false, error: '用户名至少 2 个字符' };
  }

  if (username.length > 20) {
    return { valid: false, error: '用户名最多 20 个字符' };
  }

  return { valid: true };
}
