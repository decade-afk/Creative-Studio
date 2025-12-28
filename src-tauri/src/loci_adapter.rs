/**
 * Loci API 适配层
 *
 * 将 Creative-Studio 期望的 API 适配到 Loci 实际提供的 API
 */

use anyhow::Result;
use serde::{Deserialize, Serialize};
use loci::{LociEngine, EngineConfig as LociEngineConfig};

// ==================== 类型别名和适配结构 ====================

/// AI配置 - 映射到 Loci EngineConfig
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIConfig {
    pub model_path: String,
    pub context_size: u32,
    pub gpu_layers: i32,
    pub threads: u32,
    pub temperature: f32,
    pub top_p: f32,
    pub top_k: i32,
    pub repeat_penalty: f32,
}

impl Default for AIConfig {
    fn default() -> Self {
        let loci_default = LociEngineConfig::default();
        Self {
            model_path: loci_default.model_path,
            context_size: loci_default.n_ctx,
            gpu_layers: loci_default.n_gpu_layers,
            threads: loci_default.n_threads,
            temperature: loci_default.temperature,
            top_p: loci_default.top_p,
            top_k: loci_default.top_k,
            repeat_penalty: loci_default.repeat_penalty,
        }
    }
}

impl From<AIConfig> for LociEngineConfig {
    fn from(config: AIConfig) -> Self {
        LociEngineConfig {
            model_path: config.model_path,
            n_ctx: config.context_size,
            n_gpu_layers: config.gpu_layers,
            n_batch: 512, // 默认值
            n_threads: config.threads,
            temperature: config.temperature,
            top_k: config.top_k,
            top_p: config.top_p,
            repeat_penalty: config.repeat_penalty,
        }
    }
}

impl From<LociEngineConfig> for AIConfig {
    fn from(config: LociEngineConfig) -> Self {
        Self {
            model_path: config.model_path,
            context_size: config.n_ctx,
            gpu_layers: config.n_gpu_layers,
            threads: config.n_threads,
            temperature: config.temperature,
            top_p: config.top_p,
            top_k: config.top_k,
            repeat_penalty: config.repeat_penalty,
        }
    }
}

/// 生成请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerateRequest {
    pub prompt: String,
    pub max_tokens: Option<usize>,
    pub temperature: Option<f32>,
    pub top_p: Option<f32>,
    pub top_k: Option<i32>,
}

/// 生成响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerateResponse {
    pub text: String,
    pub tokens_generated: u64,
    pub tokens_per_second: f64,
    pub total_time_ms: u64,
}

/// 流式事件
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum StreamEvent {
    Token { content: String },
    Done { content: String, stats: GenerateResponse },
    Error { message: String },
}

/// AI服务 - 封装 LociEngine
pub struct AIService {
    engine: std::sync::Mutex<Option<LociEngine>>,
    config: std::sync::RwLock<AIConfig>,
}

impl AIService {
    pub fn new() -> Self {
        Self {
            engine: std::sync::Mutex::new(None),
            config: std::sync::RwLock::new(AIConfig::default()),
        }
    }

    pub fn with_config(config: AIConfig) -> Result<Self> {
        let loci_config: LociEngineConfig = config.clone().into();
        let engine = if !loci_config.model_path.is_empty() {
            Some(LociEngine::new(loci_config)?)
        } else {
            None
        };

        Ok(Self {
            engine: std::sync::Mutex::new(engine),
            config: std::sync::RwLock::new(config),
        })
    }

    pub fn update_config(&self, config: AIConfig) -> Result<()> {
        let mut config_guard = self.config.write().unwrap();
        *config_guard = config.clone();

        // Note: This doesn't reload the engine automatically
        // Users need to call unload_model() then load_model() to apply changes
        Ok(())
    }

    pub fn load_model(&self) -> Result<(), String> {
        let config = self.config.read().unwrap().clone();
        let loci_config: LociEngineConfig = config.into();

        let engine = LociEngine::new(loci_config)
            .map_err(|e| format!("模型加载失败: {:?}", e))?;

        let mut engine_guard = self.engine.lock().unwrap();
        *engine_guard = Some(engine);

        Ok(())
    }

    pub fn unload_model(&self) {
        let mut engine_guard = self.engine.lock().unwrap();
        *engine_guard = None;
    }

    pub fn get_config(&self) -> AIConfig {
        self.config.read().unwrap().clone()
    }

    pub fn is_loaded(&self) -> bool {
        self.engine.lock().unwrap().is_some()
    }

    pub fn is_model_loaded(&self) -> bool {
        self.is_loaded()
    }

    pub fn backend_info(&self) -> String {
        self.engine.lock().unwrap().as_ref()
            .map(|e| e.backend_name())
            .unwrap_or_else(|| "Not loaded".to_string())
    }

