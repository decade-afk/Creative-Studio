/**
 * context - 长篇一致性上下文组装 + 提示词构建（Rust 侧）
 *
 * 与前端 src/services/contextAssembly.ts + aiService.ts 镜像，规则保持一致：
 * - 世界书：SillyTavern/NovelAI Lorebook 思路（标题+标签关键词命中才注入，预算控制）
 * - 前情记忆链：KoboldAI Memory + inkos 状态投影（章节摘要落库后逐章携带）
 * - 角色卡：正文提及者全卡，其余名字+性格
 * - 作者注 + 风格预设：KoboldAI Author's Note 思路
 *
 * 【用途】通过 Agent API 的 /api/ai/context、/api/ai/prepare 端点暴露给
 * 外部 agent（MCP/CLI）：调用方用自己的模型跑这些 messages，再把结果
 * 通过写接口送回应用——不依赖应用内配置的第三方模型。
 */

use rusqlite::Connection;
use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

use crate::agent_api::html_to_text;

// ============================================================================
// 风格预设
// ============================================================================

pub fn style_preset_prompt(preset_id: &str) -> &'static str {
    match preset_id {
        "casual" => "整体笔调松弛，重生活细节与人物互动；冲突轻量化，靠趣味、信息差与小心愿推动；允许闲笔，但每段仍要有可读的信息或情绪增量。",
        "drama" => "笔调沉稳克制，重因果与代价；情感表达收敛，靠选择与后果制造张力；避免煽情形容词，让事件本身承载情绪。",
        "humor" => "语感轻快，幽默从人物性格与情境错位中自然生长，不硬抖机灵、不堆段子；允许适度吐槽与反差，但保持叙事推进。",
        "suspense" => "信息释放克制，悬念前置；节奏紧凑，短句制造压迫感；线索只给证据不给结论，不提前泄底。",
        _ => "",
    }
}

// ============================================================================
// 系统提示词（与前端 WRITER_SYSTEM_PROMPT 镜像）
// ============================================================================

pub const WRITER_SYSTEM_PROMPT: &str = r#"你是一位深耕中文长篇叙事的写作者，任务是输出可以直接放进书里的正文。

写法要求：
- 用场景讲故事：每个段落通过行动、对话、感官细节、选择或后果推进，不写梗概式叙述，不做旁白分析
- 展示而非标签：情绪用具体反应呈现（动作、停顿、语气），不直接下"他很紧张""她很伤心"这类结论
- 对话承压：每句有分量的对话都要改变局面——透露信息、施加压力、欠下人情或逼出选择；删掉只为交换信息的寒暄
- 因果归属：转折来自人物在约束下做的选择，不用巧合、无来由的巧合相遇或对手降智解局
- 每段有增量：至少改变一条叙事轴（事情进展、认知、关系、处境、资源、危险），删掉纯填充
- 文笔：多用具体动词与可观察反应，句子节奏贴合场景的物理与情绪运动；比喻服务表达而非装饰

禁止（AI 味来源，审查到即改写）：
- 禁止总结式结尾、上价值说教、人生感悟收束——停在动作、画面、选择或情绪余波上
- 禁止对已演示的情绪再做一遍解释；禁止"深吸一口气"式的空转缓冲（有功能就改成角色当下动作）
- 禁止套话模板："眼中闪过一丝X"（→ 写"他垂下眼/眯起眼"）、"嘴角勾起一抹X"（→ 写"他嘴角一扯/乐了"）
- 禁止虚词缓冲："一丝/一抹/一缕"+情绪、"不禁/竟然/不由得/仿佛"当口头禅——删掉缓冲词让动作直接发生
- 禁止对比定义句式："他要的不是X而是Y""这不是结束而是开始"——用一个具体动作或选择呈现
- 禁止四字成语堆砌充当描写（"惊心动魄、险象环生、千钧一发"）——换成一个具体动作或画面
- 禁止对称排比句式、三段式套话；禁止群众整齐划一反应（"所有人都倒吸一口凉气"）

输出格式：
- 直接输出正文本身，不输出解释、前言、总结或标题
- 使用 <p></p> 段落标签组织正文"#;

const SUMMARY_SYSTEM_PROMPT: &str = "你是长篇小说的连续性编辑，负责为已完成的章节生成\"记忆摘要\"。摘要供作者续写后续章节时做前情参考，事实必须来自本章，不得推测。直接输出摘要，不要前言。";

