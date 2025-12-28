/**
 * Creative Studio - 应用入口文件
 * 启用React严格模式进行开发时检查
 */
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "./contexts/ThemeContext";
import "./index.css";  // 全局样式和Tailwind CSS

// 创建React根节点并渲染应用
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      {/* 主应用组件 */}
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
