/**
 * AppNavigation - 应用左侧导航栏组件
 *
 * 功能：
 * 1. 显示品牌Logo
 * 2. 提供三个主要视图的切换按钮（创作、规划、导演）
 * 3. 提供设置按钮入口
 *
 * 设计特点：
 * - 固定宽度68px的垂直导航栏
 * - 使用品牌色系的渐变背景
 * - 图标按钮带有悬停和激活状态动画
 */



// 视图类型定义
type View = 'writer' | 'planner' | 'director';

// 组件属性接口
interface AppNavigationProps {
  currentView: View;           // 当前激活的视图
  onViewChange: (view: View) => void;  // 视图切换回调
  onSettingsClick: () => void;  // 设置按钮点击回调
}

export default function AppNavigation({ currentView, onViewChange, onSettingsClick }: AppNavigationProps) {
  return (
    <nav 
      className="flex flex-col items-center z-50"
      style={{
        width: 'var(--navigation-width)',
        backgroundColor: 'var(--surface-secondary)',
        borderRight: '1px solid var(--outline-variant)',
        boxShadow: 'var(--elevation-2)',
        padding: '16px 0'
      }}
    >
      {/* Navigation Items */}
      <div className="flex flex-col items-center flex-1">
        <button
          onClick={() => onViewChange('writer')}
          className={`nav-item ${currentView === 'writer' ? 'active' : ''}`}
          title="创作"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </button>

        <button
          onClick={() => onViewChange('planner')}
          className={`nav-item ${currentView === 'planner' ? 'active' : ''}`}
          title="规划"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zM14 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1v-3z" />
          </svg>
        </button>

        <button
          onClick={() => onViewChange('director')}
          className={`nav-item ${currentView === 'director' ? 'active' : ''}`}
          title="导演"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </button>
      </div>

      {/* Settings Button */}
      <button
        onClick={onSettingsClick}
        className="nav-item"
        title="设置"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
    </nav>
  );
}
