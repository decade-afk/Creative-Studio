/**
 * Mock LLM 服务器（开发/测试用）
 *
 * 提供 OpenAI 兼容接口的极简实现，用于在没有 API Key 时
 * 测试 Creative Studio 的 AI 链路（Rust 流式转发 → 前端事件）：
 *   GET  /v1/models            模型列表
 *   POST /v1/chat/completions  SSE 流式对话（按请求的 messages 回显固定内容）
 *
 * 用法：node scripts/mock-llm.mjs [端口]   （默认 15120）
 */

import http from 'node:http';

const PORT = Number(process.argv[2] || 15120);

const REPLY = [
  '雨停了，顾川站在月台尽头，看见远处铁轨上有一点微弱的灯光。',
  '他握紧了口袋里那枚生锈的车票，十年前的广播声仿佛又在耳边响起——',
  '“开往临江的列车即将进站，请旅客们注意安全。”',
];

const server = http.createServer((req, res) => {
  // CORS（浏览器直连调试用）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 模型列表
  if (req.method === 'GET' && req.url?.includes('/models')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: [{ id: 'mock-mini' }, { id: 'mock-pro' }] }));
    return;
  }

  // 流式对话：不等待请求体，收到连接即开始推送
  if (req.method === 'POST' && req.url?.includes('/chat/completions')) {
    req.resume(); // 丢弃请求体

    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => console.log(`[mock] chat request body: ${body.slice(0, 120)}`));
    req.on('error', (err) => console.error('[mock] request error:', err.message));

    console.log(`[mock] stream start`);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    let i = 0;
    const timer = setInterval(() => {
      if (res.writableEnded) {
        clearInterval(timer);
        return;
      }
      if (i >= REPLY.length) {
        clearInterval(timer);
        res.write('data: [DONE]\n\n');
        res.end();
        console.log('[mock] stream done');
        return;
      }
      const payload = {
        choices: [{ delta: { content: REPLY[i] + (i < REPLY.length - 1 ? '\n\n' : '') } }],
      };
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
      i++;
    }, 150);

    // 注意：要用 res 的 close（连接关闭），req 的 close 在请求体读完即触发
    res.on('close', () => {
      clearInterval(timer);
      console.log('[mock] client closed');
    });
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Mock LLM listening on http://127.0.0.1:${PORT}/v1`);
});
