/* 验收：ZCode(agent)作为模型，经插件 MCP 通道接管软件 AI 能力
 * 全程不读软件 AI 配置、不碰用户真实作品；结束删除临时作品
 */
const { spawn } = require('node:child_process');
const path = require('node:path');

const serverPath = path.join('C:', 'Users', 'o-dream', '.zcode', 'cli', 'plugins', 'cache', 'creative-studio-local', 'creative-studio', '0.4.0', 'mcp-server.mjs');
const p = spawn('node', [serverPath], { stdio: ['pipe', 'pipe', 'pipe'] });
let buf = '';
let id = 0;
const pending = new Map();
p.stdout.on('data', (d) => {
  buf += d;
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx);
    buf = buf.slice(idx + 1);
    try {
      const msg = JSON.parse(line);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    } catch {}
  }
});
p.stderr.on('data', (d) => process.stderr.write('[srv] ' + d));

function rpc(method, params) {
  return new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, (msg) => (msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)));
    p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: msgId, method, params }) + '\n');
    setTimeout(() => pending.has(msgId) && (pending.delete(msgId), reject(new Error('timeout ' + method))), 15000);
  });
}

async function call(name, args) {
  const res = await rpc('tools/call', { name, arguments: args });
  const text = res?.content?.[0]?.text || '';
  try { return JSON.parse(text); } catch { return text; }
}

(async () => {
  let pass = 0, fail = 0;
  const check = (name, ok, extra = '') => {
    console.log(ok ? '  ✅' : '  ❌', name, extra ? `(${extra})` : '');
    ok ? pass++ : fail++;
  };

  await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'acceptance', version: '0' } });

  // 1. 建临时作品 + 第一章
  const work = await call('create_work', { title: 'AI接管验收（临时）', type: 'novel', description: '验证 agent 模型接管：修仙界的外卖员靠送餐涨修为。' });
  const workId = work.id;
  check('建临时作品', !!workId);
  const ch = await call('create_chapter', {
    workId,
    title: '第1章 差评',
    content: '林小满把电动车支在山门外，头盔都没摘。\n系统提示音在脑子里响：订单超时，灵气-1。\n他看着眼前云雾缭绕的九重山门，掏出手机看了眼地址——没错，就是这个修仙宗门点的二十八杯杨枝甘露。',
  });
  const chapterId = ch.id;
  check('建第一章', !!chapterId);

  // 2. prepare_ai(continue)：软件组装提示词，我来当模型
  const prep = await call('prepare_ai', { chapterId, action: 'continue', instruction: '节奏轻快，出现一个具体的宗门刁难' });
  const messages = prep.messages || [];
  check('prepare_ai 返回完整 messages', Array.isArray(messages) && messages.length === 2);
  check('系统提示含防AI味约束（软件提供方法论）', (messages[0]?.content || '').includes('眼中闪过一丝X'));
  check('user 消息含正文结尾', (messages[1]?.content || '').includes('【正文结尾】'));

  // 3. 我作为模型生成正文（遵守系统提示：场景推进、无总结腔、具体动作）
  const myContinuation = [
    '守门的弟子拦住他，拂尘一甩："外门杂役不得入内。"',
    '林小满把订单页面翻过来给他看。收餐人一栏写着：掌门。',
    '"掌门点了三杯少糖的。"他说，"你们宗门昨天退货两杯，差评还没撤。"',
    '弟子结巴了一下，转身进门通报。林小满靠着电动车等，头盔玻璃上映出系统新弹出的一行字：客户满意+1，灵气+3。',
    '山门里传来一阵脚步声，越来越急。',
  ].join('\n\n');

  // 4. append 写回
  const appendRes = await call('append_chapter_content', { chapterId, text: myContinuation });
  check('append 写回落库', !!appendRes.wordCount, 'wordCount=' + appendRes.wordCount);

  // 5. 读回验证
  const back = await call('read_chapter', { chapterId });
  check('读回包含我生成的内容', (back.plainText || back.content || '').includes('差评还没撤'));

  // 6. prepare_ai(summary) → 我生成摘要 → 存档进前情链
  await call('prepare_ai', { chapterId, action: 'summary' });
  await call('update_chapter_summary', {
    chapterId,
    summary: '林小满给修仙宗门送奶茶，用差评要挟守门弟子通报掌门；系统机制确认：客户满意涨灵气。',
  });
  // 摘要属于第1章，会出现在"第2章"的前情链里（前情链只带当前章之前的章节）
  const ch2 = await call('create_chapter', { workId, title: '第2章 加单', content: '第二天一早，系统又响了。' });
  const ctxAfter = await call('get_story_context', { workId, chapterId: ch2.id });
  check('摘要进入第2章前情链', (ctxAfter.memory || '').includes('差评要挟守门弟子'));

  // 7. 清理：删临时作品，确认用户小说无恙
  await call('delete_work', { workId });
  const works = await call('list_works', {});
  const worksText = JSON.stringify(works);
  check('临时作品已删除', !worksText.includes('AI接管验收'));
  check('用户小说完好', worksText.includes('别人修仙我过日子'));

  console.log(fail === 0 ? `\n验收通过: ${pass}/${pass + fail}` : `\n通过 ${pass}，失败 ${fail}`);
  p.kill();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('FAIL:', e.message); p.kill(); process.exit(1); });
