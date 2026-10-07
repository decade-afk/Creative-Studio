/**
 * 文件名：App.tsx
 * 模块名称：Creative Studio 主应用组件
 *
 * 【核心功能】
 * 1. 视图管理 - 在创作、规划、导演三个主要视图之间切换
 * 2. 设置面板 - 控制设置面板的显示/隐藏
 * 3. 侧边栏控制 - 管理创作视图的侧边栏显示状态
 * 4. 标题栏集成 - 协调标题栏与各视图的交互
 *
 * 【应用架构】
 * - 标题栏（TitleBar）：显示应用标题、文档名称、窗口控制按钮
 * - 导航栏（AppNavigation）：左侧垂直导航，切换主要视图
 * - 主内容区：根据当前视图显示对应的内容组件
 * - 设置面板（SettingsView）：模态对话框形式的设置界面
 *
 * 【视图说明】
 * 1. WriterView（创作视图）：剧本/小说编辑器，支持富文本编辑、自动保存、导出
 * 2. PlannerView（规划视图）：大纲管理、角色卡片、场景管理、里程碑跟踪
 * 3. DirectorView（导演视图）：伏笔管理、冲突分析、分镜脚本、素材库
 *
 * 【状态管理】
 * - currentView: 当前激活的视图（'writer' | 'planner' | 'director'）
 * - showSettings: 设置面板显示状态
 * - showWriterSidebar: 创作视图侧边栏显示状态
 * - currentDocumentName: 当前文档名称（用于标题栏显示）
 *
 * 【交互逻辑】
 * 1. 视图切换：点击导航栏图标切换视图
 * 2. 侧边栏切换：在创作视图点击导航栏图标切换侧边栏
 * 3. 设置打开：点击标题栏设置按钮或导航栏设置图标
 *
 * 【重要注意事项】
 * 1. 使用 flex 布局确保应用占满整个窗口
 * 2. 使用 overflow-hidden 防止滚动条出现
 * 3. 视图组件内部管理自己的状态和数据
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getCurrentWindow, LogicalSize, LogicalPosition } from '@tauri-apps/api/window';
import TitleBar from './components/TitleBar';
import AppNavigation from './components/AppNavigation';
import WriterView from './views/WriterView';
import DirectorView from './views/DirectorView';
import PlannerView from './views/PlannerView';
import SettingsView from './views/SettingsView';
import SearchPanel from './components/SearchPanel';
import TrashDialog from './components/TrashDialog';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { getShortcuts } from './services/shortcutService';
import { useWriterStore } from './stores/writerStore';
import { useTheme } from './contexts/ThemeContext';
import { useToast } from './components/Toast';
import { loadConfig, updateConfig } from './services/configService';
import { startAutoBackupScheduler } from './services/backupService';
import { getWorks } from './services/workService';
import { getChaptersByWorkId } from './services/chapterService';
import { importWorkFromFile } from './services/importService';
import { calculateWordCount } from './utils/wordCount';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 视图类型枚举
 *
 * 【说明】
 * - 'writer': 创作视图，用于剧本/小说编辑
 * - 'planner': 规划视图，用于大纲、角色、场景管理
 * - 'director': 导演视图，用于伏笔、冲突、分镜管理
 */
type View = 'writer' | 'planner' | 'director';

// ============================================================================
// 主应用组件
// ============================================================================

/**
 * App 组件 - Creative Studio 的根组件
 *
 * 【组件结构】
 * 1. 状态初始化
 * 2. 视图切换处理
 * 3. 标题栏回调处理
 * 4. 渲染应用界面
 *
 * @returns JSX 元素
 */
