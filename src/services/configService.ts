/**
 * 配置文件管理服务
 *
 * 负责：
 * 1. 用户偏好设置的持久化存储
 * 2. 应用配置的读取和更新
 * 3. 默认配置的管理
 *
 * 配置文件位置：
 * - Windows: %APPDATA%\com.creativestudio.desktop\config.json
 * - macOS: ~/Library/Application Support/com.creativestudio.desktop/config.json
 * - Linux: ~/.local/share/com.creativestudio.desktop/config.json
 */

import { appDataDir, join } from '@tauri-apps/api/path';
import { exists, readTextFile, writeTextFile, mkdir } from '@tauri-apps/plugin-fs';

/**
 * 应用配置接口
 */
export interface AppConfig {
  /** 应用版本 */
  version: string;

  /** UI 主题 */
  theme: 'light' | 'dark' | 'auto';

  /** 编辑器设置 */
  editor: {
    /** 字体大小 (px) */
    fontSize: number;
    /** 字体族 */
    fontFamily: string;
    /** 行高 */
    lineHeight: number;
    /** 自动保存间隔 (秒，0表示禁用) */
    autoSaveInterval: number;
    /** 拼写检查 */
    spellCheck: boolean;
    /** 每日写作字数目标（0 表示不启用） */
    dailyGoal: number;
  };

  /** 导出设置 */
  export: {
    /** 默认导出格式 */
    defaultFormat: 'txt' | 'pdf' | 'word' | 'markdown' | 'html';
    /** PDF 页边距 (mm) */
    pdfMargins: {
      top: number;
      bottom: number;
      left: number;
      right: number;
    };
    /** 包含作者信息 */
    includeMetadata: boolean;
  };

  /** 窗口设置 */
  window: {
    /** 记住窗口大小和位置 */
    rememberSize: boolean;
    /** 上次窗口位置 */
    lastPosition?: { x: number; y: number };
    /** 上次窗口大小 */
    lastSize?: { width: number; height: number };
    /** 是否最大化 */
    maximized: boolean;
  };

  /** 备份设置 */
  backup: {
    /** 启用自动备份 */
    enabled: boolean;
    /** 备份间隔 (小时) */
    interval: number;
    /** 保留备份数量 */
    keepCount: number;
    /** 上次备份时间 (ISO 8601，由 backupService 维护) */
    lastBackupAt?: string;
  };

  /** 存储设置 */
  storage: {
    /**
     * 数据存储根目录（数据库/备份/素材）
     *
     * 【说明】空串 = 默认应用数据目录（%APPDATA%\com.creativestudio.desktop）。
     * config.json 本身永远留在应用数据目录作为引导配置（否则死锁：
     * 自定义路径存在 config 里，config 又在自定义路径里）。
     * 修改后需迁移数据并重启（见 SettingsView 存储 Tab）。
     */
    dataDir: string;
  };

  /** AI 服务配置 */
  ai: {
    /** 服务商预设 ID（kimi | deepseek | glm | openai | openrouter | lmstudio | ollama | custom） */
    provider: string;
    /** API Base URL（OpenAI 兼容，不含 /chat/completions） */
    baseUrl: string;
    /** API Key */
    apiKey: string;
    /** 模型 ID */
    model: string;
    /** 采样温度 (0-2) */
    temperature: number;
    /** 单次回复最大 token 数 */
    maxTokens: number;
  };

  /** 上次打开的作品ID */
  lastOpenedWorkId?: string;

