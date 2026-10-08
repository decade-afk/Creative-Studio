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
 * POST /api/works/:id/outline        创建大纲节点 {title,description?,parentId?,type?,order?}
 * POST /api/works/:id/outline/batch  批量创建大纲子树 {nodes:[{title,...,children?}]}
 * PUT  /api/outline/:id              更新大纲节点 {title?,description?,type?,parentId?,order?}
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
    // 存储根目录优先读 config.json 的 storage.dataDir（与前端一致），空则回退 appDataDir
    let mut dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取应用数据目录失败: {}", e))?;
    if let Ok(config_raw) = std::fs::read_to_string(dir.join("config.json")) {
        if let Ok(config) = serde_json::from_str::<serde_json::Value>(&config_raw) {
            if let Some(custom) = config["storage"]["dataDir"].as_str() {
                if !custom.is_empty() {
                    dir = std::path::PathBuf::from(custom);
                }
            }
        }
    }
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
            .route("/api/chapters/{id}/title", axum::routing::put(update_chapter_title))
            .route("/api/ai/continue/{chapterId}", axum::routing::post(ai_continue))
            .route("/api/ai/review/{chapterId}", axum::routing::post(ai_review))
            .route("/api/ai/outline", axum::routing::post(ai_outline))
            .route("/api/search", get(search))
            .route("/api/stats/{workId}", get(stats))
            // 扩展：作品管理
            .route("/api/works/{id}", axum::routing::put(update_work).delete(delete_work))
            // 扩展：规划数据
            .route("/api/works/{id}/outline", get(get_outline).post(create_outline_node))
            .route("/api/works/{id}/outline/batch", axum::routing::post(create_outline_batch))
            .route("/api/outline/{id}", axum::routing::delete(delete_outline_node).put(update_outline_node))
            .route("/api/works/{id}/characters", get(get_characters).post(create_character))
            .route("/api/works/{id}/scenes", get(get_scenes).post(create_scene))
            .route("/api/works/{id}/world-settings", get(get_world_settings).post(create_world_setting))
            .route("/api/works/{id}/clues", get(get_clues).post(create_clue))
            .route("/api/clues/{id}/status", axum::routing::put(update_clue_status))
            .route("/api/works/{id}/conflicts", get(get_conflicts).post(create_conflict))
            .route("/api/works/{id}/storyboards", get(get_storyboards))
            .route("/api/works/{id}/submissions", get(get_submissions))
            // 扩展：AI 全家桶
            .route("/api/ai/summary/{chapterId}", axum::routing::post(ai_summary))
            .route("/api/ai/characters", axum::routing::post(ai_gen_characters))
            .route("/api/ai/scenes", axum::routing::post(ai_gen_scenes))
            .route("/api/ai/detect-clues/{workId}", axum::routing::post(ai_detect_clues))
            .route("/api/ai/storyboards/{chapterId}", axum::routing::post(ai_gen_storyboards))
            // 扩展：导出/导入/版本
            .route("/api/export", axum::routing::post(export_work_file))
            .route("/api/import", axum::routing::post(import_text))
            .route("/api/chapters/{id}/versions", get(list_chapter_versions).post(save_chapter_version_api))
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

// ============================================================================
// 扩展端点：作品管理 / 规划数据 CRUD（大纲/角色/场景/世界观/伏笔/冲突/分镜）
// ============================================================================

async fn update_work(
    axum::extract::State(app): axum::extract::State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let db = conn(&app).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    let mut sets = vec!["updated_at = ?1".to_string()];
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(now())];
    let mut idx = 2;
    if let Some(t) = body["title"].as_str() {
        sets.push(format!("title = ?{}", idx));
        params.push(Box::new(t.to_string()));
        idx += 1;
    }
    if let Some(d) = body["description"].as_str() {
        sets.push(format!("description = ?{}", idx));
        params.push(Box::new(d.to_string()));
        idx += 1;
    }
    let sql = format!("UPDATE works SET {} WHERE id = ?{} AND deleted = 0", sets.join(", "), idx);
    params.push(Box::new(id));
    let refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let n = db.execute(&sql, refs.as_slice()).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;
    if n == 0 { return Err((StatusCode::NOT_FOUND, "作品不存在".into())); }
    Ok(Json(json!({ "ok": true })))
}

async fn delete_work(
    axum::extract::State(app): axum::extract::State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let db = conn(&app).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    db.execute("UPDATE works SET deleted = 1, updated_at = ?1 WHERE id = ?2", rusqlite::params![now(), id])
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;
    Ok(Json(json!({ "ok": true })))
}

