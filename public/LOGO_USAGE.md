# 🎨 Logo 使用指南

Creative Studio 提供两个版本的 Logo：

## 📁 文件说明

| 文件 | 用途 | 配色方式 |
|------|------|---------|
| `logo.svg` | 通用固定版本 | 固定的淡色配色 |
| `logo-theme.svg` | 主题自适应版本 | 可根据主题动态变化 |

---

## 🎯 logo-theme.svg - 主题自适应版本

### 使用场景
- ✅ 软件左上角标志
- ✅ 导航栏 Logo
- ✅ 需要跟随主题变色的场景

### React/TypeScript 中使用

#### 方法 1: 通过 CSS 变量控制（推荐）

```tsx
// 在组件中
import { useEffect } from 'react';

function AppLogo() {
  // 根据当前主题设置颜色
  const applyTheme = (theme: 'brown' | 'blue' | 'green') => {
    const root = document.documentElement;

    const themes = {
      brown: {
        bgStart: '#f5f3f0',
        bgEnd: '#e8e3dc',
        primaryStart: '#a07d5e',
        primaryEnd: '#8b6342',
        accentStart: '#c38859',
        accentEnd: '#a96f3d',
        inkStart: '#6f4d34',
        inkEnd: '#5a3d2a',
      },
      blue: {
        bgStart: '#f0f4f8',
        bgEnd: '#d9e2ec',
        primaryStart: '#4299e1',
        primaryEnd: '#3182ce',
        accentStart: '#667eea',
        accentEnd: '#5a67d8',
        inkStart: '#2d3748',
        inkEnd: '#1a202c',
      },
      green: {
        bgStart: '#f0f8f4',
        bgEnd: '#d9efe5',
        primaryStart: '#48bb78',
        primaryEnd: '#38a169',
        accentStart: '#68d391',
        accentEnd: '#48bb78',
        inkStart: '#2f855a',
        inkEnd: '#276749',
      },
    };

    const colors = themes[theme];
    root.style.setProperty('--logo-bg-start', colors.bgStart);
    root.style.setProperty('--logo-bg-end', colors.bgEnd);
    root.style.setProperty('--logo-primary-start', colors.primaryStart);
    root.style.setProperty('--logo-primary-end', colors.primaryEnd);
    root.style.setProperty('--logo-accent-start', colors.accentStart);
    root.style.setProperty('--logo-accent-end', colors.accentEnd);
    root.style.setProperty('--logo-ink-start', colors.inkStart);
    root.style.setProperty('--logo-ink-end', colors.inkEnd);
  };

  useEffect(() => {
    // 应用当前主题
    applyTheme('brown'); // 或从状态/LocalStorage读取
  }, []);

  return <img src="/logo-theme.svg" alt="Creative Studio" className="w-12 h-12" />;
}
```

#### 方法 2: 内联样式

```tsx
function AppLogo({ theme }: { theme: ThemeColors }) {
  return (
    <div
      style={{
        '--logo-bg-start': theme.bgStart,
        '--logo-bg-end': theme.bgEnd,
        '--logo-primary-start': theme.primaryStart,
        '--logo-primary-end': theme.primaryEnd,
        '--logo-accent-start': theme.accentStart,
        '--logo-accent-end': theme.accentEnd,
        '--logo-ink-start': theme.inkStart,
        '--logo-ink-end': theme.inkEnd,
      } as React.CSSProperties}
    >
      <img src="/logo-theme.svg" alt="Creative Studio" className="w-12 h-12" />
    </div>
  );
}
```

#### 方法 3: 全局 CSS

```css
/* styles/themes.css */

/* 棕色主题（默认） */
.theme-brown {
  --logo-bg-start: #f5f3f0;
  --logo-bg-end: #e8e3dc;
  --logo-primary-start: #a07d5e;
  --logo-primary-end: #8b6342;
  --logo-accent-start: #c38859;
  --logo-accent-end: #a96f3d;
  --logo-ink-start: #6f4d34;
  --logo-ink-end: #5a3d2a;
}

/* 蓝色主题 */
.theme-blue {
  --logo-bg-start: #f0f4f8;
  --logo-bg-end: #d9e2ec;
  --logo-primary-start: #4299e1;
  --logo-primary-end: #3182ce;
  --logo-accent-start: #667eea;
  --logo-accent-end: #5a67d8;
  --logo-ink-start: #2d3748;
  --logo-ink-end: #1a202c;
}

/* 绿色主题 */
.theme-green {
  --logo-bg-start: #f0f8f4;
  --logo-bg-end: #d9efe5;
  --logo-primary-start: #48bb78;
  --logo-primary-end: #38a169;
  --logo-accent-start: #68d391;
  --logo-accent-end: #48bb78;
  --logo-ink-start: #2f855a;
  --logo-ink-end: #276749;
}

/* 紫色主题 */
.theme-purple {
  --logo-bg-start: #f5f0f8;
  --logo-bg-end: #e9d9ef;
  --logo-primary-start: #9f7aea;
  --logo-primary-end: #805ad5;
  --logo-accent-start: #b794f4;
  --logo-accent-end: #9f7aea;
  --logo-ink-start: #553c9a;
  --logo-ink-end: #44337a;
}
```

```tsx
// 在根组件应用主题类名
function App() {
  const [theme, setTheme] = useState('brown');

  return (
    <div className={`theme-${theme}`}>
      <img src="/logo-theme.svg" alt="Creative Studio" />
      {/* 其他内容 */}
    </div>
  );
}
```

---

## 📐 CSS 变量说明