const REVIEW_SYSTEM_PROMPT: &str = r#"你是严格而专业的中文小说审稿编辑。按以下分类输出审稿意见（纯文本，短横线列表，每条引用原文短语定位）：
【逻辑硬伤】情节自相矛盾、因果不成立之处；特别检查：是否有巧合解局、对手无故降智、人物知道了他不该知道的信息
【时间线】时间顺序、时长、事件发生与被发现的时间是否混乱
【人物一致性】言行、性格、称谓前后不一致；人物反应是否符合其动机与处境；配角是否只按主角需要行动而没有自己的利益逻辑
【叙事效率】梗概式叙述替代场景、重复解释、无信息增量的段落
【连载节奏】开篇是否尽快进入压力事件（而非背景铺陈）；千字内有无情绪起伏点；章尾钩子是落在材料性变化/新压力上，还是总结式收尾（"就这样…""他终于明白…"）
【伏笔与悬念】已埋伏笔、未回收的悬念、本章新埋钩子是否清晰
【文笔建议】具体到句子的修改建议（AI味专项：总结腔、对称排比、情绪标签化、"一丝/一抹"缓冲词、成语堆砌）
仅列出确实存在的问题；若某类没有问题，写"无明显问题"。"#;

const OUTLINE_SYSTEM_PROMPT: &str = r#"你是专业的长篇故事策划。设计大纲时遵循：
- 叙事引擎：找到主题压力与不可调和的动机冲突，让可见的前台故事由更深的后台因果驱动；对手要有自己的利益逻辑，不是主角的送件人
- 分卷思维：每一卷有独立的戏剧目的、可观察的终态和一次不可逆的变化；短期钩子挂到全书主线上
- 人物弧光：主角有具体的起点状态、内/外目的地和必须支付的代价；配角有独立理由去合作、抵抗、误读或离开
- 钩子管理：区分"已激活的钩子"与"休眠的未来种子"；承重钩子只留少数几个，其余按需休眠
- 开篇契约：第一章用具体的扰动/风险/未解事实建立阅读压力，第二章让主角的独特杠杆可见地用一次，第三章让短期目标清晰可辨
直接输出大纲内容，不要前言与总结。"#;

// ============================================================================
// 基础工具
// ============================================================================

/// HTML 转纯文本（与前端 htmlToPlainText 镜像：保留段落换行 + 实体解码）
pub fn html_to_plain(html: &str) -> String {
    let mut s = html.to_string();
    for (pat, rep) in [
        ("</p>", "\n\n"), ("</div>", "\n\n"), ("</h1>", "\n\n"), ("</h2>", "\n\n"),
        ("</h3>", "\n\n"), ("</h4>", "\n\n"), ("</h5>", "\n\n"), ("</h6>", "\n\n"),
        ("<br>", "\n"), ("<br/>", "\n"), ("<br />", "\n"),
        ("&nbsp;", " "), ("&lt;", "<"), ("&gt;", ">"), ("&quot;", "\""), ("&amp;", "&"),
    ] {
        s = s.replace(pat, rep);
    }
    // 剥掉剩余标签
    let mut out = String::with_capacity(s.len());
    let mut in_tag = false;
    for ch in s.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            c if !in_tag => out.push(c),
            _ => {}
        }
    }
    // 压缩 3+ 连续换行、去首尾空白
    let mut compact = String::with_capacity(out.len());
    let mut newline_run = 0usize;
    for ch in out.chars() {
        if ch == '\n' {
            newline_run += 1;
            if newline_run <= 2 { compact.push(ch); }
        } else {
            newline_run = 0;
            compact.push(ch);
        }
    }
    compact.trim().to_string()
}

/// 取字符串末尾 max_chars 个字符
fn tail_chars(s: &str, max_chars: usize) -> String {
    let chars: Vec<char> = s.chars().collect();
    if chars.len() <= max_chars { s.to_string() } else { chars[chars.len() - max_chars..].iter().collect() }
}

/// 取字符串前 max_chars 个字符
fn head_chars(s: &str, max_chars: usize) -> String {
    s.chars().take(max_chars).collect()
}

