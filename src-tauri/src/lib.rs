/**
 * Creative Studio - Tauri 后端入口
 *
 * 这是Tauri应用的Rust后端主入口文件，负责：
 * 1. 初始化应用和插件系统
 * 2. 注册所有 Tauri 命令处理器
 * 3. 配置跨平台应用行为
 *
 * 架构说明：
 * - 前端通过 `@tauri-apps/api` 调用这里定义的命令
 * - 每个命令都是一个带 #[tauri::command] 标记的函数
 * - 支持同步和异步命令处理
 */

// 模块声明
mod ai;
mod submission;
mod export;
mod validation;
mod errors;

// 重新导出错误类型
pub use errors::{AppError, ErrorCode};

// ========== 应用初始化 ==========

/**
 * Tauri 应用主入口
 *
 * 这个函数在应用启动时被调用（桌面端和移动端共用）。
 * 负责完整的应用初始化流程。
 *
 * 初始化步骤：
 * 1. 初始化日志系统
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
    // ========== 第一步：初始化日志系统 ==========

    // 初始化 tracing 日志系统
    // 使用环境变量 RUST_LOG 控制日志级别（如：RUST_LOG=debug）
    // 默认级别为 INFO
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .with_target(false)
        .with_thread_ids(false)
        .with_file(false)
        .with_line_number(false)
        .init();

    tracing::info!("🚀 Creative Studio Desktop 启动中...");

    // ========== 第二步：构建 Tauri 应用 ==========

    tracing::info!("🔨 构建 Tauri 应用...");

    tauri::Builder::default()
        // ========== 第三步：初始化插件 ==========

        // clipboard 插件：剪贴板读写（投递复制，无 WebView 权限弹窗）
        .plugin(tauri_plugin_clipboard_manager::init())

        // dialog 插件：提供原生文件选择对话框
        // 用途：选择文件、导出位置等
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

        // ========== 第四步：注册命令处理器 ==========

        .invoke_handler(tauri::generate_handler![
            // 导出功能命令
            export::export_to_txt,      // 导出为 TXT
            export::export_to_pdf,      // 打印预览（另存为 PDF）
            export::export_to_word,     // 导出为 Word (.docx)
            export::export_to_markdown, // 导出为 Markdown
            export::export_to_html,     // 导出为 HTML
            export::export_to_script,   // 导出为 Fountain 分镜脚本
            export::export_to_epub,     // 导出为 EPUB

            // 投递命令
            submission::open_submission_window, // 打开平台作家后台窗口
            submission::fill_submission,        // 自动填充章节到平台编辑器

            // AI 服务命令
            ai::ai_chat_stream,         // 流式对话补全
            ai::ai_cancel,              // 取消流式请求
            ai::ai_list_models,         // 获取可用模型列表
        ])

        // ========== 第五步：运行应用 ==========

        // 启动 Tauri 事件循环
        // generate_context!() 宏会自动读取 tauri.conf.json 配置
        .run(tauri::generate_context!())
        .expect("启动Tauri应用时发生错误");

    tracing::info!("✅ Creative Studio Desktop 启动完成");
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
 */
