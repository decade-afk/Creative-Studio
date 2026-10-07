# Creative Studio Desktop

面向中文创作者的一体化写作工作台：小说 / 短剧双模式编辑、大纲与角色规划、伏笔与冲突管理、AI 辅助创作（续写 / 润色 / 摘要 / 审稿）、全文检索、版本快照、多格式导出与本地备份。

> v0.2.0 · Tauri 2 + React 18 + TypeScript + SQLite

---

## 功能总览

### ✍️ 创作（Writer）
- 富文本编辑器，中文输入法（IME）友好，2 秒防抖自动保存 + `Ctrl+S` 手动保存
- 小说 / 剧本双工具栏，按作品类型切换
- **AI 创作助手**（`Ctrl+J`）：续写、润色（基于选区）、章节摘要、结构化审稿（逻辑硬伤 / 时间线 / 人物一致性 / 伏笔 / 文笔建议），流式输出、可中断，改写前自动创建版本快照
- **版本历史**：手动保存 + 关键操作自动快照（每章保留 20 份），一键恢复
- 字数统计（本章 / 全书）

### 📋 规划（Planner）
- 大纲结构、角色卡片、场景管理、里程碑跟踪

### 🎬 导演（Director）
- 伏笔线索、冲突分析、分镜脚本、素材库

### 🔍 全局搜索（`Ctrl+F`）
- 跨作品、跨章节检索标题与正文，关键词高亮，点击直达章节并滚动定位

### 📤 导出 / 📥 导入
- 导出：TXT、Markdown、HTML、Word (.docx)、EPUB 电子书、Fountain 分镜脚本
- PDF：通过打印预览窗口另存（Windows 选择 "Microsoft Print to PDF"，完美支持中文）
- 导入：TXT / Markdown 自动识别「第X章/节/回」与 Markdown 标题智能分章；无章节结构时按字数自动切分

### 💾 数据与安全
- 本地 SQLite 数据库（UUID 主键、软删除、外键约束、乐观锁字段）
- **自动备份**：`VACUUM INTO` 在线一致性快照，按间隔调度、按数量轮转、一键恢复
- 配置持久化（主题 / 编辑器 / 导出 / 备份 / 窗口 / 最近作品 / AI 服务）
- 自定义标题栏、明暗主题、快捷键可配置

---

## AI 服务配置

进入 **设置 → AI 服务**，选择服务商预设后填入 API Key 与模型即可：

| 服务商 | Base URL | 说明 |
|--------|----------|------|
| Kimi (Moonshot) | `https://api.moonshot.cn/v1` | platform.moonshot.cn |
| DeepSeek | `https://api.deepseek.com/v1` | platform.deepseek.com |
| 智谱 GLM | `https://open.bigmodel.cn/api/paas/v4` | open.bigmodel.cn |
| OpenAI | `https://api.openai.com/v1` | |
| OpenRouter | `https://openrouter.ai/api/v1` | 聚合主流模型 |
| LM Studio | `http://localhost:1234/v1` | 本地推理，无需 Key |
| Ollama | `http://localhost:11434/v1` | 本地推理，无需 Key |
| 自定义 | 任意 OpenAI 兼容接口 | |

要点：
- API Key 只保存在本机 `config.json`，请求由应用后端（Rust reqwest）直接转发，**不经过任何第三方**，也没有浏览器 CORS 限制
- 「获取模型列表」可自动发现本地 / 远端可用模型；「测试连接」发送一条极短消息验证配置
- 工作流参考 [InkOS](https://github.com/Narcooo/inkos) 的创作方法：先摘要、后审稿、改写必有快照

---

## 开发

```bash
npm install          # 安装前端依赖
npm run tauri:dev    # 开发模式（需要 Rust 工具链 + WebView2）
npm run tauri:build  # 打包安装程序
```

技术栈：Tauri 2（Rust 后端：SQL / 文件 / 对话框 / 打印窗口 / AI 流式转发）· React 18 · Zustand · Tailwind CSS · sqlx(SQLite)

代码结构：

```
src/
├── components/     # UI 组件（编辑器、工具栏、AI 面板、搜索、版本、标题栏…）
├── views/          # 三大视图 + 设置
├── stores/         # Zustand 全局状态
├── services/       # 业务服务（作品/章节/AI/导入导出/搜索/备份/配置…）
├── types/          # 类型定义
└── utils/          # 工具函数
src-tauri/
└── src/            # Rust 后端（export.rs 导出全格式 / ai.rs AI 流式转发）
```

数据位置（Windows）：`%APPDATA%\com.creativestudio.desktop`
（`creative-studio.db` 数据库 · `config.json` 配置 · `backups/` 备份）

---

## License

MIT
