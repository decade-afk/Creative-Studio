/**
 * Creative Studio - Tauri 后端入口
 *
 * 这是Tauri应用的Rust后端主入口文件，负责：
 * 1. 初始化应用和插件系统
 * 2. 注册所有 Tauri 命令处理器
 * 3. 管理全局应用状态（如 AI 服务）
 * 4. 配置跨平台应用行为
 *
 * 架构说明：
 * - 前端通过 `@tauri-apps/api` 调用这里定义的命令
 * - 每个命令都是一个带 #[tauri::command] 标记的函数
 * - 使用 `tauri::State` 管理全局共享状态
 * - 支持同步和异步命令处理
 */

use std::sync::Arc;
use std::collections::HashMap;
use parking_lot::RwLock;
use tokio::sync::watch;

// 使用适配层
mod loci_adapter;
use loci_adapter::{
    AIService, AIConfig, GenerateRequest, GenerateResponse,
    AgentSystem, ModelConfig, AgentConfig, AgentGenerateRequest, AgentGenerateResponse, AgentTemplates,
    get_system_info, recommend_model, SystemInfo, ModelRecommendation,
};

/**
 * 流式生成状态管理器
 *
 * 管理所有活跃的流式生成会话，支持取消操作。
 */
pub struct StreamState {
    /// 会话 ID -> 取消信号发送器
    sessions: RwLock<HashMap<String, watch::Sender<bool>>>,
}

impl StreamState {
    pub fn new() -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
        }
    }
    
    /// 添加新会话
    pub fn add_session(&self, session_id: String, cancel_tx: watch::Sender<bool>) {
        self.sessions.write().insert(session_id, cancel_tx);
    }
    
    /// 移除会话
    pub fn remove_session(&self, session_id: &str) {
        self.sessions.write().remove(session_id);
    }
    
    /// 取消会话
    pub fn cancel_session(&self, session_id: &str) -> Result<(), String> {
        let sessions = self.sessions.read();
        if let Some(cancel_tx) = sessions.get(session_id) {
            let _ = cancel_tx.send(true);
            Ok(())
        } else {
            Err(format!("会话不存在: {}", session_id))
        }
    }
}

// ========== 模块导入 ==========

/// 导出模块：处理作品导出为各种格式（TXT, PDF, Word等）
mod export;

/// 向量数据库模块：处理语义搜索和向量存储
mod vector_db;

// ========== AI 服务相关命令 ==========

/**
 * Tauri 命令：更新 AI 配置
 *
 * 前端调用示例：
 * ```typescript
 * await invoke('ai_update_config', {
 *   config: {
 *     model_path: '/path/to/model.gguf',
 *     context_size: 4096,
 *     gpu_layers: 32,
 *     threads: 8,
 *     temperature: 0.7,
 *     top_p: 0.9,
 *     top_k: 40,
 *     repeat_penalty: 1.1
 *   }
 * });
 * ```
 *
 * 参数：
 * - service: 全局 AI 服务实例（由 Tauri 自动注入）
 * - config: 新的 AI 配置对象
 *
 * 返回：
 * - Ok(()): 配置更新成功
 * - Err(String): 错误信息
 *
 * 注意：
 * - 配置更新不会自动重新加载模型
 * - 如果模型已加载，需要先卸载再重新加载以应用新配置
 */
#[tauri::command]
fn ai_update_config(
    service: tauri::State<Arc<AIService>>,
    config: AIConfig
) -> Result<(), String> {
    service.update_config(config)
        .map_err(|e| format!("配置更新失败: {:?}", e))?;
    Ok(())
}

/**
 * Tauri 命令：获取当前 AI 配置
 *
 * 前端调用示例：
 * ```typescript
 * const config = await invoke('ai_get_config');
 * console.log('当前配置:', config);
 * ```
 *
 * 参数：
 * - service: 全局 AI 服务实例
 *
 * 返回：
 * - Ok(AIConfig): 当前配置对象
 * - Err(String): 错误信息（极少发生）
 */