  /** 首次启动标记 */
  isFirstLaunch: boolean;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: AppConfig = {
  version: '0.3.2',
  theme: 'auto',
  editor: {
    fontSize: 16,
    fontFamily: "'Segoe UI', 'Microsoft YaHei', sans-serif",
    lineHeight: 1.8,
    autoSaveInterval: 2,
    spellCheck: true,
    dailyGoal: 0,
  },
  export: {
    defaultFormat: 'pdf',
    pdfMargins: {
      top: 25,
      bottom: 25,
      left: 25,
      right: 25,
    },
    includeMetadata: true,
  },
  window: {
    rememberSize: true,
    maximized: false,
  },
  backup: {
    enabled: true,
    interval: 24,
    keepCount: 7,
  },
  storage: {
    dataDir: '',
  },
  ai: {
    provider: 'kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    apiKey: '',
    model: 'moonshot-v1-8k',
    temperature: 0.7,
    maxTokens: 2048,
  },
  isFirstLaunch: true,
};

/**
 * 配置文件名
 */
const CONFIG_FILE_NAME = 'config.json';

/**
 * 获取配置文件完整路径
 *
 * 【注意】appDataDir() 返回的路径不带尾部分隔符，
 * 必须使用 join() 拼接，直接字符串拼接会产生
 * "...com.creativestudio.desktopconfig.json" 这样的非法路径
 *
 * @returns Promise<string> 配置文件路径
 */
async function getConfigPath(): Promise<string> {
  return await join(await appDataDir(), CONFIG_FILE_NAME);
}

/**
 * 确保应用数据目录存在
 */
async function ensureAppDataDir(): Promise<void> {
  const appData = await appDataDir();
  const dirExists = await exists(appData);

  if (!dirExists) {
    await mkdir(appData, { recursive: true });
    console.log('✅ 创建应用数据目录:', appData);
  }
}

/**
 * 加载配置
 * 如果配置文件不存在，则创建默认配置
 *
 * @returns Promise<AppConfig> 应用配置
 */
export async function loadConfig(): Promise<AppConfig> {
  try {
    await ensureAppDataDir();
    const configPath = await getConfigPath();
    const fileExists = await exists(configPath);

    if (!fileExists) {
      console.log('📝 配置文件不存在，创建默认配置...');
      await saveConfig(DEFAULT_CONFIG);
      return DEFAULT_CONFIG;
    }

    // 读取配置文件
    const content = await readTextFile(configPath);
    const config = JSON.parse(content) as AppConfig;

    // 合并默认配置（处理新增字段）
    const mergedConfig = mergeWithDefaults(config, DEFAULT_CONFIG);

    console.log('✅ 配置加载成功:', configPath);
    return mergedConfig;
  } catch (error) {
    console.error('❌ 加载配置失败，使用默认配置:', error);
    return DEFAULT_CONFIG;
  }
}

/**
 * 保存配置
 *
 * @param config 应用配置
 * @returns Promise<void>
 */
export async function saveConfig(config: AppConfig): Promise<void> {
  try {
    await ensureAppDataDir();
    const configPath = await getConfigPath();

    // 更新版本号
    config.version = DEFAULT_CONFIG.version;

    // 格式化 JSON（美化输出）
    const content = JSON.stringify(config, null, 2);
    await writeTextFile(configPath, content);

    console.log('✅ 配置保存成功:', configPath);
  } catch (error) {
    console.error('❌ 保存配置失败:', error);
    throw new Error(`保存配置失败: ${error}`);
  }
}

/**
 * 更新部分配置
 *
 * @param updates 要更新的配置字段
 * @returns Promise<AppConfig> 更新后的完整配置
 */
export async function updateConfig(
  updates: Partial<AppConfig>
): Promise<AppConfig> {
  const currentConfig = await loadConfig();
  const newConfig = deepMerge(currentConfig, updates);
  await saveConfig(newConfig);
  return newConfig;
}

/**
 * 重置为默认配置
 *
 * @returns Promise<AppConfig> 默认配置
 */
export async function resetConfig(): Promise<AppConfig> {
  await saveConfig(DEFAULT_CONFIG);
  console.log('🔄 配置已重置为默认值');
  return DEFAULT_CONFIG;
}

/**
 * 获取配置文件路径（供外部使用）
 *
 * @returns Promise<string> 配置文件路径
 */
export async function getConfigFilePath(): Promise<string> {
  return await getConfigPath();
}

/**
 * 获取默认配置（供参考）
 *
 * @returns AppConfig 默认配置的副本
 */
export function getDefaultConfig(): AppConfig {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

// ========== 辅助函数 ==========

/**
 * 深度合并两个对象
 * 用于合并配置更新
 */
function deepMerge<T>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const sourceValue = source[key];
      const targetValue = result[key];

      if (
        sourceValue &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        targetValue &&
        typeof targetValue === 'object' &&
        !Array.isArray(targetValue)
      ) {
        // 递归合并对象
        result[key] = deepMerge(targetValue, sourceValue as any) as any;
      } else {
        // 直接赋值
        result[key] = sourceValue as any;
      }
    }
  }

  return result;
}

/**
 * 合并用户配置和默认配置
 * 确保新增字段有默认值
 */
function mergeWithDefaults(
  userConfig: Partial<AppConfig>,
  defaultConfig: AppConfig
): AppConfig {
  return deepMerge(defaultConfig, userConfig);
}


/**
 * 获取数据存储根目录（数据库/备份/素材所在）
 *
 * 【规则】storage.dataDir 为空 → 默认应用数据目录；非空 → 用户自定义目录
 * config.json 永远在应用数据目录（引导配置）
 */
export async function getStorageDir(): Promise<string> {
  try {
    const config = await loadConfig();
    if (config.storage && config.storage.dataDir) {
      return config.storage.dataDir;
    }
  } catch {
    // 配置读取失败回退默认
  }
  return await appDataDir();
}
