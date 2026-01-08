/*
 * 导出模块 - Rust实现
 *
 * 负责将作品导出为各种格式：
 * - TXT: 纯文本格式
 * - PDF: PDF文档（TODO）
 * - Word: DOCX文档（TODO）
 * - Markdown: MD格式（TODO）
 * - HTML: 网页格式（TODO）
 * - Script: 分镜脚本（TODO）
 * - EPUB: 电子书（TODO）
 *
 * 设计原则：
 * - 每种格式一个独立函数
 * - 统一的数据结构输入
 * - 详细的错误处理
 */

use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::Write;

/**
 * 作品数据结构（简化版）
 * 从前端传递过来的数据
 */
#[derive(Debug, Serialize, Deserialize)]
pub struct WorkData {
    pub id: String,
    pub title: String,
    #[serde(rename = "type")]
    pub work_type: String,
    pub description: Option<String>,
}

/**
 * 章节数据结构
 */
#[derive(Debug, Serialize, Deserialize)]
pub struct ChapterData {
    pub id: String,
    pub title: String,
    pub content: String,  // HTML格式
    pub order: i32,
}

/**
 * 导出选项
 */
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportOptions {
    pub work_id: String,
    pub format: String,
    pub save_path: String,
    pub include_toc: Option<bool>,
    pub include_cover: Option<bool>,
    pub author: Option<String>,
}

/**
 * 导出数据包
 * 包含作品、章节和选项的完整数据
 */
#[derive(Debug, Serialize, Deserialize)]
pub struct ExportData {
    pub work: WorkData,
    pub chapters: Vec<ChapterData>,
    pub options: ExportOptions,
}

/**
 * 导出结果
 */
#[derive(Debug, Serialize, Deserialize)]
pub struct ExportResult {
    pub file_size: u64,
}

/**
 * 导出为TXT格式
 *
 * @param data 导出数据
 * @return Result<ExportResult, String> 导出结果或错误
 */
#[tauri::command]
pub async fn export_to_txt(data: ExportData) -> Result<ExportResult, String> {
    println!("📝 开始导出为TXT格式: {}", data.work.title);

    // 构建文本内容
    let mut content = String::new();

    // 1. 添加标题
    content.push_str(&format!("{}\n", data.work.title));
    content.push_str(&format!("{}\n\n", "=".repeat(data.work.title.len())));

    // 2. 添加作者信息（如果有）
    if let Some(author) = &data.options.author {
        content.push_str(&format!("作者: {}\n\n", author));
    }

    // 3. 添加描述（如果有）
    if let Some(description) = &data.work.description {
        content.push_str(&format!("{}\n\n", description));
        content.push_str(&format!("{}\n\n", "-".repeat(50)));
    }

    // 4. 添加目录（如果需要）
    if data.options.include_toc.unwrap_or(false) {
        content.push_str("目录\n");
        content.push_str(&format!("{}\n\n", "-".repeat(20)));

        for chapter in &data.chapters {
            content.push_str(&format!(
                "第{}章 {}\n",
                chapter.order, chapter.title
            ));
        }

        content.push_str(&format!("\n{}\n\n", "=".repeat(50)));
    }

    // 5. 添加章节内容
    for chapter in &data.chapters {
        // 章节标题
        content.push_str(&format!(
            "\n第{}章 {}\n",
            chapter.order, chapter.title
        ));
        content.push_str(&format!("{}\n\n", "-".repeat(30)));

        // 移除HTML标签，提取纯文本
        let plain_text = strip_html_tags(&chapter.content);
        content.push_str(&plain_text);
        content.push_str("\n\n");
    }

    // 6. 写入文件
    match write_file(&data.options.save_path, &content) {
        Ok(file_size) => {
            println!("✅ TXT导出成功: {} ({} bytes)", data.options.save_path, file_size);
            Ok(ExportResult { file_size })
        }
        Err(e) => {
            eprintln!("❌ TXT导出失败: {}", e);
            Err(format!("写入文件失败: {}", e))
        }
    }
}

/**
 * 移除HTML标签，提取纯文本
 *
 * @param html HTML字符串
 * @return String 纯文本
 */
fn strip_html_tags(html: &str) -> String {
    // 简单的HTML标签移除
    // TODO: 使用更强大的HTML解析库（如scraper）
    let mut result = String::new();
    let mut in_tag = false;

    for ch in html.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ => {
                if !in_tag {
                    result.push(ch);
                }
            }
        }
    }

    // 替换HTML实体
    result = result.replace("&nbsp;", " ");
    result = result.replace("&lt;", "<");
    result = result.replace("&gt;", ">");
    result = result.replace("&amp;", "&");
    result = result.replace("&quot;", "\"");

    result
}

/**
 * 将HTML转换为Markdown
 *
 * @param html HTML字符串
 * @return String Markdown格式
 */
