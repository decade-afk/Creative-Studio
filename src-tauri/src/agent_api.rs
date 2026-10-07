/*
 * Agent API 模块 - 本地 REST 服务
 *
 * 【定位】让外部 AI Agent（Claude Code / 任意 LLM 工具循环）直接使用本软件：
 * 读写作品与章节、调用 AI 工作流（续写/审稿/大纲）、全局搜索。
 * 等同于 inkos 的 "agent 操作创作库" 能力，数据面为同一 SQLite 库。
 *
 * 【安全模型】
 * - 仅监听 127.0.0.1（本机进程可见，不暴露网络）
 * - 默认关闭；设置 → Agent API 开启
 * - 端口固定 8765（后续可配）
 *
 * 【端点一览】
 * GET  /api/works                    作品列表（含章节数/总字数）
 * POST /api/works                    创建作品 {title,type}
 * GET  /api/works/:id/chapters       章节列表（含字数）
 * GET  /api/chapters/:id             章节详情（HTML + 纯文本 + 字数）
 * POST /api/chapters                 创建章节 {workId,title,content(文本或HTML)}
 * PUT  /api/chapters/:id/content     更新正文
 * DELETE /api/chapters/:id           软删除
 * POST /api/ai/continue/:chapterId   AI 续写并追加保存 {instruction?}
 * POST /api/ai/review/:chapterId     AI 审稿，返回报告
 * POST /api/ai/outline               AI 生成大纲并入库 {workId,premise,chapterCount}
 * GET  /api/search?q=                全局搜索
 * GET  /api/stats/:workId            作品统计
 */

use tauri::Manager;
use axum::{extract::Path, extract::Query, http::StatusCode, routing::get, Json, Router};
use rusqlite::Connection;
use serde_json::{json, Value};
use std::collections::HashMap;



/** 数据库文件路径（appdata/creative-studio.db） */
fn db_path(app: &tauri::AppHandle) -> Result<String, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取应用数据目录失败: {}", e))?;
    Ok(dir.join("creative-studio.db").to_string_lossy().to_string())
}

/**
 * 打开数据库连接（WAL，busy_timeout 兼容应用内并发写）
 * SQLite 打开成本为微秒级，按请求开连接换取无锁简单性
 */
fn conn(app: &tauri::AppHandle) -> Result<Connection, String> {
    let path = db_path(app)?;
    if !std::path::Path::new(&path).exists() {
        return Err("数据库不存在，请先启动并初始化应用数据".into());
    }
    let c = Connection::open(&path).map_err(|e| format!("打开数据库失败: {}", e))?;
    c.execute_batch("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;")
        .map_err(|e| format!("{}", e))?;
    Ok(c)
}

/** UUID 生成（v4，随机） */
fn uuid() -> String {
    let mut buf = [0u8; 16];
    getrandom_bytes(&mut buf);
    buf[6] = (buf[6] & 0x0f) | 0x40;
    buf[8] = (buf[8] & 0x3f) | 0x80;
    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        buf[0], buf[1], buf[2], buf[3], buf[4], buf[5], buf[6], buf[7],
        buf[8], buf[9], buf[10], buf[11], buf[12], buf[13], buf[14], buf[15]
    )
}

fn getrandom_bytes(buf: &mut [u8]) {
    // 使用系统时间 + 地址熵的简易随机（避免额外依赖；仅用于本地主键）
    use std::time::{SystemTime, UNIX_EPOCH};
    let mut seed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0x9E3779B97F4A7C15);
    let mut state = seed.wrapping_mul(0x2545F4914F6CDD1D).wrapping_add(buf.len() as u64);
    for chunk in buf.chunks_mut(8) {
        // xorshift64*
        state ^= state >> 12;
        state ^= state << 25;
        state ^= state >> 27;
        seed = seed.wrapping_add(state.wrapping_mul(0x2545F4914F6CDD1D));
        let bytes = seed.wrapping_mul(0x2545F4914F6CDD1D).to_le_bytes();
        let n = chunk.len().min(8);
        chunk[..n].copy_from_slice(&bytes[..n]);
    }
}