#[tauri::command]
fn ai_get_config(
    service: tauri::State<Arc<AIService>>
) -> Result<AIConfig, String> {
    Ok(service.get_config())
}

/**
 * Tauri 命令：加载 AI 模型
 *
 * 前端调用示例：
 * ```typescript
 * try {
 *   await invoke('ai_load_model');
 *   console.log('模型加载成功');
 * } catch (error) {
 *   console.error('加载失败:', error);
 * }
 * ```
 *
 * 执行流程：
 * 1. 读取当前配置中的模型路径
 * 2. 验证文件存在性
 * 3. 初始化 llama.cpp 后端
 * 4. 加载模型到内存（耗时操作）
 * 5. 准备推理环境
 *
 * 参数：
 * - service: 全局 AI 服务实例
 *
 * 返回：
 * - Ok(()): 模型加载成功
 * - Err(String): 错误信息（文件不存在、内存不足等）
 *
 * 注意事项：
 * - 这是一个耗时操作（可能需要几秒到几分钟）
 * - 会占用大量内存（7B 模型约 4-8GB）
 * - 建议在后台线程调用，避免阻塞 UI
 */
#[tauri::command]
fn ai_load_model(
    service: tauri::State<Arc<AIService>>
) -> Result<(), String> {
    service.load_model()
}

/**
 * Tauri 命令：卸载 AI 模型
 *
 * 前端调用示例：
 * ```typescript
 * await invoke('ai_unload_model');
 * console.log('模型已卸载，内存已释放');
 * ```
 *
 * 执行操作：
 * - 释放模型占用的内存
 * - 清理 GPU 资源（如果使用了 GPU）
 * - 销毁推理上下文
 *
 * 参数：
 * - service: 全局 AI 服务实例
 *
 * 返回：
 * - Ok(()): 始终成功
 * - Err: 不会失败
 *
 * 使用场景：
 * - 切换到不同的模型
 * - 释放内存给其他应用
 * - 应用关闭前的清理
 */
#[tauri::command]
fn ai_unload_model(
    service: tauri::State<Arc<AIService>>
) -> Result<(), String> {
    service.unload_model();
    Ok(())
}

/**
 * Tauri 命令：检查模型是否已加载
 *
 * 前端调用示例：
 * ```typescript
 * const isLoaded = await invoke('ai_is_model_loaded');
 * if (isLoaded) {
 *   console.log('模型已就绪，可以生成文本');
 * } else {
 *   console.log('请先加载模型');
 * }
 * ```
 *
 * 参数：
 * - service: 全局 AI 服务实例
 *
 * 返回：
 * - Ok(true): 模型已加载
 * - Ok(false): 模型未加载
 * - Err: 不会失败
 *
 * 典型用途：
 * - UI 状态管理（启用/禁用生成按钮）
 * - 在调用 generate 前验证
 * - 显示加载进度/状态
 */
#[tauri::command]
fn ai_is_model_loaded(
    service: tauri::State<Arc<AIService>>
) -> Result<bool, String> {
    Ok(service.is_model_loaded())
}

