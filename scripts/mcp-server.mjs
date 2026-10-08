#!/usr/bin/env node
/**
 * Creative Studio MCP Server（stdio → 本地 REST 桥）
 *
 * 让 Claude Code / Cursor / ZCode（经本地插件）等 MCP 客户端直接使用
 * Creative Studio：读写作品/章节/大纲/角色/场景/世界观/伏笔/冲突/分镜，
 * 调用软件内置 AI 工作流（续写/审稿/摘要/大纲/角色/场景/伏笔检测/分镜），
 * 导出六格式、导入 TXT、版本快照、投递台账、全局搜索。
 *
 * 【自动拉起】API 不在线时自动启动 Creative Studio 并等待就绪（最多 40s）
 * 【环境变量】CS_API_BASE 可覆盖 API 地址；CS_APP_PATH 可指定应用 exe 路径
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const API_BASE = process.env.CS_API_BASE || 'http://127.0.0.1:8765';

const T = (name, description, properties, required) => ({
  name,
  description,
  inputSchema: { type: 'object', properties, required },
});

const TOOLS = [
  T('list_works', '列出全部作品（含章节数/总字数）', {}, undefined),
  T('create_work', '创建新作品', {
    title: { type: 'string' },
    type: { type: 'string', enum: ['novel', 'script'], description: '小说/短剧，默认 novel' },
  }, ['title']),
  T('update_work', '修改作品标题/描述', {
    workId: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' },
  }, ['workId']),
  T('delete_work', '删除作品（软删除，可在软件回收站恢复）', { workId: { type: 'string' } }, ['workId']),

  T('list_chapters', '列出作品的章节（含字数）', { workId: { type: 'string' } }, ['workId']),
  T('read_chapter', '读取章节全文（plainText 适合阅读）', { chapterId: { type: 'string' } }, ['chapterId']),
  T('create_chapter', '创建章节（content 接受纯文本，自动分段）', {
    workId: { type: 'string' }, title: { type: 'string' }, content: { type: 'string' },
  }, ['workId', 'title']),
  T('write_chapter', '整章替换正文（先读后写；大改前先 save_chapter_version）', {
    chapterId: { type: 'string' }, content: { type: 'string' },
  }, ['chapterId', 'content']),
  T('delete_chapter', '删除章节（软删除）', { chapterId: { type: 'string' } }, ['chapterId']),

  T('get_outline', '读取大纲树（幕/场景/事件节点，含 AI 生成的）', { workId: { type: 'string' } }, ['workId']),
  T('delete_outline_node', '删除大纲节点', { nodeId: { type: 'string' } }, ['nodeId']),

  T('list_characters', '列出角色（含性格与关系）', { workId: { type: 'string' } }, ['workId']),
  T('create_character', '创建角色', {
    workId: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' },
    avatar: { type: 'string', description: 'emoji' }, personality: { type: 'string' }, relationships: { type: 'string' },
  }, ['workId', 'name']),

  T('list_scenes', '列出场景', { workId: { type: 'string' } }, ['workId']),
  T('create_scene', '创建场景', {
    workId: { type: 'string' }, name: { type: 'string' }, location: { type: 'string' },
    timeOfDay: { type: 'string', enum: ['morning', 'noon', 'evening', 'night', 'other'] },
    mood: { type: 'string' }, description: { type: 'string' },
  }, ['workId', 'name']),

  T('list_world_settings', '列出世界观设定', { workId: { type: 'string' } }, ['workId']),
  T('create_world_setting', '创建世界观设定', {
    workId: { type: 'string' }, title: { type: 'string' }, content: { type: 'string' },
    category: { type: 'string', enum: ['location', 'organization', 'event', 'culture', 'technology', 'magic'] },
  }, ['workId', 'title']),

  T('list_clues', '列出伏笔（含铺设/回收场景关联）', { workId: { type: 'string' } }, ['workId']),
  T('create_clue', '登记伏笔', {
    workId: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' },
  }, ['workId', 'name']),
  T('resolve_clue', '标记伏笔状态', {
    clueId: { type: 'string' }, status: { type: 'string', enum: ['open', 'resolved'] },
  }, ['clueId', 'status']),

  T('list_conflicts', '列出冲突（类型/强度/状态）', { workId: { type: 'string' } }, ['workId']),
  T('create_conflict', '登记冲突', {
    workId: { type: 'string' }, name: { type: 'string' },
    type: { type: 'string', enum: ['character', 'environment', 'internal', 'social'] },
    intensity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
    status: { type: 'string', enum: ['active', 'escalating', 'resolving', 'resolved'] },
    characters: { type: 'string', description: '涉及角色，逗号分隔' },
    description: { type: 'string' }, resolution: { type: 'string' },
  }, ['workId', 'name']),

  T('list_storyboards', '列出分镜（含章节关联/时长）', { workId: { type: 'string' } }, ['workId']),
  T('list_submissions', '列出投递台账（哪章投了哪个平台）', { workId: { type: 'string' } }, ['workId']),

  T('ai_continue', '软件 AI 续写章节并自动追加保存', {
    chapterId: { type: 'string' }, instruction: { type: 'string', description: '补充要求（可选）' },
  }, ['chapterId']),
  T('ai_review', '软件 AI 审稿（逻辑/时间线/人物/伏笔/文笔），返回报告', {
    chapterId: { type: 'string' },
  }, ['chapterId']),
  T('ai_summary', '软件 AI 生成章节梗概（不改动正文）', { chapterId: { type: 'string' } }, ['chapterId']),
  T('ai_outline', '一句话创意生成 N 章大纲并写入大纲树', {
    workId: { type: 'string' }, premise: { type: 'string' }, chapterCount: { type: 'number' },
  }, ['workId', 'premise']),
  T('ai_gen_characters', '软件 AI 批量生成角色并入库', {
    workId: { type: 'string' }, premise: { type: 'string' }, count: { type: 'number' },
  }, ['workId', 'premise']),
  T('ai_gen_scenes', '软件 AI 批量生成场景并入库', {
    workId: { type: 'string' }, premise: { type: 'string' }, count: { type: 'number' },
  }, ['workId', 'premise']),
  T('ai_detect_clues', '软件 AI 通读全书检测伏笔并入库', { workId: { type: 'string' } }, ['workId']),
  T('ai_gen_storyboards', '软件 AI 为章节生成分镜并入库', { chapterId: { type: 'string' } }, ['chapterId']),

  T('get_story_context', '组装故事上下文（世界书/前情链/角色卡/作者注），查看 AI 将看到什么', {
    workId: { type: 'string' }, chapterId: { type: 'string', description: '章节ID（可选，提供则含该章扫描与前情链）' },
  }, ['workId']),
  T('prepare_ai', '免模型密钥：返回某创作动作组装好的完整 messages（含系统提示词+上下文），agent 用自己的模型执行后写回。工作流：prepare_ai → 自己生成 → append_chapter_content / update_chapter_summary', {
    chapterId: { type: 'string' },
    action: { type: 'string', enum: ['continue', 'polish', 'expand', 'summary', 'review'], description: 'continue=续写 polish=润色(需selection) expand=扩写(需selection) summary=记忆摘要 review=审稿' },
    instruction: { type: 'string', description: '补充要求（可选）' },
    selection: { type: 'string', description: 'polish/expand 必填：要处理的文字' },
  }, ['chapterId', 'action']),
  T('prepare_outline', '免模型密钥：返回大纲动作的完整 messages（叙事引擎方法论+既有设定）', {
    workId: { type: 'string' }, premise: { type: 'string' }, chapterCount: { type: 'number' },
  }, ['workId', 'premise']),
  T('append_chapter_content', '向章节追加正文（纯文本自动转段落 HTML），外部 agent 写回创作结果的入口', {
    chapterId: { type: 'string' }, text: { type: 'string' },
  }, ['chapterId', 'text']),
  T('update_chapter_summary', '写入/清空章节记忆摘要（供后续章节 AI 前情链使用）', {
    chapterId: { type: 'string' }, summary: { type: 'string', description: '传空字符串清空' },
  }, ['chapterId', 'summary']),

  T('export_work', '导出作品为文件（savePath 传绝对路径）', {
    workId: { type: 'string' },
    format: { type: 'string', enum: ['txt', 'markdown', 'html', 'word', 'epub', 'script'] },
    savePath: { type: 'string', description: '如 C:/Users/x/Desktop/book.epub' },
    chapterId: { type: 'string', description: '可选，仅导该章' },
    author: { type: 'string' },
  }, ['workId', 'format', 'savePath']),
  T('import_text', '导入整本 TXT 自动分章建书', {
    title: { type: 'string' }, text: { type: 'string' }, type: { type: 'string', enum: ['novel', 'script'] },
  }, ['title', 'text']),

  T('list_chapter_versions', '列出章节版本快照', { chapterId: { type: 'string' } }, ['chapterId']),
  T('save_chapter_version', '保存章节版本快照（agent 大改前务必先调用）', {
    chapterId: { type: 'string' }, label: { type: 'string', description: '如"agent 改稿前"' },
  }, ['chapterId']),

  T('search', '跨作品全文搜索', { query: { type: 'string' } }, ['query']),
  T('work_stats', '作品统计（章节数/总字数）', { workId: { type: 'string' } }, ['workId']),
];

/** 探测 API 是否在线（任何 HTTP 响应都算在线，包括 5xx——5xx 说明服务在但 DB 可能未初始化） */
async function apiOnline(timeoutMs = 2000) {
  try {
    await fetch(API_BASE + '/api/works', { signal: AbortSignal.timeout(timeoutMs) });
    return true;
  } catch {
    return false;
  }
}

