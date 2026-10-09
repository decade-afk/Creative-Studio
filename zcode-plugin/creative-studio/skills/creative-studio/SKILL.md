---
name: creative-studio
description: Use when the user asks to write/edit novels or scripts stored in the Creative Studio desktop app, continue or review chapters with the app's built-in AI, generate outlines from a premise, or search their writing library. Requires the Creative Studio app to be running (its Agent API listens on 127.0.0.1:8765). Tools: list_works, create_work, update_work, delete_work, list_chapters, read_chapter, create_chapter, write_chapter, delete_chapter, get_outline, create_outline_node, create_outline_batch, update_outline_node, delete_outline_node, list_characters, create_character, list_scenes, create_scene, list_world_settings, create_world_setting, list_clues, create_clue, resolve_clue, list_conflicts, create_conflict, list_storyboards, list_submissions, ai_continue, ai_review, ai_summary, ai_outline, ai_gen_characters, ai_gen_scenes, ai_detect_clues, ai_gen_storyboards, get_story_context, prepare_ai, prepare_outline, append_chapter_content, update_chapter_summary, export_work, import_text, list_chapter_versions, save_chapter_version, search, work_stats.
---

# Creative Studio 创作库操作

通过 MCP 工具直接操作 Creative Studio 桌面软件的创作库（与软件 UI 同一数据库，双方写入实时互通）。

## 前置条件

Creative Studio 应用必须**正在运行**（Agent API 随应用启动，监听 `127.0.0.1:8765`）。
若所有工具都报连接错误，提醒用户先启动 Creative Studio。


## AI 能力接管原则（重要）

**你（agent）就是软件的 AI 引擎。** 软件里是否配置了 AI 服务无关紧要：
- 用户让你续写/润色/扩写/摘要/审稿/写大纲时，**默认走 `prepare_ai` / `prepare_outline` 通道**：软件负责把上下文（世界书/前情链/角色卡/作者注/防AI味约束）组装成完整 messages，你用自己的模型生成，再经 `append_chapter_content` / `update_chapter_summary` / `write_chapter` 写回。
- **不要因为"软件未配置 AI"而拒绝创作任务**——那只是软件内置面板依赖配置，与你无关。
- `ai_*` 工具（软件内置模型）只在用户明确说"用软件的模型/软件里的 AI 跑"时才用。

## 工具速查

| 工具 | 用途 | 关键参数 |
|------|------|---------|
| `list_works` | 列出全部作品（含章节数/总字数） | — |
| `create_work` | 新建作品 | `title`、`type`（novel/script） |
| `list_chapters` | 作品的章节列表（含字数） | `workId` |
| `read_chapter` | 读章节全文（plainText 最适合阅读） | `chapterId` |
| `create_chapter` | 新建章节（content 接受纯文本，自动分段） | `workId`、`title`、`content` |
| `write_chapter` | 整章替换（**先读后写**，大改前先 `save_chapter_version`） | `chapterId`、`content` |
| `delete_chapter` | 软删除（用户可在回收站恢复） | `chapterId` |
| `get_outline` | 读大纲树（act/scene/event 节点） | `workId` |
| `create_outline_node` | 建大纲节点（缺省挂根层；有 `parentId` 默认 scene 类型） | `workId`、`title`、`parentId?`、`type?`、`order?` |
| `create_outline_batch` | **一次写入整棵大纲子树**（`nodes` 支持嵌套 `children`，事务回滚） | `workId`、`nodes[]` |
| `update_outline_node` | 改节点标题/描述/类型/父节点/序号（`parentId` 传 null 提升为根） | `nodeId`、`title?`、`description?`… |
| `delete_outline_node` | 软删除大纲节点 | `nodeId` |
| `list_characters` / `create_character` | 角色库读写 | `workId`、`name`、`personality`、`relationships` |
| `list_world_settings` / `create_world_setting` | 世界观设定读写（category: location/organization/event/culture/technology/magic） | `workId`、`title`、`content` |
| `list_clues` / `create_clue` / `resolve_clue` | 伏笔台账读写与销账 | `workId`、`name`、`status(open/resolved)` |
| `list_conflicts` / `create_conflict` | 冲突登记 | `workId`、`name`、`type`、`intensity` |
| `list_scenes` / `create_scene` | 场景库读写 | `workId`、`name` |
| `list_storyboards` / `list_submissions` | 分镜 / 投递台账 | `workId` |
| `ai_continue` | 用**软件内置配置的模型**续写并自动追加保存 | `chapterId`、`instruction?` |
| `ai_review` | 软件模型审稿（逻辑/时间线/人物/伏笔/文笔） | `chapterId` |
| `ai_summary` | 软件模型生成章节梗概（不改正文） | `chapterId` |
| `ai_outline` | 一句话创意 → 软件模型生成 N 章大纲 → 写入大纲树 | `workId`、`premise`、`chapterCount?` |
| `ai_gen_characters` / `ai_gen_scenes` / `ai_detect_clues` / `ai_gen_storyboards` | 软件模型批量生成角色/场景/检测伏笔/生成分镜 | 见工具描述 |
| `get_story_context` | 组装故事上下文（世界书/前情链/角色卡/作者注）——看 AI 会收到什么 | `workId`、`chapterId?` |
| `prepare_ai` | **免模型密钥**：返回某动作组装好的完整 messages（提示词+上下文），agent 用自己的模型执行 | `chapterId`、`action`(continue/polish/expand/summary/review)、`instruction?`、`selection?`(polish/expand 必填) |
| `prepare_outline` | 免模型密钥：大纲动作的完整 messages（叙事引擎方法论） | `workId`、`premise`、`chapterCount?` |
| `append_chapter_content` | 向章节追加正文（纯文本自动分段）——agent 写回创作结果 | `chapterId`、`text` |
| `update_chapter_summary` | 写章节记忆摘要（后续 prepare 自动携带进前情链） | `chapterId`、`summary`(空串清空) |
| `export_work` | 导出文件（txt/markdown/html/word/epub/script） | `workId`、`format`、`savePath` |
| `import_text` | 导入整本 TXT 自动分章建书 | `title`、`text` |
| `list_chapter_versions` / `save_chapter_version` | 章节版本快照（**agent 大改前务必先存快照**） | `chapterId`、`label?` |
| `search` | 跨作品全文搜索 | `query`（≥2 字符） |
| `work_stats` | 章节数/总字数 | `workId` |