/**
 * Tauri 命令：生成文本（异步）
 *
 * 前端调用示例：
 * ```typescript
 * const response = await invoke('ai_generate', {
 *   request: {
 *     prompt: '写一个悬疑短剧的开头',
 *     system_prompt: '你是一个专业的编剧助手',
 *     max_tokens: 512,
 *     temperature: 0.8,
 *     stop_words: ['[完]', '---']
 *   }
 * });
 * console.log('生成内容:', response.content);
 * console.log('Token数:', response.tokens_generated);
 * ```
 *
 * 执行流程：
 * 1. 验证模型已加载
 * 2. 在后台线程执行推理（避免阻塞主线程）
 * 3. 逐 token 生成文本
 * 4. 返回完整结果
 *
 * 参数：
 * - service: 全局 AI 服务实例
 * - request: 生成请求对象，包含：
 *   - prompt: 用户提示词（必需）
 *   - system_prompt: 系统提示词（可选）
 *   - max_tokens: 最大生成长度（可选，默认 512）
 *   - temperature: 临时温度设置（可选）
 *   - stop_words: 停止词列表（可选）
 *
 * 返回：
 * - Ok(GenerateResponse): 生成成功，包含：
 *   - content: 生成的文本内容
 *   - tokens_generated: 实际生成的 token 数
 *   - stopped_early: 是否提前停止
 * - Err(String): 生成失败，包含错误描述
 *
 * 性能说明：
 * - 使用 `async` 和 `spawn_blocking` 避免阻塞 Tauri 事件循环
 * - 推理速度取决于：模型大小、硬件性能、生成长度
 * - 7B 模型在中等 CPU 上约 5-10 tokens/秒
 * - GPU 加速可提升到 50-100+ tokens/秒
 *
 * 错误处理：
 * - "模型未加载"：需要先调用 ai_load_model
 * - "推理任务失败"：后台线程异常
 * - 其他错误由 AIService::generate 返回
 */
#[tauri::command]
async fn ai_generate(
    service: tauri::State<'_, Arc<AIService>>,
    request: GenerateRequest
) -> Result<GenerateResponse, String> {
    // 克隆 Arc 以移动到后台线程
    let service = service.inner().clone();

    // 在后台线程执行推理(避免阻塞主线程)
    // spawn_blocking 会在 Tokio 的阻塞线程池中执行
    let result: Result<Result<GenerateResponse, String>, _> = tokio::task::spawn_blocking(move || -> Result<GenerateResponse, String> {
        service.generate(request)
    })
    .await; // 等待后台任务完成

    result.map_err(|e| format!("推理任务失败: {:?}", e))?  // 处理 JoinError
}

/**
 * Tauri 命令：流式生成文本
 *
 * 通过 Tauri Event 实时发送生成的 token 到前端。
 * 支持通过返回的 session_id 取消生成。
 *
 * 前端调用示例：
 * ```typescript
 * // 1. 监听流式事件
 * const unlisten = await listen('ai-stream', (event) => {
 *   const data = event.payload;
 *   if (data.type === 'token') {
 *     console.log('Token:', data.content);
 *   } else if (data.type === 'done') {
 *     console.log('完成:', data.content);
 *   } else if (data.type === 'error') {
 *     console.error('错误:', data.message);
 *   }
 * });
 *
 * // 2. 开始流式生成
 * const sessionId = await invoke('ai_generate_stream', {
 *   request: { prompt: '写一个故事' }
 * });
 *
 * // 3. 如需取消
 * await invoke('ai_cancel_stream', { sessionId });
 * ```
 *
 * 参数：
 * - service: 全局 AI 服务实例
 * - stream_state: 流式生成状态管理
 * - window: Tauri 窗口句柄
 * - request: 生成请求
 *
 * 返回：
 * - Ok(String): session_id，用于取消生成
 * - Err(String): 错误信息
 */
#[tauri::command]
async fn ai_generate_stream(
    _service: tauri::State<'_, Arc<AIService>>,
    _stream_state: tauri::State<'_, Arc<StreamState>>,
    _window: tauri::Window,
    _request: GenerateRequest,
) -> Result<String, String> {
    // Streaming not supported by Loci engine yet
    Err("流式生成暂未支持，请使用 ai_generate 代替".to_string())
}

/**
 * Tauri 命令：取消流式生成
 *
 * 前端调用示例：
 * ```typescript
 * await invoke('ai_cancel_stream', { sessionId });
 * ```
 *
 * 参数：
 * - stream_state: 流式生成状态管理
 * - session_id: 生成会话 ID
 *
 * 返回：
 * - Ok(()): 取消信号已发送
 * - Err(String): 会话不存在
 */