function App() {
  // ==========================================================================
  // 状态初始化
  // ==========================================================================

  /**
   * 当前激活的视图
   *
   * 【默认值】
   * - 'writer': 默认显示创作视图
   *
   * 【用途】
   * - 控制主内容区显示哪个视图组件
   * - 影响导航栏的高亮状态
   */
  const [currentView, setCurrentView] = useState<View>('writer');

  /**
   * 设置面板的显示状态
   *
   * 【默认值】
   * - false: 默认隐藏设置面板
   *
   * 【用途】
   * - 控制设置面板的显示/隐藏
   * - 点击设置按钮时切换状态
   */
  const [showSettings, setShowSettings] = useState(false);

  /**
   * 创作视图侧边栏的显示状态
   *
   * 【默认值】
   * - true: 默认显示侧边栏
   *
   * 【用途】
   * - 控制创作视图侧边栏的显示/隐藏
   * - 只在创作视图有效
   */
  const [showWriterSidebar, setShowWriterSidebar] = useState(true);

  /**
   * 当前文档名称
   *
   * 【数据来源】
   * - writerStore 中的当前作品和章节
   * - 格式："作品名 / 章节名"，无章节时仅显示作品名
   */
  const works = useWriterStore((state) => state.works);
  const currentWorkId = useWriterStore((state) => state.currentWorkId);
  const chapters = useWriterStore((state) => state.chapters);
  const currentChapterId = useWriterStore((state) => state.currentChapterId);
  const currentDocumentName = useMemo(() => {
    const work = works.find((w) => w.id === currentWorkId);
    if (!work) return '';
    const chapter = chapters.find((c) => c.id === currentChapterId);
    return chapter ? `${work.title} / ${chapter.title}` : work.title;
  }, [works, currentWorkId, chapters, currentChapterId]);

  // ==========================================================================
  // 全局搜索 / 导入 / Toast
  // ==========================================================================

  const [showSearch, setShowSearch] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const { showToast, ToastComponent } = useToast();

  /**
   * 跳转到指定章节（搜索结果点击）
   *
   * 【执行逻辑】
   * 1. 切换到创作视图
   * 2. 目标作品与当前不同：加载其章节列表后再选中目标章节
   * 3. 内容同步后尝试用 window.find 滚动定位关键词
   */
  const handleOpenChapter = async (workId: string, chapterId: string, keyword: string) => {
    setCurrentView('writer');
    const store = useWriterStore.getState();

    try {
      if (store.currentWorkId !== workId) {
        store.setCurrentWorkId(workId);
        const loadedChapters = await getChaptersByWorkId(workId);
        store.setChapters(loadedChapters);
        const chapter = loadedChapters.find((c) => c.id === chapterId);
        if (chapter) {
          store.setCurrentChapterId(chapter.id);
          store.setEditorContent(chapter.content || '');
          store.setShouldSyncContent(true);
          store.setWordCount(calculateWordCount(chapter.content || ''));
        }
      } else {
        const chapter = store.chapters.find((c) => c.id === chapterId);
        if (chapter) {
          store.setCurrentChapterId(chapter.id);
          store.setEditorContent(chapter.content || '');
          store.setShouldSyncContent(true);
          store.setWordCount(calculateWordCount(chapter.content || ''));
        }
      }

      // 等 DOM 同步完成后尝试定位关键词（window.find 为 Chromium 能力）
      setTimeout(() => {
        try {
          (window as any).find?.(keyword);
        } catch {
          // 定位失败不影响打开章节
        }
      }, 600);
    } catch (error) {
      console.error('打开章节失败:', error);
      showToast('打开章节失败', 'error');
    }
  };

  /**
   * 导入作品（TXT / Markdown）
   */
  const handleImport = async () => {
    setCurrentView('writer');
    try {
      const result = await importWorkFromFile('novel');
      if (!result) return;

      const store = useWriterStore.getState();
      const loadedWorks = await getWorks();
      store.setWorks(loadedWorks);
      store.setCurrentWorkId(result.workId);

      const loadedChapters = await getChaptersByWorkId(result.workId);
      store.setChapters(loadedChapters);
      const first = loadedChapters[0];
      if (first) {
        store.setCurrentChapterId(first.id);
        store.setEditorContent(first.content || '');
        store.setShouldSyncContent(true);
        store.setWordCount(calculateWordCount(first.content || ''));
      }

      showToast(`导入成功：「${result.title}」共 ${result.chapterCount} 章`, 'success');
    } catch (error: any) {
      console.error('导入失败:', error);
      showToast(`导入失败: ${error.message || error}`, 'error');
    }
  };

  /**
   * 切换 AI 助手面板（菜单/快捷键入口，仅创作视图）
   */
  const handleToggleAiPanel = () => {
    setCurrentView('writer');
    useWriterStore.getState().toggleAiPanel();
  };

  // ==========================================================================
  // 启动配置集成
  // ==========================================================================

  /**
   * 应用启动时加载配置文件
   *
   * 【执行流程】
   * 1. 读取 config.json（读取失败时 configService 内部回退到默认配置）
   * 2. 将配置中的主题应用到 ThemeContext（配置文件为启动时的权威来源）
   * 3. 清除首次启动标记
   * 4. 启动自动备份调度器（含启动补齐逻辑）
   */
  const { setMode: setThemeMode } = useTheme();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const config = await loadConfig();
        if (cancelled) return;

        // 配置文件中的主题优先于 localStorage（保存配置时会同步写入两者）
        const savedMode = localStorage.getItem('theme-mode');
        if (config.theme && config.theme !== savedMode) {
          setThemeMode(config.theme);
        }

        if (config.isFirstLaunch) {
          await updateConfig({ isFirstLaunch: false });
        }

        // 恢复上次窗口状态（位置/尺寸/最大化）
        if (config.window.rememberSize) {
          try {
            const appWindow = getCurrentWindow();
            if (config.window.maximized) {
              await appWindow.maximize();
            } else if (config.window.lastSize) {
              await appWindow.setSize(new LogicalSize(config.window.lastSize.width, config.window.lastSize.height));
              if (config.window.lastPosition) {
                await appWindow.setPosition(new LogicalPosition(config.window.lastPosition.x, config.window.lastPosition.y));
              }
            }
          } catch (error) {
            console.warn('⚠️ 恢复窗口状态失败:', error);
          }
        }

        await startAutoBackupScheduler();
      } catch (error) {
        console.error('❌ 启动配置加载失败:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
    // setMode 来自 ThemeContext，引用稳定；仅在挂载时执行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * 窗口关闭时保存状态（位置/尺寸/最大化）
   * 拦截关闭请求：先写配置再销毁窗口；最大化时只记标志
   */
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let disposed = false;

    (async () => {
      try {
        const appWindow = getCurrentWindow();
        unlisten = await appWindow.onCloseRequested(async (event) => {
          event.preventDefault();
          try {
            const config = await loadConfig();
            if (config.window.rememberSize) {
              const maximized = await appWindow.isMaximized();
              if (maximized) {
                await updateConfig({ window: { ...config.window, maximized: true } });
              } else {
                const size = await appWindow.innerSize();
                const position = await appWindow.outerPosition();
                const scale = await appWindow.scaleFactor();
                await updateConfig({
                  window: {
                    ...config.window,
                    maximized: false,
                    lastSize: { width: Math.round(size.width / scale), height: Math.round(size.height / scale) },
                    lastPosition: { x: Math.round(position.x / scale), y: Math.round(position.y / scale) },
                  },
                });
              }
            }
          } catch (error) {
            console.warn('⚠️ 保存窗口状态失败:', error);
          } finally {
            await appWindow.destroy();
          }
        });
        if (disposed) unlisten();
      } catch {
        // 非 Tauri 环境忽略
      }
    })();

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  // ==========================================================================
  // 事件处理函数
  // ==========================================================================

  /**
   * 处理视图切换
   *
   * 【触发时机】
   * - 用户点击导航栏的视图图标
   *
   * 【执行逻辑】
   * 1. 如果切换到创作视图（view === 'writer'）：
   *    - 如果已经在创作视图：切换侧边栏显示状态
   *    - 如果从其他视图跳转：显示侧边栏并切换视图
   * 2. 如果切换到其他视图：
   *    - 直接切换到目标视图
   *
   * 【设计说明】
   * - 创作视图的侧边栏可以独立切换
   * - 其他视图没有侧边栏，直接切换视图
   * - 从其他视图跳转到创作视图时，默认显示侧边栏
   *
   * @param view - 目标视图类型
   */
  const handleViewChange = (view: View) => {
    if (view === 'writer') {
      // 切换到创作视图
      if (currentView === 'writer') {
        // 如果已经在创作视图，切换侧边栏状态
        setShowWriterSidebar(prev => !prev);
      } else {
        // 从其他视图跳转到创作视图，固定显示侧边栏
        setShowWriterSidebar(true);
        setCurrentView(view);
      }
    } else {
      // 切换到其他视图（planner 或 director）
      setCurrentView(view);
    }
  };

  /**
   * 处理新建作品
   *
   * 【触发时机】
   * - 用户点击标题栏的"新建作品"菜单项或按下 Ctrl+N
   *
   * 【执行逻辑】
   * 1. 切换到创作视图（对话框在 WriterView 中渲染）
   * 2. 打开 writerStore 中的新建作品对话框
   */
  const handleNewWork = () => {
    setCurrentView('writer');
    useWriterStore.getState().setShowNewWorkDialog(true);
  };

  /**
   * 处理新建章节
   *
   * 【触发时机】
   * - 用户点击标题栏的"新建章节"菜单项或按下 Ctrl+Shift+N
   *
   * 【执行逻辑】
   * 1. 切换到创作视图
   * 2. 已选中作品：打开新建章节对话框
   * 3. 未选中作品：章节必须隶属于作品，改为打开新建作品对话框
   */
  const handleNewChapter = () => {
    setCurrentView('writer');
    const { currentWorkId, setShowNewWorkDialog, setShowNewChapterDialog } =
      useWriterStore.getState();
    if (currentWorkId) {
      setShowNewChapterDialog(true);
    } else {
      setShowNewWorkDialog(true);
    }
  };

  /**
   * 处理导出
   *
   * 【触发时机】
   * - 用户点击标题栏的"导出"菜单项或按下 Ctrl+E
   *
   * 【执行逻辑】
   * 1. 切换到创作视图
   * 2. 打开 writerStore 中的导出对话框
   */
  const handleExport = () => {
    setCurrentView('writer');
    useWriterStore.getState().setShowExportDialog(true);
  };

  /**
   * 处理切换侧边栏
   *
   * 【触发时机】
   * - 用户按下 Ctrl+B / Cmd+B 快捷键
   *
   * 【执行逻辑】
   * - 仅在创作视图有效
   * - 切换侧边栏显示状态
   */
  const handleToggleSidebar = () => {
    if (currentView === 'writer') {
      setShowWriterSidebar(prev => !prev);
    }
  };

  // ==========================================================================
  // 快捷键配置
  // ==========================================================================

  /**
   * 全局快捷键配置
   *
   * 【快捷键列表】
   * - Ctrl+N / Cmd+N: 新建作品
   * - Ctrl+Shift+N / Cmd+Shift+N: 新建章节
   * - Ctrl+E / Cmd+E: 导出
   * - Ctrl+, / Cmd+,: 打开设置
   * - Ctrl+B / Cmd+B: 切换侧边栏（仅创作视图）
   *
   * 【注意事项】
   * - 快捷键在输入框、文本域、可编辑元素中不生效
   * - 自动适配 macOS 和 Windows/Linux 平台
   */
  // ==========================================================================
  // 自定义快捷键生效
  // ==========================================================================

  /**
   * 读取用户自定义快捷键（设置 → 快捷键），保存后实时生效
   *
   * 【说明】
   * - shortcutService 以字符串（如 "Ctrl+Shift+F"）持久化到 localStorage
   * - 此处解析为 useKeyboardShortcuts 需要的结构，并按 action 分派处理函数
   * - SettingsView 保存快捷键后派发 config-changed 事件，此处刷新
   */
  const [customShortcuts, setCustomShortcuts] = useState(() => getShortcuts());

  useEffect(() => {
    const refresh = () => setCustomShortcuts(getShortcuts());
    window.addEventListener('creative-studio:config-changed', refresh);
    // shortcutService 保存只写 localStorage，SettingsView 保存后也会派发上述事件；
    // 同时监听 storage 事件覆盖其它写入路径
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('creative-studio:config-changed', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  /** 将 "Ctrl+Shift+F" 字符串解析为按键配置（末段为按键，其余为修饰键） */
  const parseShortcutString = useCallback((str: string): { key: string; ctrl: boolean; shift: boolean; alt: boolean } => {
    const parts = str.split('+').map((p) => p.trim().toLowerCase()).filter(Boolean);
    return {
      key: parts[parts.length - 1] || '',
      ctrl: parts.includes('ctrl'),
      shift: parts.includes('shift'),
      alt: parts.includes('alt'),
    };
  }, []);

  const shortcuts = useMemo(
    () => [
      { ...parseShortcutString(customShortcuts.global.newWork), handler: handleNewWork, description: '新建作品' },
      { ...parseShortcutString(customShortcuts.global.newChapter), handler: handleNewChapter, description: '新建章节' },
      { ...parseShortcutString(customShortcuts.global.export), handler: handleExport, description: '导出' },
      { ...parseShortcutString(customShortcuts.global.settings), handler: () => setShowSettings(true), description: '设置' },
      { ...parseShortcutString(customShortcuts.global.search), handler: () => setShowSearch(true), description: '全局搜索' },
      { ...parseShortcutString(customShortcuts.global.save), handler: () => {
        window.dispatchEvent(new CustomEvent('creative-studio:save'));
      }, description: '保存' },
      { ...parseShortcutString(customShortcuts.editor.bold), handler: handleToggleSidebar, description: '切换侧边栏' },
      {
        key: 'h',
        ctrl: true,
        handler: () => {
          setCurrentView('writer');
          window.dispatchEvent(new CustomEvent('creative-studio:replace'));
        },
        description: '查找替换',
      },
      {
        key: 'j',
        ctrl: true,
        handler: handleToggleAiPanel,
        description: 'AI 创作助手',
      },
    ],
    [customShortcuts, parseShortcutString, handleNewWork, handleNewChapter, handleExport, handleToggleSidebar, handleToggleAiPanel]
  );

  useKeyboardShortcuts(shortcuts);

  // ==========================================================================
  // 渲染逻辑
  // ==========================================================================

  /**
   * 应用主界面渲染
   *
   * 【布局结构】
   * 1. 外层容器：flex 列布局，占满整个窗口
   * 2. 标题栏：固定在顶部
   * 3. 主内容区：flex 行布局，占满剩余空间
   *    - 导航栏：固定在左侧
   *    - 内容区：根据当前视图显示对应组件
   * 4. 设置面板：模态对话框，覆盖整个应用
   *
   * 【样式说明】
   * - h-screen w-screen: 占满整个屏幕
   * - flex flex-col: 列布局
   * - overflow-hidden: 防止滚动条出现
   * - bg-surface-primary: 使用主题背景色
   *
   * @returns JSX 元素
   */
  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-surface-primary">
      {/* ========================================================================
          自定义标题栏
          ========================================================================

          【功能说明】
          - 显示应用标题和当前文档名称
          - 提供菜单按钮（文件、编辑、视图）
          - 提供窗口控制按钮（最小化、最大化、关闭）

          【Props 说明】
          - documentName: 当前文档名称（暂时为空）
          - onNewWork: 新建作品回调（暂时为占位符）
          - onNewChapter: 新建章节回调（暂时为占位符）
          - onExport: 导出回调（暂时为占位符）
          - onSettings: 打开设置面板的回调
      */}
      <TitleBar
        documentName={currentDocumentName}
        onNewWork={handleNewWork}
        onNewChapter={handleNewChapter}
        onImport={handleImport}
        onExport={handleExport}
        onSettings={() => setShowSettings(true)}
        onToggleSidebar={handleToggleSidebar}
        onSearch={() => setShowSearch(true)}
        onReplace={() => {
          setCurrentView('writer');
          window.dispatchEvent(new CustomEvent('creative-studio:replace'));
        }}
        onTrash={() => setShowTrash(true)}
        onToggleAiPanel={handleToggleAiPanel}
      />

      {/* ========================================================================
          主应用区域
          ========================================================================

          【布局说明】
          - flex-1: 占满剩余空间
          - flex: 行布局（导航栏在左，内容区在右）
          - overflow-hidden: 防止滚动条出现
      */}
      <div className="flex-1 flex overflow-hidden">
        {/* ------------------------------------------------------------------------
            应用导航栏
            ------------------------------------------------------------------------

            【功能说明】
            - 显示三个主要视图的图标（创作、规划、导演）
            - 高亮显示当前视图
            - 提供设置按钮

            【Props 说明】
            - currentView: 当前激活的视图
            - onViewChange: 视图切换回调
            - onSettingsClick: 设置按钮点击回调
        */}
        <AppNavigation
          currentView={currentView}
          onViewChange={handleViewChange}
          onSettingsClick={() => setShowSettings(true)}
        />

        {/* ------------------------------------------------------------------------
            主内容区域
            ------------------------------------------------------------------------

            【功能说明】
            - 根据当前视图显示对应的内容组件
            - 创作视图支持侧边栏切换
            - 其他视图占满整个内容区

            【布局说明】
            - flex-1: 占满剩余空间
            - flex flex-col: 列布局
            - overflow-hidden: 防止滚动条出现
        */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* 创作视图 */}
          {currentView === 'writer' && (
            <WriterView
              showSidebar={showWriterSidebar}
              onToggleSidebar={() => setShowWriterSidebar(prev => !prev)}
            />
          )}

          {/* 规划视图 */}
          {currentView === 'planner' && <PlannerView />}

          {/* 导演视图 */}
          {currentView === 'director' && <DirectorView />}
        </div>
      </div>

      {/* ========================================================================
          设置面板（模态对话框）
          ========================================================================

          【功能说明】
          - 显示设置界面（用户信息、外观设置等）
          - 带背景遮罩，覆盖整个应用
          - 点击关闭按钮或遮罩可关闭

          【显示条件】
          - showSettings 为 true 时显示

          【注意事项】
          - AI 功能已移除，无需进行 AI 配置检查
      */}
      {showSettings && <SettingsView onClose={() => setShowSettings(false)} />}

      {/* 回收站 */}
      {showTrash && (
        <TrashDialog
          onClose={() => setShowTrash(false)}
          onChanged={() => {
            // 恢复/删除后刷新侧边栏的作品与当前作品的章节列表
            const store = useWriterStore.getState();
            getWorks()
              .then(async (loaded) => {
                store.setWorks(loaded);
                const active = store.currentWorkId || loaded[0]?.id;
                if (active) {
                  const chapters = await getChaptersByWorkId(active);
                  useWriterStore.getState().setChapters(chapters);
                }
              })
              .catch(() => undefined);
          }}
        />
      )}

      {/* 全局搜索面板 */}
      {showSearch && (
        <SearchPanel
          onClose={() => setShowSearch(false)}
          onOpenChapter={handleOpenChapter}
        />
      )}

      {/* 全局 Toast */}
      {ToastComponent}
    </div>
  );
}

// 导出 App 组件
export default App;
