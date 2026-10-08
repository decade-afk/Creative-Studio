---
name: creative-studio
description: Use when the user asks to write/edit novels or scripts stored in the Creative Studio desktop app, continue or review chapters with the app's built-in AI, generate outlines from a premise, or search their writing library. Requires the Creative Studio app to be running (its Agent API listens on 127.0.0.1:8765). Tools: list_works, create_work, update_work, delete_work, list_chapters, read_chapter, create_chapter, write_chapter, delete_chapter, get_outline, delete_outline_node, list_characters, create_character, list_scenes, create_scene, list_world_settings, create_world_setting, list_clues, create_clue, resolve_clue, list_conflicts, create_conflict, list_storyboards, list_submissions, ai_continue, ai_review, ai_summary, ai_outline, ai_gen_characters, ai_gen_scenes, ai_detect_clues, ai_gen_storyboards, export_work, import_text, list_chapter_versions, save_chapter_version, search, work_stats.
---

# Creative Studio 创作库操作

通过 MCP 工具直接操作 Creative Studio 桌面软件的创作库（与软件 UI 同一数据库，双方写入实时互通）。

## 前置条件

Creative Studio 应用必须**正在运行**（Agent API 随应用启动，监听 `127.0.0.1:8765`）。
若所有工具都报连接错误，提醒用户先启动 Creative Studio。

## 工具速查

| 工具 | 用途 | 关键参数 |
|------|------|---------|
| `list_works` | 列出全部作品（含章节数/总字数） | — |
| `create_work` | 新建作品 | `title`、`type`（novel/script） |
| `list_chapters` | 作品的章节列表（含字数） | `workId` |
| `read_chapter` | 读章节全文（plainText 最适合阅读） | `chapterId` |
| `create_chapter` | 新建章节（content 接受纯文本，自动分段） | `workId`、`title`、`content` |
| `write_chapter` | 整章替换（**先读后写**，别盲目覆盖） | `chapterId`、`content` |
| `delete_chapter` | 软删除（用户可在回收站恢复） | `chapterId` |
| `ai_continue` | 用**软件内置配置的模型**续写并自动追加保存 | `chapterId`、`instruction?` |
| `ai_review` | 软件模型审稿（逻辑/时间线/人物/伏笔/文笔） | `chapterId` |
| `ai_outline` | 一句话创意 → N 章大纲 → 写入软件大纲树 | `workId`、`premise`、`chapterCount?` |
| `search` | 跨作品全文搜索 | `query`（≥2 字符） |
| `work_stats` | 章节数/总字数 | `workId` |

## 推荐工作流

**续写一章**：`list_works` → `list_chapters` → `read_chapter`（吃透上下文与文风）→ `ai_continue`（让软件的模型续写，或自己写好后 `write_chapter`）→ `read_chapter` 复核。

**按审稿意见修改**：`ai_review` 拿报告 → 与用户确认要修哪些点 → `read_chapter` → 自己改写全文 → `write_chapter` 写回。

**从零开书**：与用户敲定一句话创意 → `create_work` → `ai_outline` 生成大纲树（用户可在软件"规划"视图查看/调整）→ 逐章 `create_chapter`。

**查找内容**：`search` 定位章节 → `read_chapter` 读全文。

## 注意事项

1. **写作偏好**：正文用简体中文；`create_chapter`/`write_chapter` 传纯文本即可（软件自动转 HTML 分段），无需手写 HTML。
2. **不要无确认地整章覆盖**（`write_chapter` 是替换语义）；软件有版本快照但谨慎为上。
3. `ai_*` 工具用的是软件设置里配置的模型——与 agent 自己的模型无关；如果用户说"AI 报错"，多半是软件的 AI 服务未配置（设置 → AI 服务）。
4. 用户在软件 UI 里的修改，agent 下次读取即可见（同一数据库），无需刷新。