#[tauri::command]
fn ai_cancel_stream(
    stream_state: tauri::State<'_, Arc<StreamState>>,
    session_id: String,
) -> Result<(), String> {
    stream_state.cancel_session(&session_id)
}

// ========== Agent 系统相关命令 ==========

/**
 * Tauri 命令：加载模型到模型池
 *
 * 前端调用示例：
 * ```typescript
 * await invoke('agent_load_model', {
 *   config: {
 *     model_id: 'model_general',
 *     model_path: '/path/to/model.gguf',
 *     context_size: 4096,
 *     gpu_layers: 32,
 *     threads: 8
 *   }
 * });
 * ```
 */
#[tauri::command]
fn agent_load_model(
    agent_system: tauri::State<'_, Arc<AgentSystem>>,
    config: ModelConfig
) -> Result<(), String> {
    agent_system.load_model(config)
}

/**
 * Tauri 命令：从模型池卸载模型
 */
#[tauri::command]
fn agent_unload_model(
    agent_system: tauri::State<'_, Arc<AgentSystem>>,
    model_id: String
) -> Result<(), String> {
    agent_system.unload_model(&model_id)
}

/**
 * Tauri 命令：列出所有已加载的模型
 */
#[tauri::command]
fn agent_list_models(
    agent_system: tauri::State<'_, Arc<AgentSystem>>
) -> Vec<ModelConfig> {
    agent_system.list_models()
}

/**
 * Tauri 命令：检查模型是否已加载
 */
#[tauri::command]
fn agent_is_model_loaded(
    agent_system: tauri::State<'_, Arc<AgentSystem>>,
    model_id: String
) -> bool {
    agent_system.is_model_loaded(&model_id)
}

/**
 * Tauri 命令：创建新的 Agent
 *
 * 前端调用示例：
 * ```typescript
 * await invoke('agent_create_agent', {
 *   config: {
 *     agent_id: 'writer',
 *     model_id: 'model_general',
 *     system_prompt: '你是一个创意写作助手...',
 *     temperature: 0.9,
 *     top_p: 0.95,
 *     top_k: 100,
 *     repeat_penalty: 1.15,
 *     description: '创意写作助手'
 *   }
 * });
 * ```
 */
#[tauri::command]
fn agent_create_agent(
    agent_system: tauri::State<'_, Arc<AgentSystem>>,
    config: AgentConfig
) -> Result<(), String> {
    agent_system.create_agent(config)
}

/**
 * Tauri 命令：删除 Agent
 */
#[tauri::command]
fn agent_delete_agent(
    agent_system: tauri::State<'_, Arc<AgentSystem>>,
    agent_id: String
) -> Result<(), String> {
    agent_system.delete_agent(&agent_id)
}

/**
 * Tauri 命令：列出所有 Agent
 */
#[tauri::command]
fn agent_list_agents(
    agent_system: tauri::State<'_, Arc<AgentSystem>>
) -> Vec<AgentConfig> {
    agent_system.list_agents()
}

/**
 * Tauri 命令：获取 Agent 配置
 */
#[tauri::command]
fn agent_get_agent(
    agent_system: tauri::State<'_, Arc<AgentSystem>>,
    agent_id: String
) -> Option<AgentConfig> {
    agent_system.get_agent(&agent_id).ok()
}