/// 读 config.json 的 ai 段（作者注 + 风格预设）
fn read_ai_config(app: &tauri::AppHandle) -> (String, String) {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    if let Ok(raw) = std::fs::read_to_string(dir.join("config.json")) {
        if let Ok(cfg) = serde_json::from_str::<Value>(&raw) {
            let note = cfg["ai"]["authorNote"].as_str().unwrap_or("").trim().to_string();
            let preset = cfg["ai"]["stylePreset"].as_str().unwrap_or("default").to_string();
            return (note, preset);
        }
    }
    (String::new(), "default".to_string())
}

// ============================================================================
// 上下文组装
// ============================================================================

pub struct StoryContext {
    pub story_bible: String,
    pub character_cards: String,
    pub lorebook: String,
    pub memory: String,
    pub author_note: String,
}

impl StoryContext {
    pub fn is_empty(&self) -> bool {
        self.story_bible.is_empty()
            && self.character_cards.is_empty()
            && self.lorebook.is_empty()
            && self.memory.is_empty()
            && self.author_note.is_empty()
    }

    /// 拼成可嵌入 user 消息的上下文块（与前端 renderContextBlock 镜像）
    pub fn render(&self) -> String {
        let mut blocks: Vec<String> = Vec::new();
        if !self.story_bible.is_empty() {
            blocks.push(format!("【故事背景】\n{}", self.story_bible));
        }
        if !self.memory.is_empty() {
            blocks.push(self.memory.clone());
        }
        if !self.character_cards.is_empty() {
            blocks.push(self.character_cards.clone());
        }
        if !self.lorebook.is_empty() {
            blocks.push(format!("【相关设定】\n{}", self.lorebook));
        }
        if !self.author_note.is_empty() {
            blocks.push(self.author_note.clone());
        }
        blocks.join("\n\n")
    }
}

const LOREBOOK_MAX_ENTRIES: usize = 8;
const LOREBOOK_CHAR_BUDGET: usize = 1600;
const LOREBOOK_ENTRY_MAX: usize = 300;
const CHARACTER_CHAR_BUDGET: usize = 1500;
const MEMORY_MAX_CHAPTERS: usize = 8;
const PREV_TAIL_CHARS: usize = 600;
const CONTINUE_TAIL_CHARS: usize = 3000;

