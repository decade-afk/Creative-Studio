/**
 * useKeyboardShortcuts - 键盘快捷键 Hook
 *
 * 功能说明：
 * 1. 统一管理应用的全局键盘快捷键
 * 2. 支持 Ctrl/Cmd 组合键
 * 3. 自动适配 Windows/macOS 平台
 * 4. 防止在输入框中触发快捷键
 */

import { useEffect } from 'react';

/**
 * 快捷键处理函数类型
 */
export type ShortcutHandler = () => void;

/**
 * 快捷键配置类型
 */
export interface ShortcutConfig {
  key: string;           // 按键，如 'n', 's', 'e'
  ctrl?: boolean;        // 是否需要 Ctrl/Cmd 键
  shift?: boolean;       // 是否需要 Shift 键
  alt?: boolean;         // 是否需要 Alt 键
  handler: ShortcutHandler;  // 处理函数
  description?: string;  // 快捷键描述
}

/**
 * 检测当前平台是否为 macOS
 */
const isMacOS = (): boolean => {
  const platform = navigator.platform.toLowerCase();
  const userAgent = navigator.userAgent.toLowerCase();
  return platform.startsWith('mac') || userAgent.includes('macintosh');
};

/**
 * 检查事件目标是否为输入元素
 *
 * 说明：
 * - 如果当前焦点在输入框、文本域或可编辑元素上，不触发快捷键
 * - 防止在编辑内容时误触快捷键
 */
const isInputElement = (target: EventTarget | null): boolean => {
  if (!target) return false;

  const element = target as HTMLElement;
  const tagName = element.tagName.toLowerCase();

  // 检查是否为输入元素
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
    return true;
  }

  // 检查是否为可编辑元素 (contenteditable)
  if (element.isContentEditable) {
    return true;
  }

  return false;
};

/**
 * 快捷键匹配检测
 *
 * @param event - 键盘事件
 * @param config - 快捷键配置
 * @returns 是否匹配
 */
const matchesShortcut = (event: KeyboardEvent, config: ShortcutConfig): boolean => {
  const isMac = isMacOS();

  // 检查按键是否匹配（不区分大小写）
  if (event.key.toLowerCase() !== config.key.toLowerCase()) {
    return false;
  }

  // 检查 Ctrl/Cmd 键
  if (config.ctrl) {
    // macOS 使用 Cmd 键，Windows/Linux 使用 Ctrl 键
    const modifierPressed = isMac ? event.metaKey : event.ctrlKey;
    if (!modifierPressed) return false;
  }

  // 检查 Shift 键
  if (config.shift && !event.shiftKey) {
    return false;
  }

  // 检查 Alt 键
  if (config.alt && !event.altKey) {
    return false;
  }

  return true;
};

/**
 * useKeyboardShortcuts Hook
 *
 * 使用示例：
 * ```tsx
 * useKeyboardShortcuts([
 *   { key: 'n', ctrl: true, handler: handleNewWork },
 *   { key: 's', ctrl: true, handler: handleSave },
 *   { key: 'e', ctrl: true, handler: handleExport },
 * ]);
 * ```
 *
 * @param shortcuts - 快捷键配置数组
 * @param enabled - 是否启用快捷键（默认 true）
 */
export function useKeyboardShortcuts(
  shortcuts: ShortcutConfig[],
  enabled: boolean = true
): void {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // 如果焦点在输入元素上，不处理快捷键
      if (isInputElement(event.target)) {
        return;
      }

      // 遍历快捷键配置，查找匹配的快捷键
      for (const shortcut of shortcuts) {
        if (matchesShortcut(event, shortcut)) {
          // 阻止默认行为和事件冒泡
          event.preventDefault();
          event.stopPropagation();

          // 执行快捷键处理函数
          shortcut.handler();

          // 找到匹配的快捷键后停止查找
          break;
        }
      }
    };

    // 添加事件监听器
    window.addEventListener('keydown', handleKeyDown);

    // 清理函数：移除事件监听器
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [shortcuts, enabled]);
}

/**
 * 格式化快捷键显示文本
 *
 * 说明：
 * - 根据当前平台显示正确的修饰键符号
 * - macOS: ⌘N, ⇧⌘N
 * - Windows/Linux: Ctrl+N, Ctrl+Shift+N
 *
 * @param config - 快捷键配置
 * @returns 格式化后的快捷键文本
 */
export function formatShortcut(config: ShortcutConfig): string {
  const isMac = isMacOS();
  const parts: string[] = [];

  if (isMac) {
    // macOS 样式
    if (config.ctrl) parts.push('⌘');
    if (config.shift) parts.push('⇧');
    if (config.alt) parts.push('⌥');
    parts.push(config.key.toUpperCase());
    return parts.join('');
  } else {
    // Windows/Linux 样式
    if (config.ctrl) parts.push('Ctrl');
    if (config.shift) parts.push('Shift');
    if (config.alt) parts.push('Alt');
    parts.push(config.key.toUpperCase());
    return parts.join('+');
  }
}

/**
 * 常用快捷键配置生成器
 */
export const ShortcutPresets = {
  /**
   * 新建（Ctrl+N / Cmd+N）
   */
  new: (handler: ShortcutHandler): ShortcutConfig => ({
    key: 'n',
    ctrl: true,
    handler,
    description: '新建作品'
  }),

  /**
   * 新建章节（Ctrl+Shift+N / Cmd+Shift+N）
   */
  newChapter: (handler: ShortcutHandler): ShortcutConfig => ({
    key: 'n',
    ctrl: true,
    shift: true,
    handler,
    description: '新建章节'
  }),

  /**
   * 保存（Ctrl+S / Cmd+S）
   */
  save: (handler: ShortcutHandler): ShortcutConfig => ({
    key: 's',
    ctrl: true,
    handler,
    description: '保存'
  }),

  /**
   * 导出（Ctrl+E / Cmd+E）
   */
  export: (handler: ShortcutHandler): ShortcutConfig => ({
    key: 'e',
    ctrl: true,
    handler,
    description: '导出'
  }),

  /**
   * 设置（Ctrl+, / Cmd+,）
   */
  settings: (handler: ShortcutHandler): ShortcutConfig => ({
    key: ',',
    ctrl: true,
    handler,
    description: '设置'
  }),

  /**
   * 查找（Ctrl+F / Cmd+F）
   */
  find: (handler: ShortcutHandler): ShortcutConfig => ({
    key: 'f',
    ctrl: true,
    handler,
    description: '查找'
  }),

  /**
   * 替换（Ctrl+H / Cmd+H）
   */
  replace: (handler: ShortcutHandler): ShortcutConfig => ({
    key: 'h',
    ctrl: true,
    handler,
    description: '替换'
  }),

  /**
   * 切换侧边栏（Ctrl+B / Cmd+B）
   */
  toggleSidebar: (handler: ShortcutHandler): ShortcutConfig => ({
    key: 'b',
    ctrl: true,
    handler,
    description: '切换侧边栏'
  }),

  /**
   * 撤销（Ctrl+Z / Cmd+Z）
   */
  undo: (handler: ShortcutHandler): ShortcutConfig => ({
    key: 'z',
    ctrl: true,
    handler,
    description: '撤销'
  }),

  /**
   * 重做（Ctrl+Y / Cmd+Y）
   */
  redo: (handler: ShortcutHandler): ShortcutConfig => ({
    key: 'y',
    ctrl: true,
    handler,
    description: '重做'
  }),
};