fn html_to_markdown(html: &str) -> String {
    let mut result = html.to_string();

    // 转换标题
    result = result.replace("<h1>", "# ");
    result = result.replace("</h1>", "\n\n");
    result = result.replace("<h2>", "## ");
    result = result.replace("</h2>", "\n\n");
    result = result.replace("<h3>", "### ");
    result = result.replace("</h3>", "\n\n");

    // 转换粗体
    result = result.replace("<strong>", "**");
    result = result.replace("</strong>", "**");
    result = result.replace("<b>", "**");
    result = result.replace("</b>", "**");

    // 转换斜体
    result = result.replace("<em>", "*");
    result = result.replace("</em>", "*");
    result = result.replace("<i>", "*");
    result = result.replace("</i>", "*");

    // 转换段落
    result = result.replace("<p>", "");
    result = result.replace("</p>", "\n\n");

    // 转换换行
    result = result.replace("<br>", "\n");
    result = result.replace("<br/>", "\n");
    result = result.replace("<br />", "\n");

    // 转换列表
    result = result.replace("<ul>", "\n");
    result = result.replace("</ul>", "\n");
    result = result.replace("<li>", "- ");
    result = result.replace("</li>", "\n");

    // 移除其他HTML标签
    result = strip_html_tags(&result);

    // 清理多余的空行
    while result.contains("\n\n\n") {
        result = result.replace("\n\n\n", "\n\n");
    }

    result.trim().to_string()
}

/**
 * 写入文件
 *
 * @param path 文件路径
 * @param content 文件内容
 * @return Result<u64, std::io::Error> 文件大小或错误
 */
fn write_file(path: &str, content: &str) -> Result<u64, std::io::Error> {
    let mut file = File::create(path)?;
    file.write_all(content.as_bytes())?;

    // 获取文件大小
    let metadata = file.metadata()?;
    Ok(metadata.len())
}

/*
 * ========================================
 * 其他格式导出（待实现）
 * ========================================
 */

/**
 * 导出为PDF格式
 * TODO: 实现PDF生成
 */
#[tauri::command]
pub async fn export_to_pdf(_data: ExportData) -> Result<ExportResult, String> {
    println!("📕 PDF导出功能开发中...");
    Err("PDF导出功能尚未实现，敬请期待".to_string())

    // TODO: 使用printpdf或类似库实现PDF生成
    // 1. 创建PDF文档
    // 2. 添加字体（支持中文）
    // 3. 添加标题页
    // 4. 添加目录
    // 5. 添加章节内容
    // 6. 保存文件
}

/**
 * 导出为Word格式 (.docx)
 * TODO: 实现Word文档生成
 */
#[tauri::command]
pub async fn export_to_word(_data: ExportData) -> Result<ExportResult, String> {
    println!("📘 Word导出功能开发中...");
    Err("Word导出功能尚未实现，敬请期待".to_string())

    // TODO: 使用docx-rs库实现Word文档生成
}

/**
 * 导出为Markdown格式
 */
#[tauri::command]
pub async fn export_to_markdown(data: ExportData) -> Result<ExportResult, String> {
    tracing::info!("📝 开始导出为Markdown格式: {}", data.work.title);

    // 验证文件路径
    crate::validation::validate_file_path(&data.options.save_path)?;

    // 构建Markdown内容
    let mut content = String::new();

    // 1. 添加标题（一级标题）
    content.push_str(&format!("# {}\n\n", data.work.title));

    // 2. 添加作者信息（如果有）
    if let Some(author) = &data.options.author {
        content.push_str(&format!("**作者**: {}\n\n", author));
    }

    // 3. 添加描述（如果有）
    if let Some(description) = &data.work.description {
        content.push_str(&format!("> {}\n\n", description));
    }

    // 4. 添加目录（如果需要）
    if data.options.include_toc.unwrap_or(false) {
        content.push_str("## 目录\n\n");
        for chapter in &data.chapters {
            content.push_str(&format!(
                "- [第{}章 {}](#第{}章-{})\n",
                chapter.order,
                chapter.title,
                chapter.order,
                chapter.title.replace(" ", "-")
            ));
        }
        content.push_str("\n---\n\n");
    }

    // 5. 添加章节内容
    for chapter in &data.chapters {
        // 章节标题（二级标题）
        content.push_str(&format!(
            "\n## 第{}章 {}\n\n",
            chapter.order, chapter.title
        ));

        // 将HTML转换为Markdown
        let markdown = html_to_markdown(&chapter.content);
        content.push_str(&markdown);
        content.push_str("\n\n");
    }

    // 6. 写入文件
    match write_file(&data.options.save_path, &content) {
        Ok(file_size) => {
            tracing::info!("✅ Markdown导出成功: {} ({} bytes)", data.options.save_path, file_size);
            Ok(ExportResult { file_size })
        }
        Err(e) => {
            tracing::error!("❌ Markdown导出失败: {}", e);
            Err(format!("写入文件失败: {}", e))
        }
    }
}

/**
 * 导出为HTML格式
 */