### 必需的 8 个变量

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `--logo-bg-start` | 背景渐变起始色 | `#f5f3f0` |
| `--logo-bg-end` | 背景渐变结束色 | `#e8e3dc` |
| `--logo-primary-start` | 钢笔主色起始 | `#a07d5e` |
| `--logo-primary-end` | 钢笔主色结束 | `#8b6342` |
| `--logo-accent-start` | C字母强调色起始 | `#c38859` |
| `--logo-accent-end` | C字母强调色结束 | `#a96f3d` |
| `--logo-ink-start` | 墨滴颜色起始 | `#6f4d34` |
| `--logo-ink-end` | 墨滴颜色结束 | `#5a3d2a` |

---

## 🎨 预设主题配色

### 棕色主题（温暖、专业）
```css
--logo-bg-start: #f5f3f0;
--logo-bg-end: #e8e3dc;
--logo-primary-start: #a07d5e;
--logo-primary-end: #8b6342;
--logo-accent-start: #c38859;
--logo-accent-end: #a96f3d;
--logo-ink-start: #6f4d34;
--logo-ink-end: #5a3d2a;
```

### 蓝色主题（清新、专注）
```css
--logo-bg-start: #f0f4f8;
--logo-bg-end: #d9e2ec;
--logo-primary-start: #4299e1;
--logo-primary-end: #3182ce;
--logo-accent-start: #667eea;
--logo-accent-end: #5a67d8;
--logo-ink-start: #2d3748;
--logo-ink-end: #1a202c;
```

### 绿色主题（自然、舒适）
```css
--logo-bg-start: #f0f8f4;
--logo-bg-end: #d9efe5;
--logo-primary-start: #48bb78;
--logo-primary-end: #38a169;
--logo-accent-start: #68d391;
--logo-accent-end: #48bb78;
--logo-ink-start: #2f855a;
--logo-ink-end: #276749;
```

### 紫色主题（优雅、创意）
```css
--logo-bg-start: #f5f0f8;
--logo-bg-end: #e9d9ef;
--logo-primary-start: #9f7aea;
--logo-primary-end: #805ad5;
--logo-accent-start: #b794f4;
--logo-accent-end: #9f7aea;
--logo-ink-start: #553c9a;
--logo-ink-end: #44337a;
```

### 深色主题（夜间模式）
```css
--logo-bg-start: #2d3748;
--logo-bg-end: #1a202c;
--logo-primary-start: #a0aec0;
--logo-primary-end: #718096;
--logo-accent-start: #90cdf4;
--logo-accent-end: #63b3ed;
--logo-ink-start: #cbd5e0;
--logo-ink-end: #e2e8f0;
```

---

## 💡 完整示例

### 主题切换器组件

```tsx
// ThemeSwitcher.tsx
import { useState } from 'react';

const themes = {
  brown: '棕色',
  blue: '蓝色',
  green: '绿色',
  purple: '紫色',
  dark: '深色',
};

export function ThemeSwitcher() {
  const [currentTheme, setCurrentTheme] = useState<keyof typeof themes>('brown');

  const switchTheme = (theme: keyof typeof themes) => {
    setCurrentTheme(theme);
    document.documentElement.className = `theme-${theme}`;
  };

  return (
    <div className="flex gap-2">
      {Object.entries(themes).map(([key, name]) => (
        <button
          key={key}
          onClick={() => switchTheme(key as keyof typeof themes)}
          className={`px-3 py-1 rounded ${
            currentTheme === key ? 'bg-primary-500 text-white' : 'bg-gray-200'
          }`}
        >
          {name}
        </button>
      ))}
    </div>
  );
}
```

### 应用到导航栏

```tsx
// AppNavigation.tsx
export function AppNavigation() {
  return (
    <nav className="flex items-center gap-4 p-4">
      {/* Logo - 自动跟随主题变色 */}
      <img
        src="/logo-theme.svg"
        alt="Creative Studio"
        className="w-10 h-10"
      />

      {/* 其他导航内容 */}
      <div className="flex-1">
        {/* ... */}
      </div>

      {/* 主题切换器 */}
      <ThemeSwitcher />
    </nav>
  );
}
```

---

## 🔧 故障排查

### Logo 颜色没有变化

1. **检查 CSS 变量是否正确设置**
   ```javascript
   console.log(
     getComputedStyle(document.documentElement)
       .getPropertyValue('--logo-bg-start')
   );
   ```

2. **确保 SVG 正确加载**
   - 检查文件路径是否正确
   - 确认 SVG 包含 `class="logo-theme"`

3. **CSS 优先级问题**
   - 使用 `!important` 强制覆盖
   - 检查是否有其他样式覆盖

### 渐变显示异常

- 确保所有 8 个 CSS 变量都已设置
- 检查颜色值格式（使用 HEX 格式）

---

## 📝 最佳实践

1. **主题持久化**
   ```typescript
   // 保存主题到 localStorage
   localStorage.setItem('theme', 'brown');

   // 读取主题
   const savedTheme = localStorage.getItem('theme') || 'brown';
   ```

2. **跟随系统主题**
   ```typescript
   const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
   const theme = prefersDark ? 'dark' : 'brown';
   ```

3. **平滑过渡**
   ```css
   .logo-theme {
     transition: all 0.3s ease;
   }
   ```

---

## 🎯 总结

- **固定版本** (`logo.svg`): 用于不需要变色的场景
- **主题版本** (`logo-theme.svg`): 用于跟随主题动态变色

通过 CSS 变量，你可以轻松实现：
- ✅ 多主题切换
- ✅ 深色/浅色模式
- ✅ 用户自定义配色
- ✅ 品牌色一键切换
