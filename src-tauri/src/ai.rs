/*
 * AI 服务模块 - Rust 实现
 *
 * 通过 OpenAI 兼容的 Chat Completions API 调用大模型（Kimi/GLM/DeepSeek/
 * OpenAI/OpenRouter/LM Studio/Ollama 等），以事件流方式向前端推送增量内容。
 *
 * 【为什么在 Rust 侧做 HTTP】
 * - 绕开 WebView 的 CORS 限制，可以直连任意服务商与本地推理服务
 * - 密钥只在前端配置文件中保存、由后端转发，不经过第三方
 *
 * 【事件协议】
 * - "ai-chunk"  { requestId, delta, done }  增量内容 / 结束标记
 * - "ai-error"  { requestId, message }      错误通知
 */

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::{Mutex, OnceLock};
use tauri::Emitter;

/** 单条对话消息 */
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiMessage {
    pub role: String,
    pub content: String,
}

/** Chat Completions 请求参数 */
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiChatRequest {
    pub base_url: String,
    #[serde(default)]
    pub api_key: String,
    pub model: String,
    pub messages: Vec<AiMessage>,
    #[serde(default = "default_temperature")]
    pub temperature: f64,
    #[serde(default = "default_max_tokens")]
    pub max_tokens: u32,
}

fn default_temperature() -> f64 {
    0.7
}

fn default_max_tokens() -> u32 {
    2048
}

/** 推送给前端的增量事件载荷 */
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AiChunkEvent {
    request_id: String,
    delta: String,
    done: bool,
}

/** 推送给前端的错误事件载荷 */
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AiErrorEvent {
    request_id: String,
    message: String,
}

/// 已取消的请求 ID 集合
fn cancelled_set() -> &'static Mutex<HashSet<String>> {
    static CANCELLED: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    CANCELLED.get_or_init(|| Mutex::new(HashSet::new()))
}

/// 规范化 base URL：去掉尾部分隔符与 /chat/completions 后缀
fn normalize_base_url(base_url: &str) -> String {
    let trimmed = base_url.trim_end_matches('/');
    trimmed
        .strip_suffix("/chat/completions")
        .unwrap_or(trimmed)
        .to_string()
}

/**
 * 流式对话补全
 *
 * 向 {base_url}/chat/completions 发起 stream=true 请求，
 * 解析 SSE 数据并逐段 emit "ai-chunk" 事件；
 * 结束或出错时分别 emit done=true 的 chunk 或 "ai-error" 事件。
 */
#[tauri::command]
pub async fn ai_chat_stream(
    app: tauri::AppHandle,
    request_id: String,
    request: AiChatRequest,
) -> Result<(), String> {
    let url = format!("{}/chat/completions", normalize_base_url(&request.base_url));

    let mut body = serde_json::json!({
        "model": request.model,
        "messages": request.messages,
        "stream": true,
        "temperature": request.temperature,
    });
    // 部分本地服务（Ollama 等）在 max_tokens 为 0 时行为异常，仅在有效时携带
    if request.max_tokens > 0 {
        body["max_tokens"] = serde_json::json!(request.max_tokens);
    }

    let client = reqwest::Client::new();
    let mut builder = client.post(&url).json(&body);
    if !request.api_key.is_empty() {
        builder = builder.bearer_auth(&request.api_key);
    }

    let response = builder
        .send()
        .await
        .map_err(|e| format!("连接 AI 服务失败: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let detail = response.text().await.unwrap_or_default();
        let message = format!("AI 服务返回错误 ({}): {}", status, truncate_detail(&detail));
        app.emit("ai-error", AiErrorEvent { request_id: request_id.clone(), message: message.clone() })
            .ok();
        return Err(message);
    }

    cancelled_set().lock().unwrap().remove(&request_id);

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();

    while let Some(chunk) = stream.next().await {
        // 前端请求取消：停止拉取，不再通知（前端已主动结束）
        if cancelled_set().lock().unwrap().contains(&request_id) {
            break;
        }

        let bytes = chunk.map_err(|e| {
            let message = format!("读取 AI 响应失败: {}", e);
            app.emit("ai-error", AiErrorEvent { request_id: request_id.clone(), message: message.clone() }).ok();
            message
        })?;
        buffer.push_str(&String::from_utf8_lossy(&bytes));

        // SSE 以换行分隔，逐行解析
        while let Some(pos) = buffer.find('\n') {
            let line: String = buffer.drain(..=pos).collect();
            let line = line.trim();

            if !line.starts_with("data:") {
                continue;
            }
            let data = line[5..].trim();

            if data == "[DONE]" {
                app.emit("ai-chunk", AiChunkEvent { request_id: request_id.clone(), delta: String::new(), done: true }).ok();
                return Ok(());
            }

            let parsed: serde_json::Value = match serde_json::from_str(data) {
                Ok(v) => v,
                Err(_) => continue,
            };

            // 兼容 delta.content 与 message.content（部分服务不按流式返回）
            let delta = parsed["choices"][0]["delta"]["content"]
                .as_str()
                .or_else(|| parsed["choices"][0]["message"]["content"].as_str())
                .unwrap_or("");

            if !delta.is_empty() {
                app.emit(
                    "ai-chunk",
                    AiChunkEvent { request_id: request_id.clone(), delta: delta.to_string(), done: false },
                )
                .ok();
            }
        }
    }

    // 流结束但未收到 [DONE]：仍需通知前端结束
    app.emit("ai-chunk", AiChunkEvent { request_id, delta: String::new(), done: true }).ok();
    Ok(())
}

/**
 * 取消进行中的流式请求
 */
#[tauri::command]
pub fn ai_cancel(request_id: String) {
    cancelled_set().lock().unwrap().insert(request_id);
}

/**
 * 获取服务商可用模型列表（OpenAI GET /models 兼容格式）
 */
#[tauri::command]
pub async fn ai_list_models(
    base_url: String,
    api_key: String,
) -> Result<Vec<String>, String> {
    let url = format!("{}/models", normalize_base_url(&base_url));

    let client = reqwest::Client::new();
    let mut builder = client.get(&url);
    if !api_key.is_empty() {
        builder = builder.bearer_auth(&api_key);
    }

    let response = builder
        .send()
        .await
        .map_err(|e| format!("连接 AI 服务失败: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("获取模型列表失败 ({})", response.status()));
    }

    let json: serde_json::Value = response.json().await.map_err(|e| format!("解析响应失败: {}", e))?;

    let models = json["data"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m["id"].as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    Ok(models)
}

/**
 * 截断错误详情，避免超长响应撑爆事件
 */
fn truncate_detail(detail: &str) -> String {
    if detail.len() > 300 {
        format!("{}...", &detail[..300])
    } else {
        detail.to_string()
    }
}