/**
 * Tauri 命令：使用 Agent 生成文本（异步）
 *
 * 前端调用示例（单次对话）：
 * ```typescript
 * const response = await invoke('agent_generate', {
 *   request: {
 *     agent_id: 'writer',
 *     prompt: '写一个悬疑短剧的开头',
 *     max_tokens: 2048,
 *     temperature: 0.8
 *   }
 * });
 * ```
 *
 * 前端调用示例（多轮对话）：
 * ```typescript
 * // 第一轮：创建会话
 * const sessionId = await invoke('agent_create_session', {
 *   agentId: 'writer'
 * });
 *
 * // 第二轮：带会话 ID 生成
 * const response = await invoke('agent_generate', {
 *   request: {
 *     agent_id: 'writer',
 *     prompt: '写一个悬疑短剧的开头',
 *     session_id: sessionId,
 *     max_tokens: 2048
 *   }
 * });
 *
 * // 第三轮：继续对话（会保留上下文）
 * const response2 = await invoke('agent_generate', {
 *   request: {
 *     agent_id: 'writer',
 *     prompt: '继续写下一幕',
 *     session_id: sessionId,
 *     max_tokens: 2048
 *   }
 * });
 * ```
 */
#[tauri::command]
async fn agent_generate(
    agent_system: tauri::State<'_, Arc<AgentSystem>>,
    request: AgentGenerateRequest
) -> Result<AgentGenerateResponse, String> {
    let agent_system = agent_system.inner().clone();
    let result: Result<Result<AgentGenerateResponse, String>, _> = tokio::task::spawn_blocking(move || -> Result<AgentGenerateResponse, String> {
        agent_system.generate(request)
    })
    .await;

    result.map_err(|e| format!("推理任务失败: {:?}", e))?
}

/**
 * Tauri 命令：创建新会话
 */
#[tauri::command]
fn agent_create_session(
    agent_system: tauri::State<'_, Arc<AgentSystem>>,
    agent_id: String
) -> Result<String, String> {
    agent_system.create_session(agent_id)
}

/**
 * Tauri 命令：删除会话
 */
#[tauri::command]
fn agent_delete_session(
    agent_system: tauri::State<'_, Arc<AgentSystem>>,
    session_id: String
) -> Result<(), String> {
    agent_system.delete_session(&session_id)
}

/**
 * Tauri 命令：清理过期会话
 *
 * 返回清理的会话数量
 */
#[tauri::command]
fn agent_cleanup_sessions(
    agent_system: tauri::State<'_, Arc<AgentSystem>>
) -> usize {
    agent_system.cleanup_expired_sessions()
}

/**
 * Tauri 命令：获取预定义的 Agent 模板
 *
 * 前端调用示例：
 * ```typescript
 * // 获取通用助手模板
 * const config = await invoke('agent_get_template_general', {
 *   modelId: 'model_general'
 * });
 * // 然后创建 Agent
 * await invoke('agent_create_agent', { config });
 * ```
 */
#[tauri::command]
fn agent_get_template_general(model_id: String) -> AgentConfig {
    AgentTemplates::general_assistant(model_id)
}

#[tauri::command]
fn agent_get_template_coder(model_id: String) -> AgentConfig {
    AgentTemplates::code_assistant(model_id)
}

#[tauri::command]
fn agent_get_template_writer(model_id: String) -> AgentConfig {
    AgentTemplates::creative_writer(model_id)
}

#[tauri::command]
fn agent_get_template_storyboard(model_id: String) -> AgentConfig {
    AgentTemplates::storyboard_artist(model_id)
}

// ========== 系统信息和模型推荐命令 ==========

/**
 * Tauri 命令：获取系统硬件信息
 *
 * 前端调用示例：
 * ```typescript
 * const systemInfo = await invoke('system_get_info');
 * console.log('CPU:', systemInfo.cpu.brand);
 * console.log('内存:', systemInfo.memory.total_gb + 'GB');
 * console.log('GPU:', systemInfo.gpu.description);
 * ```
 *
 * 返回信息包括：
 * - cpu: CPU 品牌、核心数、架构等
 * - memory: 总内存、可用内存、使用率等
 * - gpu: GPU 类型（CUDA/Metal/Vulkan）
 * - os: 操作系统名称和版本
 *
 * 建议在加载模型前调用，以了解系统配置。
 */
#[tauri::command]
fn system_get_info() -> Result<SystemInfo, String> {
    get_system_info()
}

