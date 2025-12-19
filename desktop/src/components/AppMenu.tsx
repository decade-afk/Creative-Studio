/**
 * AppMenu - 应用菜单组件
 *
 * 功能：
 * 1. 提供应用级别的菜单选项
 * 2. 文件、编辑、视图等常用菜单
 * 3. 下拉菜单交互
 */

import { useState, useRef, useEffect } from 'react';

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
  onExport?: () => void;
  onSettings?: () => void;
}

export default function AppMenu({ onNewWork, onNewChapter, onExport, onSettings }: AppMenuProps) {
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

  const menus: MenuSection[] = [
    {
      title: '文件',
      items: [
        { label: '新建作品', shortcut: 'Ctrl+N', onClick: onNewWork },
        { label: '新建章节', shortcut: 'Ctrl+Shift+N', onClick: onNewChapter },
        { divider: true },
        { label: '导出...', shortcut: 'Ctrl+E', onClick: onExport },
        { divider: true },
        { label: '设置', shortcut: 'Ctrl+,', onClick: onSettings },
      ],
    },
    {
      title: '编辑',
      items: [
        { label: '撤销', shortcut: 'Ctrl+Z', disabled: true },
        { label: '重做', shortcut: 'Ctrl+Y', disabled: true },
        { divider: true },
        { label: '查找', shortcut: 'Ctrl+F', disabled: true },
        { label: '替换', shortcut: 'Ctrl+H', disabled: true },
      ],
    },
    {
      title: '视图',
      items: [
        { label: '切换侧边栏', shortcut: 'Ctrl+B', disabled: true },
        { label: '切换预览', shortcut: 'Ctrl+P', disabled: true },
        { divider: true },
        { label: '全屏模式', shortcut: 'F11', disabled: true },
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
    <div ref={menuRef} className="flex items-center gap-1 h-full">
      {menus.map((menu) => (
        <div key={menu.title} className="relative">
          {/* 菜单标题按钮 */}
          <button
            className={`px-2 h-6 text-xs font-medium rounded transition-colors ${
              activeMenu === menu.title
                ? 'bg-[#a07d5e] text-white'
                : 'text-[#5d554a] hover:bg-[rgba(122,110,95,0.1)]'
            }`}
            onClick={() => handleMenuClick(menu.title)}
          >
            {menu.title}
          </button>

          {/* 下拉菜单 */}
          {activeMenu === menu.title && (
            <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-[#e5ddd2] py-1 min-w-[180px] z-[9999]">
              {menu.items.map((item, idx) => {
                if (item.divider) {
                  return (
                    <div
                      key={`divider-${idx}`}
                      className="h-px bg-[#e5ddd2] my-1"
                    />
                  );
                }

                return (
                  <button
                    key={item.label}
                    className={`w-full px-3 py-1.5 text-left text-sm flex items-center justify-between ${
                      item.disabled
                        ? 'text-[#ccc] cursor-not-allowed'
                        : 'text-[#38342e] hover:bg-[#faf8f5]'
                    }`}
                    onClick={() => handleItemClick(item)}
                    disabled={item.disabled}
                  >
                    <span>{item.label}</span>
                    {item.shortcut && (
                      <span className="text-xs text-[#7a6e5f] ml-4">{item.shortcut}</span>
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
