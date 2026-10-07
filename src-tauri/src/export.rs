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
                "{}\n",
                chapter.title
            ));
        }

        content.push_str(&format!("\n{}\n\n", "=".repeat(50)));
    }

    // 5. 添加章节内容
    for chapter in &data.chapters {
        // 章节标题
        content.push_str(&format!(
            "\n{}\n",
            chapter.title
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
    // 先把块级标签与 <br> 转为换行，保持段落结构
    let mut preprocessed = html.to_string();
    for tag in ["</p>", "</div>", "</h1>", "</h2>", "</h3>", "<br>", "<br/>", "<br />"] {
        preprocessed = preprocessed.replace(tag, format!("{}\n", tag).as_str());
    }

    let mut result = String::new();
    let mut in_tag = false;

    for ch in preprocessed.chars() {
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
    result = result.replace("&quot;", "\"");
    result = result.replace("&amp;", "&");

    result
}

/**
 * 将编辑器产出的 HTML 片段转换为 EPUB 可用的 XHTML 片段
 *
 * 处理内容：
 * - 无闭合的 void 标签改为自闭合（<br> → <br/>）
 * - XHTML 未定义的实体（&nbsp;）转为数字引用
 * - 裸 & 转义为 &amp;
 */
fn html_to_xhtml(html: &str) -> String {
    let mut result = html.to_string();

    // void 标签自闭合
    for (open, close) in [("<br>", "<br/>"), ("<br />", "<br/>"), ("<hr>", "<hr/>"), ("<hr />", "<hr/>"), ("<img ", "<img ")] {
        result = result.replace(open, close);
    }

    // 实体处理：&nbsp; → &#160;，其余未知实体只保留常见几个
    result = result.replace("&nbsp;", "&#160;");
    result = result.replace("&copy;", "&#169;");

    // 转义裸 &（已跟实体组合的除外）
    let mut escaped = String::with_capacity(result.len());
    let chars: Vec<char> = result.chars().collect();
    for (i, ch) in chars.iter().enumerate() {
        if *ch == '&' {
            let rest: String = chars[i + 1..].iter().take(8).collect();
            let is_entity = rest.starts_with("amp;")
                || rest.starts_with("lt;")
                || rest.starts_with("gt;")
                || rest.starts_with("quot;")
                || rest.starts_with("apos;")
                || rest.starts_with('#');
            if is_entity {
                escaped.push(*ch);
            } else {
                escaped.push_str("&amp;");
            }
        } else {
            escaped.push(*ch);
        }
    }

    escaped
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
 * 其他格式导出（PDF 打印 / Word / Fountain / EPUB 实现在文件末尾）
 * ========================================
 */

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
                "- [{}](#{})\n",
                chapter.title, chapter.title
            ));
        }
        content.push_str("\n---\n\n");
    }

    // 5. 添加章节内容
    for chapter in &data.chapters {
        // 章节标题（二级标题）
        content.push_str(&format!(
            "\n## {}\n\n",
            chapter.title
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

    let content = build_styled_html(&data);

    // 写入文件
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
 * 构建带样式的完整 HTML 文档
 * 导出 HTML 文件与打印预览共用
 */
fn build_styled_html(data: &ExportData) -> String {
    let mut content = String::new();

    // 1. HTML头部
    content.push_str("<!DOCTYPE html>\n");
    content.push_str("<html lang=\"zh-CN\">\n");
    content.push_str("<head>\n");
    content.push_str("  <meta charset=\"UTF-8\">\n");
    content.push_str(&format!("  <title>{}</title>\n", html_escape::encode_text(&data.work.title)));
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
    content.push_str("    @media print { body { max-width: none; padding: 0; } .toc { display: none; } }\n");
    content.push_str("  </style>\n");
    content.push_str("</head>\n");
    content.push_str("<body>\n");

    // 2. 标题
    content.push_str(&format!("  <h1>{}</h1>\n", html_escape::encode_text(&data.work.title)));

    // 3. 作者信息（如果有）
    if let Some(author) = &data.options.author {
        content.push_str(&format!("  <p class=\"author\">作者: {}</p>\n", html_escape::encode_text(author)));
    }

    // 4. 描述（如果有）
    if let Some(description) = &data.work.description {
        content.push_str(&format!("  <div class=\"description\">{}</div>\n", html_escape::encode_text(description)));
    }

    // 5. 目录（如果需要）
    if data.options.include_toc.unwrap_or(false) {
        content.push_str("  <div class=\"toc\">\n");
        content.push_str("    <h2>目录</h2>\n");
        content.push_str("    <ul>\n");
        for chapter in &data.chapters {
            content.push_str(&format!(
                "      <li><a href=\"#chapter-{}\">{}</a></li>\n",
                chapter.id, chapter.title
            ));
        }
        content.push_str("    </ul>\n");
        content.push_str("  </div>\n");
    }

    // 6. 章节内容
    for chapter in &data.chapters {
        content.push_str(&format!(
            "  <h2 id=\"chapter-{}\">{}</h2>\n",
            chapter.id, chapter.title
        ));
        content.push_str("  <div class=\"chapter\">\n");
        content.push_str(&format!("    {}\n", chapter.content));
        content.push_str("  </div>\n");
    }

    // 7. HTML尾部
    content.push_str("</body>\n");
    content.push_str("</html>\n");

    content
}

/**
 * 打开打印预览窗口（用于导出 PDF）
 *
 * 生成带样式的 HTML，写入临时文件后打开独立窗口，
 * 窗口加载完成后自动唤起系统打印对话框；
 * Windows 下选择 "Microsoft Print to PDF" 即可保存为 PDF。
 */
#[tauri::command]
pub async fn export_to_pdf(app: tauri::AppHandle, data: ExportData) -> Result<(), String> {
    tracing::info!("📕 打开打印预览（PDF 导出）: {}", data.work.title);

    let mut html = build_styled_html(&data);
    // 注入自动打印脚本
    html = html.replace(
        "</body>",
        "<script>window.addEventListener('load', function() { setTimeout(function() { window.print(); }, 500); });</script>\n</body>",
    );

    // 写入临时文件（留给打印窗口使用，由系统临时目录统一回收）
    let temp_dir = tempfile::env::temp_dir();
    let file_name = format!(
        "creative-studio-print-{}.html",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    );
    let temp_path = temp_dir.join(file_name);
    std::fs::write(&temp_path, html).map_err(|e| format!("写入打印临时文件失败: {}", e))?;

    let url = tauri::Url::from_file_path(&temp_path)
        .map_err(|_| format!("临时文件路径无效: {}", temp_path.display()))?;

    tauri::webview::WebviewWindowBuilder::new(
        &app,
        "print-preview",
        tauri::WebviewUrl::External(url),
    )
    .title("打印预览（选择 Microsoft Print to PDF 可保存为 PDF）")
    .inner_size(800.0, 1000.0)
    .build()
    .map_err(|e| format!("打开打印窗口失败: {}", e))?;

    Ok(())
}

/**
 * 导出为Word格式 (.docx)
 *
 * 手工构建 OOXML（WordprocessingML）文档并用 ZIP 打包：
 * 每个章节为一级/二级标题 + 段落，满足正文阅读与二次编辑需求。
 */
#[tauri::command]
pub async fn export_to_word(data: ExportData) -> Result<ExportResult, String> {
    tracing::info!("📘 开始导出为Word格式: {}", data.work.title);

    crate::validation::validate_file_path(&data.options.save_path)?;

    let content = build_docx_document_xml(&data);
    let styles = build_docx_styles_xml();

    let file = File::create(&data.options.save_path)
        .map_err(|e| format!("创建文件失败: {}", e))?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::FileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    zip.start_file("[Content_Types].xml", options)
        .map_err(|e| format!("打包失败: {}", e))?;
    zip.write_all(build_docx_content_types().as_bytes())
        .map_err(|e| format!("打包失败: {}", e))?;

    zip.start_file("_rels/.rels", options).map_err(|e| format!("打包失败: {}", e))?;
    zip.write_all(build_docx_root_rels().as_bytes()).map_err(|e| format!("打包失败: {}", e))?;

    zip.start_file("word/document.xml", options).map_err(|e| format!("打包失败: {}", e))?;
    zip.write_all(content.as_bytes()).map_err(|e| format!("打包失败: {}", e))?;

    zip.start_file("word/styles.xml", options).map_err(|e| format!("打包失败: {}", e))?;
    zip.write_all(styles.as_bytes()).map_err(|e| format!("打包失败: {}", e))?;

    let finished = zip.finish().map_err(|e| format!("打包失败: {}", e))?;
    let file_size = finished
        .metadata()
        .map_err(|e| format!("读取文件失败: {}", e))?
        .len();

    tracing::info!("✅ Word导出成功: {} ({} bytes)", data.options.save_path, file_size);
    Ok(ExportResult { file_size })
}

/**
 * 构建 document.xml：标题页 + 章节（标题样式 + 正文段落）
 */
fn build_docx_document_xml(data: &ExportData) -> String {
    let mut body = String::new();

    // 作品标题（Title 样式）
    body.push_str(&wrap_docx_paragraph(&data.work.title, "Title"));
    body.push_str("<w:p/>");

    // 作者
    if let Some(author) = &data.options.author {
        body.push_str(&wrap_docx_paragraph(&format!("作者: {}", author), ""));
    }
    // 描述
    if let Some(description) = &data.work.description {
        body.push_str(&wrap_docx_paragraph(description, ""));
    }

    // 章节
    for chapter in &data.chapters {
        body.push_str(&wrap_docx_paragraph(&chapter.title, "Heading1"));

        // HTML → 纯文本段落（保留换行结构）
        let text = strip_html_tags(&chapter.content);
        for paragraph in text.split('\n') {
            let paragraph = paragraph.trim();
            if paragraph.is_empty() {
                continue;
            }
            body.push_str(&wrap_docx_paragraph(paragraph, ""));
        }
    }

    format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\
         <w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">\
         <w:body>{}</w:body></w:document>",
        body
    )
}

/**
 * 输出一个 OOXML 段落
 *
 * @param style 段落样式 ID（空字符串表示 Normal 默认样式）
 */
fn wrap_docx_paragraph(text: &str, style: &str) -> String {
    let escaped = html_escape::encode_text(text);
    let style_xml = if style.is_empty() {
        String::new()
    } else {
        format!("<w:pPr><w:pStyle w:val=\"{}\"/></w:pPr>", style)
    };
    format!(
        "<w:p>{}<w:r><w:t xml:space=\"preserve\">{}</w:t></w:r></w:p>",
        style_xml, escaped
    )
}

/** [Content_Types].xml */
fn build_docx_content_types() -> String {
    "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\
     <Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">\
     <Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>\
     <Default Extension=\"xml\" ContentType=\"application/xml\"/>\
     <Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/>\
     <Override PartName=\"/word/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml\"/>\
     </Types>"
    .to_string()
}

/** 包级关系 */
fn build_docx_root_rels() -> String {
    "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\
     <Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">\
     <Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/>\
     </Relationships>"
    .to_string()
}

/** styles.xml：定义 Title / Heading1 / Normal 三种样式 */
fn build_docx_styles_xml() -> String {
    "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\
     <w:styles xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">\
     <w:docDefaults><w:rPrDefault><w:rPr>\
     <w:rFonts w:ascii=\"Calibri\" w:eastAsia=\"Microsoft YaHei\" w:hAnsi=\"Calibri\"/>\
     <w:sz w:val=\"24\"/></w:rPr></w:rPrDefault></w:docDefaults>\
     <w:style w:type=\"paragraph\" w:default=\"1\" w:styleId=\"Normal\"><w:name w:val=\"Normal\"/></w:style>\
     <w:style w:type=\"paragraph\" w:styleId=\"Title\"><w:name w:val=\"Title\"/>\
     <w:pPr><w:jc w:val=\"center\"/></w:pPr>\
     <w:rPr><w:b/><w:sz w:val=\"48\"/></w:rPr></w:style>\
     <w:style w:type=\"paragraph\" w:styleId=\"Heading1\"><w:name w:val=\"heading 1\"/>\
     <w:rPr><w:b/><w:sz w:val=\"32\"/></w:rPr></w:style>\
     </w:styles>"
    .to_string()
}

/**
 * 导出为 Fountain 格式
 *
 * Fountain 是业界通用的纯文本剧本格式：
 * 作品信息放在标题页（Title: / Author: 键值），
 * 章节标题使用 Fountain 的 Section 标记（#），正文段落原样保留。
 */
#[tauri::command]
pub async fn export_to_script(data: ExportData) -> Result<ExportResult, String> {
    tracing::info!("🎬 开始导出为Fountain格式: {}", data.work.title);

    crate::validation::validate_file_path(&data.options.save_path)?;

    let mut content = String::new();

    // 1. 标题页信息块
    content.push_str(&format!("Title: {}\n", data.work.title));
    if let Some(author) = &data.options.author {
        content.push_str(&format!("Author: {}\n", author));
    }
    if let Some(description) = &data.work.description {
        content.push_str(&format!("Draft date: {}\nContact: {}\n", current_date(), description));
    }

    // 2. 章节内容（# 为 Section 标记）
    for chapter in &data.chapters {
        content.push_str(&format!("\n# {}\n\n", chapter.title));

        let text = strip_html_tags(&chapter.content);
        content.push_str(text.trim());
        content.push_str("\n\n");
    }

    match write_file(&data.options.save_path, &content) {
        Ok(file_size) => {
            tracing::info!("✅ Fountain导出成功: {} ({} bytes)", data.options.save_path, file_size);
            Ok(ExportResult { file_size })
        }
        Err(e) => {
            tracing::error!("❌ Fountain导出失败: {}", e);
            Err(format!("写入文件失败: {}", e))
        }
    }
}

/**
 * 导出为EPUB格式
 *
 * 使用 epub-builder 生成标准 EPUB 电子书：
 * 作品元数据 + 目录（TOC）+ 各章节 XHTML。
 */
#[tauri::command]
pub async fn export_to_epub(data: ExportData) -> Result<ExportResult, String> {
    tracing::info!("📚 开始导出为EPUB格式: {}", data.work.title);

    crate::validation::validate_file_path(&data.options.save_path)?;

    let mut builder = epub_builder::EpubBuilder::new(epub_builder::ZipLibrary::new().map_err(|e| format!("初始化EPUB失败: {}", e))?)
        .map_err(|e| format!("初始化EPUB失败: {}", e))?;

    builder
        .metadata("title", &data.work.title)
        .map_err(|e| format!("设置元数据失败: {}", e))?
        .metadata("author", data.options.author.as_deref().unwrap_or("Unknown"))
        .map_err(|e| format!("设置元数据失败: {}", e))?
        .metadata("generator", "Creative Studio")
        .map_err(|e| format!("设置元数据失败: {}", e))?;

    if let Some(description) = &data.work.description {
        builder
            .metadata("description", description)
            .map_err(|e| format!("设置元数据失败: {}", e))?;
    }

    // 内嵌阅读样式
    builder
        .stylesheet(&b"body { font-family: serif; line-height: 1.8; } h2 { margin-top: 2em; }"[..])
        .map_err(|e| format!("设置样式失败: {}", e))?;

    for chapter in &data.chapters {
        let xhtml = html_to_xhtml(&chapter.content);
        let content = epub_builder::EpubContent::new(
            format!("chapter-{}.xhtml", chapter.order),
            xhtml.as_bytes(),
        )
        .title(chapter.title.clone());
        builder.add_content(content).map_err(|e| format!("添加章节失败: {}", e))?;
    }

    let mut file = File::create(&data.options.save_path).map_err(|e| format!("创建文件失败: {}", e))?;
    builder.generate(&mut file).map_err(|e| format!("生成EPUB失败: {}", e))?;

    let file_size = file.metadata().map_err(|e| format!("读取文件失败: {}", e))?.len();
    tracing::info!("✅ EPUB导出成功: {} ({} bytes)", data.options.save_path, file_size);
    Ok(ExportResult { file_size })
}

/**
 * 当前日期（YYYY-MM-DD），用于 Fountain 标题页
 */
fn current_date() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let days = now / 86400;
    // 简化的天数转日期（1970-01-01 起）
    let mut year = 1970i64;
    let mut remaining = days as i64;
    loop {
        let leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
        let year_days = if leap { 366 } else { 365 };
        if remaining < year_days {
            break;
        }
        remaining -= year_days;
        year += 1;
    }
    let leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
    let month_lengths = [31, if leap { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let mut month = 1;
    for length in month_lengths {
        if remaining < length {
            break;
        }
        remaining -= length;
        month += 1;
    }
    let day = remaining + 1;
    format!("{:04}-{:02}-{:02}", year, month, day)
}
