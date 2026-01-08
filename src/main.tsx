/**
 * 文件名：main.tsx
 * 模块名称：Creative Studio 应用入口文件
 *
 * 【核心功能】
 * 1. 应用初始化 - 创建 React 根节点并挂载应用
 * 2. Context 提供 - 提供全局主题上下文
 * 3. 样式导入 - 导入全局样式和 Tailwind CSS
 * 4. 严格模式 - 启用 React 严格模式进行开发时检查
 *
 * 【应用启动流程】
 * 1. 导入必要的模块和组件
 * 2. 导入全局样式
 * 3. 查找 DOM 中的 root 元素
 * 4. 创建 React 根节点
 * 5. 渲染应用（包裹在 ThemeProvider 和 StrictMode 中）
 *
 * 【组件层级结构】
 * ┌─────────────────────────────────────┐
 * │  React.StrictMode (严格模式)        │
 * │  ┌───────────────────────────────┐  │
 * │  │  ThemeProvider (主题提供者)   │  │
 * │  │  ┌─────────────────────────┐  │  │
 * │  │  │  App (主应用组件)      │  │  │
 * │  │  │  ├─ TitleBar           │  │  │
 * │  │  │  ├─ AppNavigation      │  │  │
 * │  │  │  ├─ WriterView         │  │  │
 * │  │  │  ├─ PlannerView        │  │  │
 * │  │  │  ├─ DirectorView       │  │  │
 * │  │  │  └─ SettingsView       │  │  │
 * │  │  └─────────────────────────┘  │  │
 * │  └───────────────────────────────┘  │
 * └─────────────────────────────────────┘
 *
 * 【React.StrictMode 说明】
 * - 严格模式是 React 提供的开发工具
 * - 仅在开发模式下生效，不影响生产环境
 * - 检测潜在问题：
 *   - 不安全的生命周期方法
 *   - 过时的 API 使用
 *   - 意外的副作用
 *   - 不安全的 ref 使用
 * - 会故意双重调用某些函数（如渲染、effect 回调）以检测副作用
 *
 * 【ThemeProvider 说明】
 * - 提供全局主题状态管理
 * - 支持浅色/深色/自动主题切换
 * - 使用 localStorage 持久化主题设置
 * - 自动检测系统主题偏好（自动模式）
 *
 * 【重要注意事项】
 * 1. 确保 index.html 中有 id="root" 的元素
 * 2. 必须在 App 组件外层包裹 ThemeProvider
 * 3. 全局样式必须在组件渲染前导入
 * 4. 严格模式可能导致某些 effect 执行两次，这是正常行为
 *
 * 【使用场景】
 * - 应用启动时自动执行
 * - 不需要手动调用，由构建工具处理
 * - 开发环境启用严格模式，生产环境自动禁用
 */

// ============================================================================
// 模块导入
// ============================================================================

/**
 * 导入 React 核心库
 *
 * 【用途】
 * - 提供 React 组件和 API
 * - 提供 JSX 支持
 * - 提供 StrictMode 组件
 */
import React from "react";

/**
 * 导入 ReactDOM 客户端渲染库
 *
 * 【用途】
 * - 提供 createRoot API（React 18+）
 * - 将 React 组件渲染到 DOM
 * - 支持并发渲染特性
 */
import ReactDOM from "react-dom/client";

/**
 * 导入主应用组件
 *
 * 【说明】
 * - App 组件是应用的根组件
 * - 包含所有子组件和业务逻辑
 * - 管理全局状态和视图切换
 */
import App from "./App";

/**
 * 导入主题提供者
 *
 * 【说明】
 * - ThemeProvider 提供全局主题状态
 * - 使用 React Context API 实现
 * - 支持主题切换和持久化
 */
import { ThemeProvider } from "./contexts/ThemeContext";

/**
 * 导入全局样式
 *
 * 【说明】
 * - index.css 包含全局 CSS 变量
 * - Tailwind CSS 指令在这里导入
 * - 基础样式和重置样式
 *
 * 【导入顺序】
 * - 必须在组件渲染前导入
 * - 确保样式正确应用
 */
import "./index.css";

// ============================================================================
// 应用渲染
// ============================================================================

/**
 * 创建 React 根节点并渲染应用
 *
 * 【执行步骤】
 * 1. 查找 DOM 中的 root 元素
 * 2. 创建 React 根节点（createRoot）
 * 3. 渲染应用（render）
 *
 * 【createRoot 说明】
 * - React 18+ 的新 API
 * - 替代旧的 ReactDOM.render()
 * - 支持并发渲染特性
 * - 提供更好的性能和用户体验
 *
 * 【StrictMode 说明】
 * - 开发工具，检测潜在问题
 * - 仅在开发模式生效
 * - 生产环境自动禁用
 * - 可能双重调用某些函数（正常行为）
 *
 * 【ThemeProvider 说明】
 * - 提供全局主题状态
 * - 所有子组件都可以访问主题
 * - 支持主题切换和持久化
 *
 * 【错误处理】
 * - 如果找不到 root 元素，会抛出错误
 * - 确保 index.html 中有 id="root" 的元素
 */
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  /**
   * React.StrictMode - 严格模式
   *
   * 【功能】
   * - 检测不安全的生命周期方法
   * - 检测过时的 API 使用
   * - 检测意外的副作用
   * - 检测不安全的 ref 使用
   *
   * 【开发模式行为】
   * - 双重调用组件渲染函数
   * - 双重调用 effect 回调
   * - 双重调用状态更新器
   *
   * 【生产模式行为】
   * - 不执行任何检查
   * - 不影响性能
   */
  <React.StrictMode>
    {/**
     * ThemeProvider - 主题提供者
     *
     * 【功能】
     * - 提供全局主题状态
     * - 支持浅色/深色/自动主题
     * - 持久化主题设置
     * - 自动检测系统主题
     *
     * 【Context 值】
     * - mode: 主题模式（'light' | 'dark' | 'auto'）
     * - appliedTheme: 实际应用的主题（'light' | 'dark'）
     * - setMode: 设置主题模式的方法
     */}
    <ThemeProvider>
      {/**
       * App - 主应用组件
       *
       * 【功能】
       * - 管理视图切换
       * - 管理设置面板
       * - 管理侧边栏状态
       *
       * 【子组件】
       * - TitleBar: 自定义标题栏
       * - AppNavigation: 应用导航栏
       * - WriterView: 创作视图
       * - PlannerView: 规划视图
       * - DirectorView: 导演视图
       * - SettingsView: 设置面板
       */}
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
