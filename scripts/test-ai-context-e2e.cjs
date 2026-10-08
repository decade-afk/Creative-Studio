/* E2E：AI 上下文组装 + 摘要落库 + 前情链 实测（v2） */
const { Cdp } = require('./cdp-driver.cjs');
const fs = require('node:fs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WORK_ID = '8cdc2351-84d2-462a-8fd8-570e35a0fd72';
const API = 'http://127.0.0.1:8765';
const MOCK_SUMMARY_MARK = '六百灵石欠债'; // mock 摘要回复中的特征串

async function api(path, method = 'GET', body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

(async () => {
  const chapters = await api(`/api/works/${WORK_ID}/chapters`);
  const ch1 = chapters[0], ch2 = chapters[1];

  // 0. 造必然命中的世界书条目：第2章正文含"锅巴"
  const created = await api(`/api/works/${WORK_ID}/world-settings`, 'POST', {
    work_id: WORK_ID, category: 'term', title: '锅巴',
    content: '米饭锅底的焦香脆层，老周头灶上的独门口感，陆长安喜欢的少数食物之一。',
  });
  console.log('测试世界书条目(锅巴):', created.id ? 'created' : JSON.stringify(created));

  const cdp = await Cdp.connect(9223);
  await sleep(1500);

  /** 打开 AI 面板（若未开） */
  const ensurePanel = async () => {
    const has = await cdp.evalJs(`[...document.querySelectorAll('button')].some(b => b.textContent.trim().includes('摘要')) ? 'yes' : 'no'`);
    if (has === 'no') {
      await cdp.evalJs(`[...document.querySelectorAll('button')].find(x => x.title && x.title.includes('AI 创作助手'))?.click()`);
      await sleep(600);
    }
  };

  /** 切换到指定章节 */
  const switchChapter = async (chTitle) => {
    await cdp.evalJs(`document.querySelector('button[title="切换章节"]')?.click()`);
    await sleep(300);
    await cdp.evalJs(`(() => {
      const panels = [...document.querySelectorAll('.absolute.top-full')];
      const p = panels[panels.length - 1];
      const item = [...p.querySelectorAll('button')].find(b => b.textContent.includes(${JSON.stringify(chTitle)}));
      item && item.click();
    })()`);
    await sleep(1200);
    return cdp.evalJs(`document.querySelector('button[title="切换章节"] span')?.textContent.trim()`);
  };

  /** 选中动作并点执行按钮（文本形如 "摘要（mock-model）"） */
  const runAction = async (label) => {
    await cdp.evalJs(`(() => {
      const tab = [...document.querySelectorAll('button')].find(x =>
        (x.querySelector('span.text-base') && x.textContent.trim().endsWith(${JSON.stringify(label)})) || x.textContent.trim() === ${JSON.stringify(label)});
      if (tab) tab.click();
    })()`);
    await sleep(250);
    return cdp.evalJs(`(() => {
      const run = [...document.querySelectorAll('button')].find(x => x.textContent.includes(${JSON.stringify(label)}) && x.textContent.includes('（'));
      if (run) { run.click(); return 'ran'; }
      return 'run-not-found';
    })()`);
  };

  await ensurePanel();

  // 1. 在第1章执行摘要（mock 回复含特征串）
  console.log('切到:', await switchChapter('第1章'));
  console.log('第1章摘要:', await runAction('摘要'));
  await sleep(2500);

  // 2. 切到第2章执行续写
  console.log('切到:', await switchChapter('第2章'));
  console.log('第2章续写:', await runAction('续写'));
  await sleep(2500);

  // 3. 断言
  const log = fs.readFileSync('.mock-requests.log', 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  console.log('捕获请求数:', log.length);

  const summaryReq = log.find((r) => r.messages.some((m) => m.content.includes('记忆摘要')));
  const contReq = log.find((r) => r.messages.some((m) => m.content.includes('正文结尾')));
  let pass = 0, fail = 0;
  const check = (name, ok) => { console.log(ok ? '  ✅' : '  ❌', name); ok ? pass++ : fail++; };

  if (summaryReq) {
    const user = summaryReq.messages.find((m) => m.role === 'user').content;
    const sys = summaryReq.messages.find((m) => m.role === 'system').content;
    check('摘要: user 含状态投影要素', user.includes('人物状态与关系变化'));
    check('摘要: system 含连续性编辑角色', sys.includes('连续性编辑'));
  } else { check('摘要请求已捕获', false); }

  if (contReq) {
    const user = contReq.messages.find((m) => m.role === 'user').content;
    const sys = contReq.messages.find((m) => m.role === 'system').content;
    check('系统提示·防AI味替换表', sys.includes('眼中闪过一丝X'));
    check('【故事背景】(简介+大纲)', user.includes('【故事背景】') && user.includes('故事大纲'));
    check('前情链携带第1章摘要(特征串)', user.includes(MOCK_SUMMARY_MARK));
    check('角色卡(陆长安)', user.includes('陆长安'));
    check('世界书·锅巴命中', user.includes('【锅巴】'));
    check('【全书笔调】casual 预设', user.includes('【全书笔调】'));
    check('【作者注】注入', user.includes('测试作者注'));
    // 末位效应：【正文结尾】是 user 消息里最后一个块标记
    const lastMarker = '【正文结尾】';
    const lastIdx = user.lastIndexOf(lastMarker);
    const otherIdx = ['【故事背景】', '前情提要', '出场与相关角色', '【相关设定】', '【全书笔调】', '【作者注】', '【补充要求】']
      .reduce((acc, m) => Math.max(acc, user.indexOf(m)), -1);
    check('正文结尾位于上下文末位', lastIdx > otherIdx && lastIdx > 0);
  } else { check('续写请求已捕获', false); }

  // 4. 清理：清空两章摘要 + 删除测试条目
  await api(`/api/chapters/${ch1.id}/summary`, 'PUT', { summary: '' });
  await api(`/api/chapters/${ch2.id}/summary`, 'PUT', { summary: '' });
  if (created.id) await api(`/api/world-settings/${created.id}`, 'DELETE').catch(() => undefined);
  console.log('清理完成（摘要置空 + 测试条目删除）');

  console.log(fail === 0 ? `\n全部通过: ${pass}/${pass + fail}` : `\n通过 ${pass}，失败 ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
