/**
 * 文件名：ThemeContext.tsx
 * 模块名称：全局主题管理上下文
 *
 * 【核心功能】
 * 1. 提供全局主题状态管理（浅色/深色/自动）
 * 2. 持久化主题设置到 localStorage
 * 3. 自动检测并跟随系统主题变化
 * 4. 动态应用 CSS 变量实现主题切换
 *
 * 【技术要点】
 * - 使用 React Context API 实现全局状态共享
 * - 使用 window.matchMedia 检测系统主题偏好
 * - 使用 CSS 自定义属性（CSS Variables）实现主题系统
 * - 使用 localStorage 实现设置持久化
 *
 * 【主题系统设计】
 * - 表面色彩：定义背景色、卡片色等
 * - 品牌色彩：定义主色调（棕色系，适合写作应用）
 * - 文本色彩：定义不同层级的文字颜色
 * - 状态层色彩：定义交互状态的叠加色
 *
 * 【重要注意事项】
 * 1. 必须在应用根节点包裹 ThemeProvider
 * 2. 使用 useTheme Hook 获取主题状态
 * 3. CSS 变量定义在 :root 选择器上
 * 4. 暗色模式下添加 'dark' class 到 html 元素
 *
 * 【使用示例】
 * ```tsx
 * // 在 App.tsx 中包裹
 * import { ThemeProvider } from '@/contexts/ThemeContext';
 *
 * function App() {
 *   return (
 *     <ThemeProvider>
 *       <YourApp />
 *     </ThemeProvider>
 *   );
 * }
 *
 * // 在组件中使用
 * import { useTheme } from '@/contexts/ThemeContext';
 *
 * function MyComponent() {
 *   const { mode, appliedTheme, setMode } = useTheme();
 *
 *   return (
 *     <div>
 *       <p>当前模式: {mode}</p>
 *       <p>应用主题: {appliedTheme}</p>
 *       <button onClick={() => setMode('dark')}>切换到深色</button>
 *     </div>
 *   );
 * }
 * ```
 */

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 主题模式类型
 *
 * 【说明】
 * - 'light': 强制使用浅色主题
 * - 'dark': 强制使用深色主题
 * - 'auto': 根据系统主题自动切换
 */
export type ThemeMode = 'light' | 'dark' | 'auto';

/**
 * 实际应用的主题类型
 *
 * 【说明】
 * - 只有两种实际应用的主题
 * - 当 mode 为 'auto' 时，根据系统主题设置为 'light' 或 'dark'
 */
export type AppliedTheme = 'light' | 'dark';

/**
 * Theme Context 接口
 *
 * 【状态说明】
 * - mode: 用户选择的主题模式（可持久化）
 * - appliedTheme: 实际应用的主题（只读，由 mode 计算）
 *
 * 【方法说明】
 * - setMode: 切换主题模式，自动触发主题应用和持久化
 */
interface ThemeContextType {
  /** 用户选择的主题模式 */
  mode: ThemeMode;

  /** 实际应用的主题（light/dark） */
  appliedTheme: AppliedTheme;

  /** 设置主题模式的方法 */
  setMode: (mode: ThemeMode) => void;
}

// ============================================================================
// Context 创建
// ============================================================================

/**
 * Theme Context 实例
 *
 * 【默认值】
 * - 初始值为 undefined
 * - 通过 useTheme Hook 检查是否在 Provider 内使用
 */
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// ============================================================================
// Props 类型定义
// ============================================================================

/**
 * ThemeProvider 组件 Props
 *
 * 【说明】
 * - children: 任意 React 节点
 * - Provider 会将主题状态传递给所有子组件
 */
interface ThemeProviderProps {
  /** 子组件 */
  children: ReactNode;
}

// ============================================================================
// ThemeProvider 组件
// ============================================================================