/// 从 DB 组装故事上下文（与前端 assembleStoryContext 镜像）
///
/// * `scan_text`：世界书/角色卡的触发扫描文本（当前章正文纯文本），可空
pub fn assemble(
    app: &tauri::AppHandle,
    db: &Connection,
    work_id: &str,
    chapter_id: Option<&str>,
    scan_text: Option<&str>,
) -> Result<StoryContext, String> {
    let plain = scan_text.map(html_to_plain).unwrap_or_default();

    // ---- 作品 + 大纲 → 故事圣经 ----
    let mut bible_parts: Vec<String> = Vec::new();
    let work: Option<(String, String, String)> = db
        .query_row(
            "SELECT title, type, COALESCE(description, '') FROM works WHERE id = ?1 AND deleted = 0",
            [work_id],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?)),
        )
        .ok();
    if let Some((title, wtype, desc)) = &work {
        let type_label = if wtype == "script" { "剧本" } else { "小说" };
        bible_parts.push(format!("作品《{}》（{}）", title, type_label));
        if !desc.trim().is_empty() {
            bible_parts.push(format!("简介：{}", desc.trim()));
        }
    }
    {
        let mut stmt = db
            .prepare(
                "SELECT title, COALESCE(description, '') FROM outline_nodes
                 WHERE work_id = ?1 AND deleted = 0 ORDER BY \"order\" ASC LIMIT 30",
            )
            .map_err(|e| e.to_string())?;
        let rows: Vec<(String, String)> = stmt
            .query_map([work_id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        if !rows.is_empty() {
            let lines: Vec<String> = rows
                .iter()
                .map(|(t, d)| {
                    if d.trim().is_empty() {
                        format!("- {}", t)
                    } else {
                        format!("- {}：{}", t, head_chars(d.trim(), 120))
                    }
                })
                .collect();
            bible_parts.push(format!("故事大纲：\n{}", lines.join("\n")));
        }
    }
    let story_bible = bible_parts.join("\n");

    // ---- 世界书：关键词命中注入 ----
    let mut lore_parts: Vec<String> = Vec::new();
    if !plain.is_empty() {
        let mut stmt = db
            .prepare(
                "SELECT title, content, tags FROM world_settings
                 WHERE work_id = ?1 AND deleted = 0 ORDER BY created_at ASC",
            )
            .map_err(|e| e.to_string())?;
        let entries: Vec<(String, String, String)> = stmt
            .query_map([work_id], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?))
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        let mut budget = LOREBOOK_CHAR_BUDGET;
        for (title, content, tags_raw) in entries {
            if lore_parts.len() >= LOREBOOK_MAX_ENTRIES || budget <= 0 {
                break;
            }
            let mut keys: Vec<String> = vec![title.trim().to_string()];
            if let Ok(arr) = serde_json::from_str::<Vec<String>>(&tags_raw) {
                for t in arr {
                    if !t.trim().is_empty() {
                        keys.push(t.trim().to_string());
                    }
                }
            }
            keys.retain(|k| !k.is_empty());
            if !keys.iter().any(|k| plain.contains(k.as_str())) {
                continue;
            }
            let text = format!("【{}】{}", title, head_chars(content.trim(), LOREBOOK_ENTRY_MAX));
            if text.chars().count() > budget {
                break;
            }
            budget -= text.chars().count();
            lore_parts.push(text);
        }
    }
    let lorebook = lore_parts.join("\n");

    // ---- 角色卡：提及者全卡，其余名字+性格 ----
    let mut char_lines: Vec<String> = Vec::new();
    {
        let mut stmt = db
            .prepare(
                "SELECT name, COALESCE(personality, ''), COALESCE(description, '') FROM characters
                 WHERE work_id = ?1 AND deleted = 0 ORDER BY created_at ASC",
            )
            .map_err(|e| e.to_string())?;
        let all: Vec<(String, String, String)> = stmt
            .query_map([work_id], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?))
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        let mut budget = CHARACTER_CHAR_BUDGET;
        let mut rest: Vec<String> = Vec::new();
        // 提及者在前（全卡）
        for (name, personality, description) in &all {
            let mentioned = !plain.is_empty() && plain.contains(name.as_str());
            if mentioned {
                let mut bits = vec![name.clone()];
                if !personality.trim().is_empty() {
                    bits.push(format!("性格：{}", personality.trim()));
                }
                if !description.trim().is_empty() {
                    bits.push(format!("设定：{}", description.trim()));
                }
                let line = bits.join("，");
                if line.chars().count() > budget { break; }
                budget -= line.chars().count();
                char_lines.push(line);
            } else {
                let line = if personality.trim().is_empty() {
                    name.clone()
                } else {
                    format!("{}（{}）", name, personality.trim())
                };
                rest.push(line);
            }
        }
        for line in rest {
            if line.chars().count() > budget { break; }
            budget -= line.chars().count();
            char_lines.push(line);
        }
    }
    let character_cards = if char_lines.is_empty() {
        String::new()
    } else {
        format!("出场与相关角色：\n{}", char_lines.join("\n"))
    };

    // ---- 前情记忆链 ----
    let mut mem_parts: Vec<String> = Vec::new();
    {
        let mut stmt = db
            .prepare(
                "SELECT id, title, content, COALESCE(summary, '') FROM chapters
                 WHERE work_id = ?1 AND deleted = 0 ORDER BY chapter_order ASC",
            )
            .map_err(|e| e.to_string())?;
        let chapters: Vec<(String, String, String, String)> = stmt
            .query_map([work_id], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                ))
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        let idx = chapter_id
            .and_then(|cid| chapters.iter().position(|c| c.0 == cid));
        if let Some(idx) = idx {
            let start = idx.saturating_sub(MEMORY_MAX_CHAPTERS);
            let prev = &chapters[start..idx];
            let last_prev_idx = prev.len().saturating_sub(1);
            for (i, (cid, title, content, summary)) in prev.iter().enumerate() {
                let _ = cid;
                if !summary.trim().is_empty() {
                    mem_parts.push(format!("《{}》：{}", title, summary.trim()));
                } else if i == last_prev_idx {
                    let tail = tail_chars(&html_to_plain(content), PREV_TAIL_CHARS);
                    if !tail.is_empty() {
                        mem_parts.push(format!("《{}》结尾：\n{}", title, tail));
                    }
                }
            }
        }
    }
    let memory = if mem_parts.is_empty() {
        String::new()
    } else {
        format!("前情提要（按章节顺序）：\n{}", mem_parts.join("\n"))
    };

    // ---- 作者注 + 风格预设 ----
    let (author_note_raw, preset_id) = read_ai_config(app);
    let mut note_parts: Vec<String> = Vec::new();
    let preset = style_preset_prompt(&preset_id);
    if !preset.is_empty() {
        note_parts.push(format!("【全书笔调】{}", preset));
    }
    if !author_note_raw.is_empty() {
        note_parts.push(format!("【作者注】{}", author_note_raw));
    }
    let author_note = note_parts.join("\n");

    Ok(StoryContext {
        story_bible,
        character_cards,
        lorebook,
        memory,
        author_note,
    })
}