/** API 是否就绪（200：数据库已初始化可正常服务） */
async function apiReady(timeoutMs = 2000) {
  try {
    const r = await fetch(API_BASE + '/api/works', { signal: AbortSignal.timeout(timeoutMs) });
    return r.ok;
  } catch {
    return false;
  }
}

/** 从卸载注册表查安装的主程序路径（NSIS 安装写入 DisplayIcon，含完整 exe 路径） */
function installExeFromRegistry() {
  try {
    const { execSync } = require('node:child_process');
    const cmd = [
      'powershell -NoProfile -Command "',
      "Get-ItemProperty 'HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall/*',",
      "'HKLM:/Software/Microsoft/Windows/CurrentVersion/Uninstall/*'",
      " -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -eq 'Creative Studio' }",
      ' | Select-Object -ExpandProperty DisplayIcon"',
    ].join(' ');
    const out = execSync(cmd, {
      timeout: 8000,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
    const exe = out.split(/\r?\n/)[0].replace(/^"|"$/g, '');
    if (exe && existsSync(exe)) return exe;
  } catch {}
  return null;
}

/** 候选应用路径（按优先级）：环境变量 > 注册表安装位置 > 常见安装目录 > 仓库构建产物 */
function findAppExe() {
  const candidates = [];
  if (process.env.CS_APP_PATH) candidates.push(process.env.CS_APP_PATH);
  // 已安装版本优先（正式写作环境）
  const fromReg = installExeFromRegistry();
  if (fromReg) candidates.push(fromReg);
  const home = process.env.USERPROFILE || process.env.HOME || '';
  if (home) {
    candidates.push(home + '/AppData/Local/Programs/Creative Studio/creative-studio-desktop.exe');
    candidates.push(home + '/AppData/Local/Creative Studio/creative-studio-desktop.exe');
  }
  candidates.push('C:/Program Files/Creative Studio/creative-studio-desktop.exe');
  candidates.push('D:/Creative Studio/creative-studio-desktop.exe');
  // 开发构建产物兜底
  candidates.push('D:/Code/创作中心/src-tauri/target/release/creative-studio-desktop.exe');
  candidates.push('D:/Code/创作中心/src-tauri/target/debug/creative-studio-desktop.exe');
  return candidates.find((p) => { try { return existsSync(p); } catch { return false; } }) || null;
}

/**
 * 确保 API 在线；不在线则拉起应用并等待就绪
 * 每个工具调用前调用；就绪后本次会话内短路（30s 内不重复探测启动流程）
 */
let lastReadyAt = 0;
async function ensureApiOnline() {
  if (await apiReady()) { lastReadyAt = Date.now(); return; }
  if (Date.now() - lastReadyAt < 30000 && await apiReady(500)) return;

  const exe = findAppExe();
  if (!exe) {
    throw new Error('Creative Studio 未运行且未找到应用路径。请启动应用，或设置环境变量 CS_APP_PATH 指向 creative-studio-desktop.exe / Creative Studio.exe');
  }
  // detached 启动：不阻塞 agent，不继承 stdio
  const child = spawn(exe, [], { detached: true, stdio: 'ignore', windowsHide: false });
  child.unref();

  // 阶段一：等 API 进程在线（应用启动 → axum 监听，任何 HTTP 响应都算）
  for (let i = 0; i < 30; i++) {
    if (await apiOnline(1200)) break;
    await new Promise((r) => setTimeout(r, 1000));
    if (i === 29) throw new Error(`已启动 ${exe} 但 API 30 秒内未监听`);
  }
  // 阶段二：等数据库就绪（前端初始化建表后 /api/works 返回 200）
  for (let i = 0; i < 30; i++) {
    if (await apiReady(1500)) { lastReadyAt = Date.now(); return; }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('API 已在线但数据库 30 秒内未初始化（应用窗口是否正常打开？）');
}

async function callTool(name, args) {
  await ensureApiOnline();
  const req = (method, path, body) =>
    fetch(API_BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => {
      const text = await r.text();
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 200)}`);
      return text;
    });

  switch (name) {
    case 'list_works': return req('GET', '/api/works');
    case 'create_work': return req('POST', '/api/works', { title: args.title, type: args.type || 'novel' });
    case 'update_work': return req('PUT', `/api/works/${args.workId}`, args);
    case 'delete_work': return req('DELETE', `/api/works/${args.workId}`);
    case 'list_chapters': return req('GET', `/api/works/${args.workId}/chapters`);
    case 'read_chapter': return req('GET', `/api/chapters/${args.chapterId}`);
    case 'create_chapter': return req('POST', '/api/chapters', args);
    case 'write_chapter': return req('PUT', `/api/chapters/${args.chapterId}/content`, { content: args.content });
    case 'delete_chapter': return req('DELETE', `/api/chapters/${args.chapterId}`);
    case 'get_outline': return req('GET', `/api/works/${args.workId}/outline`);
    case 'delete_outline_node': return req('DELETE', `/api/outline/${args.nodeId}`);
    case 'list_characters': return req('GET', `/api/works/${args.workId}/characters`);
    case 'create_character': return req('POST', `/api/works/${args.workId}/characters`, args);
    case 'list_scenes': return req('GET', `/api/works/${args.workId}/scenes`);
    case 'create_scene': return req('POST', `/api/works/${args.workId}/scenes`, args);
    case 'list_world_settings': return req('GET', `/api/works/${args.workId}/world-settings`);
    case 'create_world_setting': return req('POST', `/api/works/${args.workId}/world-settings`, args);
    case 'list_clues': return req('GET', `/api/works/${args.workId}/clues`);
    case 'create_clue': return req('POST', `/api/works/${args.workId}/clues`, args);
    case 'resolve_clue': return req('PUT', `/api/clues/${args.clueId}/status`, { status: args.status });
    case 'list_conflicts': return req('GET', `/api/works/${args.workId}/conflicts`);
    case 'create_conflict': return req('POST', `/api/works/${args.workId}/conflicts`, args);
    case 'list_storyboards': return req('GET', `/api/works/${args.workId}/storyboards`);
    case 'list_submissions': return req('GET', `/api/works/${args.workId}/submissions`);
    case 'ai_continue': return req('POST', `/api/ai/continue/${args.chapterId}`, { instruction: args.instruction || '' });
    case 'ai_review': return req('POST', `/api/ai/review/${args.chapterId}`);
    case 'ai_summary': return req('POST', `/api/ai/summary/${args.chapterId}`);
    case 'ai_outline': return req('POST', '/api/ai/outline', args);
    case 'ai_gen_characters': return req('POST', '/api/ai/characters', args);
    case 'ai_gen_scenes': return req('POST', '/api/ai/scenes', args);
    case 'ai_detect_clues': return req('POST', `/api/ai/detect-clues/${args.workId}`);
    case 'ai_gen_storyboards': return req('POST', `/api/ai/storyboards/${args.chapterId}`);
    case 'get_story_context': return req('GET', `/api/ai/context/${args.workId}` + (args.chapterId ? `?chapterId=${args.chapterId}` : ''));
    case 'prepare_ai': return req('POST', `/api/ai/prepare/${args.chapterId}`, { action: args.action, instruction: args.instruction || '', selection: args.selection });
    case 'prepare_outline': return req('POST', '/api/ai/prepare-outline', { workId: args.workId, premise: args.premise, chapterCount: args.chapterCount });
    case 'append_chapter_content': return req('POST', `/api/chapters/${args.chapterId}/append`, { text: args.text });
    case 'update_chapter_summary': return req('PUT', `/api/chapters/${args.chapterId}/summary`, { summary: args.summary });
    case 'export_work': return req('POST', '/api/export', args);
    case 'import_text': return req('POST', '/api/import', args);
    case 'list_chapter_versions': return req('GET', `/api/chapters/${args.chapterId}/versions`);
    case 'save_chapter_version': return req('POST', `/api/chapters/${args.chapterId}/versions`, { label: args.label || 'agent 快照' });
    case 'search': return req('GET', `/api/search?q=${encodeURIComponent(args.query)}`);
    case 'work_stats': return req('GET', `/api/stats/${args.workId}`);
    default: throw new Error(`未知工具: ${name}`);
  }
}

/** JSON-RPC over stdio（MCP 协议） */
process.stdin.setEncoding('utf8');
let buffer = '';
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    try {
      handle(JSON.parse(line));
    } catch (e) {
      console.error('parse error:', e.message);
    }
  }
});

async function handle(msg) {
  const reply = (result) => {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }) + '\n');
  };
  const replyErr = (code, message) => {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code, message } }) + '\n');
  };

  try {
    switch (msg.method) {
      case 'initialize':
        reply({
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'creative-studio', version: '0.4.0' },
        });
        break;
      case 'notifications/initialized':
        break;
      case 'tools/list':
        reply({ tools: TOOLS });
        break;
      case 'tools/call': {
        const result = await callTool(msg.params.name, msg.params.arguments || {});
        reply({ content: [{ type: 'text', text: String(result).slice(0, 50000) }] });
        break;
      }
      case 'ping':
        reply({});
        break;
      default:
        if (msg.id !== undefined) replyErr(-32601, `未知方法: ${msg.method}`);
    }
  } catch (e) {
    if (msg.id !== undefined) replyErr(-32000, e.message);
  }
}
