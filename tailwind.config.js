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
        // 品牌色彩系统
        primary: {
          40: 'var(--primary-40)',
          500: 'var(--primary-40)',
          60: 'var(--primary-60)',
          80: 'var(--primary-80)',
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