fn now() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| {
            // ISO 8601（与前端 getCurrentTimestamp 对齐：毫秒精度足够）
            let secs = d.as_secs();
            let millis = d.subsec_millis();
            let days = secs / 86400;
            let (y, mo, da) = civil_from_days(days as i64);
            let (h, mi, s) = (
                (secs % 86400) / 3600,
                (secs % 3600) / 60,
                secs % 60,
            );
            format!(
                "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
                y, mo, da, h, mi, s, millis
            )
        })
        .unwrap_or_default()
}

/** 天数 → 公历日期（Howard Hinnant 算法） */
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/** HTML → 纯文本（与前端一致） */
fn html_to_text(html: &str) -> String {
    let mut pre = html
        .replace("</p>", "\n\n")
        .replace("</div>", "\n\n")
        .replace("<br>", "\n")
        .replace("<br/>", "\n")
        .replace("<br />", "\n");
    let mut out = String::new();
    let mut in_tag = false;
    for ch in pre.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    for (e, r) in [("&nbsp;", " "), ("&lt;", "<"), ("&gt;", ">"), ("&quot;", "\""), ("&amp;", "&")] {
        out = out.replace(e, r);
    }
    pre = out.trim().to_string();
    while pre.contains("\n\n\n") {
        pre = pre.replace("\n\n\n", "\n\n");
    }
    pre
}

/** 文本 → 段落 HTML */
fn text_to_html(text: &str) -> String {
    text.split("\n\n")
        .map(|p| format!("<p>{}</p>", p.trim().replace('\n', "<br>")))
        .collect::<Vec<_>>()
        .join("")
}

/** 简易字数（中文字符 + 英文单词） */
fn word_count(html: &str) -> i64 {
    let text = html_to_text(html);
    let chinese = text.matches(|c: char| ('\u{4e00}'..='\u{9fa5}').contains(&c)).count() as i64;
    let english = text
        .split(|c: char| !c.is_ascii_alphabetic())
        .filter(|w| !w.is_empty())
        .count() as i64;
    chinese + english
}

// ============================================================================
// 处理器
// ============================================================================

type AppState = tauri::AppHandle;

async fn list_works(axum::extract::State(app): axum::extract::State<AppState>) -> Result<Json<Value>, (StatusCode, String)> {
    let db = conn(&app).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    let mut stmt = db
        .prepare("SELECT id, title, type, icon FROM works WHERE deleted = 0 ORDER BY created_at")
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;
    let works = stmt
        .query_map([], |row: &rusqlite::Row| {
            Ok(json!({
                "id": row.get::<_, String>(0)?,
                "title": row.get::<_, String>(1)?,
                "type": row.get::<_, String>(2)?,
                "icon": row.get::<_, String>(3)?,
            }))
        })
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?
        .filter_map(|r| r.ok())
        .collect::<Vec<_>>();

    // 附加章节统计
    let mut result = Vec::new();
    for mut w in works {
        let wid = w["id"].as_str().unwrap_or("").to_string();
        let stats: (i64, i64) = db
            .query_row(
                "SELECT COUNT(*), COALESCE(SUM(LENGTH(content) - LENGTH(REPLACE(content,'<',''))), 0) FROM chapters WHERE work_id = ?1 AND deleted = 0",
                [&wid],
                |r: &rusqlite::Row| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?)),
            )
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;
        w["chapterCount"] = json!(stats.0);
        // 字数用统一口径逐章算（章节数一般不大）
        let mut wc = 0i64;
        let mut stmt = db
            .prepare("SELECT content FROM chapters WHERE work_id = ?1 AND deleted = 0")
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;
        let contents = stmt
            .query_map([&wid], |r| r.get::<_, String>(0))
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;
        for c in contents.flatten() {
            wc += word_count(&c);
        }
        w["totalWords"] = json!(wc);
        result.push(w);
    }
    Ok(Json(json!(result)))
}

async fn create_work(
    axum::extract::State(app): axum::extract::State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let title = body["title"].as_str().ok_or((StatusCode::BAD_REQUEST, "title 必填".into()))?;
    let wtype = body["type"].as_str().unwrap_or("novel");
    let db = conn(&app).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    let id = uuid();
    let ts = now();
    db.execute(
        "INSERT INTO works (id, title, type, icon, created_at, updated_at, deleted) VALUES (?1, ?2, ?3, ?4, ?5, ?5, 0)",
        rusqlite::params![id, title, wtype, if wtype == "script" { "🎬" } else { "📖" }, ts],
    )
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;
    Ok(Json(json!({ "id": id, "title": title, "type": wtype })))
}

