//! 输入验证模块
//!
//! 提供统一的输入验证功能，确保所有用户输入都经过安全检查。

use std::path::Path;

/// 验证错误类型
#[derive(Debug, thiserror::Error)]
pub enum ValidationError {
    #[error("模型路径不能为空")]
    ModelPathEmpty,

    #[error("模型文件不存在: {0}")]
    ModelFileNotFound(String),

    #[error("模型文件格式错误，必须是 .gguf 格式: {0}")]
    InvalidModelFormat(String),

    #[error("提示词不能为空")]
    PromptEmpty,

    #[error("提示词过长（最大 {max} 字符，当前 {current} 字符）")]
    PromptTooLong { max: usize, current: usize },

    #[error("max_tokens 参数无效（范围: {min}-{max}，当前: {current}）")]
    InvalidMaxTokens { min: usize, max: usize, current: usize },

    #[error("temperature 参数无效（范围: {min}-{max}，当前: {current}）")]
    InvalidTemperature { min: f32, max: f32, current: f32 },

    #[error("top_p 参数无效（范围: {min}-{max}，当前: {current}）")]
    InvalidTopP { min: f32, max: f32, current: f32 },

    #[error("文件路径不合法: {0}")]
    InvalidFilePath(String),

    #[error("文件路径包含非法字符: {0}")]
    PathContainsInvalidChars(String),
}

/// 将 ValidationError 转换为 String（用于 Tauri 命令返回）
impl From<ValidationError> for String {
    fn from(err: ValidationError) -> Self {
        err.to_string()
    }
}

/// 验证模型路径
pub fn validate_model_path(path: &str) -> Result<(), ValidationError> {
    // 检查是否为空
    if path.trim().is_empty() {
        return Err(ValidationError::ModelPathEmpty);
    }

    // 检查文件格式（先于存在性检查，便于给出明确的格式错误提示）
    if !path.to_lowercase().ends_with(".gguf") {
        return Err(ValidationError::InvalidModelFormat(path.to_string()));
    }

    // 检查文件是否存在
    if !Path::new(path).exists() {
        return Err(ValidationError::ModelFileNotFound(path.to_string()));
    }

    // 检查路径是否包含非法字符（防止路径遍历攻击）
    let path_str = path.to_string();
    if path_str.contains("..") || path_str.contains("~") {
        return Err(ValidationError::PathContainsInvalidChars(path_str));
    }

    Ok(())
}

/// 验证生成请求参数
pub fn validate_generate_request(
    prompt: &str,
    max_tokens: Option<usize>,
    temperature: Option<f32>,
    top_p: Option<f32>,
) -> Result<(), ValidationError> {
    // 验证提示词
    let prompt = prompt.trim();
    if prompt.is_empty() {
        return Err(ValidationError::PromptEmpty);
    }

    // 检查提示词长度（限制为 32768 字符）
    const MAX_PROMPT_LENGTH: usize = 32768;
    if prompt.len() > MAX_PROMPT_LENGTH {
        return Err(ValidationError::PromptTooLong {
            max: MAX_PROMPT_LENGTH,
            current: prompt.len(),
        });
    }

    // 验证 max_tokens
    if let Some(tokens) = max_tokens {
        const MIN_TOKENS: usize = 1;
        const MAX_TOKENS: usize = 8192;
        if tokens < MIN_TOKENS || tokens > MAX_TOKENS {
            return Err(ValidationError::InvalidMaxTokens {
                min: MIN_TOKENS,
                max: MAX_TOKENS,
                current: tokens,
            });
        }
    }

    // 验证 temperature
    if let Some(temp) = temperature {
        const MIN_TEMP: f32 = 0.0;
        const MAX_TEMP: f32 = 2.0;
        if temp < MIN_TEMP || temp > MAX_TEMP {
            return Err(ValidationError::InvalidTemperature {
                min: MIN_TEMP,
                max: MAX_TEMP,
                current: temp,
            });
        }
    }

    // 验证 top_p
    if let Some(p) = top_p {
        const MIN_TOP_P: f32 = 0.0;
        const MAX_TOP_P: f32 = 1.0;
        if p < MIN_TOP_P || p > MAX_TOP_P {
            return Err(ValidationError::InvalidTopP {
                min: MIN_TOP_P,
                max: MAX_TOP_P,
                current: p,
            });
        }
    }

    Ok(())
}