/** 通用列表查询助手（单表 where work_id） */
fn list_by_work(db: &Connection, table: &str, work_id: &str, order: &str) -> Result<Vec<Value>, String> {
    // 表名来自代码常量，不做用户输入拼接
    let sql = format!("SELECT * FROM {} WHERE work_id = ?1 AND deleted = 0 ORDER BY {}", table, order);
    let mut stmt = db.prepare(&sql).map_err(|e| format!("{}", e))?;
    let cols: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let rows = stmt
        .query_map([work_id], |r| {
            let mut obj = serde_json::Map::new();
            for (i, c) in cols.iter().enumerate() {
                let v: Value = match r.get_ref(i) {
                    Ok(rusqlite::types::ValueRef::Null) => Value::Null,
                    Ok(rusqlite::types::ValueRef::Integer(n)) => json!(n),
                    Ok(rusqlite::types::ValueRef::Real(f)) => json!(f),
                    Ok(rusqlite::types::ValueRef::Text(t)) => json!(String::from_utf8_lossy(t)),
                    Ok(rusqlite::types::ValueRef::Blob(b)) => json!(String::from_utf8_lossy(b)),
                    Err(_) => Value::Null,
                };
                obj.insert(c.clone(), v);
            }
            Ok(Value::Object(obj))
        })
        .map_err(|e| format!("{}", e))?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

async fn get_outline(
    axum::extract::State(app): axum::extract::State<AppState>,
    Path(work_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let db = conn(&app).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    let list = list_by_work(&db, "outline_nodes", &work_id, "\"order\" ASC").map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok(Json(json!(list)))
}

async fn delete_outline_node(
    axum::extract::State(app): axum::extract::State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let db = conn(&app).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    db.execute("UPDATE outline_nodes SET deleted = 1, updated_at = ?1 WHERE id = ?2", rusqlite::params![now(), id])
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;
    Ok(Json(json!({ "ok": true })))
}

// ============================================================================
// 扩展：大纲节点写入（agent 重写大纲用；与 AI 生成共用 outline_nodes 表）
// ============================================================================

/** 大纲节点类型校验（与前端 OutlineNode.type 对齐） */
fn valid_outline_type(t: &str) -> bool {
    matches!(t, "act" | "scene" | "event")
}

/** 计算大纲新节点的同级 order（取同级最大 +1） */
fn next_outline_order(
    db: &Connection,
    work_id: &str,
    parent_id: Option<&str>,
) -> Result<i64, String> {
    let max_order: i64 = match parent_id {
        Some(pid) => db
            .query_row(
                "SELECT COALESCE(MAX(\"order\"), -1) FROM outline_nodes WHERE work_id = ?1 AND parent_id = ?2 AND deleted = 0",
                rusqlite::params![work_id, pid],
                |r| r.get(0),
            )
            .map_err(|e| format!("{}", e))?,
        None => db
            .query_row(
                "SELECT COALESCE(MAX(\"order\"), -1) FROM outline_nodes WHERE work_id = ?1 AND parent_id IS NULL AND deleted = 0",
                [&work_id],
                |r| r.get(0),
            )
            .map_err(|e| format!("{}", e))?,
    };
    Ok(max_order + 1)
}

/** 校验父节点存在且属于该作品 */
fn ensure_parent_exists(
    db: &Connection,
    work_id: &str,
    parent_id: &str,
) -> Result<(), (StatusCode, String)> {
    let n: i64 = db
        .query_row(
            "SELECT COUNT(*) FROM outline_nodes WHERE id = ?1 AND work_id = ?2 AND deleted = 0",
            rusqlite::params![parent_id, work_id],
            |r| r.get(0),
        )
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;
    if n == 0 {
        return Err((StatusCode::NOT_FOUND, format!("父节点不存在: {}", parent_id)));
    }
    Ok(())
}

async fn create_outline_node(
    axum::extract::State(app): axum::extract::State<AppState>,
    Path(work_id): Path<String>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let title = body["title"].as_str().ok_or((StatusCode::BAD_REQUEST, "title 必填".into()))?.to_string();
    let description = body["description"].as_str().unwrap_or("").to_string();
    let parent_id = body["parentId"].as_str().map(|s| s.to_string());
    let default_type = if parent_id.is_some() { "scene" } else { "act" };
    let node_type = body["type"].as_str().unwrap_or(default_type).to_string();
    if !valid_outline_type(&node_type) {
        return Err((StatusCode::BAD_REQUEST, "type 仅支持 act/scene/event".into()));
    }

    let db = conn(&app).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    if let Some(pid) = parent_id.as_deref() {
        ensure_parent_exists(&db, &work_id, pid)?;
    }
    let order = match body["order"].as_i64() {
        Some(o) => o,
        None => next_outline_order(&db, &work_id, parent_id.as_deref())
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?,
    };

    let id = uuid();
    let ts = now();
    db.execute(
        "INSERT INTO outline_nodes (id, work_id, parent_id, title, description, \"order\", type, created_at, updated_at, deleted) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, 0)",
        rusqlite::params![id, work_id, parent_id, title, description, order, node_type, ts],
    )
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;
    Ok(Json(json!({ "id": id, "title": title, "parentId": parent_id, "order": order, "type": node_type })))
}

async fn update_outline_node(
    axum::extract::State(app): axum::extract::State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let db = conn(&app).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    // parentId：字符串 = 改挂父节点；显式 null = 提升为根节点
    let has_parent_key = body.as_object().map(|o| o.contains_key("parentId")).unwrap_or(false);
    if has_parent_key && !body["parentId"].is_null() {
        let pid = body["parentId"]
            .as_str()
            .ok_or((StatusCode::BAD_REQUEST, "parentId 须为字符串或 null".into()))?
            .to_string();
        let work_id: String = db
            .query_row(
                "SELECT work_id FROM outline_nodes WHERE id = ?1 AND deleted = 0",
                [&id],
                |r| r.get(0),
            )
            .map_err(|_| (StatusCode::NOT_FOUND, "大纲节点不存在".into()))?;
        ensure_parent_exists(&db, &work_id, &pid)?;
    }

    let mut sets = vec!["updated_at = ?1".to_string()];
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(now())];
    let mut idx = 2;
    if let Some(t) = body["title"].as_str() {
        sets.push(format!("title = ?{}", idx));
        params.push(Box::new(t.to_string()));
        idx += 1;
    }
    if let Some(d) = body["description"].as_str() {
        sets.push(format!("description = ?{}", idx));
        params.push(Box::new(d.to_string()));
        idx += 1;
    }
    if let Some(t) = body["type"].as_str() {
        if !valid_outline_type(t) {
            return Err((StatusCode::BAD_REQUEST, "type 仅支持 act/scene/event".into()));
        }
        sets.push(format!("type = ?{}", idx));
        params.push(Box::new(t.to_string()));
        idx += 1;
    }
    if let Some(o) = body["order"].as_i64() {
        sets.push(format!("\"order\" = ?{}", idx));
        params.push(Box::new(o));
        idx += 1;
    }
    if has_parent_key {
        if body["parentId"].is_null() {
            sets.push("parent_id = NULL".to_string());
        } else {
            let pid = body["parentId"].as_str().unwrap_or_default().to_string();
            sets.push(format!("parent_id = ?{}", idx));
            params.push(Box::new(pid));
            idx += 1;
        }
    }

    let sql = format!("UPDATE outline_nodes SET {} WHERE id = ?{} AND deleted = 0", sets.join(", "), idx);
    params.push(Box::new(id));
    let refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let n = db
        .execute(&sql, refs.as_slice())
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;
    if n == 0 {
        return Err((StatusCode::NOT_FOUND, "大纲节点不存在".into()));
    }
    Ok(Json(json!({ "ok": true })))
}

/// 批量创建大纲子树：nodes 支持嵌套 children，一次写入整棵大纲
/// 节点字段：{ title, description?, type?, parentId?, order?, children?: [...] }
async fn create_outline_batch(
    axum::extract::State(app): axum::extract::State<AppState>,
    Path(work_id): Path<String>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let nodes = body["nodes"]
        .as_array()
        .ok_or((StatusCode::BAD_REQUEST, "nodes 必填（数组）".into()))?;
    if nodes.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "nodes 不能为空".into()));
    }

    let db = conn(&app).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    db.execute_batch("BEGIN")
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;

    let result = (|| -> Result<Vec<Value>, (StatusCode, String)> {
        let mut created = Vec::new();
        for node in nodes {
            insert_outline_tree(&db, &work_id, node, None, &mut created)?;
        }
        Ok(created)
    })();

    match result {
        Ok(created) => {
            db.execute_batch("COMMIT")
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;
            Ok(Json(json!({ "created": created.len(), "nodes": created })))
        }
        Err(e) => {
            let _ = db.execute_batch("ROLLBACK");
            Err(e)
        }
    }
}