// ============================================================================
// 提示词构建（与前端 builders 镜像）
// ============================================================================

pub type Messages = Vec<Value>;

fn msg(role: &str, content: String) -> Value {
    json!({ "role": role, "content": content })
}

pub fn build_continue(context_tail_plain: &str, instruction: &str, ctx: &StoryContext) -> Messages {
    let plain = tail_chars(context_tail_plain, CONTINUE_TAIL_CHARS);
    let mut parts: Vec<String> = Vec::new();
    let rendered = ctx.render();
    if !rendered.is_empty() {
        parts.push(rendered);
    }
    if !instruction.trim().is_empty() {
        parts.push(format!("【补充要求】\n{}", instruction.trim()));
    }
    // 正文语态文字放在末尾（末位效应）
    parts.push(format!(
        "接着下面的正文自然续写 400-700 字。衔接处与已有文本的语汇、节奏、氛围保持一致，可以写少量过渡让承接自然，但不复述已覆盖的事件、不重新描写已出现的细节。先明确这一段要完成的 1-3 个节拍（目标-阻力-转折），再动笔：\n\n【正文结尾】\n{}",
        plain
    ));
    vec![msg("system", WRITER_SYSTEM_PROMPT.to_string()), msg("user", parts.join("\n\n"))]
}

pub fn build_polish(selection_plain: &str, instruction: &str, ctx: &StoryContext) -> Messages {
    let rendered = ctx.render();
    let prefix = if rendered.is_empty() { String::new() } else { format!("{}\n\n", rendered) };
    let suffix = if instruction.trim().is_empty() {
        String::new()
    } else {
        format!("\n\n【补充要求】\n{}", instruction.trim())
    };
    vec![
        msg("system", WRITER_SYSTEM_PROMPT.to_string()),
        msg(
            "user",
            format!(
                "{}请修订下面的文字。逐段自问：\n1. 这段要完成什么叙事功能？功能是否通过行动/画面/证据可见？\n2. 叙述者是否解释了已经演示出来的情绪？删掉解释，保留演示\n3. 这句话换成任何角色任何书都成立吗？成立就改写到只属于此场景\n4. 对话有动机吗？伪装成对话的说明要么给动机要么改叙述\n5. 节奏是否贴合场景的运动？\n\n保留情节事实、人物声音与有力的原句，只修病灶；篇幅与原文接近，直接输出修订后的全文：\n\n【原文】\n{}{}",
                prefix,
                selection_plain,
                suffix
            ),
        ),
    ]
}

pub fn build_expand(selection_plain: &str, instruction: &str, ctx: &StoryContext) -> Messages {
    let rendered = ctx.render();
    let prefix = if rendered.is_empty() { String::new() } else { format!("{}\n\n", rendered) };
    let suffix = if instruction.trim().is_empty() {
        String::new()
    } else {
        format!("\n\n【补充要求】\n{}", instruction.trim())
    };
    vec![
        msg("system", WRITER_SYSTEM_PROMPT.to_string()),
        msg(
            "user",
            format!(
                "{}请扩充下面的文字：在原有走向中引入更多具体事件、阻力与反应，使其一波三折、跌宕起伏，更有故事性。\n注意：\n- 扩的是\"事件与变化\"，不是形容词语气词的注水；每处新增内容都要有叙事功能\n- 保留原文的关键事实与结局走向，篇幅可为原文的 1.5-3 倍\n- 直接输出扩充后的全文：\n\n【原文】\n{}{}",
                prefix,
                selection_plain,
                suffix
            ),
        ),
    ]
}

