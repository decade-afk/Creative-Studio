#!/usr/bin/env node
/**
 * Creative Studio MCP Server（stdio → 本地 REST 桥）
 *
 * 让 Claude Code / Cursor 等任意 MCP 客户端直接使用 Creative Studio：
 * 读写作品与章节、调用软件内置的 AI 工作流（续写/审稿/大纲）、全局搜索。
 *
 * 【前提】Creative Studio 桌面应用正在运行（Agent API 监听 127.0.0.1:8765）
 *
 * 【接入 Claude Code】
 *   claude mcp add creative-studio -- node <本项目路径>/scripts/mcp-server.mjs
 * 或写入 .mcp.json：
 *   { "mcpServers": { "creative-studio": {
 *       "command": "node", "args": ["<绝对路径>/scripts/mcp-server.mjs"] } } }
 */

import { readFileSync } from 'node:fs';

const API_BASE = process.env.CS_API_BASE || 'http://127.0.0.1:8765';

/** 工具定义（MCP tools） */
const TOOLS = [
  {
    name: 'list_works',
    description: '列出 Creative Studio 中的全部作品（含章节数与总字数）',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'create_work',
    description: '创建新作品',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '作品标题' },
        type: { type: 'string', enum: ['novel', 'script'], description: '类型：小说/短剧' },
      },
      required: ['title'],
    },
  },
  {
    name: 'list_chapters',
    description: '列出作品的章节（含字数）',
    inputSchema: {
      type: 'object',
      properties: { workId: { type: 'string' } },
      required: ['workId'],
    },
  },
  {
    name: 'read_chapter',
    description: '读取章节全文（HTML 与纯文本）',
    inputSchema: {
      type: 'object',
      properties: { chapterId: { type: 'string' } },
      required: ['chapterId'],
    },
  },
  {
    name: 'create_chapter',
    description: '在作品下创建新章节（content 接受纯文本或 HTML，纯文本自动分段）',
    inputSchema: {
      type: 'object',
      properties: {
        workId: { type: 'string' },
        title: { type: 'string' },
        content: { type: 'string', description: '章节正文（纯文本即可）' },
      },
      required: ['workId', 'title'],
    },
  },
  {
    name: 'write_chapter',
    description: '整体替换章节正文（content 接受纯文本或 HTML）',
    inputSchema: {
      type: 'object',
      properties: {
        chapterId: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['chapterId', 'content'],
    },
  },
  {
    name: 'delete_chapter',
    description: '删除章节（软删除，可在回收站恢复）',
    inputSchema: {
      type: 'object',
      properties: { chapterId: { type: 'string' } },
      required: ['chapterId'],
    },
  },
  {
    name: 'ai_continue',
    description: '调用软件内置 AI 续写章节并自动追加保存（使用软件中配置的模型）',
    inputSchema: {
      type: 'object',
      properties: {
        chapterId: { type: 'string' },
        instruction: { type: 'string', description: '补充要求（可选）' },
      },
      required: ['chapterId'],
    },
  },
  {
    name: 'ai_review',
    description: '调用软件内置 AI 审稿（逻辑/时间线/人物一致性/伏笔/文笔），返回报告',
    inputSchema: {
      type: 'object',
      properties: { chapterId: { type: 'string' } },
      required: ['chapterId'],
    },
  },
  {
    name: 'ai_outline',
    description: '用一句话创意生成 N 章大纲并写入作品的大纲树',
    inputSchema: {
      type: 'object',
      properties: {
        workId: { type: 'string' },
        premise: { type: 'string', description: '一句话创意' },
        chapterCount: { type: 'number', description: '章节数（默认 10）' },
      },
      required: ['workId', 'premise'],
    },
  },
  {
    name: 'search',
    description: '跨作品全文搜索章节标题与正文',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
  {
    name: 'work_stats',
    description: '作品统计（章节数/总字数）',
    inputSchema: {
      type: 'object',
      properties: { workId: { type: 'string' } },
      required: ['workId'],
    },
  },
];

/** 工具调用 → REST */
async function callTool(name, args) {
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
    case 'list_chapters': return req('GET', `/api/works/${args.workId}/chapters`);
    case 'read_chapter': return req('GET', `/api/chapters/${args.chapterId}`);
    case 'create_chapter': return req('POST', '/api/chapters', args);
    case 'write_chapter': return req('PUT', `/api/chapters/${args.chapterId}/content`, { content: args.content });
    case 'delete_chapter': return req('DELETE', `/api/chapters/${args.chapterId}`);
    case 'ai_continue': return req('POST', `/api/ai/continue/${args.chapterId}`, { instruction: args.instruction || '' });
    case 'ai_review': return req('POST', `/api/ai/review/${args.chapterId}`);
    case 'ai_outline': return req('POST', '/api/ai/outline', args);
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
          serverInfo: { name: 'creative-studio', version: '0.3.0' },
        });
        break;
      case 'notifications/initialized':
        break; // 无回复
      case 'tools/list':
        reply({ tools: TOOLS });
        break;
      case 'tools/call': {
        const result = await callTool(msg.params.name, msg.params.arguments || {});
        reply({
          content: [{ type: 'text', text: String(result).slice(0, 50000) }],
        });
        break;
      }
      case 'ping':
        reply({});
        break;
      default:
        if (msg.id !== undefined) replyErr(-32601, `未知方法: ${msg.method}`);
    }
  } catch (e) {
    if (msg.id !== undefined) {
      replyErr(-32000, e.message);
    }
  }
}