/**
 * Tauri 命令：获取模型推荐配置
 *
 * 前端调用示例：
 * ```typescript
 * const systemInfo = await invoke('system_get_info');
 * const recommendation = await invoke('system_recommend_model', { systemInfo });
 *
 * console.log('推荐模型大小:', recommendation.recommended_sizes);
 * console.log('推荐上下文:', recommendation.recommended_context_size);
 * console.log('推荐 GPU 层数:', recommendation.recommended_gpu_layers);
 * console.log('推荐线程数:', recommendation.recommended_threads);
 * console.log('性能等级:', recommendation.performance_tier);
 *
 * // 显示建议
 * recommendation.suggestions.forEach(msg => console.log(msg));
 * ```
 *
 * 推荐逻辑：
 * - 根据可用内存推荐模型大小（1B/3B/7B/13B/30B+）
 * - 根据 GPU 类型推荐 GPU 加速参数
 * - 根据 CPU 核心数推荐线程数
 * - 根据总内存推荐上下文大小
 * - 提供性能优化建议和警告
 *
 * 内存安全策略：
 * - 模型内存占用不超过可用内存的 70%
 * - 如果内存使用率 > 80%，会发出警告
 * - 如果可用内存 < 4GB，会强烈建议释放内存
 */
#[tauri::command]
fn system_recommend_model(system_info: SystemInfo) -> ModelRecommendation {
    recommend_model(&system_info)
}

// ========== 向量数据库相关命令 ==========

/**
 * Tauri 命令：初始化向量数据库
 *
 * 前端调用示例：
 * ```typescript
 * await invoke('vector_db_init', { dbPath: './data/vectors' });
 * ```
 */
