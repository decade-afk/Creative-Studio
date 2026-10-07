/**
 * TitleBar - 自定义窗口标题栏组件
 *
 * 功能说明：
 * 1. 显示应用标题和当前文档名称
 * 2. 应用菜单（文件、编辑、视图）
 * 3. 窗口控制按钮（最小化、最大化、关闭）
 * 4. 支持拖拽移动窗口
 * 5. 双击标题栏最大化/还原
 * 6. macOS 平台适配（按钮位置调整）
 */

import { useState, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import AppMenu from './AppMenu';

interface TitleBarProps {
  documentName?: string;        // 当前文档名称
  onNewWork?: () => void;        // 新建作品回调
  onNewChapter?: () => void;     // 新建章节回调
  onImport?: () => void;         // 导入作品回调
  onExport?: () => void;         // 导出回调
  onSettings?: () => void;       // 设置回调
  onToggleSidebar?: () => void;  // 切换侧边栏回调
  onSearch?: () => void;         // 全局搜索回调
  onReplace?: () => void;        // 查找替换回调
  onToggleAiPanel?: () => void;  // 切换 AI 助手面板回调
}

export default function TitleBar({
  documentName,
  onNewWork,
  onNewChapter,
  onImport,
  onExport,
  onSettings,
  onToggleSidebar,
  onSearch,
  onReplace,
  onToggleAiPanel,
}: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMacOS, setIsMacOS] = useState(false);
  const [isToggling, setIsToggling] = useState(false);

  // 监听窗口最大化状态和平台检测
  useEffect(() => {
    const appWindow = getCurrentWindow();

    // 检测平台（使用更精确的检测方式）
    const detectPlatform = () => {
      const userAgent = navigator.userAgent.toLowerCase();
      const platform = navigator.platform.toLowerCase();

      // 更精确的 macOS 检测：检查是否以 'mac' 开头，而不是包含'mac'
      // 避免误判 'machine'、'x86_64' 等字符串
      const isMac = platform.startsWith('mac') || userAgent.includes('macintosh');
      setIsMacOS(isMac);

      // 调试信息：检测运行环境
      console.log('=== 窗口拖拽调试信息 ===');
      console.log('User Agent:', userAgent);
      console.log('Platform:', platform);
      console.log('是否为macOS:', isMac);
      console.log('检测依据', platform.startsWith('mac') ? 'Platform' : userAgent.includes('macintosh') ? 'User Agent' : 'Both false');
    };

    // 检查最大化状态
    const checkMaximized = async () => {
      const maximized = await appWindow.isMaximized();
      setIsMaximized(maximized);
    };

    detectPlatform();
    checkMaximized();

    // 监听窗口大小变化
    const unlisten = appWindow.listen('tauri://resize', checkMaximized);

    return () => {
      unlisten.then((f: () => void) => f());
    };
  }, []);

  /**
   * 窗口最小化处理函数
   *
   * 修复说明：
   * - 添加了 e.stopPropagation() 防止事件冒泡到拖拽区域
   * - 将 getCurrentWindow() 移到函数内部，避免闭包问题
   * - 添加了 .catch() 错误处理
   * - 添加了 console.log 用于调试
   */
  const handleMinimize = (e: React.MouseEvent) => {
    e.stopPropagation(); // ⚠️ 重要：阻止事件冒泡，防止触发拖拽
    console.log('最小化按钮被点击');
    const appWindow = getCurrentWindow();
    appWindow.minimize().catch((err: unknown) => console.error('最小化失败:', err));
  };

  /**
   * 窗口最大化/还原处理函数
   *
   * 修复说明：
   * - 使用 toggleMaximize() 自动在最大化和还原之间切换
   * - 添加了事件冒泡阻止和错误处理
   */
  const handleMaximize = (e: React.MouseEvent) => {
    e.stopPropagation(); // ⚠️ 重要：阻止事件冒泡
    console.log('最大化按钮被点击');
    const appWindow = getCurrentWindow();
    appWindow.toggleMaximize().catch((err: unknown) => console.error('最大化失败:', err));
  };

  /**
   * 窗口关闭处理函数
   *
   * 注意：关闭窗口会触发应用退出
   */
  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation(); // ⚠️ 重要：阻止事件冒泡
    console.log('关闭按钮被点击');
    const appWindow = getCurrentWindow();
    appWindow.close().catch((err: unknown) => console.error('关闭失败:', err));
  };

  /**
   * 双击标题栏最大化/还原
   *
   * 功能：双击标题栏的任意可拖拽区域可以快速切换最大化状态
   * 这是桌面应用的常见交互模式
   *
   * 修复说明：
   * - 使用 isToggling 标志防止重复触发
   * - 添加调试日志显示当前状态
   * - 延迟更新状态，等待窗口动画完成
   */
  const handleDoubleClick = async (e: React.MouseEvent) => {
    // 防止重复触发
    if (isToggling) {
      console.log('正在切换中，忽略双击');
      return;
    }

    // 检查是否点击在按钮或菜单上
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('[role="menu"]')) {
      console.log('双击在按钮或菜单上，忽略');
      return;
    }

    console.log('双击标题栏');
    setIsToggling(true);
    const appWindow = getCurrentWindow();

    try {
      await appWindow.toggleMaximize();
      // 延迟获取状态，等待窗口动画完成
      setTimeout(async () => {
        const newState = await appWindow.isMaximized();
        console.log('切换后状态', newState ? '最大化' : '正常');
        setIsMaximized(newState);
        // 延迟解锁，确保动画完成
        setTimeout(() => setIsToggling(false), 100);
      }, 200);
    } catch (err) {
      console.error('双击切换失败:', err);
      setIsToggling(false);
    }
  };

  // 窗口控制按钮组件
  const WindowControls = () => (
    <div
      className="flex items-center gap-1"
      data-tauri-drag-region="false"
      style={{
        WebkitAppRegion: 'no-drag',
        appRegion: 'no-drag',
        position: 'relative',
        zIndex: 10000
      } as any}
    >
      {/* 最小化 */}
      <button
        onClick={handleMinimize}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
        className="titlebar-button"
        title="最小化"
        aria-label="最小化窗口"
      >
        <svg className="w-4 h-4" viewBox="0 0 12 12" fill="currentColor">
          <rect x="2" y="5" width="8" height="1.5" rx="0.75" />
        </svg>
      </button>

      {/* 最大化/还原 */}
      <button
        onClick={handleMaximize}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
        className="titlebar-button"
        title={isMaximized ? '还原' : '最大化'}
        aria-label={isMaximized ? '还原窗口' : '最大化窗口'}
      >
        {isMaximized ? (
          // 还原图标（双窗口图标）
          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
            <path d="M 3 3 L 3 9 L 9 9 L 9 3 Z M 4 4 L 8 4 L 8 8 L 4 8 Z" />
          </svg>
        ) : (
          // 最大化图标（单窗口图标）
          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
            <path d="M 2 2 L 2 10 L 10 10 L 10 2 Z M 3.5 3.5 L 8.5 3.5 L 8.5 8.5 L 3.5 8.5 Z" />
          </svg>
        )}
      </button>

      {/* 关闭 */}
      <button
        onClick={handleClose}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
        className="titlebar-button titlebar-button-close"
        title="关闭"
        aria-label="关闭窗口"
      >
        <svg className="w-4 h-4" viewBox="0 0 12 12" fill="none">
          <path d="M 2 2 L 10 10 M 10 2 L 2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );

  // macOS 样式的窗口控制按钮（交通灯样式）
  const MacOSControls = () => (
    <div
      className="flex items-center gap-2 pl-2"
      data-tauri-drag-region="false"
      style={{
        WebkitAppRegion: 'no-drag',
        appRegion: 'no-drag',
        position: 'relative',
        zIndex: 10000
      } as any}
    >
      <button
        onClick={handleClose}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
        className="w-3 h-3 rounded-full bg-[#ff5f57] hover:bg-[#ff4136] transition-colors"
        title="关闭"
        aria-label="关闭窗口"
      />
      <button
        onClick={handleMinimize}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
        className="w-3 h-3 rounded-full bg-[#febc2e] hover:bg-[#ffb700] transition-colors"
        title="最小化"
        aria-label="最小化窗口"
      />
      <button
        onClick={handleMaximize}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
        className="w-3 h-3 rounded-full bg-[#28c840] hover:bg-[#00d924] transition-colors"
        title={isMaximized ? '还原' : '最大化'}
        aria-label={isMaximized ? '还原窗口' : '最大化窗口'}
      />
    </div>
  );

  return (
    <div
      className="flex items-center justify-between select-none"
      style={{
        height: 'var(--titlebar-height)',
        backgroundColor: 'var(--surface-secondary)',
        borderBottom: '1px solid var(--outline-variant)',
        boxShadow: 'var(--elevation-1)',
        WebkitAppRegion: 'drag',
        appRegion: 'drag',
        position: 'relative',
        zIndex: 1000
      } as any}
      onDoubleClick={handleDoubleClick}
    >
      {/* macOS 布局：控制按钮在左侧，内容在右侧 */}
      {isMacOS ? (
        <>
          {/* 左侧：窗口控制按钮 - 禁用拖拽 */}
          <MacOSControls />

          {/* 中间：空白拖拽区域 */}
          <div className="flex-1" data-tauri-drag-region />

          {/* 右侧：文档名称、菜单、Logo */}
          <div className="flex items-center gap-2 pr-3" data-tauri-drag-region>
            {/* 文档名称显示 - 可拖拽区域 */}
            {documentName && (
              <span
                style={{
                  fontSize: '16px',
                  color: 'var(--on-surface-secondary)'
                }}
              >
                {documentName}
              </span>
            )}

            {/* 应用菜单 - 禁用拖拽，保持可点击 */}
            <div
              data-tauri-drag-region="false"
              style={{ appRegion: 'no-drag', WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              <AppMenu
                onNewWork={onNewWork}
                onNewChapter={onNewChapter}
                onImport={onImport}
                onExport={onExport}
                onSettings={onSettings}
                onToggleSidebar={onToggleSidebar}
                onSearch={onSearch}
                onReplace={onReplace}
                onToggleAiPanel={onToggleAiPanel}
              />
            </div>

            {/* Logo - 可拖拽区域 */}
            <svg
              width="32"
              height="32"
              viewBox="0 0 48 48"
              className="opacity-90 flex-shrink-0"
            >
              <defs>
                <linearGradient id="titleLogoGradientMacOS" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#a07d5e" />
                  <stop offset="100%" stopColor="#8b6342" />
                </linearGradient>
              </defs>
              <g transform="translate(16, 24)">
                <path d="M 0 -7 Q -4 0 0 7" stroke="url(#titleLogoGradientMacOS)" strokeWidth="4" strokeLinecap="round" fill="none" />
              </g>
              <path d="M 28 11 L 34 23 L 28 27 L 22 23 Z" fill="url(#titleLogoGradientMacOS)" />
              <rect x="26" y="19" width="4" height="8" fill="url(#titleLogoGradientMacOS)" rx="1" />
              <circle cx="28" cy="31" r="2.5" fill="#6f4d34" opacity="0.9" />
            </svg>
          </div>
        </>
      ) : (
        /* Windows/Linux 布局：控制按钮在右侧 */
        <>
          {/* 左侧区域：Logo、菜单、文档名称 */}
          <div
            className="flex items-center gap-2 px-3"
            style={{ WebkitAppRegion: 'drag', appRegion: 'drag' } as any}
          >
            {/* Logo - 可拖拽区域 */}
            <svg
              width="32"
              height="32"
              viewBox="0 0 48 48"
              className="opacity-90 flex-shrink-0"
            >
              <defs>
                <linearGradient id="titleLogoGradientWin" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#a07d5e" />
                  <stop offset="100%" stopColor="#8b6342" />
                </linearGradient>
              </defs>
              <g transform="translate(16, 24)">
                <path d="M 0 -7 Q -4 0 0 7" stroke="url(#titleLogoGradientWin)" strokeWidth="4" strokeLinecap="round" fill="none" />
              </g>
              <path d="M 28 11 L 34 23 L 28 27 L 22 23 Z" fill="url(#titleLogoGradientWin)" />
              <rect x="26" y="19" width="4" height="8" fill="url(#titleLogoGradientWin)" rx="1" />
              <circle cx="28" cy="31" r="2.5" fill="#6f4d34" opacity="0.9" />
            </svg>

            {/* 应用菜单 - 禁用拖拽，保持可点击 */}
            <div
              data-tauri-drag-region="false"
              style={{
                WebkitAppRegion: 'no-drag',
                appRegion: 'no-drag'
              } as any}
            >
              <AppMenu
                onNewWork={onNewWork}
                onNewChapter={onNewChapter}
                onImport={onImport}
                onExport={onExport}
                onSettings={onSettings}
                onToggleSidebar={onToggleSidebar}
                onSearch={onSearch}
                onReplace={onReplace}
                onToggleAiPanel={onToggleAiPanel}
              />
            </div>

            {/* 文档名称显示 - 可拖拽区域 */}
            {documentName && (
              <span
                style={{
                  fontSize: '16px',
                  color: 'var(--on-surface-secondary)'
                }}
              >
                {documentName}
              </span>
            )}
          </div>

          {/* 中间空白区域 - 可拖拽 */}
          <div className="flex-1" style={{ WebkitAppRegion: 'drag', appRegion: 'drag' } as any} />

          {/* 右侧：窗口控制按钮 - 禁用拖拽，保持可点击 */}
          <WindowControls />
        </>
      )}
    </div>
  );
}
