//! 统一错误类型定义
//!
//! 提供应用程序中使用的所有错误类型，便于错误处理和用户反馈。

use std::io;
use thiserror::Error;

/// 应用程序错误类型
#[derive(Debug, Error)]
pub enum AppError {
    /// 模型未加载
    #[error("模型未加载，请先加载模型")]
    ModelNotLoaded,

    /// 模型加载失败
    #[error("模型加载失败: {0}")]
    ModelLoadFailed(String),

    /// 模型卸载失败
    #[error("模型卸载失败: {0}")]
    ModelUnloadFailed(String),

    /// 生成失败
    #[error("文本生成失败: {0}")]
    GenerationFailed(String),

    /// 流式生成失败
    #[error("流式生成失败: {0}")]
    StreamGenerationFailed(String),

    /// 向量数据库错误
    #[error("向量数据库错误: {0}")]
    VectorDbError(String),

    /// 插件错误
    #[error("插件错误: {0}")]
    PluginError(String),

    /// IO 错误
    #[error("IO 错误: {0}")]
    IoError(#[from] io::Error),

    /// 序列化错误
    #[error("序列化错误: {0}")]
    SerializationError(#[from] serde_json::Error),

    /// 验证错误
    #[error("输入验证失败: {0}")]
    ValidationError(String),

    /// 配置错误
    #[error("配置错误: {0}")]
    ConfigError(String),

    /// 系统错误
    #[error("系统错误: {0}")]
    SystemError(String),

    /// 其他错误
    #[error("{0}")]
    Other(String),
}

impl From<crate::validation::ValidationError> for AppError {
    fn from(err: crate::validation::ValidationError) -> Self {
        AppError::ValidationError(err.to_string())
    }
}

/// 将 AppError 转换为 String（用于 Tauri 命令返回）
impl From<AppError> for String {
    fn from(err: AppError) -> Self {
        err.to_string()
    }
}

/// 错误代码枚举
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorCode {
    /// 模型相关错误 (1000-1999)
    ModelNotLoaded = 1001,
    ModelLoadFailed = 1002,
    ModelUnloadFailed = 1003,

    /// 生成相关错误 (2000-2999)
    GenerationFailed = 2001,
    StreamGenerationFailed = 2002,

    /// 向量数据库错误 (3000-3999)
    VectorDbError = 3001,

    /// 插件错误 (4000-4999)
    PluginError = 4001,

    /// IO 错误 (5000-5999)
    IoError = 5001,

    /// 序列化错误 (6000-6999)
    SerializationError = 6001,

    /// 验证错误 (7000-7999)
    ValidationError = 7001,

    /// 配置错误 (8000-8999)
    ConfigError = 8001,

    /// 系统错误 (9000-9999)
    SystemError = 9001,
}

impl AppError {
    /// 获取错误代码
    pub fn error_code(&self) -> ErrorCode {
        match self {
            AppError::ModelNotLoaded => ErrorCode::ModelNotLoaded,
            AppError::ModelLoadFailed(_) => ErrorCode::ModelLoadFailed,
            AppError::ModelUnloadFailed(_) => ErrorCode::ModelUnloadFailed,
            AppError::GenerationFailed(_) => ErrorCode::GenerationFailed,
            AppError::StreamGenerationFailed(_) => ErrorCode::StreamGenerationFailed,
            AppError::VectorDbError(_) => ErrorCode::VectorDbError,
            AppError::PluginError(_) => ErrorCode::PluginError,
            AppError::IoError(_) => ErrorCode::IoError,
            AppError::SerializationError(_) => ErrorCode::SerializationError,
            AppError::ValidationError(_) => ErrorCode::ValidationError,
            AppError::ConfigError(_) => ErrorCode::ConfigError,
            AppError::SystemError(_) => ErrorCode::SystemError,
            AppError::Other(_) => ErrorCode::SystemError,
        }
    }

    /// 判断错误是否可恢复
    pub fn is_recoverable(&self) -> bool {
        match self {
            AppError::ModelNotLoaded => true,
            AppError::ValidationError(_) => true,
            AppError::ConfigError(_) => true,
            _ => false,
        }
    }

    /// 获取用户友好的错误消息
    pub fn user_message(&self) -> String {
        match self {
            AppError::ModelNotLoaded => "请先加载 AI 模型".to_string(),
            AppError::ModelLoadFailed(msg) => format!("无法加载模型: {}", msg),
            AppError::GenerationFailed(msg) => format!("生成失败: {}", msg),
            AppError::ValidationError(msg) => format!("输入无效: {}", msg),
            _ => self.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_code() {
        let err = AppError::ModelNotLoaded;
        assert_eq!(err.error_code(), ErrorCode::ModelNotLoaded);
        assert_eq!(err.error_code() as i32, 1001);
    }

    #[test]
    fn test_is_recoverable() {
        assert!(AppError::ModelNotLoaded.is_recoverable());
        assert!(AppError::ValidationError("test".to_string()).is_recoverable());
        assert!(!AppError::GenerationFailed("test".to_string()).is_recoverable());
    }

    #[test]
    fn test_user_message() {
        let msg = AppError::ModelNotLoaded.user_message();
        assert_eq!(msg, "请先加载 AI 模型");
    }

    #[test]
    fn test_app_error_to_string() {
        let err = AppError::GenerationFailed("测试错误".to_string());
        let s: String = err.into();
        assert!(s.contains("文本生成失败"));
    }
}