## 推荐工作流

**续写一章（默认走接管通道）**：`prepare_ai`(action=continue) → 阅读返回的 messages（含前情链与文风约束）→ 用你的模型写 400-700 字 → `append_chapter_content` 写回 → `read_chapter` 复核 → `prepare_ai`(action=summary) 生成摘要 → `update_chapter_summary` 存档（下一章自动进前情链）。

**续写一章**：`list_works` → `list_chapters` → `read_chapter`（吃透上下文与文风）→ `ai_continue`（让软件的模型续写，或自己写好后 `write_chapter`）→ `read_chapter` 复核。

**按审稿意见修改**：`ai_review` 拿报告 → 与用户确认要修哪些点 → `read_chapter` → `save_chapter_version` 存快照 → 自己改写全文 → `write_chapter` 写回。

**agent 自模型创作闭环（不依赖软件内置模型）**：
`prepare_ai`(action=continue) 拿组装好的 messages → 用你自己的模型生成正文 → `save_chapter_version` 可选快照 → `append_chapter_content` 写回 → `prepare_ai`(action=summary) → 用你的模型生成摘要 → `update_chapter_summary` 存档（下一章 prepare 时自动进前情链）→ 下一章循环。世界书条目（`list_world_settings`/`create_world_setting`）与角色库会被自动扫描注入，无需手动拼接。

**从零开书**：与用户敲定一句话创意 → `create_work` → 自己拟好分章大纲 → `create_outline_batch` 一次写入大纲树（内容完全由 agent 决定，比 `ai_outline` 可控）→ 逐章 `create_chapter`。

**重写/调整大纲**：`get_outline` 读现状 → 与用户确认改法 → `create_outline_batch` 写新结构（或 `update_outline_node` 微调、`delete_outline_node` 清旧节点）。批量写入是事务性的：任一节点非法（缺 title、type 非法、parentId 不存在）整批回滚，不会留半棵树。

**搭设定库**：`create_world_setting` 录世界观/力量体系 → `create_character` 录人物卡 → `create_clue` 登记每条伏笔（回收后 `resolve_clue` 销账）——规划视图与写作时都能直接引用。

**查找内容**：`search` 定位章节 → `read_chapter` 读全文。

## 注意事项

1. **写作偏好**：正文用简体中文；`create_chapter`/`write_chapter` 传纯文本即可（软件自动转 HTML 分段），无需手写 HTML。
2. **不要无确认地整章覆盖**（`write_chapter` 是替换语义）；先 `save_chapter_version` 再动笔。
3. **大纲节点类型**：`act`（卷/幕）、`scene`（章/场）、`event`（事件）。层级约定：卷 → 章；批量写入时 children 自动挂上级节点，跨层挂接才需要显式 `parentId`。
4. `ai_*` 工具用的是**软件设置里配置的模型**（用户说"AI 报错"多半是软件的 AI 服务未配置）；`prepare_*` / `get_story_context` 则**完全免模型**——提示词与上下文由软件组装好，模型用调用方自己的（推荐写作类任务走这条通道，提示词里已含防AI味约束与前情链）。
5. 用户在软件 UI 里的修改，agent 下次读取即可见（同一数据库），无需刷新。