#[tauri::command]
async fn vector_db_init(
    vector_db: tauri::State<'_, Arc<vector_db::VectorDatabase>>,
) -> Result<(), String> {
    vector_db
        .initialize()
        .await
        .map_err(|e| e.to_string())?;

    vector_db
        .create_table()
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

/**
 * Tauri 命令：添加文档到向量数据库
 *
 * 前端调用示例：
 * ```typescript
 * await invoke('vector_db_add_documents', {
 *   documents: [
 *     {
 *       id: 'chapter-1',
 *       work_id: 'work-123',
 *       chapter_id: 'chapter-1',
 *       doc_type: 'chapter',
 *       title: '第一章',
 *       content: '章节内容...',
 *       embedding: [0.1, 0.2, ...],
 *       metadata: '{}',
 *       created_at: '2024-01-01T00:00:00Z'
 *     }
 *   ]
 * });
 * ```
 */
#[tauri::command]
async fn vector_db_add_documents(
    vector_db: tauri::State<'_, Arc<vector_db::VectorDatabase>>,
    documents: Vec<vector_db::VectorDocument>,
) -> Result<usize, String> {
    vector_db
        .add_documents(documents)
        .await
        .map_err(|e| e.to_string())
}

/**
 * Tauri 命令：语义搜索
 *
 * 前端调用示例：
 * ```typescript
 * const results = await invoke('vector_db_search', {
 *   queryEmbedding: [0.1, 0.2, ...],
 *   limit: 10
 * });
 * ```
 */
#[tauri::command]
async fn vector_db_search(
    vector_db: tauri::State<'_, Arc<vector_db::VectorDatabase>>,
    query_embedding: Vec<f32>,
    limit: usize,
) -> Result<Vec<vector_db::SearchResult>, String> {
    vector_db
        .search(query_embedding, limit)
        .await
        .map_err(|e| e.to_string())
}

/**
 * Tauri 命令：根据作品 ID 删除文档
 *
 * 前端调用示例：
 * ```typescript
 * await invoke('vector_db_delete_by_work', { workId: 'work-123' });
 * ```
 */
#[tauri::command]
async fn vector_db_delete_by_work(
    vector_db: tauri::State<'_, Arc<vector_db::VectorDatabase>>,
    work_id: String,
) -> Result<usize, String> {
    vector_db
        .delete_by_work(&work_id)
        .await
        .map_err(|e| e.to_string())
}

/**
 * Tauri 命令：获取向量数据库统计信息
 *
 * 前端调用示例：
 * ```typescript
 * const stats = await invoke('vector_db_get_stats');
 * console.log('Total documents:', stats.total_documents);
 * ```
 */
#[tauri::command]
async fn vector_db_get_stats(
    vector_db: tauri::State<'_, Arc<vector_db::VectorDatabase>>,
) -> Result<vector_db::DatabaseStats, String> {
    vector_db
        .get_stats()
        .await
        .map_err(|e| e.to_string())
}

/**
 * Tauri 命令：生成文本嵌入向量
 *
 * 前端调用示例：
 * ```typescript
 * const embedding = await invoke('vector_db_generate_embedding', {
 *   text: '这是一段需要向量化的文本'
 * });
 * ```
 */
#[tauri::command]
async fn vector_db_generate_embedding(text: String) -> Result<Vec<f32>, String> {
    vector_db::generate_embedding(&text)
        .await
        .map_err(|e| e.to_string())
}

// ========== 应用初始化 ==========

/**
 * Tauri 应用主入口
 *
 * 这个函数在应用启动时被调用（桌面端和移动端共用）。
 * 负责完整的应用初始化流程。
 *
 * 初始化步骤：
 * 1. 创建全局状态（AI 服务等）
 * 2. 初始化 Tauri 插件（文件系统、数据库、对话框等）
 * 3. 注册所有命令处理器
 * 4. 启动事件循环
 *
 * 条件编译：
 * - `#[cfg_attr(mobile, tauri::mobile_entry_point)]`
 * - 在移动平台上，这个函数会作为入口点
 * - 在桌面平台上，由 main.rs 调用
 */
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // ========== 第一步：创建全局状态 ==========

    // 创建 AI 服务实例
    // 使用 Arc 包装以支持多线程共享
    let ai_service = Arc::new(AIService::new());

    // 创建 Agent 系统实例
    let agent_system = Arc::new(AgentSystem::new());

    // 创建流式生成状态管理器
    let stream_state = Arc::new(StreamState::new());

    // 创建向量数据库实例
    // 数据库路径：./data/vectors.lance
    let vector_db = Arc::new(vector_db::VectorDatabase::new(
        "./data/vectors.lance".to_string(),
        Some("documents".to_string()),
    ));

    // ========== 第二步：构建 Tauri 应用 ==========

    tauri::Builder::default()
        // ========== 第三步：初始化插件 ==========

        // dialog 插件：提供原生文件选择对话框
        // 用途：选择模型文件、导出位置等
        .plugin(tauri_plugin_dialog::init())

        // fs 插件：文件系统访问（带权限控制）
        // 用途：读写用户文件、保存作品等
        .plugin(tauri_plugin_fs::init())

        // opener 插件：打开外部链接和文件
        // 用途：在默认浏览器中打开链接、在系统文件管理器中显示文件等
        .plugin(tauri_plugin_opener::init())

        // sql 插件：SQLite 数据库支持
        // 用途：本地数据持久化（作品、章节、设置等）
        .plugin(tauri_plugin_sql::Builder::default().build())

        // ========== 第四步：管理全局状态 ==========

        // 将 AI 服务注册为全局状态
        // 所有命令都可以通过 `tauri::State<Arc<AIService>>` 访问
        .manage(ai_service)

        // 将 Agent 系统注册为全局状态
        // 所有命令都可以通过 `tauri::State<Arc<AgentSystem>>` 访问
        .manage(agent_system)

        // 将流式生成状态管理器注册为全局状态
        .manage(stream_state)

        // 将向量数据库注册为全局状态
        // 所有命令都可以通过 `tauri::State<Arc<VectorDatabase>>` 访问
        .manage(vector_db)

        // ========== 第五步：注册命令处理器 ==========

        .invoke_handler(tauri::generate_handler![
            // 导出功能命令
            export::export_to_txt,      // 导出为 TXT
            export::export_to_pdf,      // 导出为 PDF
            export::export_to_word,     // 导出为 Word
            export::export_to_markdown, // 导出为 Markdown
            export::export_to_html,     // 导出为 HTML
            export::export_to_script,   // 导出为分镜脚本
            export::export_to_epub,     // 导出为 EPUB

            // AI 功能命令
            ai_update_config,    // 更新 AI 配置
            ai_get_config,       // 获取 AI 配置
            ai_load_model,       // 加载模型
            ai_unload_model,     // 卸载模型
            ai_is_model_loaded,  // 检查模型状态
            ai_generate,         // 生成文本
            ai_generate_stream,  // 流式生成文本
            ai_cancel_stream,    // 取消流式生成

            // Agent 系统命令
            agent_load_model,               // 加载模型到模型池
            agent_unload_model,             // 从模型池卸载模型
            agent_list_models,              // 列出所有已加载的模型
            agent_is_model_loaded,          // 检查模型是否已加载
            agent_create_agent,             // 创建新的 Agent
            agent_delete_agent,             // 删除 Agent
            agent_list_agents,              // 列出所有 Agent
            agent_get_agent,                // 获取 Agent 配置
            agent_generate,                 // 使用 Agent 生成文本
            agent_create_session,           // 创建新会话
            agent_delete_session,           // 删除会话
            agent_cleanup_sessions,         // 清理过期会话
            agent_get_template_general,     // 获取通用助手模板
            agent_get_template_coder,       // 获取代码助手模板
            agent_get_template_writer,      // 获取创意写作模板
            agent_get_template_storyboard,  // 获取分镜师模板

            // 系统信息和模型推荐命令
            system_get_info,                // 获取系统硬件信息
            system_recommend_model,         // 获取模型推荐配置

            // 向量数据库命令
            vector_db_init,                 // 初始化向量数据库
            vector_db_add_documents,        // 添加文档
            vector_db_search,               // 语义搜索
            vector_db_delete_by_work,       // 按作品ID删除
            vector_db_get_stats,            // 获取统计信息
            vector_db_generate_embedding,   // 生成文本嵌入
        ])

        // ========== 第六步：运行应用 ==========

        // 启动 Tauri 事件循环
        // generate_context!() 宏会自动读取 tauri.conf.json 配置
        .run(tauri::generate_context!())
        .expect("启动Tauri应用时发生错误");
}

