/**
 * Creative Studio - 主应用组件
 *
 * 这是应用的根组件，负责：
 * 1. 管理主要视图切换（创作、规划、导演）
 * 2. 控制设置面板的显示/隐藏
 * 3. 协调左侧导航栏和主内容区域的交互
 * 4. 管理标题栏状态和回调
 * 5. 显示 AI 服务状态横幅（优雅降级）
 */
import { useState } from 'react';
import TitleBar from './components/TitleBar';
import AppNavigation from './components/AppNavigation';
import AIServiceStatusBanner from './components/AIServiceStatusBanner';
import WriterView from './views/WriterView';
import DirectorView from './views/DirectorView';
import PlannerView from './views/PlannerView';
import SettingsView from './views/SettingsView';

// 定义视图类型：创作、规划、导演
type View = 'writer' | 'planner' | 'director';

function App() {
  // 当前激活的视图
  const [currentView, setCurrentView] = useState<View>('writer');
  // 设置面板的显示状态
  const [showSettings, setShowSettings] = useState(false);
  // WriterView 的侧边栏显示状态
  const [showWriterSidebar, setShowWriterSidebar] = useState(true);
  // 当前文档名称（用于标题栏显示，暂时为空）
  const currentDocumentName = '';

  // 处理视图切换
  const handleViewChange = (view: View) => {
    if (view === 'writer') {
      if (currentView === 'writer') {
        // 如果已经在创作页面，切换侧边栏状态
        setShowWriterSidebar(prev => !prev);
      } else {
        // 从其他页面跳转到创作页面，固定显示侧边栏
        setShowWriterSidebar(true);
        setCurrentView(view);
      }
    } else {
      // 切换到其他视图
      setCurrentView(view);
    }
  };

  // 标题栏菜单回调（暂时为占位符，功能由各视图内部处理）
  const handleNewWork = () => {
    console.log('新建作品功能暂由视图内部按钮触发');
  };

  const handleNewChapter = () => {
    console.log('新建章节功能暂由视图内部按钮触发');
  };

  const handleExport = () => {
    console.log('导出功能暂由视图内部按钮触发');
  };

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#faf8f5]">
      {/* Custom Title Bar */}
      <TitleBar
        documentName={currentDocumentName}
        onNewWork={handleNewWork}
        onNewChapter={handleNewChapter}
        onExport={handleExport}
        onSettings={() => setShowSettings(true)}
      />

      {/* AI Service Status Banner - 当AI不可用时显示 */}
      <AIServiceStatusBanner dismissible={true} />

      {/* Main Application Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* App Navigation Rail */}
        <AppNavigation
          currentView={currentView}
          onViewChange={handleViewChange}
          onSettingsClick={() => setShowSettings(true)}
        />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {currentView === 'writer' && (
            <WriterView
              showSidebar={showWriterSidebar}
              onToggleSidebar={() => setShowWriterSidebar(prev => !prev)}
            />
          )}
          {currentView === 'planner' && <PlannerView />}
          {currentView === 'director' && <DirectorView />}
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && <SettingsView onClose={() => setShowSettings(false)} />}
    </div>
  );
}

export default App;
