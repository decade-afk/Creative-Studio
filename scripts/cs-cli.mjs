#!/usr/bin/env node
/**
 * Creative Studio CLI —— 面向脚本/外部 agent 的创作流程通道
 *
 * 与 MCP 服务器共用同一套 Agent API（127.0.0.1:8765，应用需在运行）。
 * 核心能力：免模型密钥拿到"组装好的完整提示词"（上下文+创作方法论），
 * 用你自己的模型执行后把结果写回应用。
 *
 * 用法：
 *   node scripts/cs-cli.mjs works                                  列出作品
 *   node scripts/cs-cli.mjs chapters <workId>                      列出章节
 *   node scripts/cs-cli.mjs context <workId> [chapterId]           查看故事上下文
 *   node scripts/cs-cli.mjs prepare <chapterId> <action> [说明]    取组装好的 messages（JSON）
 *       action: continue | polish | expand | summary | review
 *       polish/expand 需另加 --selection "要处理的文字"（或 --selection-file 路径）
 *   node scripts/cs-cli.mjs append <chapterId> <文本|->            追加正文（- 读 stdin）
 *   node scripts/cs-cli.mjs summary <chapterId> <文本|->           写入章节记忆摘要
 *   node scripts/cs-cli.mjs outline <workId> <创意> [章数]          取大纲 messages（JSON）
 *
 * 典型 agent 闭环：
 *   1. prepare 取 messages → 2. 用自己的模型生成 → 3. append/summary 写回 → 4. 下一章 repeat
 */

const API = process.env.CS_API || 'http://127.0.0.1:8765';

async function req(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) {
    console.error(`✗ ${method} ${path} → ${res.status}:`, typeof data === 'string' ? data : JSON.stringify(data));
    process.exit(1);
  }
  return data;
}

function readStdin() {
  return new Promise((resolve) => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (buf += c));
    process.stdin.on('end', () => resolve(buf));
  });
}

function argAfter(args, flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case 'works': {
      const works = await req('GET', '/api/works');
      for (const w of works) console.log(`${w.icon || '📖'} ${w.id}  ${w.title}  (${w.chapterCount}章/${w.totalWords}字)`);
      break;
    }
    case 'chapters': {
      const [workId] = rest;
      if (!workId) { console.error('用法: chapters <workId>'); process.exit(1); }
      const chs = await req('GET', `/api/works/${workId}/chapters`);
      for (const c of chs) {
        const plain = (c.content || '').replace(/<[^>]*>/g, '');
        console.log(`${c.id}  ${c.title}  (${plain.length}字${c.summary ? ' | 已有摘要' : ''})`);
      }
      break;
    }
    case 'context': {
      const [workId, chapterId] = rest;
      if (!workId) { console.error('用法: context <workId> [chapterId]'); process.exit(1); }
      const q = chapterId ? `?chapterId=${chapterId}` : '';
      const ctx = await req('GET', `/api/ai/context/${workId}${q}`);
      console.log('=== 上下文块（AI 实际收到的内容）===');
      console.log(ctx.contextBlock || '(空——作品还没有可组装的上下文)');
      break;
    }
    case 'prepare': {
      const [chapterId, action, ...restArgs] = rest;
      if (!chapterId || !action) {
        console.error('用法: prepare <chapterId> <continue|polish|expand|summary|review> [补充要求] [--selection 文字] [--selection-file 路径]');
        process.exit(1);
      }
      let selection = argAfter(process.argv, '--selection');
      const selFile = argAfter(process.argv, '--selection-file');
      if (selFile) selection = require('node:fs').readFileSync(selFile, 'utf8');
      // 从位置参数里剔除 flag 及其值，剩下的才是补充要求
      const instrParts = [];
      for (let i = 0; i < restArgs.length; i++) {
        if (restArgs[i] === '--selection' || restArgs[i] === '--selection-file') { i++; continue; }
        instrParts.push(restArgs[i]);
      }
      const body = { action, instruction: instrParts.join(' ').trim() };
      if (selection) body.selection = selection;
      const out = await req('POST', `/api/ai/prepare/${chapterId}`, body);
      console.log(JSON.stringify(out, null, 2));
      break;
    }
    case 'append': {
      const [chapterId, text] = rest;
      if (!chapterId || !text) { console.error('用法: append <chapterId> <文本或 ->'); process.exit(1); }
      const content = text === '-' ? await readStdin() : text;
      const out = await req('POST', `/api/chapters/${chapterId}/append`, { text: content });
      console.log('✓ 已追加，章节总字数:', out.wordCount);
      break;
    }
    case 'summary': {
      const [chapterId, text] = rest;
      if (!chapterId || !text) { console.error('用法: summary <chapterId> <文本或 ->'); process.exit(1); }
      const content = text === '-' ? await readStdin() : text;
      await req('PUT', `/api/chapters/${chapterId}/summary`, { summary: content });
      console.log('✓ 摘要已存档，后续章节 prepare 时会自动携带');
      break;
    }
    case 'outline': {
      const [workId, premise, count] = rest;
      if (!workId || !premise) { console.error('用法: outline <workId> <创意> [章数]'); process.exit(1); }
      const out = await req('POST', '/api/ai/prepare-outline', { workId, premise, chapterCount: parseInt(count) || 10 });
      console.log(JSON.stringify(out, null, 2));
      break;
    }
    default:
      console.log('未知命令:', cmd, '—— 见文件头用法说明');
      process.exit(1);
  }
}

main().catch((e) => { console.error('✗', e.message); process.exit(1); });