/// 递归插入大纲子树；children 与父节点同批创建（parent_id 直接引用新 id），任一失败整体回滚
fn insert_outline_tree(
    db: &Connection,
    work_id: &str,
    node: &Value,
    parent_id: Option<&str>,
    created: &mut Vec<Value>,
) -> Result<(), (StatusCode, String)> {
    let title = node["title"]
        .as_str()
        .ok_or((StatusCode::BAD_REQUEST, "批内节点 title 必填".into()))?
        .to_string();
    let description = node["description"].as_str().unwrap_or("").to_string();
    // 节点自带 parentId 优先（挂到已有节点），否则挂到上级 children 的父节点
    let pid = node["parentId"]
        .as_str()
        .map(|s| s.to_string())
        .or_else(|| parent_id.map(|s| s.to_string()));
    let default_type = if pid.is_some() { "scene" } else { "act" };
    let node_type = node["type"].as_str().unwrap_or(default_type).to_string();
    if !valid_outline_type(&node_type) {
        return Err((StatusCode::BAD_REQUEST, "type 仅支持 act/scene/event".into()));
    }
    if let Some(p) = pid.as_deref() {
        // 同批新建的父节点直接放行，其余校验存在性
        if !created.iter().any(|c| c["id"].as_str() == Some(p)) {
            ensure_parent_exists(db, work_id, p)?;
        }
    }
    let order = match node["order"].as_i64() {
        Some(o) => o,
        None => next_outline_order(db, work_id, pid.as_deref())
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?,
    };

    let id = uuid();
    let ts = now();
    db.execute(
        "INSERT INTO outline_nodes (id, work_id, parent_id, title, description, \"order\", type, created_at, updated_at, deleted) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, 0)",
        rusqlite::params![id, work_id, pid, title, description, order, node_type, ts],
    )
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;
    created.push(json!({ "id": id, "title": title, "parentId": pid, "order": order, "type": node_type }));

    if let Some(children) = node["children"].as_array() {
        for child in children {
            insert_outline_tree(db, work_id, child, Some(&id), created)?;
        }
    }
    Ok(())
}

