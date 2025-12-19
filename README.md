# Creative Studio Desktop

<div align="center">

![Creative Studio Logo](../assets/logo.svg)

**专业创作者的本地智能创作工作台**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Rust](https://img.shields.io/badge/Rust-1.0-orange)](https://www.rust-lang.org/)
[![React](https://img.shields.io/badge/React-19-blue)](https://reactjs.org/)
[![Tauri](https://img.shields.io/badge/Tauri-2.0-00C4B7)](https://tauri.app/)

[下载应用](#下载) • [功能特性](#功能特性) • [快速开始](#快速开始) • [开发指南](#开发指南)

</div>

## 概述

Creative Studio Desktop 是一款专为独立创作者、编剧和小说家设计的本地优先桌面应用。它将创作、规划、导演、设定四个维度融为一体，通过端侧 AI 在保障用户数据隐私的前提下，提供智能化的剧情分析、伏笔追踪、冲突点管理和分镜绘制能力。

### 核心特点

- 🔒 **端侧 AI 驱动**：所有 AI 推理均在本地运行，确保数据隐私
- 📚 **多作品管理**：支持同时管理多个小说或短剧项目
- 🖥️ **四重视图**：Writer（创作）、Planner（规划）、Director（导演）、Settings（设置）
- 💾 **本地优先架构**：数据存储在本地，可选云端同步
- 🎭 **专业工具**：冲突分析系统、伏笔追踪、角色关系图

## 功能特性

### ✍️ Writer（创作视图）

沉浸式的专业创作环境

- **智能编辑器**：支持 Fountain 剧本格式和 Markdown
- **手机预览**：实时模拟竖屏阅读体验
- **AI 续写助手**：基于上下文的智能续写
- **格式渲染**：专业的剧本和小说格式展示
- **快捷操作**：快速插入场景、角色、对话

### 📋 Planner（规划视图）

结构化的内容管理工具

- **看板式大纲**：拖拽式章节管理
- **角色卡片**：可视化角色关系网络
- **世界观维基**：6种分类的设定管理
- **智能生成**：AI 辅助创建角色和设定
- **标签系统**：灵活的分类和筛选

### 🎬 Director（导演视图）

专业的剧情分析工具

- **结构分析**：经典三幕式结构检测
- **伏笔追踪**：AI 自动检测 + 手动标记
- **冲突管理**：四种类型 × 四级强度评估
- **时间线管理**：支持插叙、倒叙、平行叙事
- **分镜实验室**：AI 生成分镜脚本

### ⚙️ Settings（设置视图）

全面的系统配置中心

- **AI 配置**：模型选择、参数调节、性能优化
- **编辑器设置**：字体、主题、快捷键
- **数据管理**：自动备份、导入导出、存储位置
- **外观主题**：深色/浅色/自动主题、品牌色定制
- **关于信息**：版本更新、使用统计、帮助文档

## 技术架构

### 前端技术栈
- **框架**：React 19 + TypeScript
- **UI 库**：TailwindCSS 4.x
- **状态管理**：React Hooks + Context API
- **路由**：React Router v6
- **构建工具**：Vite 7.x

### 后端技术栈
- **框架**：Tauri 2.0
- **语言**：Rust
- **AI 引擎**：loci（本地 llama.cpp）
- **数据库**：SQLite（tauri-plugin-sql）
- **文件系统**：tauri-plugin-fs

### 系统架构图

```
┌─────────────────────────────────────────────────┐
│                Desktop 应用                      │
├─────────────────────────────────────────────────┤
│                                                 │
│  React 前端                                     │
│  ├─ Writer View    (创作编辑器)                 │
│  ├─ Planner View   (规划管理)                   │
│  ├─ Director View  (导演工具)                   │
│  └─ Settings View  (系统设置)                   │
│                                                 │
│  ─────────────────────────────────────────────   │
│                                                 │
│  Tauri 后端                                     │
│  ├─ AI Commands    (AI 接口)                    │
│  ├─ File Commands  (文件操作)                   │
│  ├─ Export Commands (导出功能)                  │
│  └─ DB Commands     (数据管理)                   │
│                                                 │
│  ─────────────────────────────────────────────   │
│                                                 │
│  loci AI 核心                                   │
│  ├─ Engine         (推理引擎)                   │
│  ├─ Agent System   (智能体系统)                 │
│  └─ System Info    (硬件检测)                   │
└─────────────────────────────────────────────────┘
```

## 快速开始

### 系统要求

- **操作系统**：Windows 10+ / macOS 10.15+ / Linux (Ubuntu 20.04+)
- **内存**：8GB RAM（推荐 16GB）
- **存储**：2GB 可用空间
- **GPU**：支持 OpenCL 1.2+（可选，用于 AI 加速）

### 下载安装

#### Windows
1. 下载 `Creative-Studio-Setup-x.x.x.exe`
2. 运行安装程序，按提示完成安装
3. 启动应用，开始创作

#### macOS
1. 下载 `Creative-Studio-x.x.x.dmg`
2. 打开 DMG 文件，拖拽到 Applications
3. 首次运行需要在"系统偏好设置"中允许

#### Linux
```bash
# Ubuntu/Debian
wget https://releases.creative-studio.app/creative-studio_x.x.x_amd64.deb
sudo dpkg -i creative-studio_x.x.x_amd64.deb

# 或使用 AppImage
wget https://releases.creative-studio.app/creative-studio-x.x.x.AppImage
chmod +x creative-studio-x.x.x.AppImage
./creative-studio-x.x.x.AppImage
```

### 首次使用

1. **启动应用**：双击桌面图标或从开始菜单启动
2. **AI 配置**：首次启动会引导配置 AI 模型
3. **创建作品**：点击"新建作品"开始创作
4. **探索功能**：通过顶部导航栏切换不同视图

## 开发指南

### 环境搭建

```bash
# 1. 克隆仓库
git clone https://github.com/your-org/creative-studio.git
cd creative-studio/desktop

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm run tauri dev
```

### 项目结构

```
desktop/
├── src/                  # 前端源码
│   ├── views/           # 视图组件
│   ├── components/      # 通用组件
│   ├── services/        # API 服务
│   └── types/           # 类型定义
├── src-tauri/           # 后端源码
│   ├── src/            # Rust 源码
│   ├── Cargo.toml      # Rust 依赖
│   └── tauri.conf.json # Tauri 配置
├── public/             # 静态资源
├── package.json        # 前端依赖
└── README.md          # 本文件
```

### 构建发布

```bash
# 开发构建
npm run tauri build

# 生产构建
npm run tauri build -- --release

# 指定目标平台
npm run tauri build -- --target x86_64-pc-windows-msvc
```

## 使用指南

### 创作流程

1. **作品规划**：在 Planner 视图中创建大纲和角色
2. **内容创作**：在 Writer 视图中编写具体内容
3. **结构分析**：在 Director 视图中分析剧情结构
4. **导出发布**：导出为所需格式进行分享

### AI 使用技巧

- **续写**：选中文字后点击"AI 续写"
- **润色**：使用"AI 润色"改善文笔
- **生成**：通过提示词生成新内容
- **分析**：让 AI 分析剧情和角色

### 数据管理

- **自动保存**：默认每 30 秒自动保存
- **版本历史**：保留最近的 10 个版本
- **导入导出**：支持多种格式互转
- **云同步**：可选的云端备份服务

## 常见问题

### Q: AI 模型如何选择？
A: 建议根据设备性能选择：
- 8GB 内存：使用 3B 模型
- 16GB 内存：使用 7B 模型
- 32GB+ 内存：使用 13B+ 模型

### Q: 如何提高 AI 响应速度？
A: 
- 开启 GPU 加速
- 调整上下文大小
- 使用量化模型

### Q: 数据存储在哪里？
A: 
- Windows: `%APPDATA%/creative-studio`
- macOS: `~/Library/Application Support/creative-studio`
- Linux: `~/.local/share/creative-studio`

### Q: 如何备份作品？
A: 
- 使用内置的导出功能
- 或者直接备份整个数据目录

## 贡献指南

我们欢迎社区贡献！请查看 [CONTRIBUTING.md](CONTRIBUTING.md) 了解详细信息。

### 开发流程

1. Fork 项目
2. 创建特性分支
3. 提交更改
4. 发起 Pull Request

### 代码规范

- Rust: 使用 `cargo fmt` 和 `cargo clippy`
- TypeScript: 使用 ESLint 和 Prettier
- 提交信息: 遵循 [Conventional Commits](https://conventionalcommits.org/)

## 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 联系我们

- **官方网站**: [creative-studio.app](https://creative-studio.app)
- **问题反馈**: [GitHub Issues](https://github.com/your-org/creative-studio/issues)
- **社区讨论**: [Discord](https://discord.gg/creative-studio)
- **邮件联系**: support@creative-studio.app

---

<div align="center">

**让 AI 成为你的创作伙伴** ❤️

Made with ❤️ by Creative Studio Team

</div>