/**
 * Mock LLM 服务器（开发/测试用）
 *
 * 提供 OpenAI 兼容接口的极简实现，用于在没有 API Key 时
 * 测试 Creative Studio 的 AI 链路（Rust 流式转发 → 前端事件）：
 *   GET  /v1/models            模型列表
 *   POST /v1/chat/completions  SSE 流式对话
 *
 * 【应答策略】根据请求内容返回不同结果：
 * - 消息包含"分镜" → 分镜 JSON 数组
 * - 消息包含"大纲" → "第N章 标题：梗概" 列表
 * - 其它 → 固定续写文本
 *
 * 用法：node scripts/mock-llm.mjs [端口]   （默认 15120）
 */

import http from 'node:http';

const PORT = Number(process.argv[2] || 15120);

const CONTINUE_REPLY = [
  '雨停了，顾川站在月台尽头，看见远处铁轨上有一点微弱的灯光。',
  '他握紧了口袋里那枚生锈的车票，十年前的广播声仿佛又在耳边响起——',
  '“开往临江的列车即将进站，请旅客们注意安全。”',
];

const STORYBOARD_JSON = JSON.stringify([
  { title: '月台全景', description: '雨夜空镜，霓虹灯牌闪烁', shot_type: 'wide', camera_movement: 'crane', duration: 8 },
  { title: '脚步特写', description: '皮鞋踏过积水', shot_type: 'close', camera_movement: 'dolly', duration: 4 },
  { title: '车票特写', description: '手指抚摸票根锈迹', shot_type: 'extreme_close', camera_movement: 'static', duration: 6 },
  { title: '站长现身', description: '老周提灯从暗处走出', shot_type: 'medium', camera_movement: 'pan', duration: 7 },
]);

const OUTLINE_TEXT = [
  '第1章 归途：顾川接到站长电话，登上十年未走的返乡列车。',
  '第2章 车站：雨夜月台，老周欲言又止，递来一枚生锈车票。',
  '第3章 老宅：阁楼遗物中发现母亲的信，日期正是事故当日。',
  '第4章 真相：车票背面暗号揭开当年脱轨事故的目击秘密。',
  '第5章 告别：顾川替母亲完成遗愿，与老周在晨光中和解。',
].join('\n\n');

function pickReply(body) {
  try {
    const parsed = JSON.parse(body);
    const text = JSON.stringify(parsed);
    if (text.includes('分镜')) return STORYBOARD_JSON;
    if (text.includes('大纲')) return OUTLINE_TEXT;
  } catch {
    // 忽略解析失败
  }
  return CONTINUE_REPLY.join('\n\n');
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url?.includes('/models')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: [{ id: 'mock-mini' }, { id: 'mock-pro' }] }));
    return;
  }

  if (req.method === 'POST' && req.url?.includes('/chat/completions')) {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      console.log('[mock] chat:', body.slice(0, 100));
      // 必须在请求体读完后才能按内容选择应答
      const reply = pickReply(body);
      // 按固定长度切片流式推送
      const chunks = [];
      for (let i = 0; i < reply.length; i += 60) {
        chunks.push(reply.slice(i, i + 60));
      }

      console.log('[mock] stream start');
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
        if (i >= chunks.length) {
          clearInterval(timer);
          res.write('data: [DONE]\n\n');
          res.end();
          console.log('[mock] stream done');
          return;
        }
        const payload = { choices: [{ delta: { content: chunks[i] } }] };
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
        i++;
      }, 100);

      // 注意：用 res 的 close（连接关闭），req 的 close 在请求体读完即触发
      res.on('close', () => {
        clearInterval(timer);
        console.log('[mock] client closed');
      });
    });
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Mock LLM listening on http://127.0.0.1:${PORT}/v1`);
});
