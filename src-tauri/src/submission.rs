/*
 * 投递模块 - Rust 实现
 *
 * 两家平台均无公开投稿 API，此模块提供"内嵌后台 + 自动填充"能力：
 * 1. open_submission_window: 为平台打开/聚焦独立的 Webview 窗口（加载作家后台，
 *    用户在窗口内登录；登录态由 WebView 持久化存储保留）
 * 2. fill_submission: 对平台窗口执行 evaluate_script，将章节标题与正文
 *    注入页面中的标题输入框与正文编辑器（选择器多级探测，尽力而为；
 *    注入结果以页面内浮动提示条反馈，失败时提示用户用剪贴板粘贴）
 */

use serde::Deserialize;
use tauri::Manager;

/** 平台窗口 label（capability 中以 submission-* 通配授权） */
fn window_label(platform: &str) -> String {
    format!("submission-{platform}")
}

/** 平台后台地址 */
fn console_url(platform: &str) -> &'static str {
    match platform {
        "fanqie" => "https://fanqienovel.com/writer/zone",
        _ => "https://write.qq.com",
    }
}

/**
 * 打开（或聚焦）平台作家后台窗口
 */
#[tauri::command]
pub async fn open_submission_window(app: tauri::AppHandle, platform: String) -> Result<(), String> {
    let label = window_label(&platform);
    let url = console_url(&platform);

    // 已打开则聚焦
    if let Some(existing) = app.get_webview_window(&label) {
        existing
            .set_focus()
            .map_err(|e| format!("聚焦窗口失败: {}", e))?;
        return Ok(());
    }

    tauri::webview::WebviewWindowBuilder::new(
        &app,
        &label,
        tauri::WebviewUrl::External(url.parse().map_err(|_| "URL 解析失败".to_string())?),
    )
    .title(if platform == "fanqie" { "番茄小说 · 作家后台" } else { "起点中文网 · 作家后台" })
    .inner_size(1280.0, 860.0)
    .build()
    .map_err(|e| format!("打开平台窗口失败: {}", e))?;

    Ok(())
}

/** 自动填充请求参数 */
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FillRequest {
    pub platform: String,
    pub title: String,
    pub content: String,
}

/**
 * 向平台窗口注入填充脚本
 *
 * 【注入策略】多级选择器探测，命中即填：
 * - 标题：input/textarea[name|placeholder 含 title/标题/章节名]
 * - 正文：优先大面积 contenteditable，其次大面积 textarea
 * 【反馈】在页面右上角插入 3 秒浮动提示条说明结果
 */
#[tauri::command]
pub async fn fill_submission(app: tauri::AppHandle, request: FillRequest) -> Result<(), String> {
    let label = window_label(&request.platform);
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| "平台窗口未打开，请先点击「打开作家后台」并登录".to_string())?;

    let title = request.title.replace('\\', "\\\\").replace('\'', "\\'").replace('\n', "\\n");
    let content = request.content.replace('\\', "\\\\").replace('\'', "\\'").replace('\n', "\\n");

    let script = format!(
        r#"(function() {{
  var TITLE = '{title}';
  var CONTENT = '{content}';
  var results = [];

  function setInputValue(el, value) {{
    var proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    var setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', {{ bubbles: true }}));
    el.dispatchEvent(new Event('change', {{ bubbles: true }}));
  }}

  // ===== 标题 =====
  var titleEl = null;
  var titleCandidates = document.querySelectorAll(
    'input[name*="title" i], input[placeholder*="标题" i], input[placeholder*="章节" i], ' +
    'textarea[name*="title" i], textarea[placeholder*="标题" i]'
  );
  if (titleCandidates.length) titleEl = titleCandidates[titleCandidates.length - 1];
  if (titleEl) {{
    setInputValue(titleEl, TITLE);
    results.push('标题已填充');
  }} else {{
    results.push('未找到标题输入框');
  }}

  // ===== 正文 =====
  // 优先：面积最大的 contenteditable（富文本编辑器）
  var editors = Array.from(document.querySelectorAll('[contenteditable="true"]'));
  var bodyEl = null, bestArea = 0;
  editors.forEach(function(ed) {{
    var r = ed.getBoundingClientRect();
    var area = r.width * r.height;
    if (area > bestArea) {{ bestArea = area; bodyEl = ed; }}
  }});
  // 次选：面积最大的 textarea
  if (!bodyEl || bestArea < 10000) {{
    var tas = Array.from(document.querySelectorAll('textarea'));
    var bestTa = null; bestArea = 0;
    tas.forEach(function(ta) {{
      var r = ta.getBoundingClientRect();
      var area = r.width * r.height;
      if (area > bestArea) {{ bestArea = area; bestTa = ta; }}
    }});
    if (bestTa && bestArea > 10000) {{
      setInputValue(bestTa, CONTENT);
      bodyEl = bestTa;
    }}
  }}
  if (bodyEl && bodyEl.isContentEditable) {{
    bodyEl.focus();
    bodyEl.innerHTML = '';
    // 按段落逐个插入，触发输入事件让编辑器框架感知
    var paragraphs = CONTENT.split('\n\n');
    paragraphs.forEach(function(p, i) {{
      var div = document.createElement('div');
      div.textContent = p;
      bodyEl.appendChild(div);
      if (i < paragraphs.length - 1) bodyEl.appendChild(document.createElement('br'));
    }});
    bodyEl.dispatchEvent(new Event('input', {{ bubbles: true }}));
    results.push('正文已填充');
  }} else if (bodyEl) {{
    results.push('正文已填充');
  }} else {{
    results.push('未找到正文编辑器（内容已在剪贴板，可直接 Ctrl+V）');
  }}

  // ===== 浮动结果提示 =====
  var old = document.getElementById('__cs_fill_toast');
  if (old) old.remove();
  var toast = document.createElement('div');
  toast.id = '__cs_fill_toast';
  toast.textContent = 'Creative Studio：' + results.join('；');
  toast.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;background:#8b6342;color:#fff;padding:10px 16px;border-radius:8px;font-size:13px;box-shadow:0 4px 16px rgba(0,0,0,.3);max-width:360px;';
  document.body.appendChild(toast);
  setTimeout(function() {{ toast.remove(); }}, 4000);
}})();"#,
        title = title,
        content = content
    );

    window
        .eval(&script)
        .map_err(|e| format!("注入填充脚本失败: {}", e))?;

    Ok(())
}
