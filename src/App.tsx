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

import { useState } from 'react';
import TitleBar from './components/TitleBar';
import AppNavigation from './components/AppNavigation';
import WriterView from './views/WriterView';
import DirectorView from './views/DirectorView';
import PlannerView from './views/PlannerView';
import SettingsView from './views/SettingsView';
import { useKeyboardShortcuts, ShortcutPresets } from './hooks/useKeyboardShortcuts';

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
   * 【默认值】
   * - '': 空字符串
   *
   * 【用途】
   * - 在标题栏显示当前编辑的文档名称
   * - 暂时为空，未来可以根据当前作品/章节动态设置
   */
  const currentDocumentName = '';

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
   * - 用户点击标题栏的"新建作品"菜单项
   *
   * 【当前实现】
   * - 暂时为占位符，输出日志
   * - 实际功能由 WriterView 内部的新建按钮触发
   *
   * 【未来扩展】
   * - 可以在这里实现全局新建作品功能
   * - 或者在各视图内部实现，保持功能内聚
   */
  const handleNewWork = () => {
    console.log('新建作品功能暂由视图内部按钮触发');
  };

  /**
   * 处理新建章节
   *
   * 【触发时机】
   * - 用户点击标题栏的"新建章节"菜单项
   *
   * 【当前实现】
   * - 暂时为占位符，输出日志
   * - 实际功能由 WriterView 内部的新建按钮触发
   *
   * 【未来扩展】
   * - 可以在这里实现全局新建章节功能
   * - 或者在 WriterView 内部实现，保持功能内聚
   */
  const handleNewChapter = () => {
    console.log('新建章节功能暂由视图内部按钮触发');
  };

  /**
   * 处理导出
   *
   * 【触发时机】
   * - 用户点击标题栏的"导出"菜单项
   *
   * 【当前实现】
   * - 暂时为占位符，输出日志
   * - 实际功能由各视图内部的导出按钮触发
   *
   * 【未来扩展】
   * - 可以在这里实现全局导出功能
   * - 或者在各视图内部实现，根据视图类型选择导出格式
   */
  const handleExport = () => {
    console.log('导出功能暂由视图内部按钮触发');
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
  useKeyboardShortcuts([
    ShortcutPresets.new(handleNewWork),
    ShortcutPresets.newChapter(handleNewChapter),
    ShortcutPresets.export(handleExport),
    ShortcutPresets.settings(() => setShowSettings(true)),
    ShortcutPresets.toggleSidebar(handleToggleSidebar),
  ]);

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
        onExport={handleExport}
        onSettings={() => setShowSettings(true)}
        onToggleSidebar={handleToggleSidebar}
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
    </div>
  );
}

// 导出 App 组件
export default App;