    pub fn generate(&self, request: GenerateRequest) -> Result<GenerateResponse, String> {
        let engine_guard = self.engine.lock().unwrap();
        let engine = engine_guard.as_ref()
            .ok_or_else(|| "AI引擎未初始化".to_string())?;

        let max_tokens = request.max_tokens.unwrap_or(512);

        let start = std::time::Instant::now();
        let text = engine.generate(&request.prompt, max_tokens)
            .map_err(|e| format!("生成失败: {:?}", e))?;

        let total_time_ms = start.elapsed().as_millis() as u64;
        let stats = engine.stats();

        Ok(GenerateResponse {
            text,
            tokens_generated: stats.eval_count,
            tokens_per_second: stats.eval_tokens_per_second(),
            total_time_ms,
        })
    }
}

// ==================== Agent 系统占位实现 ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelConfig {
    pub model_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    pub agent_id: String,
    pub name: String,
    pub system_prompt: String,
    pub model_config: ModelConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentGenerateRequest {
    pub session_id: String,
    pub user_message: String,
    pub max_tokens: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentGenerateResponse {
    pub message: String,
    pub tokens_used: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentTemplates {
    pub templates: Vec<AgentConfig>,
}

pub struct AgentSystem {
    _placeholder: (),
}

impl AgentSystem {
    pub fn new() -> Self {
        Self { _placeholder: () }
    }

    pub fn load_model(&self, _config: ModelConfig) -> Result<(), String> {
        Err("Agent系统尚未实现".to_string())
    }

    pub fn unload_model(&self, _model_id: &str) -> Result<(), String> {
        Err("Agent系统尚未实现".to_string())
    }

    pub fn list_models(&self) -> Vec<ModelConfig> {
        Vec::new()
    }

    pub fn is_model_loaded(&self, _model_id: &str) -> bool {
        false
    }

    pub fn create_agent(&self, _config: AgentConfig) -> Result<(), String> {
        Err("Agent系统尚未实现".to_string())
    }

    pub fn delete_agent(&self, _agent_id: &str) -> Result<(), String> {
        Err("Agent系统尚未实现".to_string())
    }

    pub fn list_agents(&self) -> Vec<AgentConfig> {
        Vec::new()
    }

    pub fn get_agent(&self, _agent_id: &str) -> Result<AgentConfig, String> {
        Err("Agent系统尚未实现".to_string())
    }

    pub fn create_session(&self, _agent_id: String) -> Result<String, String> {
        Ok(uuid::Uuid::new_v4().to_string())
    }

    pub fn delete_session(&self, _session_id: &str) -> Result<(), String> {
        Err("Agent系统尚未实现".to_string())
    }

    pub fn cleanup_expired_sessions(&self) -> usize {
        0
    }

    pub fn generate(&self, _request: AgentGenerateRequest) -> Result<AgentGenerateResponse, String> {
        Err("Agent系统尚未实现".to_string())
    }

    pub fn get_templates(&self) -> Result<AgentTemplates, String> {
        Ok(AgentTemplates {
            templates: vec![],
        })
    }
}

impl AgentTemplates {
    pub fn general_assistant(model_id: String) -> AgentConfig {
        AgentConfig {
            agent_id: "general_assistant".to_string(),
            name: "通用助手".to_string(),
            system_prompt: "你是一个通用助手，可以回答各种问题。".to_string(),
            model_config: ModelConfig { model_path: model_id },
        }
    }

    pub fn code_assistant(model_id: String) -> AgentConfig {
        AgentConfig {
            agent_id: "code_assistant".to_string(),
            name: "代码助手".to_string(),
            system_prompt: "你是一个代码助手，擅长编程和技术问题。".to_string(),
            model_config: ModelConfig { model_path: model_id },
        }
    }

    pub fn creative_writer(model_id: String) -> AgentConfig {
        AgentConfig {
            agent_id: "creative_writer".to_string(),
            name: "创意写作助手".to_string(),
            system_prompt: "你是一个创意写作助手，擅长创作故事和内容。".to_string(),
            model_config: ModelConfig { model_path: model_id },
        }
    }

    pub fn storyboard_artist(model_id: String) -> AgentConfig {
        AgentConfig {
            agent_id: "storyboard_artist".to_string(),
            name: "故事板艺术家".to_string(),
            system_prompt: "你是一个故事板艺术家，擅长视觉叙事和场景设计。".to_string(),
            model_config: ModelConfig { model_path: model_id },
        }
    }
}

// ==================== 系统信息占位实现 ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemInfo {
    pub cpu_model: String,
    pub cpu_cores: usize,
    pub total_memory_gb: f64,
    pub gpu_available: bool,
    pub gpu_name: Option<String>,
    pub gpu_memory_gb: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelRecommendation {
    pub recommended_model: String,
    pub recommended_quant: String,
    pub max_context: u32,
    pub reason: String,
}

pub fn get_system_info() -> Result<SystemInfo, String> {
    Ok(SystemInfo {
        cpu_model: "Unknown".to_string(),
        cpu_cores: num_cpus::get(),
        total_memory_gb: 0.0,
        gpu_available: false,
        gpu_name: None,
        gpu_memory_gb: None,
    })
}

pub fn recommend_model(_info: &SystemInfo) -> ModelRecommendation {
    ModelRecommendation {
        recommended_model: "TinyLlama-1.1B".to_string(),
        recommended_quant: "Q4_K_M".to_string(),
        max_context: 2048,
        reason: "基于系统资源的推荐".to_string(),
    }
}