pub fn build_summary(chapter_title: &str, chapter_plain: &str, ctx: &StoryContext) -> Messages {
    let rendered = ctx.render();
    let ctx_part = if rendered.is_empty() {
        String::new()
    } else {
        format!("\n\n【既有设定参考】\n{}", rendered)
    };
    vec![
        msg("system", SUMMARY_SYSTEM_PROMPT.to_string()),
        msg(
            "user",
            format!(
                "请为章节「{}」生成 200 字以内的记忆摘要，按以下要素选取本章**新建立/新变化**的事实：\n- 关键事件（谁做了什么，导致什么后果）\n- 人物状态与关系变化（含每人**知道了什么/不知道什么**）\n- 新出现的地点、物品、规则、称谓\n- 未解决的悬念与新埋的伏笔\n只记录确定的、可被后续章节引用的事实：\n\n{}{}",
                chapter_title,
                head_chars(chapter_plain, 8000),
                ctx_part
            ),
        ),
    ]
}

pub fn build_review(chapter_title: &str, chapter_plain: &str, ctx: &StoryContext) -> Messages {
    let rendered = ctx.render();
    let prefix = if rendered.is_empty() { String::new() } else { format!("{}\n\n", rendered) };
    vec![
        msg("system", REVIEW_SYSTEM_PROMPT.to_string()),
        msg(
            "user",
            format!(
                "{}请审稿章节「{}」：\n\n{}",
                prefix,
                chapter_title,
                head_chars(chapter_plain, 8000)
            ),
        ),
    ]
}

pub fn build_outline(premise: &str, chapter_count: i64, ctx: &StoryContext) -> Messages {
    let rendered = ctx.render();
    let ctx_part = if rendered.is_empty() {
        String::new()
    } else {
        format!("\n\n【既有设定】\n{}", rendered)
    };
    vec![
        msg("system", OUTLINE_SYSTEM_PROMPT.to_string()),
        msg(
            "user",
            format!(
                "基于以下创意生成 {} 章的故事大纲。每章一段，格式为：\n第N章 标题：章节梗概（谁要什么、什么阻力、如何转折）[伏笔：埋设X/回收Y/强化Z，无则写\"无\"]（章末钩子一句话）\n要求：\n- 每章梗概必须包含至少一条叙事轴的推进（事情/认知/关系/处境）\n- 章末钩子落在材料性变化或新压力上，不用机械悬念公式\n- 合理安排悬念节奏：每 3-5 章构成一个张弛单元，紧后要有缓冲\n- 主要人物要有独立动机，反派按自己的利益行动\n\n【创意】\n{}{}",
                chapter_count, premise, ctx_part
            ),
        ),
    ]
}

/// 取章节正文并组装上下文 + 构建指定动作的 messages
///
/// 返回 (messages, chapter_title, used_context_flag)
pub fn prepare_messages(
    app: &tauri::AppHandle,
    db: &Connection,
    chapter_id: &str,
    action: &str,
    instruction: &str,
    selection: Option<&str>,
) -> Result<(Messages, String, bool), String> {
    // 章节所属作品 + 标题 + 正文
    let (work_id, title, content): (String, String, String) = db
        .query_row(
            "SELECT work_id, title, content FROM chapters WHERE id = ?1 AND deleted = 0",
            [chapter_id],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                ))
            },
        )
        .map_err(|_| "章节不存在".to_string())?;

    let plain = html_to_plain(&content);
    let ctx = assemble(app, db, &work_id, Some(chapter_id), Some(&plain))?;
    let used = !ctx.is_empty();

    let messages = match action {
        "continue" => build_continue(&plain, instruction, &ctx),
        "polish" | "expand" => {
            let sel = selection
                .map(|s| html_to_plain(s))
                .filter(|s| !s.trim().is_empty())
                .ok_or_else(|| format!("{} 动作需要提供 selection（要处理的文字）", action))?;
            if action == "polish" {
                build_polish(&sel, instruction, &ctx)
            } else {
                build_expand(&sel, instruction, &ctx)
            }
        }
        "summary" => build_summary(&title, &plain, &ctx),
        "review" => build_review(&title, &plain, &ctx),
        other => return Err(format!("未知动作: {}（支持 continue/polish/expand/summary/review）", other)),
    };

    Ok((messages, title, used))
}
