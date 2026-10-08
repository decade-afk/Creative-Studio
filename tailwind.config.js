/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // 表面色彩系统 - 映射CSS变量
        surface: {
          primary: 'var(--surface-primary)',
          secondary: 'var(--surface-secondary)',
          tertiary: 'var(--surface-tertiary)',
          container: 'var(--surface-container)',
        },
        // 品牌色彩系统（全色阶：40/60/80 为 CSS 变量，其余为派生色调）
        primary: {
          40: 'var(--primary-40)',
          50: '#f7f2ec',
          100: '#ece1d5',
          200: '#d9c3ac',
          300: '#c2a183',
          400: '#a9805f',
          500: 'var(--primary-40)',
          60: 'var(--primary-60)',
          600: 'var(--primary-60)',
          700: 'var(--primary-80)',
          80: 'var(--primary-80)',
          900: '#46301f',
        },
        // 强调色系统（暖金，与品牌棕互补）
        accent: {
          50: '#faf6ec',
          100: '#f0e6d0',
          200: '#e0cda5',
          300: '#c9ab77',
          400: '#b08d57',
          500: '#b08d57',
          600: '#96733f',
          700: '#7a5d33',
          800: '#5d4727',
          900: '#46361d',
        },
        // 文本色彩系统
        text: {
          primary: 'var(--on-surface)',
          variant: 'var(--on-surface-variant)',
          secondary: 'var(--on-surface-secondary)',
        },
        // 边框色彩
        outline: 'var(--outline)',
        'outline-variant': 'var(--outline-variant)',
      },
      // 投影系统
      boxShadow: {
        'elevation-1': 'var(--elevation-1)',
        'elevation-2': 'var(--elevation-2)',
        'elevation-3': 'var(--elevation-3)',
      },
      // 过渡动画
      transitionDuration: {
        fast: 'var(--transition-fast)',
        normal: 'var(--transition-normal)',
        slow: 'var(--transition-slow)',
      },
    },
  },
  plugins: [],
}