async fn list_chapters(
    axum::extract::State(app): axum::extract::State<AppState>,
    Path(work_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let db = conn(&app).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    let mut stmt = db
        .prepare("SELECT id, title, chapter_order, content FROM chapters WHERE work_id = ?1 AND deleted = 0 ORDER BY chapter_order")
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;
    let list = stmt
        .query_map([&work_id], |row: &rusqlite::Row| {
            let content: String = row.get(3)?;
            Ok(json!({
                "id": row.get::<_, String>(0)?,
                "title": row.get::<_, String>(1)?,
                "order": row.get::<_, i64>(2)?,
                "wordCount": word_count(&content),
            }))
        })
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?
        .filter_map(|r| r.ok())
        .collect::<Vec<_>>();
    Ok(Json(json!(list)))
}

async fn get_chapter(
    axum::extract::State(app): axum::extract::State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let db = conn(&app).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    let row = db
        .query_row(
            "SELECT id, work_id, title, content, chapter_order FROM chapters WHERE id = ?1 AND deleted = 0",
            [&id],
            |r: &rusqlite::Row| {
                Ok(json!({
                    "id": r.get::<_, String>(0)?,
                    "workId": r.get::<_, String>(1)?,
                    "title": r.get::<_, String>(2)?,
                    "content": r.get::<_, String>(3)?,
                    "order": r.get::<_, i64>(4)?,
                }))
            },
        )
        .map_err(|_| (StatusCode::NOT_FOUND, "章节不存在".to_string()))?;
    let mut ch = row;
    let html = ch["content"].as_str().unwrap_or("").to_string();
    ch["plainText"] = json!(html_to_text(&html));
    ch["wordCount"] = json!(word_count(&html));
    Ok(Json(ch))
}

async fn create_chapter(
    axum::extract::State(app): axum::extract::State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let work_id = body["workId"].as_str().ok_or((StatusCode::BAD_REQUEST, "workId 必填".into()))?.to_string();
    let title = body["title"].as_str().ok_or((StatusCode::BAD_REQUEST, "title 必填".into()))?.to_string();
    let content = body["content"].as_str().unwrap_or("");
    let html = if content.contains('<') { content.to_string() } else { text_to_html(content) };

    let db = conn(&app).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    let max_order: i64 = db
        .query_row(
            "SELECT COALESCE(MAX(chapter_order), 0) FROM chapters WHERE work_id = ?1 AND deleted = 0",
            [&work_id],
            |r: &rusqlite::Row| r.get::<_, i64>(0),
        )
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;
    let id = uuid();
    let ts = now();
    db.execute(
        "INSERT INTO chapters (id, work_id, title, content, chapter_order, created_at, updated_at, deleted) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, 0)",
        rusqlite::params![id, work_id, title, html, max_order + 1, ts],
    )
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;
    Ok(Json(json!({ "id": id, "title": title, "order": max_order + 1 })))
}

async fn update_chapter_content(
    axum::extract::State(app): axum::extract::State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let content = body["content"].as_str().ok_or((StatusCode::BAD_REQUEST, "content 必填".into()))?;
    let html = if content.contains('<') { content.to_string() } else { text_to_html(content) };
    let db = conn(&app).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    let n = db
        .execute("UPDATE chapters SET content = ?1, updated_at = ?2 WHERE id = ?3 AND deleted = 0", rusqlite::params![html, now(), id])
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;
    if n == 0 {
        return Err((StatusCode::NOT_FOUND, "章节不存在".into()));
    }
    Ok(Json(json!({ "ok": true, "wordCount": word_count(&html) })))
}

async fn delete_chapter(
    axum::extract::State(app): axum::extract::State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let db = conn(&app).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    db.execute("UPDATE chapters SET deleted = 1, updated_at = ?1 WHERE id = ?2", rusqlite::params![now(), id])
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;
    Ok(Json(json!({ "ok": true })))
}

// ============================================================================
// AI 端点（复用 ai.rs 的请求逻辑，非流式收集）
// ============================================================================

async fn ai_continue(
    axum::extract::State(app): axum::extract::State<AppState>,
    Path(chapter_id): Path<String>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let db = conn(&app).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    let (title, content): (String, String) = db
        .query_row("SELECT title, content FROM chapters WHERE id = ?1 AND deleted = 0", [&chapter_id], |r: &rusqlite::Row| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(|_| (StatusCode::NOT_FOUND, "章节不存在".to_string()))?;

    let tail = html_to_text(&content).chars().rev().take(1500).collect::<Vec<_>>().into_iter().rev().collect::<String>();
    let instruction = body["instruction"].as_str().unwrap_or("");
    let messages = json!([
        { "role": "system", "content": "你是专业的中文小说创作助手。直接输出续写正文（简体中文），不要解释。使用 <p></p> 段落。" },
        { "role": "user", "content": format!("请接着下面的正文续写 300-500 字，保持人物、语气连贯，不要重复已有内容：\n\n{}{}", tail, if instruction.is_empty() { String::new() } else { format!("\n\n【补充要求】{}", instruction) }) }
    ]);

    let reply = crate::ai::chat_once_from_config(&app, messages).await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    // 纯文本 → HTML 追加
    let addition = text_to_html(&reply);
    let new_content = format!("{}{}", content, addition);
    db.execute("UPDATE chapters SET content = ?1, updated_at = ?2 WHERE id = ?3", rusqlite::params![new_content, now(), chapter_id])
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;
    Ok(Json(json!({ "added": reply, "wordCount": word_count(&new_content) })))
}

async fn ai_review(
    axum::extract::State(app): axum::extract::State<AppState>,
    Path(chapter_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let db = conn(&app).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    let (title, content): (String, String) = db
        .query_row("SELECT title, content FROM chapters WHERE id = ?1 AND deleted = 0", [&chapter_id], |r: &rusqlite::Row| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(|_| (StatusCode::NOT_FOUND, "章节不存在".to_string()))?;

    let body_text: String = html_to_text(&content).chars().take(8000).collect();
    let messages = json!([
        { "role": "system", "content": "你是严格的中文小说审稿编辑。按【逻辑硬伤】【时间线】【人物一致性】【伏笔与悬念】【文笔建议】分类输出，仅列实际存在的问题。" },
        { "role": "user", "content": format!("请审稿章节「{}」：\n\n{}", title, body_text) }
    ]);
    let report = crate::ai::chat_once_from_config(&app, messages).await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok(Json(json!({ "report": report })))
}

async fn ai_outline(
    axum::extract::State(app): axum::extract::State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let work_id = body["workId"].as_str().ok_or((StatusCode::BAD_REQUEST, "workId 必填".into()))?.to_string();
    let premise = body["premise"].as_str().ok_or((StatusCode::BAD_REQUEST, "premise 必填".into()))?.to_string();
    let count = body["chapterCount"].as_i64().unwrap_or(10);

    let messages = json!([
        { "role": "system", "content": "你是专业的故事策划。直接输出大纲，不要前言。每章一段：第N章 标题：梗概" },
        { "role": "user", "content": format!("基于以下创意生成 {} 章的故事大纲：\n\n{}", count, premise) }
    ]);
    let text = crate::ai::chat_once_from_config(&app, messages).await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    // 解析并入库：1 幕 + N 场景节点
    let db = conn(&app).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    let max_order: i64 = db
        .query_row("SELECT COALESCE(MAX(\"order\"), -1) FROM outline_nodes WHERE work_id = ?1 AND deleted = 0 AND parent_id IS NULL", [&work_id], |r| r.get(0))
        .unwrap_or(-1);
    let act_id = uuid();
    let ts = now();
    let act_title: String = format!("AI 大纲：{}", premise.chars().take(20).collect::<String>());
    db.execute(
        "INSERT INTO outline_nodes (id, work_id, parent_id, title, description, \"order\", type, created_at, updated_at, deleted) VALUES (?1, ?2, NULL, ?3, ?4, ?5, 'act', ?6, ?6, 0)",
        rusqlite::params![act_id, work_id, act_title, premise, max_order + 1, ts],
    )
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;

    let mut created = Vec::new();
    let mut order = 0i64;
    for line in text.lines() {
        let line = line.trim();
        if !line.starts_with("第") || !line.contains("章") {
            continue;
        }
        let rest = line.splitn(2, "章").nth(1).unwrap_or("").trim_start_matches(|c: char| c == ':' || c == '：');
        // 字符级分割（find 返回字节偏移，全角冒号 3 字节，i+1 会切在字符中间 panic）
        let (title, desc) = match rest.char_indices().find(|(_, c)| *c == '：' || *c == ':') {
            Some((bi, ch)) => (
                rest[..bi].trim(),
                rest[bi + ch.len_utf8()..].trim(),
            ),
            None => (rest, ""),
        };
        if title.is_empty() {
            continue;
        }
        let nid = uuid();
        db.execute(
            "INSERT INTO outline_nodes (id, work_id, parent_id, title, description, \"order\", type, created_at, updated_at, deleted) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'scene', ?7, ?7, 0)",
            rusqlite::params![nid, work_id, act_id, title, desc, order, ts],
        )
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;
        created.push(json!({ "id": nid, "title": title, "description": desc }));
        order += 1;
    }
    Ok(Json(json!({ "actNodeId": act_id, "chapters": created })))
}

async fn search(
    axum::extract::State(app): axum::extract::State<AppState>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let q = params.get("q").cloned().unwrap_or_default();
    if q.len() < 2 {
        return Err((StatusCode::BAD_REQUEST, "q 至少 2 个字符".into()));
    }
    let db = conn(&app).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    let mut stmt = db
        .prepare("SELECT c.id, c.work_id, c.title, c.content, w.title FROM chapters c JOIN works w ON w.id = c.work_id WHERE c.deleted = 0 AND w.deleted = 0 AND (c.title LIKE ?1 OR c.content LIKE ?1) LIMIT 50")
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;
    let like = format!("%{}%", q);
    let list = stmt
        .query_map([&like], |row: &rusqlite::Row| {
            let content: String = row.get(3)?;
            let plain = html_to_text(&content);
            let pos = plain.find(&q).unwrap_or(0);
            let start = pos.saturating_sub(40);
            let snippet: String = plain[start..(pos + q.len() + 40).min(plain.len())].to_string();
            Ok(json!({
                "chapterId": row.get::<_, String>(0)?,
                "workId": row.get::<_, String>(1)?,
                "chapterTitle": row.get::<_, String>(2)?,
                "workTitle": row.get::<_, String>(4)?,
                "snippet": snippet,
            }))
        })
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?
        .filter_map(|r| r.ok())
        .collect::<Vec<_>>();
    Ok(Json(json!(list)))
}

async fn stats(
    axum::extract::State(app): axum::extract::State<AppState>,
    Path(work_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let db = conn(&app).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    let count: i64 = db
        .query_row("SELECT COUNT(*) FROM chapters WHERE work_id = ?1 AND deleted = 0", [&work_id], |r| r.get(0))
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;
    let mut stmt = db
        .prepare("SELECT content FROM chapters WHERE work_id = ?1 AND deleted = 0")
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;
    let wc: i64 = stmt
        .query_map([&work_id], |r| r.get::<_, String>(0))
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?
        .flatten()
        .map(|c| word_count(&c))
        .sum();
    Ok(Json(json!({ "chapters": count, "totalWords": wc })))
}

// ============================================================================
// 启动
// ============================================================================

/**
 * 启动 Agent API（127.0.0.1:8765）
 *
 * 由 lib.rs 在应用启动时按配置调用；失败仅记录不阻塞主应用
 */
pub fn start(app: &tauri::AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let router = Router::new()
            .route("/api/works", get(list_works).post(create_work))
            .route("/api/works/{id}/chapters", get(list_chapters))
            .route("/api/chapters/{id}", get(get_chapter).delete(delete_chapter))
            .route("/api/chapters", axum::routing::post(create_chapter))
            .route("/api/chapters/{id}/content", axum::routing::put(update_chapter_content))
            .route("/api/ai/continue/{chapterId}", axum::routing::post(ai_continue))
            .route("/api/ai/review/{chapterId}", axum::routing::post(ai_review))
            .route("/api/ai/outline", axum::routing::post(ai_outline))
            .route("/api/search", get(search))
            .route("/api/stats/{workId}", get(stats))
            .with_state(app);

        let listener = match tokio::net::TcpListener::bind("127.0.0.1:8765").await {
            Ok(l) => l,
            Err(e) => {
                tracing::warn!("⚠️ Agent API 启动失败（端口被占用？）: {}", e);
                return;
            }
        };
        tracing::info!("🤖 Agent API 已启动: http://127.0.0.1:8765/api/works");
        if let Err(e) = axum::serve(listener, router).await {
            tracing::warn!("Agent API 退出: {}", e);
        }
    });
}