/*
 * ========== 扩展指南 ==========
 *
 * 添加新的 Tauri 命令：
 *
 * 1. 定义命令函数：
 * ```rust
 * #[tauri::command]
 * fn my_command(param: String) -> Result<String, String> {
 *     Ok(format!("收到参数: {}", param))
 * }
 * ```
 *
 * 2. 在 invoke_handler 中注册：
 * ```rust
 * .invoke_handler(tauri::generate_handler![
 *     my_command,
 *     // ... 其他命令
 * ])
 * ```
 *
 * 3. 前端调用：
 * ```typescript
 * import { invoke } from '@tauri-apps/api/core';
 * const result = await invoke('my_command', { param: '测试' });
 * ```
 *
 * 使用全局状态：
 *
 * 1. 定义状态类型：
 * ```rust
 * struct MyState {
 *     data: RwLock<String>
 * }
 * ```
 *
 * 2. 在 run() 中注册：
 * ```rust
 * let state = Arc::new(MyState { data: RwLock::new(String::new()) });
 * tauri::Builder::default()
 *     .manage(state)
 *     // ...
 * ```
 *
 * 3. 在命令中使用：
 * ```rust
 * #[tauri::command]
 * fn use_state(state: tauri::State<Arc<MyState>>) -> String {
 *     state.data.read().clone()
 * }
 * ```
 */
