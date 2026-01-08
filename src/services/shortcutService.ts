/**
 * 快捷键配置服务
 *
 * 负责：
 * 1. 快捷键配置的读取和保存
 * 2. 快捷键冲突检测
 * 3. 快捷键格式化和验证
 */

/**
 * 快捷键配置接口
 */
export interface ShortcutConfig {
  /** 全局快捷键 */
  global: {
    newWork: string;           // 新建作品
    newChapter: string;        // 新建章节
    save: string;              // 保存
    export: string;            // 导出
    search: string;            // 搜索
    settings: string;          // 设置
  };

  /** 编辑器快捷键 */
  editor: {
    bold: string;              // 加粗
    italic: string;            // 斜体
    underline: string;         // 下划线
    strikethrough: string;     // 删除线
    undo: string;              // 撤销
    redo: string;              // 重做
    selectAll: string;         // 全选
    copy: string;              // 复制
    cut: string;               // 剪切
    paste: string;             // 粘贴
  };

  /** 剧本专用快捷键 */
  script: {
    insertScene: string;       // 插入场景
    insertDialogue: string;    // 插入对话
    insertAction: string;      // 插入动作
    insertParenthetical: string; // 插入动作指示
  };
}

/**
 * 默认快捷键配置
 */
export const DEFAULT_SHORTCUTS: ShortcutConfig = {
  global: {
    newWork: 'Ctrl+N',
    newChapter: 'Ctrl+Shift+N',
    save: 'Ctrl+S',
    export: 'Ctrl+E',
    search: 'Ctrl+F',
    settings: 'Ctrl+,',
  },
  editor: {
    bold: 'Ctrl+B',
    italic: 'Ctrl+I',
    underline: 'Ctrl+U',
    strikethrough: 'Ctrl+Shift+X',
    undo: 'Ctrl+Z',
    redo: 'Ctrl+Y',
    selectAll: 'Ctrl+A',
    copy: 'Ctrl+C',
    cut: 'Ctrl+X',
    paste: 'Ctrl+V',
  },
  script: {
    insertScene: 'Ctrl+Shift+S',
    insertDialogue: 'Ctrl+Shift+D',
    insertAction: 'Ctrl+Shift+A',
    insertParenthetical: 'Ctrl+Shift+P',
  },
};

const SHORTCUTS_KEY = 'shortcuts-config';

/**
 * 获取快捷键配置
 */
export function getShortcuts(): ShortcutConfig {
  try {
    const saved = localStorage.getItem(SHORTCUTS_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (error) {
    console.error('读取快捷键配置失败:', error);
  }
  return { ...DEFAULT_SHORTCUTS };
}

/**
 * 保存快捷键配置
 */
export function saveShortcuts(config: ShortcutConfig): void {
  try {
    localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(config));
  } catch (error) {
    console.error('保存快捷键配置失败:', error);
    throw new Error('保存失败');
  }
}

/**
 * 重置为默认快捷键
 */
export function resetShortcuts(): ShortcutConfig {
  const defaults = { ...DEFAULT_SHORTCUTS };
  saveShortcuts(defaults);
  return defaults;
}

/**
 * 格式化快捷键显示
 * 例如：Ctrl+Shift+S
 */
export function formatShortcut(shortcut: string): string {
  return shortcut
    .split('+')
    .map(key => key.trim())
    .map(key => {
      // 首字母大写
      return key.charAt(0).toUpperCase() + key.slice(1).toLowerCase();
    })
    .join('+');
}

/**
 * 验证快捷键格式
 */
export function validateShortcut(shortcut: string): { valid: boolean; error?: string } {
  if (!shortcut || shortcut.trim().length === 0) {
    return { valid: false, error: '快捷键不能为空' };
  }

  const parts = shortcut.split('+').map(p => p.trim().toLowerCase());

  // 至少包含一个修饰键 (Ctrl/Alt/Shift) 和一个主键
  const modifiers = ['ctrl', 'alt', 'shift', 'meta'];
  const hasModifier = parts.some(p => modifiers.includes(p));

  if (!hasModifier) {
    return { valid: false, error: '快捷键必须包含修饰键 (Ctrl/Alt/Shift)' };
  }

  if (parts.length < 2) {
    return { valid: false, error: '快捷键格式不正确' };
  }

  return { valid: true };
}

/**
 * 检查快捷键冲突
 */
export function checkConflict(
  newShortcut: string,
  currentConfig: ShortcutConfig,
  excludeKey?: string
): { conflict: boolean; conflictWith?: string } {
  const normalized = newShortcut.toLowerCase().replace(/\s/g, '');

  // 遍历所有快捷键
  for (const category of Object.keys(currentConfig)) {
    const shortcuts = currentConfig[category as keyof ShortcutConfig];
    for (const [key, value] of Object.entries(shortcuts)) {
      const fullKey = `${category}.${key}`;
      if (fullKey === excludeKey) continue;

      const existing = (value as string).toLowerCase().replace(/\s/g, '');
      if (existing === normalized) {
        return { conflict: true, conflictWith: fullKey };
      }
    }
  }

  return { conflict: false };
}

/**
 * 获取快捷键分类显示名称
 */
export function getCategoryName(category: keyof ShortcutConfig): string {
  const names = {
    global: '全局快捷键',
    editor: '编辑器快捷键',
    script: '剧本专用快捷键',
  };
  return names[category];
}

/**
 * 获取快捷键操作显示名称
 */
export function getActionName(category: string, action: string): string {
  const names: Record<string, Record<string, string>> = {
    global: {
      newWork: '新建作品',
      newChapter: '新建章节',
      save: '保存',
      export: '导出',
      search: '搜索',
      settings: '设置',
    },
    editor: {
      bold: '加粗',
      italic: '斜体',
      underline: '下划线',
      strikethrough: '删除线',
      undo: '撤销',
      redo: '重做',
      selectAll: '全选',
      copy: '复制',
      cut: '剪切',
      paste: '粘贴',
    },
    script: {
      insertScene: '插入场景',
      insertDialogue: '插入对话',
      insertAction: '插入动作',
      insertParenthetical: '插入动作指示',
    },
  };

  return names[category]?.[action] || action;
}
