/**
 * Logo - Creative Studio Logo组件
 *
 * 主题自适应版本，支持通过CSS变量控制颜色
 */

interface LogoProps {
  className?: string;
  size?: number;
}

export default function Logo({ className = "", size = 48 }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      role="img"
      aria-label="Creative Studio"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ cursor: 'pointer', display: 'block' }}
    >
      <defs>
        {/* 背景渐变 */}
        <linearGradient id="logoBgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f5f3f0" />
          <stop offset="100%" stopColor="#e8e3dc" />
        </linearGradient>

        {/* 钢笔主体 */}
        <linearGradient id="logoMainGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a07d5e" />
          <stop offset="100%" stopColor="#8b6342" />
        </linearGradient>

        {/* C字母 */}
        <linearGradient id="logoAccentGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#c38859" />
          <stop offset="100%" stopColor="#a96f3d" />
        </linearGradient>

        {/* 墨滴 */}
        <linearGradient id="logoInkGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6f4d34" />
          <stop offset="100%" stopColor="#5a3d2a" />
        </linearGradient>
      </defs>

      {/* 透明悬停区域 */}
      <rect width="48" height="48" fill="transparent" id="logoHoverTarget" />

      {/* 背景 */}
      <rect width="48" height="48" rx="12" fill="url(#logoBgGradient)" />

      {/* 内容组 */}
      <g id="logoIconRoot">
        {/* 反转 C（开口向右） */}
        <g transform="translate(16,24)">
          <path
            d="M 0 -7 Q -4 0 0 7"
            stroke="url(#logoAccentGradient)"
            strokeWidth="4"
            strokeLinecap="round"
            fill="none"
          />
        </g>

        {/* 钢笔 */}
        <path d="M 28 11 L 34 23 L 28 27 L 22 23 Z" fill="url(#logoMainGradient)" />
        <rect x="26" y="19" width="4" height="8" fill="url(#logoMainGradient)" rx="1" />

        {/* 墨滴 */}
        <circle cx="28" cy="31" r="2.5" fill="url(#logoInkGradient)" opacity="0.9" />
      </g>
    </svg>
  );
}
