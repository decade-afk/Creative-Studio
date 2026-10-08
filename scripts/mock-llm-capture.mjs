/* 捕获请求的 Mock LLM：把每次收到的 messages 落盘，供断言上下文组装是否正确 */
import http from 'node:http';
import fs from 'node:fs';

const PORT = Number(process.argv[2] || 15120);
const LOG = process.argv[3] || '.mock-requests.log';

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/v1/models') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: [{ id: 'mock-model' }] }));
    return;
  }
  if (req.method === 'POST' && req.url === '/v1/chat/completions') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        fs.appendFileSync(LOG, JSON.stringify({ url: req.url, at: Date.now(), messages: parsed.messages }) + '\n');
      } catch { /* ignore */ }
      const stream = false;
      const userMsg = (() => {
        try { return JSON.parse(body).messages.map((m) => m.content).join('\n'); } catch { return ''; }
      })();
      let content = '陆长安把抹布搭在肩上，看了一眼殿外的天色。雨还没停，檐下的水线连成一道细帘。他弯腰把最后一格地砖擦完，直起腰时膝盖响了一声。日子还长，先把今天熬过去。';
      if (userMsg.includes('分镜')) {
        content = JSON.stringify([
          { title: '开场', description: '雨中杂役院', shot_type: 'wide', camera_movement: 'static', duration: 3 },
          { title: '特写', description: '陆长安擦地', shot_type: 'close', camera_movement: 'pan', duration: 4 },
        ]);
      } else if (userMsg.includes('记忆摘要')) {
        content = '陆长安擦完大殿，与老周头、小豆子有交集；确认七情六欲系统"吃"到情绪可涨道行；未解决：六百灵石欠债。';
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      void stream;
    });
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(PORT, '127.0.0.1', () => console.log(`capturing mock on ${PORT}, log=${LOG}`));