/**
 * ThemeProvider 组件
 *
 * 【功能说明】
 * - 提供全局主题状态管理
 * - 从 localStorage 读取保存的主题设置
 * - 根据主题模式应用对应的 CSS 变量
 * - 监听系统主题变化（auto 模式下）
 *
 * 【组件结构】
 * 1. 状态初始化：从 localStorage 读取主题模式
 * 2. 主题应用：根据模式设置 CSS 变量
 * 3. 系统监听：auto 模式下监听系统主题变化
 * 4. Context 提供：将主题状态传递给子组件
 *
 * @param props - ThemeProviderProps
 * @returns 包含子组件的 JSX 元素
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  // ==========================================================================
  // 状态初始化
  // ==========================================================================

  /**
   * 主题模式状态
   *
   * 【初始化逻辑】
   * 1. 尝试从 localStorage 读取 'theme-mode'
   * 2. 如果存在且有效，使用保存的值
   * 3. 否则使用默认值 'light'
   *
   * 【持久化说明】
   * - 每次调用 setMode 都会保存到 localStorage
   * - 下次启动应用时自动恢复
   */
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('theme-mode');  // 从 localStorage 读取
    return (saved as ThemeMode) || 'light';  // 转换为 ThemeMode 类型，默认 'light'
  });

  /**
   * 实际应用的主题状态
   *
   * 【计算逻辑】
   * - mode 为 'light' → appliedTheme 为 'light'
   * - mode 为 'dark' → appliedTheme 为 'dark'
   * - mode 为 'auto' → appliedTheme 根据系统主题动态设置
   */
  const [appliedTheme, setAppliedTheme] = useState<AppliedTheme>('light');

  // ==========================================================================
  // 辅助函数
  // ==========================================================================

  /**
   * 检测系统主题偏好
   *
   * 【实现说明】
   * - 使用 window.matchMedia API
   * - 查询 '(prefers-color-scheme: dark)' 媒体查询
   * - 返回系统当前的主题偏好
   *
   * @returns 系统主题（'dark' 或 'light'）
   */
  const getSystemTheme = (): AppliedTheme => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  };

  // ==========================================================================
  // 主题应用函数
  // ==========================================================================

  /**
   * 应用主题到 DOM
   *
   * 【功能说明】
   * - 设置 CSS 自定义属性（CSS Variables）
   * - 在 html 元素上添加/移除 'dark' class
   * - 更新 appliedTheme 状态
   *
   * 【CSS 变量系统】
   * 1. 表面色彩：定义背景色、卡片色、输入框色等
   * 2. 品牌色彩：定义主色调（棕色系，符合写作应用的沉稳气质）
   * 3. 文本色彩：定义不同层级的文字颜色
   * 4. 状态层色彩：定义 hover、pressed 等交互状态的叠加色
   *
   * 【设计原则】
   * - 暗色模式：降低对比度，减少眼睛疲劳
   * - 浅色模式：保持清晰的层次结构
   * - 品牌色：两种模式使用不同的明度，确保可读性
   *
   * @param theme - 要应用的主题（'light' 或 'dark'）
   */
  const applyTheme = (theme: AppliedTheme) => {
    // 获取根元素（html 元素）
    const root = document.documentElement;

    if (theme === 'dark') {
      // ==========================================================================
      // 暗色模式主题
      // ==========================================================================

      // 添加 'dark' class，用于 Tailwind 的 dark: 前缀
      root.classList.add('dark');

      // 表面色彩系统（暗色模式）
      // 【说明】使用深灰色系作为背景，减少眼睛疲劳
      root.style.setProperty('--surface-primary', '#1a1a1a');      // 主背景色
      root.style.setProperty('--surface-secondary', '#2d2d2d');    // 次要背景色（卡片、侧边栏）
      root.style.setProperty('--surface-tertiary', '#404040');      // 第三级背景色（输入框、弹出层）
      root.style.setProperty('--surface-container', '#1e1e1e');    // 容器背景色

      // 品牌色彩系统（保持不变）
      // 【说明】使用棕色系作为品牌色，符合写作应用的沉稳气质
      // 【注意】暗色模式下使用较亮的色调，确保在深色背景上清晰可见
      root.style.setProperty('--primary-40', '#a07d5e');  // 主色调（最亮）
      root.style.setProperty('--primary-60', '#8b6342');  // 主色调（中等）
      root.style.setProperty('--primary-80', '#6f4d34');  // 主色调（最暗）

      // 文本色彩系统（暗色模式）
      // 【说明】使用浅色文字，确保在深色背景上可读
      root.style.setProperty('--on-surface', '#e8e6e3');              // 主文本色（最高对比度）
      root.style.setProperty('--on-surface-variant', '#b8b0a8');      // 次要文本色
      root.style.setProperty('--on-surface-secondary', '#9a9289');    // 辅助文本色（最低对比度）

      // 边框和分割线（暗色模式）
      // 【说明】使用深灰色，与背景融合但不完全消失
      root.style.setProperty('--outline', '#4a4540');           // 边框色
      root.style.setProperty('--outline-variant', '#3d3833');   // 分割线色

      // 状态层色彩（暗色模式）
      // 【说明】使用半透明叠加层实现交互状态
      // 【透明度规则】hover > normal，pressed > hover
      root.style.setProperty('--state-layer-primary', 'rgba(160, 125, 94, 0.12)');      // 主按钮正常状态
      root.style.setProperty('--state-layer-hover', 'rgba(160, 125, 94, 0.16)');       // 主按钮 hover 状态
      root.style.setProperty('--state-layer-pressed', 'rgba(160, 125, 94, 0.20)');     // 主按钮 pressed 状态
      root.style.setProperty('--state-layer-secondary', 'rgba(232, 230, 227, 0.08)');   // 次要按钮正常状态
      root.style.setProperty('--state-layer-secondary-hover', 'rgba(232, 230, 227, 0.12)'); // 次要按钮 hover 状态
      root.style.setProperty('--state-layer-secondary-pressed', 'rgba(232, 230, 227, 0.16)'); // 次要按钮 pressed 状态

    } else {
      // ==========================================================================
      // 浅色模式主题
      // ==========================================================================

      // 移除 'dark' class
      root.classList.remove('dark');

      // 表面色彩系统（浅色模式）
      // 【说明】使用米色系作为背景，营造温暖的写作氛围
      root.style.setProperty('--surface-primary', '#f5f2ed');      // 主背景色（米白色）
      root.style.setProperty('--surface-secondary', '#e8e3dc');    // 次要背景色（浅米色）
      root.style.setProperty('--surface-tertiary', '#ddd6cc');      // 第三级背景色（中米色）
      root.style.setProperty('--surface-container', '#faf8f5');    // 容器背景色（极浅米色）

      // 品牌色彩系统（保持不变）
      // 【说明】使用棕色系作为品牌色
      // 【注意】浅色模式下使用较暗的色调，确保在浅色背景上清晰可见
      root.style.setProperty('--primary-40', '#8b6342');  // 主色调（最亮）
      root.style.setProperty('--primary-60', '#6f4d34');  // 主色调（中等）
      root.style.setProperty('--primary-80', '#5d3f2a');  // 主色调（最暗）

      // 文本色彩系统（浅色模式）
      // 【说明】使用深色文字，确保在浅色背景上可读
      root.style.setProperty('--on-surface', '#38342e');              // 主文本色（最高对比度）
      root.style.setProperty('--on-surface-variant', '#5d554a');      // 次要文本色
      root.style.setProperty('--on-surface-secondary', '#7a6e5f');    // 辅助文本色（最低对比度）

      // 边框和分割线（浅色模式）
      // 【说明】使用半透明棕色，与背景和谐融合
      root.style.setProperty('--outline', 'rgba(122, 110, 95, 0.2)');      // 边框色（20% 透明度）
      root.style.setProperty('--outline-variant', 'rgba(122, 110, 95, 0.15)'); // 分割线色（15% 透明度）

      // 状态层色彩（浅色模式）
      // 【说明】使用半透明叠加层实现交互状态
      root.style.setProperty('--state-layer-primary', 'rgba(139, 99, 66, 0.08)');      // 主按钮正常状态
      root.style.setProperty('--state-layer-hover', 'rgba(139, 99, 66, 0.12)');       // 主按钮 hover 状态
      root.style.setProperty('--state-layer-pressed', 'rgba(139, 99, 66, 0.16)');     // 主按钮 pressed 状态
      root.style.setProperty('--state-layer-secondary', 'rgba(122, 110, 95, 0.08)');   // 次要按钮正常状态
      root.style.setProperty('--state-layer-secondary-hover', 'rgba(122, 110, 95, 0.12)'); // 次要按钮 hover 状态
      root.style.setProperty('--state-layer-secondary-pressed', 'rgba(122, 110, 95, 0.16)'); // 次要按钮 pressed 状态
    }

    // 更新 appliedTheme 状态
    setAppliedTheme(theme);
  };

  // ==========================================================================
  // 主题模式设置函数
  // ==========================================================================

  /**
   * 设置主题模式
   *
   * 【功能说明】
   * - 更新 mode 状态
   * - 持久化到 localStorage
   * - 触发 useEffect 重新应用主题
   *
   * 【使用场景】
   * - 用户点击主题切换按钮
   * - 应用初始化时恢复上次设置
   *
   * @param newMode - 新的主题模式（'light' | 'dark' | 'auto'）
   */
  const setMode = (newMode: ThemeMode) => {
    setModeState(newMode);  // 更新状态
    localStorage.setItem('theme-mode', newMode);  // 持久化到 localStorage
  };

  // ==========================================================================
  // 主题应用监听
  // ==========================================================================

  /**
   * 监听模式变化，应用相应主题
   *
   * 【执行逻辑】
   * 1. 当 mode 变化时触发
   * 2. 如果 mode 为 'auto'：
   *    - 检测当前系统主题
   *    - 应用系统主题
   *    - 监听系统主题变化（用户修改系统设置时自动切换）
   * 3. 如果 mode 为 'light' 或 'dark'：
   *    - 直接应用对应主题
   *    - 不监听系统主题变化
   *
   * 【清理逻辑】
   * - auto 模式下添加系统主题监听器
   * - 组件卸载时移除监听器，避免内存泄漏
   */
  useEffect(() => {
    if (mode === 'auto') {
      // 自动模式：使用系统主题
      const systemTheme = getSystemTheme();  // 获取当前系统主题
      applyTheme(systemTheme);  // 应用系统主题

      // 监听系统主题变化
      // 【说明】当用户在系统设置中切换主题时，应用会自动响应
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

      /**
       * 系统主题变化处理函数
       *
       * @param e - MediaQueryListEvent 事件对象
       */
      const handleChange = (e: MediaQueryListEvent) => {
        applyTheme(e.matches ? 'dark' : 'light');  // 根据匹配结果应用主题
      };

      // 添加监听器
      mediaQuery.addEventListener('change', handleChange);

      // 清理函数：组件卸载时移除监听器
      return () => mediaQuery.removeEventListener('change', handleChange);

    } else {
      // 手动模式：直接应用指定主题
      applyTheme(mode);
    }
  }, [mode]);  // 依赖 mode，mode 变化时重新执行

  // ==========================================================================
  // Context Provider
  // ==========================================================================

  /**
   * 返回 Theme Context Provider
   *
   * 【提供的值】
   * - mode: 用户选择的主题模式
   * - appliedTheme: 实际应用的主题
   * - setMode: 设置主题模式的方法
   */
  return (
    <ThemeContext.Provider value={{ mode, appliedTheme, setMode }}>
      {children}  {/* 渲染子组件 */}
    </ThemeContext.Provider>
  );
}

// ============================================================================
// useTheme Hook
// ============================================================================

/**
 * useTheme Hook
 *
 * 【功能说明】
 * - 在组件中访问主题状态和方法
 * - 必须在 ThemeProvider 内部使用
 *
 * 【错误处理】
 * - 如果在 Provider 外使用，抛出错误
 * - 提供清晰的错误信息，帮助开发者定位问题
 *
 * @returns ThemeContextType 对象
 * @throws Error 如果未在 ThemeProvider 内使用
 *
 * 【使用示例】
 * ```tsx
 * function MyComponent() {
 *   const { mode, appliedTheme, setMode } = useTheme();
 *
 *   return (
 *     <div>
 *       <p>当前模式: {mode}</p>
 *       <button onClick={() => setMode('dark')}>切换到深色</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useTheme() {
  // 从 Context 中获取主题状态
  const context = useContext(ThemeContext);

  // 错误检查：确保在 ThemeProvider 内使用
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }

  return context;
}
