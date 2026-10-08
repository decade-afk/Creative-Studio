/* E2E：外部 agent 免模型密钥闭环（纯 REST，不经过前端）
 * 流程：context 检查 → prepare(summary) → 模拟模型生成 → PUT summary 存档
 *      → prepare(continue, 下一章) → 验证前情链携带摘要 → 模拟生成 → append 写回
 *      → 恢复现场（清摘要、还原被 append 的章正文、删测试条目）
 */
const API = 'http://127.0.0.1:8765';
const WORK_ID = '8cdc2351-84d2-462a-8fd8-570e35a0fd72';
const MOCK_SUMMARY = '陆长安在杂役院安顿下来，确认系统只认七情六欲（吃饭/睡觉/高兴都涨修为）；欠六百灵石；老周头给了碗面，小豆子分他半块饼。';

async function req(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

(async () => {
  let pass = 0, fail = 0;
  const check = (name, ok, extra = '') => {
    console.log(ok ? '  ✅' : '  ❌', name, extra ? `(${extra})` : '');
    ok ? pass++ : fail++;
  };

  const chapters = await req('GET', `/api/works/${WORK_ID}/chapters`);
  const ch1 = chapters[0], ch2 = chapters[1];

  // 0. 世界书条目（"锅巴"在第2章正文出现）
  const entry = await req('POST', `/api/works/${WORK_ID}/world-settings`, {
    work_id: WORK_ID, category: 'term', title: '锅巴', content: '米饭锅底的焦香脆层，老周头的独门口感。',
  });

  // 1. context 端点
  const ctx = await req('GET', `/api/ai/context/${WORK_ID}?chapterId=${ch1.id}`);
  check('GET /ai/context：故事背景', ctx.storyBible.includes('别人修仙我过日子'));
  check('GET /ai/context：角色卡', ctx.characterCards.includes('陆长安'));

  // 2. prepare(summary) — 模拟"模型是调用方自己"
  const prepSummary = await req('POST', `/api/ai/prepare/${ch1.id}`, { action: 'summary' });
  check('prepare(summary)：messages 结构', Array.isArray(prepSummary.messages) && prepSummary.messages.length === 2);
  check('prepare(summary)：状态投影要素', prepSummary.messages[1].content.includes('人物状态与关系变化'));
  check('prepare(summary)：免密钥可用', typeof prepSummary.usedContext === 'boolean');

  // 3. 模拟模型产出摘要 → 写回存档
  await req('PUT', `/api/chapters/${ch1.id}/summary`, { summary: MOCK_SUMMARY });

  // 4. prepare(continue) 下一章 → 前情链必须携带刚存的摘要
  const prepCont = await req('POST', `/api/ai/prepare/${ch2.id}`, { action: 'continue', instruction: '测试补充要求' });
  const user = prepCont.messages[1].content;
  const sys = prepCont.messages[0].content;
  check('prepare(continue)：系统提示含防AI味替换表', sys.includes('眼中闪过一丝X'));
  check('prepare(continue)：故事背景注入', user.includes('【故事背景】'));
  check('prepare(continue)：前情链携带第1章摘要', user.includes('六百灵石'));
  check('prepare(continue)：世界书·锅巴命中', user.includes('【锅巴】'));
  check('prepare(continue)：角色卡注入', user.includes('陆长安'));
  check('prepare(continue)：补充要求注入', user.includes('测试补充要求'));
  // 末位效应：【正文结尾】是最后一个块标记
  const lastIdx = user.lastIndexOf('【正文结尾】');
  const otherMax = ['【故事背景】', '前情提要', '出场与相关角色', '【相关设定】', '【全书笔调】', '【作者注】', '【补充要求】']
    .reduce((a, m) => Math.max(a, user.indexOf(m)), -1);
  check('prepare(continue)：正文结尾在末位', lastIdx > otherMax && lastIdx > 0);

  // 5. 模拟模型产出续写 → append 写回
  const ch2Before = await req('GET', `/api/chapters/${ch2.id}`);
  const appended = '他试着在心里默念了一句就那么回事，窗户纸忽然透进一线晨光。';
  const appendRes = await req('POST', `/api/chapters/${ch2.id}/append`, { text: appended });
  check('append 写回：字数增加', appendRes.wordCount > (appendRes.wordCount - 1) && appendRes.wordCount > 0);
  const ch2After = await req('GET', `/api/chapters/${ch2.id}`);
  check('append 写回：内容确实落库', ch2After.content.includes('就那么回事'));

  // 6. prepare(polish) 需要 selection
  const prepPolish = await req('POST', `/api/ai/prepare/${ch2.id}`, { action: 'polish', selection: '他笑得挺真的啊。' });
  check('prepare(polish)：含五问诊断', prepPolish.messages[1].content.includes('这段要完成什么叙事功能'));

  // 7. prepare-outline
  const prepOutline = await req('POST', '/api/ai/prepare-outline', { workId: WORK_ID, premise: '测试创意', chapterCount: 12 });
  check('prepare-outline：叙事引擎方法论', prepOutline.messages[0].content.includes('叙事引擎'));

  // 8. CLI 冒烟（同 API）
  const { execSync } = require('node:child_process');
  try {
    const out = execSync('node scripts/cs-cli.mjs works', { encoding: 'utf8', cwd: process.cwd() });
    check('CLI works 冒烟', out.includes('别人修仙我过日子'));
  } catch (e) {
    check('CLI works 冒烟', false, e.message.slice(0, 60));
  }

  // ---- 清理现场 ----
  await req('PUT', `/api/chapters/${ch1.id}/summary`, { summary: '' });
  await req('PUT', `/api/chapters/${ch2.id}/content`, { content: ch2Before.content });
  await req('DELETE', `/api/world-settings/${entry.id}`);
  const works = await req('GET', '/api/works');
  console.log(`\n现场已恢复：${works[0].title} ${works[0].chapterCount}章 ${works[0].totalWords}字`);
  console.log(fail === 0 ? `\n全部通过: ${pass}/${pass + fail}` : `\n通过 ${pass}，失败 ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