#[tauri::command]
pub async fn export_to_html(data: ExportData) -> Result<ExportResult, String> {
    tracing::info!("🌐 开始导出为HTML格式: {}", data.work.title);

    // 验证文件路径
    crate::validation::validate_file_path(&data.options.save_path)?;

    // 构建HTML内容
    let mut content = String::new();

    // 1. HTML头部
    content.push_str("<!DOCTYPE html>\n");
    content.push_str("<html lang=\"zh-CN\">\n");
    content.push_str("<head>\n");
    content.push_str("  <meta charset=\"UTF-8\">\n");
    content.push_str(&format!("  <title>{}</title>\n", data.work.title));
    content.push_str("  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n");
    content.push_str("  <style>\n");
    content.push_str("    body { font-family: 'Microsoft YaHei', Arial, sans-serif; line-height: 1.8; max-width: 800px; margin: 0 auto; padding: 20px; }\n");
    content.push_str("    h1 { color: #333; border-bottom: 2px solid #8b6342; padding-bottom: 10px; }\n");
    content.push_str("    h2 { color: #555; margin-top: 30px; }\n");
    content.push_str("    .author { color: #666; font-style: italic; margin-bottom: 20px; }\n");
    content.push_str("    .description { background: #f5f5f5; padding: 15px; border-left: 4px solid #8b6342; margin-bottom: 20px; }\n");
    content.push_str("    .toc { background: #fafafa; padding: 15px; border-radius: 5px; margin-bottom: 20px; }\n");
    content.push_str("    .toc ul { list-style: none; padding-left: 0; }\n");
    content.push_str("    .toc li { margin: 8px 0; }\n");
    content.push_str("    .toc a { color: #8b6342; text-decoration: none; }\n");
    content.push_str("    .toc a:hover { text-decoration: underline; }\n");
    content.push_str("  </style>\n");
    content.push_str("</head>\n");
    content.push_str("<body>\n");

    // 2. 标题
    content.push_str(&format!("  <h1>{}</h1>\n", data.work.title));

    // 3. 作者信息（如果有）
    if let Some(author) = &data.options.author {
        content.push_str(&format!("  <p class=\"author\">作者: {}</p>\n", author));
    }

    // 4. 描述（如果有）
    if let Some(description) = &data.work.description {
        content.push_str(&format!("  <div class=\"description\">{}</div>\n", description));
    }

    // 5. 目录（如果需要）
    if data.options.include_toc.unwrap_or(false) {
        content.push_str("  <div class=\"toc\">\n");
        content.push_str("    <h2>目录</h2>\n");
        content.push_str("    <ul>\n");
        for chapter in &data.chapters {
            content.push_str(&format!(
                "      <li><a href=\"#chapter-{}\">第{}章 {}</a></li>\n",
                chapter.id, chapter.order, chapter.title
            ));
        }
        content.push_str("    </ul>\n");
        content.push_str("  </div>\n");
    }

    // 6. 章节内容
    for chapter in &data.chapters {
        content.push_str(&format!(
            "  <h2 id=\"chapter-{}\">第{}章 {}</h2>\n",
            chapter.id, chapter.order, chapter.title
        ));
        content.push_str(&format!("  <div class=\"chapter\">\n"));
        content.push_str(&format!("    {}\n", chapter.content));
        content.push_str("  </div>\n");
    }

    // 7. HTML尾部
    content.push_str("</body>\n");
    content.push_str("</html>\n");

    // 8. 写入文件
    match write_file(&data.options.save_path, &content) {
        Ok(file_size) => {
            tracing::info!("✅ HTML导出成功: {} ({} bytes)", data.options.save_path, file_size);
            Ok(ExportResult { file_size })
        }
        Err(e) => {
            tracing::error!("❌ HTML导出失败: {}", e);
            Err(format!("写入文件失败: {}", e))
        }
    }
}

/**
 * 导出为分镜脚本格式（Fountain）
 * TODO: 实现Fountain格式生成
 */
#[tauri::command]
pub async fn export_to_script(_data: ExportData) -> Result<ExportResult, String> {
    println!("🎬 分镜脚本导出功能开发中...");
    Err("分镜脚本导出功能尚未实现，敬请期待".to_string())

    // TODO: 转换为Fountain格式
    // Fountain是业界标准的剧本格式
    // 参考：https://fountain.io/syntax
}

/**
 * 导出为EPUB格式
 * TODO: 实现EPUB电子书生成
 */
#[tauri::command]
pub async fn export_to_epub(_data: ExportData) -> Result<ExportResult, String> {
    println!("📚 EPUB导出功能开发中...");
    Err("EPUB导出功能尚未实现，敬请期待".to_string())

    // TODO: 使用epub-builder库生成EPUB电子书
    // 1. 创建EPUB容器
    // 2. 添加元数据
    // 3. 添加封面
    // 4. 添加目录
    // 5. 添加章节
    // 6. 打包为.epub文件
}
