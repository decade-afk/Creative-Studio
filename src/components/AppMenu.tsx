/**
 * AppMenu - 应用菜单组件
 *
 * 功能说明：
 * 1. 提供应用级别的菜单选项
 * 2. 文件、编辑、视图等常用菜单
 * 3. 下拉菜单交互
 * 4. 显示快捷键提示（自动适配平台）
 */

import { useState, useRef, useEffect } from 'react';
import { ShortcutPresets, formatShortcut } from '../hooks/useKeyboardShortcuts';

interface MenuItem {
  label?: string;
  shortcut?: string;
  onClick?: () => void;
  divider?: boolean;
  disabled?: boolean;
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

interface AppMenuProps {
  onNewWork?: () => void;
  onNewChapter?: () => void;
  onImport?: () => void;
  onExport?: () => void;
  onSettings?: () => void;
  onToggleSidebar?: () => void;
  onSearch?: () => void;
  onReplace?: () => void;
  onToggleAiPanel?: () => void;
}

export default function AppMenu({
  onNewWork,
  onNewChapter,
  onImport,
  onExport,
  onSettings,
  onToggleSidebar,
  onSearch,
  onReplace,
  onToggleAiPanel
}: AppMenuProps) {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenu(null);
      }
    };

    if (activeMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [activeMenu]);

  // 菜单配置 - 使用统一的快捷键格式
  const menus: MenuSection[] = [
    {
      title: '文件',
      items: [
        {
          label: '新建作品',
          shortcut: formatShortcut(ShortcutPresets.new(() => {})),
          onClick: onNewWork
        },
        {
          label: '新建章节',
          shortcut: formatShortcut(ShortcutPresets.newChapter(() => {})),
          onClick: onNewChapter
        },
        { divider: true },
        {
          label: '导入作品（TXT/Markdown）...',
          onClick: onImport
        },
        {
          label: '导出...',
          shortcut: formatShortcut(ShortcutPresets.export(() => {})),
          onClick: onExport
        },
        { divider: true },
        {
          label: '设置',
          shortcut: formatShortcut(ShortcutPresets.settings(() => {})),
          onClick: onSettings
        },
      ],
    },
    {
      title: '编辑',
      items: [
        {
          label: '全局搜索',
          shortcut: formatShortcut(ShortcutPresets.find(() => {})),
          onClick: onSearch
        },
        {
          label: 'AI 创作助手',
          shortcut: 'Ctrl+J',
          onClick: onToggleAiPanel
        },
        { divider: true },
        {
          label: '撤销',
          shortcut: formatShortcut(ShortcutPresets.undo(() => {})),
          disabled: true
        },
        {
          label: '重做',
          shortcut: formatShortcut(ShortcutPresets.redo(() => {})),
          disabled: true
        },
        { divider: true },
        {
          label: '查找替换',
          shortcut: formatShortcut(ShortcutPresets.replace(() => {})),
          onClick: onReplace
        },
      ],
    },
    {
      title: '视图',
      items: [
        {
          label: '切换侧边栏',
          shortcut: formatShortcut(ShortcutPresets.toggleSidebar(() => {})),
          onClick: onToggleSidebar
        },
        {
          label: '切换预览',
          shortcut: formatShortcut({ key: 'p', ctrl: true, handler: () => {} }),
          disabled: true
        },
        { divider: true },
        {
          label: '全屏模式',
          shortcut: 'F11',
          disabled: true
        },
      ],
    },
  ];

  const handleMenuClick = (menuTitle: string) => {
    setActiveMenu(activeMenu === menuTitle ? null : menuTitle);
  };

  const handleItemClick = (item: MenuItem) => {
    if (!item.disabled && item.onClick) {
      item.onClick();
    }
    setActiveMenu(null);
  };

  return (
    <div ref={menuRef} className="flex items-center gap-1 h-full" style={{ pointerEvents: 'auto' }}>
      {menus.map((menu) => (
        <div key={menu.title} className="relative" style={{ pointerEvents: 'auto' }}>
          {/* 菜单标题按钮 */}
          <button
            className={`px-2 h-6 text-xs font-medium rounded transition-colors ${
              activeMenu === menu.title
                ? 'bg-primary-500 text-white'
                : 'text-on-surface-variant hover:bg-on-surface-secondary/10'
            }`}
            style={{ pointerEvents: 'auto', position: 'relative', zIndex: 1001 }}
            onClick={() => handleMenuClick(menu.title)}
          >
            {menu.title}
          </button>

          {/* 下拉菜单 */}
          {activeMenu === menu.title && (
            <div
              className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-outline py-1 min-w-[180px]"
              style={{ zIndex: 10000, pointerEvents: 'auto' }}
            >
              {menu.items.map((item, idx) => {
                if (item.divider) {
                  return (
                    <div
                      key={`divider-${idx}`}
                      className="h-px bg-outline my-1"
                    />
                  );
                }

                return (
                  <button
                    key={item.label}
                    className={`w-full px-3 py-1.5 text-left text-sm flex items-center justify-between ${
                      item.disabled
                        ? 'text-neutral-400 cursor-not-allowed'
                        : 'text-on-surface hover:bg-surface-primary'
                    }`}
                    onClick={() => handleItemClick(item)}
                    disabled={item.disabled}
                  >
                    <span>{item.label}</span>
                    {item.shortcut && (
                      <span className="text-xs text-on-surface-secondary ml-4">{item.shortcut}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