/// 验证文件路径（用于导出功能）
///
/// 【说明】保存对话框返回的是用户选择的绝对路径（Windows 下带盘符如 `C:\`），
/// 因此允许开头的盘符冒号，仅对其余部分做非法字符检查。
pub fn validate_file_path(path: &str) -> Result<(), ValidationError> {
    let path_str = path.trim();

    // 检查是否为空
    if path_str.is_empty() {
        return Err(ValidationError::InvalidFilePath("路径不能为空".to_string()));
    }

    // Windows 盘符前缀（如 C:\ 或 C:/）：跳过前两个字符后再检查冒号
    let check_str = if path_str.len() >= 2
        && path_str.as_bytes()[0].is_ascii_alphabetic()
        && path_str.as_bytes()[1] == b':'
    {
        &path_str[2..]
    } else {
        path_str
    };

    // 防路径遍历
    if check_str.contains("..") {
        return Err(ValidationError::PathContainsInvalidChars(path_str.to_string()));
    }

    // 检查非法字符（Windows 和 Unix）
    let invalid_chars = ['\0', '<', '>', ':', '"', '|', '?', '*'];
    for &c in &invalid_chars {
        if check_str.contains(c) {
            return Err(ValidationError::InvalidFilePath(format!(
                "路径包含非法字符: '{}'",
                c
            )));
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_model_path_empty() {
        assert!(matches!(
            validate_model_path(""),
            Err(ValidationError::ModelPathEmpty)
        ));
    }

    #[test]
    fn test_validate_model_path_not_exists() {
        assert!(matches!(
            validate_model_path("nonexistent.gguf"),
            Err(ValidationError::ModelFileNotFound(_))
        ));
    }

    #[test]
    fn test_validate_model_path_invalid_format() {
        assert!(matches!(
            validate_model_path("model.bin"),
            Err(ValidationError::InvalidModelFormat(_))
        ));
    }

    #[test]
    fn test_validate_generate_request_empty_prompt() {
        assert!(matches!(
            validate_generate_request("", None, None, None),
            Err(ValidationError::PromptEmpty)
        ));
    }

    #[test]
    fn test_validate_generate_request_prompt_too_long() {
        let long_prompt = "a".repeat(40000);
        assert!(matches!(
            validate_generate_request(&long_prompt, None, None, None),
            Err(ValidationError::PromptTooLong { .. })
        ));
    }

    #[test]
    fn test_validate_generate_request_invalid_max_tokens() {
        assert!(matches!(
            validate_generate_request("test", Some(0), None, None),
            Err(ValidationError::InvalidMaxTokens { .. })
        ));
        assert!(matches!(
            validate_generate_request("test", Some(10000), None, None),
            Err(ValidationError::InvalidMaxTokens { .. })
        ));
    }

    #[test]
    fn test_validate_generate_request_invalid_temperature() {
        assert!(matches!(
            validate_generate_request("test", None, Some(3.0), None),
            Err(ValidationError::InvalidTemperature { .. })
        ));
    }

    #[test]
    fn test_validate_generate_request_invalid_top_p() {
        assert!(matches!(
            validate_generate_request("test", None, None, Some(1.5)),
            Err(ValidationError::InvalidTopP { .. })
        ));
    }

    #[test]
    fn test_validate_file_path_invalid_chars() {
        assert!(matches!(
            validate_file_path("../test.txt"),
            Err(ValidationError::PathContainsInvalidChars(_))
        ));
    }

    #[test]
    fn test_validate_file_path_windows_drive() {
        // Windows 盘符路径必须合法
        assert!(validate_file_path("C:\\Users\\test\\out.docx").is_ok());
        assert!(validate_file_path("D:/导出/作品.epub").is_ok());
        // 盘符之后出现冒号仍然非法
        assert!(validate_file_path("C:\\bad:name.txt").is_err());
    }
}