async fn get_characters(
    axum::extract::State(app): axum::extract::State<AppState>,
    Path(work_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let db = conn(&app).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok(Json(json!(list_by_work(&db, "characters", &work_id, "created_at ASC").map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?)))
}

async fn create_character(
    axum::extract::State(app): axum::extract::State<AppState>,
    Path(work_id): Path<String>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let db = conn(&app).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    let id = uuid();
    db.execute(
        "INSERT INTO characters (id, work_id, name, description, avatar, personality, relationships, created_at, updated_at, deleted) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, 0)",
        rusqlite::params![id, work_id, body["name"].as_str().unwrap_or("新角色"), body["description"].as_str().unwrap_or(""), body["avatar"].as_str().unwrap_or("👤"), body["personality"].as_str().unwrap_or(""), body["relationships"].as_str().unwrap_or(""), now()],
    ).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;
    Ok(Json(json!({ "id": id })))
}

async fn get_scenes(
    axum::extract::State(app): axum::extract::State<AppState>,
    Path(work_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let db = conn(&app).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok(Json(json!(list_by_work(&db, "scenes", &work_id, "created_at ASC").map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?)))
}

async fn create_scene(
    axum::extract::State(app): axum::extract::State<AppState>,
    Path(work_id): Path<String>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let db = conn(&app).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    let tod = body["timeOfDay"].as_str().or(body["time_of_day"].as_str()).unwrap_or("other");
    let tod = if ["morning","noon","evening","night","other"].contains(&tod) { tod } else { "other" };
    let id = uuid();
    db.execute(
        "INSERT INTO scenes (id, work_id, name, description, location, time_of_day, mood, created_at, updated_at, deleted) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, 0)",
        rusqlite::params![id, work_id, body["name"].as_str().unwrap_or("新场景"), body["description"].as_str().unwrap_or(""), body["location"].as_str().unwrap_or(""), tod, body["mood"].as_str().unwrap_or(""), now()],
    ).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;
    Ok(Json(json!({ "id": id })))
}

async fn get_world_settings(
    axum::extract::State(app): axum::extract::State<AppState>,
    Path(work_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let db = conn(&app).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
        let db = conn(&app).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    db.execute_batch("CREATE TABLE IF NOT EXISTS world_settings (id TEXT PRIMARY KEY NOT NULL, work_id TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'location', title TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', icon_type TEXT, icon_color TEXT, tags TEXT NOT NULL DEFAULT '[]', related_characters TEXT NOT NULL DEFAULT '[]', related_settings TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0)").ok();
    Ok(Json(json!(list_by_work(&db, "world_settings", &work_id, "created_at ASC").map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?)))
}

async fn create_world_setting(
    axum::extract::State(app): axum::extract::State<AppState>,
    Path(work_id): Path<String>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let db = conn(&app).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    db.execute_batch("CREATE TABLE IF NOT EXISTS world_settings (id TEXT PRIMARY KEY NOT NULL, work_id TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'location', title TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', icon_type TEXT, icon_color TEXT, tags TEXT NOT NULL DEFAULT '[]', related_characters TEXT NOT NULL DEFAULT '[]', related_settings TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0)").ok();
    let cat = body["category"].as_str().unwrap_or("location");
    let cat = if ["location","organization","event","culture","technology","magic"].contains(&cat) { cat } else { "location" };
    let id = uuid();
    db.execute(
        "INSERT INTO world_settings (id, work_id, category, title, content, tags, related_characters, related_settings, created_at, updated_at, deleted) VALUES (?1, ?2, ?3, ?4, ?5, '[]', '[]', '[]', ?6, ?6, 0)",
        rusqlite::params![id, work_id, cat, body["title"].as_str().unwrap_or("新设定"), body["content"].as_str().unwrap_or(""), now()],
    ).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;
    Ok(Json(json!({ "id": id })))
}

async fn get_clues(
    axum::extract::State(app): axum::extract::State<AppState>,
    Path(work_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let db = conn(&app).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok(Json(json!(list_by_work(&db, "clues", &work_id, "created_at ASC").map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?)))
}

async fn create_clue(
    axum::extract::State(app): axum::extract::State<AppState>,
    Path(work_id): Path<String>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let db = conn(&app).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    let id = uuid();
    db.execute(
        "INSERT INTO clues (id, work_id, name, source, status, setup_scene_id, payoff_scene_id, description, created_at, updated_at, deleted) VALUES (?1, ?2, ?3, 'manual', ?4, NULL, NULL, ?5, ?6, ?6, 0)",
        rusqlite::params![id, work_id, body["name"].as_str().unwrap_or("新伏笔"), body["status"].as_str().unwrap_or("open"), body["description"].as_str().unwrap_or(""), now()],
    ).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;
    Ok(Json(json!({ "id": id })))
}

async fn update_clue_status(
    axum::extract::State(app): axum::extract::State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let status = body["status"].as_str().ok_or((StatusCode::BAD_REQUEST, "status 必填".into()))?;
    if !["open", "resolved"].contains(&status) {
        return Err((StatusCode::BAD_REQUEST, "status 只能是 open/resolved".into()));
    }
    let db = conn(&app).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    db.execute("UPDATE clues SET status = ?1, updated_at = ?2 WHERE id = ?3", rusqlite::params![status, now(), id])
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;
    Ok(Json(json!({ "ok": true })))
}

async fn get_conflicts(
    axum::extract::State(app): axum::extract::State<AppState>,
    Path(work_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let db = conn(&app).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok(Json(json!(list_by_work(&db, "conflicts", &work_id, "created_at ASC").map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?)))
}

async fn create_conflict(
    axum::extract::State(app): axum::extract::State<AppState>,
    Path(work_id): Path<String>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let db = conn(&app).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    let typ = body["type"].as_str().unwrap_or("character");
    let typ = if ["character","environment","internal","social"].contains(&typ) { typ } else { "character" };
    let intensity = body["intensity"].as_str().unwrap_or("medium");
    let intensity = if ["low","medium","high","critical"].contains(&intensity) { intensity } else { "medium" };
    let status = body["status"].as_str().unwrap_or("active");
    let status = if ["active","escalating","resolving","resolved"].contains(&status) { status } else { "active" };
    let id = uuid();
    db.execute(
        "INSERT INTO conflicts (id, work_id, name, type, intensity, characters, scene_id, description, resolution, status, created_at, updated_at, deleted) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7, ?8, ?9, ?10, ?10, 0)",
        rusqlite::params![id, work_id, body["name"].as_str().unwrap_or("新冲突"), typ, intensity, body["characters"].as_str().unwrap_or(""), body["description"].as_str().unwrap_or(""), body["resolution"].as_str().unwrap_or(""), status, now()],
    ).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;
    Ok(Json(json!({ "id": id })))
}

async fn get_storyboards(
    axum::extract::State(app): axum::extract::State<AppState>,
    Path(work_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let db = conn(&app).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok(Json(json!(list_by_work(&db, "storyboards", &work_id, "\"order\" ASC").map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?)))
}

async fn get_submissions(
    axum::extract::State(app): axum::extract::State<AppState>,
    Path(work_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let db = conn(&app).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    // submissions 表无软删除列，走专用查询
    let mut stmt = db
        .prepare("SELECT id, chapter_id, platform, chapter_title, status, note, created_at FROM submissions WHERE work_id = ?1 ORDER BY created_at DESC")
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;
    let list = stmt
        .query_map([&work_id], |r: &rusqlite::Row| {
            Ok(json!({
                "id": r.get::<_, String>(0)?,
                "chapterId": r.get::<_, String>(1)?,
                "platform": r.get::<_, String>(2)?,
                "chapterTitle": r.get::<_, String>(3)?,
                "status": r.get::<_, String>(4)?,
                "note": r.get::<_, String>(5)?,
                "createdAt": r.get::<_, String>(6)?,
            }))
        })
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?
        .filter_map(|r| r.ok())
        .collect::<Vec<_>>();
    Ok(Json(json!(list)))
}

// ============================================================================
// AI 扩展端点：摘要 / 角色生成 / 场景生成 / 伏笔检测 / 分镜生成
// ============================================================================

/** AI 生成章节摘要（不落库，返回文本） */
async fn ai_summary(
    axum::extract::State(app): axum::extract::State<AppState>,
    Path(chapter_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let db = conn(&app).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    let (title, content): (String, String) = db
        .query_row("SELECT title, content FROM chapters WHERE id = ?1 AND deleted = 0", [&chapter_id], |r: &rusqlite::Row| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(|_| (StatusCode::NOT_FOUND, "章节不存在".to_string()))?;
    let body_text: String = html_to_text(&content).chars().take(8000).collect();
    let messages = json!([
        { "role": "system", "content": "你是专业编辑，直接输出摘要，不要前言。" },
        { "role": "user", "content": format!("为章节「{}」生成 150 字以内的梗概（关键事件、人物动机、结尾悬念）：\n\n{}", title, body_text) }
    ]);
    let summary = crate::ai::chat_once_from_config(&app, messages).await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok(Json(json!({ "summary": summary })))
}

/** 从 AI 输出提取 JSON 数组（容忍代码块包裹） */
fn extract_json_array(text: &str) -> Option<Vec<Value>> {
    let start = text.find('[')?;
    let end = text.rfind(']')?;
    serde_json::from_str::<Value>(&text[start..=end]).ok()?.as_array().cloned()
}

/** AI 批量生成角色并入库 */
async fn ai_gen_characters(
    axum::extract::State(app): axum::extract::State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let work_id = body["workId"].as_str().ok_or((StatusCode::BAD_REQUEST, "workId 必填".into()))?.to_string();
    let premise = body["premise"].as_str().unwrap_or("");
    let count = body["count"].as_i64().unwrap_or(5);
    let messages = json!([
        { "role": "system", "content": format!("你是小说人物架构师。只输出 JSON 数组，每个元素 {{\"name\":\"\",\"avatar\":\"emoji\",\"description\":\"80字内\",\"personality\":\"\",\"relationships\":\"与其他角色的关系\"}}。生成 {} 个有戏剧张力的角色。", count) },
        { "role": "user", "content": format!("作品创意：{}", premise) }
    ]);
    let text = crate::ai::chat_once_from_config(&app, messages).await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    let arr = extract_json_array(&text).unwrap_or_default();
    let db = conn(&app).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    let mut created = Vec::new();
    for item in arr.iter().take(20) {
        let name = item["name"].as_str().unwrap_or("").to_string();
        if name.is_empty() { continue; }
        let id = uuid();
        db.execute(
            "INSERT INTO characters (id, work_id, name, description, avatar, personality, relationships, created_at, updated_at, deleted) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, 0)",
            rusqlite::params![id, work_id, name, item["description"].as_str().unwrap_or(""), item["avatar"].as_str().unwrap_or("👤"), item["personality"].as_str().unwrap_or(""), item["relationships"].as_str().unwrap_or(""), now()],
        ).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;
        created.push(json!({ "id": id, "name": name }));
    }
    Ok(Json(json!({ "created": created.len(), "characters": created })))
}

/** AI 批量生成场景并入库 */
async fn ai_gen_scenes(
    axum::extract::State(app): axum::extract::State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let work_id = body["workId"].as_str().ok_or((StatusCode::BAD_REQUEST, "workId 必填".into()))?.to_string();
    let premise = body["premise"].as_str().unwrap_or("");
    let count = body["count"].as_i64().unwrap_or(5);
    let messages = json!([
        { "role": "system", "content": format!("你是美术指导。只输出 JSON 数组，每个元素 {{\"name\":\"\",\"location\":\"\",\"timeOfDay\":\"morning|noon|evening|night|other\",\"mood\":\"\",\"description\":\"80字内\"}}。生成 {} 个有画面感的场景。", count) },
        { "role": "user", "content": format!("作品创意：{}", premise) }
    ]);
    let text = crate::ai::chat_once_from_config(&app, messages).await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    let arr = extract_json_array(&text).unwrap_or_default();
    let db = conn(&app).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    let mut created = Vec::new();
    for item in arr.iter().take(20) {
        let name = item["name"].as_str().unwrap_or("").to_string();
        if name.is_empty() { continue; }
        let tod = item["timeOfDay"].as_str().or(item["time_of_day"].as_str()).unwrap_or("other");
        let tod = if ["morning","noon","evening","night","other"].contains(&tod) { tod } else { "other" };
        let id = uuid();
        db.execute(
            "INSERT INTO scenes (id, work_id, name, description, location, time_of_day, mood, created_at, updated_at, deleted) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, 0)",
            rusqlite::params![id, work_id, name, item["description"].as_str().unwrap_or(""), item["location"].as_str().unwrap_or(""), tod, item["mood"].as_str().unwrap_or(""), now()],
        ).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;
        created.push(json!({ "id": id, "name": name }));
    }
    Ok(Json(json!({ "created": created.len(), "scenes": created })))
}

/** AI 检测全书伏笔并入库（来源标记 ai_detected） */
async fn ai_detect_clues(
    axum::extract::State(app): axum::extract::State<AppState>,
    Path(work_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let chapters = {
        let db = conn(&app).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
        let mut stmt = db
            .prepare("SELECT title, content FROM chapters WHERE work_id = ?1 AND deleted = 0 ORDER BY chapter_order")
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;
        let rows = stmt
            .query_map([&work_id], |r: &rusqlite::Row| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?
            .flatten()
            .map(|(t, c)| (t, html_to_text(&c)))
            .collect::<Vec<_>>();
        rows
    };
    if chapters.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "作品没有章节内容".into()));
    }
    let body_all = chapters.iter().map(|(t, c)| format!("【{}】\n{}", t, c.chars().take(3000).collect::<String>())).collect::<Vec<_>>().join("\n\n");
    let messages = json!([
        { "role": "system", "content": "你是严谨的中文编辑。只输出 JSON 数组（可为空 []），每个元素 {\"name\":\"伏笔简称\",\"description\":\"埋设位置与暗示内容\"}。只列确实存在于正文的伏笔。" },
        { "role": "user", "content": format!("检测以下章节中的伏笔：\n\n{}", body_all.chars().take(12000).collect::<String>()) }
    ]);
    let text = crate::ai::chat_once_from_config(&app, messages).await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    let arr = extract_json_array(&text).unwrap_or_default();
    let db = conn(&app).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    let mut created = Vec::new();
    for item in arr.iter().take(20) {
        let name = item["name"].as_str().unwrap_or("").to_string();
        if name.is_empty() { continue; }
        let id = uuid();
        db.execute(
            "INSERT INTO clues (id, work_id, name, source, status, setup_scene_id, payoff_scene_id, description, created_at, updated_at, deleted) VALUES (?1, ?2, ?3, 'ai_detected', 'open', NULL, NULL, ?4, ?5, ?5, 0)",
            rusqlite::params![id, work_id, name, item["description"].as_str().unwrap_or(""), now()],
        ).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;
        created.push(json!({ "id": id, "name": name }));
    }
    Ok(Json(json!({ "detected": created.len(), "clues": created })))
}

/** AI 生成分镜并入库（关联章节，order 续接） */
async fn ai_gen_storyboards(
    axum::extract::State(app): axum::extract::State<AppState>,
    Path(chapter_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let db = conn(&app).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    let (work_id, title, content): (String, String, String) = db
        .query_row("SELECT work_id, title, content FROM chapters WHERE id = ?1 AND deleted = 0", [&chapter_id], |r: &rusqlite::Row| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .map_err(|_| (StatusCode::NOT_FOUND, "章节不存在".to_string()))?;
    let messages = json!([
        { "role": "system", "content": "你是影视分镜师。只输出 JSON 数组，每个元素 {\"title\":\"\",\"description\":\"\",\"shotType\":\"wide|medium|close|extreme_close\",\"cameraMovement\":\"static|pan|tilt|zoom|dolly|crane\",\"duration\":秒}。8-12 个镜头。" },
        { "role": "user", "content": format!("为章节「{}」设计分镜：\n\n{}", title, html_to_text(&content).chars().take(8000).collect::<String>()) }
    ]);
    let text = crate::ai::chat_once_from_config(&app, messages).await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    let arr = extract_json_array(&text).unwrap_or_default();
    let base_order: i64 = db
        .query_row("SELECT COUNT(*) FROM storyboards WHERE chapter_id = ?1 AND deleted = 0", [&chapter_id], |r| r.get(0))
        .unwrap_or(0);
    let mut created = Vec::new();
    for (i, item) in arr.iter().take(20).enumerate() {
        let st = item["shotType"].as_str().or(item["shot_type"].as_str()).unwrap_or("medium");
        let st = if ["wide","medium","close","extreme_close"].contains(&st) { st } else { "medium" };
        let cm = item["cameraMovement"].as_str().or(item["camera_movement"].as_str()).unwrap_or("static");
        let cm = if ["static","pan","tilt","zoom","dolly","crane"].contains(&cm) { cm } else { "static" };
        let dur = item["duration"].as_i64().unwrap_or(5).clamp(1, 60);
        let id = uuid();
        db.execute(
            "INSERT INTO storyboards (id, work_id, chapter_id, scene_id, title, description, shot_type, camera_movement, duration, \"order\", thumbnail_url, created_at, updated_at, deleted) VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?6, ?7, ?8, ?9, NULL, ?10, ?10, 0)",
            rusqlite::params![id, work_id, chapter_id, item["title"].as_str().unwrap_or("未命名镜头"), item["description"].as_str().unwrap_or(""), st, cm, dur, base_order + i as i64, now()],
        ).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;
        created.push(json!({ "id": id, "title": item["title"].as_str().unwrap_or("") }));
    }
    Ok(Json(json!({ "created": created.len(), "storyboards": created })))
}

// ============================================================================
// 导出 / 导入 / 版本
// ============================================================================

/** 导出作品（或单章）为文件 */
async fn export_work_file(
    axum::extract::State(app): axum::extract::State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let work_id = body["workId"].as_str().ok_or((StatusCode::BAD_REQUEST, "workId 必填".into()))?.to_string();
    let format = body["format"].as_str().unwrap_or("txt");
    let save_path = body["savePath"].as_str().ok_or((StatusCode::BAD_REQUEST, "savePath 必填（绝对路径）".into()))?.to_string();
    let chapter_id = body["chapterId"].as_str();

    let (title, wtype, desc, mut chapters): (String, String, Option<String>, Vec<(String, String, String, i64)>) = {
        let db = conn(&app).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
        let meta = db
            .query_row("SELECT title, type, description FROM works WHERE id = ?1 AND deleted = 0", [&work_id], |r: &rusqlite::Row| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, Option<String>>(2)?)))
            .map_err(|_| (StatusCode::NOT_FOUND, "作品不存在".to_string()))?;
        let mut stmt = db
            .prepare("SELECT id, title, content, chapter_order FROM chapters WHERE work_id = ?1 AND deleted = 0 ORDER BY chapter_order")
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;
        let rows = stmt
            .query_map([&work_id], |r: &rusqlite::Row| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, i64>(3)?)))
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?
            .flatten()
            .collect::<Vec<_>>();
        (meta.0, meta.1, meta.2, rows)
    };
    if let Some(cid) = chapter_id {
        chapters.retain(|c| c.0 == cid);
    }
    if chapters.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "没有可导出的章节".into()));
    }

    // 组装 ExportData（camelCase 与 Rust 端 serde 对齐）
    let data = json!({
        "work": { "id": work_id, "title": title, "type": wtype, "description": desc },
        "chapters": chapters.iter().map(|c| json!({ "id": c.0, "title": c.1, "content": c.2, "order": c.3 })).collect::<Vec<_>>(),
        "options": { "workId": work_id, "format": format, "savePath": save_path, "includeToc": chapter_id.is_none(), "author": body["author"].as_str() }
    });
    let export_data: crate::export::ExportData = serde_json::from_value(data)
        .map_err(|e| (StatusCode::BAD_REQUEST, format!("参数无效: {}", e)))?;

    let result = match format {
        "txt" => crate::export::export_to_txt(export_data).await,
        "markdown" | "md" => crate::export::export_to_markdown(export_data).await,
        "html" => crate::export::export_to_html(export_data).await,
        "word" | "docx" => crate::export::export_to_word(export_data).await,
        "epub" => crate::export::export_to_epub(export_data).await,
        "script" | "fountain" => crate::export::export_to_script(export_data).await,
        _ => return Err((StatusCode::BAD_REQUEST, "不支持的格式（txt/markdown/html/word/epub/script）".into())),
    };
    match result {
        Ok(r) => Ok(Json(json!({ "ok": true, "filePath": save_path, "fileSize": r.file_size }))),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

/** 导入整本 TXT 文本（自动分章） */
async fn import_text(
    axum::extract::State(app): axum::extract::State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let title = body["title"].as_str().ok_or((StatusCode::BAD_REQUEST, "title 必填".into()))?.to_string();
    let text = body["text"].as_str().ok_or((StatusCode::BAD_REQUEST, "text 必填".into()))?.to_string();
    let wtype = body["type"].as_str().unwrap_or("novel");

    // 分章：按"第X章/节/回/卷/幕"行切分；无结构则按 6000 字切
    let mut chapters: Vec<(String, String)> = Vec::new();
    let cn = "一二三四五六七八九十百千万零两";
    let re_title = |line: &str| -> Option<String> {
        let t = line.trim().trim_start_matches('#').trim();
        if !t.starts_with("第") { return None; }
        let after = &t[3..];
        let mut end = None;
        for (i, ch) in after.char_indices() {
            if "章节回卷部集幕".contains(ch) {
                end = Some(i + ch.len_utf8());
                break;
            }
            if !(ch.is_ascii_digit() || cn.contains(ch)) {
                return None;
            }
        }
        end.map(|e| t[..3 + e].trim().to_string())
    };
    let lines: Vec<&str> = text.split('\n').collect();
    let mut current: Option<(String, String)> = None;
    for line in lines {
        if let Some(t) = re_title(line) {
            if let Some((title, body)) = current.take() {
                chapters.push((title, body.trim().to_string()));
            }
            current = Some((t, String::new()));
        } else if let Some((_, body)) = current.as_mut() {
            body.push_str(line);
            body.push('\n');
        } else if line.trim().len() > 50 {
            current = Some(("开头".to_string(), format!("{}\n", line)));
        }
    }
    if let Some((title, body)) = current.take() {
        chapters.push((title, body.trim().to_string()));
    }
    if chapters.is_empty() {
        // 兜底：按段落累积 6000 字切分
        let mut buf: Vec<&str> = Vec::new();
        let mut size = 0usize;
        for para in text.split("\n\n") {
            buf.push(para);
            size += para.len();
            if size >= 6000 {
                chapters.push((format!("第{}章", chapters.len() + 1), buf.join("\n\n")));
                buf.clear();
                size = 0;
            }
        }
        if !buf.is_empty() {
            chapters.push((format!("第{}章", chapters.len() + 1), buf.join("\n\n")));
        }
    }
    if chapters.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "文本为空".into()));
    }

    let db = conn(&app).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    let work_id = uuid();
    db.execute(
        "INSERT INTO works (id, title, type, icon, created_at, updated_at, deleted) VALUES (?1, ?2, ?3, ?4, ?5, ?5, 0)",
        rusqlite::params![work_id, title, wtype, if wtype == "script" { "🎬" } else { "📖" }, now()],
    ).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;
    for (i, (ct, cb)) in chapters.iter().enumerate() {
        let cid = uuid();
        db.execute(
            "INSERT INTO chapters (id, work_id, title, content, chapter_order, created_at, updated_at, deleted) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, 0)",
            rusqlite::params![cid, work_id, ct, text_to_html(cb), (i + 1) as i64, now()],
        ).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;
    }
    Ok(Json(json!({ "workId": work_id, "chapters": chapters.len(), "totalChars": text.len() })))
}

/** 章节版本列表 */
async fn list_chapter_versions(
    axum::extract::State(app): axum::extract::State<AppState>,
    Path(chapter_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let db = conn(&app).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    let mut stmt = db
        .prepare("SELECT id, title, word_count, label, created_at FROM chapter_versions WHERE chapter_id = ?1 ORDER BY created_at DESC LIMIT 50")
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;
    let list = stmt
        .query_map([&chapter_id], |r: &rusqlite::Row| {
            Ok(json!({
                "id": r.get::<_, String>(0)?,
                "title": r.get::<_, String>(1)?,
                "wordCount": r.get::<_, i64>(2)?,
                "label": r.get::<_, String>(3)?,
                "createdAt": r.get::<_, String>(4)?,
            }))
        })
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?
        .filter_map(|r| r.ok())
        .collect::<Vec<_>>();
    Ok(Json(json!(list)))
}

/** 保存章节版本快照（agent 大改前的保命索） */
async fn save_chapter_version_api(
    axum::extract::State(app): axum::extract::State<AppState>,
    Path(chapter_id): Path<String>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let label = body["label"].as_str().unwrap_or("agent 快照");
    let db = conn(&app).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    let (work_id, title, content): (String, String, String) = db
        .query_row("SELECT work_id, title, content FROM chapters WHERE id = ?1 AND deleted = 0", [&chapter_id], |r: &rusqlite::Row| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .map_err(|_| (StatusCode::NOT_FOUND, "章节不存在".to_string()))?;
    let id = uuid();
    db.execute(
        "INSERT INTO chapter_versions (id, chapter_id, work_id, title, content, word_count, label, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![id, chapter_id, work_id, title, content, word_count(&content), label, now()],
    ).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;
    Ok(Json(json!({ "versionId": id })))
}

/** 更新章节标题（修复重复前缀等场景） */
async fn update_chapter_title(
    axum::extract::State(app): axum::extract::State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let title = body["title"].as_str().ok_or((StatusCode::BAD_REQUEST, "title 必填".into()))?;
    let db = conn(&app).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    let n = db
        .execute("UPDATE chapters SET title = ?1, updated_at = ?2 WHERE id = ?3 AND deleted = 0", rusqlite::params![title, now(), id])
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;
    if n == 0 { return Err((StatusCode::NOT_FOUND, "章节不存在".into())); }
    Ok(Json(json!({ "ok": true })))
}
