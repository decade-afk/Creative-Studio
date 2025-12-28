/**
 * ThemeContext - 主题上下文
 *
 * 提供全局主题管理功能:
 * - 浅色/深色/自动主题切换
 * - localStorage 持久化
 * - 自动检测系统主题
 */

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type ThemeMode = 'light' | 'dark' | 'auto';
export type AppliedTheme = 'light' | 'dark';

interface ThemeContextType {
  mode: ThemeMode;
  appliedTheme: AppliedTheme;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  // 从 localStorage 读取保存的主题,默认为浅色
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('theme-mode');
    return (saved as ThemeMode) || 'light';
  });

  const [appliedTheme, setAppliedTheme] = useState<AppliedTheme>('light');

  // 检测系统主题
  const getSystemTheme = (): AppliedTheme => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  };

  // 应用主题到 DOM
  const applyTheme = (theme: AppliedTheme) => {
    const root = document.documentElement;

    if (theme === 'dark') {
      root.classList.add('dark');
      root.style.setProperty('--surface-primary', '#1a1a1a');
      root.style.setProperty('--surface-secondary', '#2d2d2d');
      root.style.setProperty('--on-surface-primary', '#ffffff');
      root.style.setProperty('--on-surface-secondary', '#e0e0e0');
      root.style.setProperty('--outline', '#404040');
      root.style.setProperty('--outline-variant', '#333333');
    } else {
      root.classList.remove('dark');
      root.style.setProperty('--surface-primary', '#faf8f5');
      root.style.setProperty('--surface-secondary', '#f2ede7');
      root.style.setProperty('--on-surface-primary', '#38342e');
      root.style.setProperty('--on-surface-secondary', '#7a6e5f');
      root.style.setProperty('--outline', '#e5ddd2');
      root.style.setProperty('--outline-variant', '#e8e3dc');
    }

    setAppliedTheme(theme);
  };

  // 设置主题模式
  const setMode = (newMode: ThemeMode) => {
    setModeState(newMode);
    localStorage.setItem('theme-mode', newMode);
  };

  // 监听模式变化,应用相应主题
  useEffect(() => {
    if (mode === 'auto') {
      const systemTheme = getSystemTheme();
      applyTheme(systemTheme);

      // 监听系统主题变化
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = (e: MediaQueryListEvent) => {
        applyTheme(e.matches ? 'dark' : 'light');
      };

      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    } else {
      applyTheme(mode);
    }
  }, [mode]);

  return (
    <ThemeContext.Provider value={{ mode, appliedTheme, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
