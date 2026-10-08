/* 顶栏作品/章节下拉实测：点击触发 → 校验面板内容 → 实际切换章节 → 校验正文加载 */
const { Cdp } = require('./cdp-driver.cjs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const cdp = await Cdp.connect(9223);
  await sleep(2000); // 等前端数据加载

  const q = (sel) => cdp.evalJs(`(() => {
    const el = document.querySelector(${JSON.stringify('SEL')});
    return el ? el.textContent.trim().slice(0, 40) : null;
  })()`);

  // 1. 初始面包屑
  const crumb = await cdp.evalJs(
    `document.querySelector('nav, .h-16') ? document.querySelector('.h-16').textContent.slice(0, 80) : 'NOBAR'`
  );
  console.log('顶栏文本:', crumb);

  // 2. 点开作品下拉
  await cdp.evalJs(`document.querySelector('button[title="切换作品"]').click()`);
  await sleep(400);
  const workPanel = await cdp.evalJs(`(() => {
    const panels = [...document.querySelectorAll('.absolute.top-full')];
    const p = panels[panels.length - 1];
    if (!p) return 'NO_PANEL';
    return 'ITEMS:' + [...p.querySelectorAll('button')].map(b => b.textContent.trim().slice(0, 20)).join(' | ');
  })()`);
  console.log('作品面板:', workPanel);
  await cdp.screenshot('topbar-work-menu');
  // 收起
  await cdp.evalJs(`document.body.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}))`);
  await cdp.evalJs(`document.querySelector('button[title="切换作品"]').click()`);
  await sleep(200);

  // 3. 点开章节下拉
  await cdp.evalJs(`document.querySelector('button[title="切换章节"]').click()`);
  await sleep(400);
  const chapPanel = await cdp.evalJs(`(() => {
    const panels = [...document.querySelectorAll('.absolute.top-full')];
    const p = panels[panels.length - 1];
    if (!p) return 'NO_PANEL';
    const items = [...p.querySelectorAll('button')];
    return 'COUNT:' + items.length + ' FIRST:' + items[0]?.textContent.trim().slice(0, 20) + ' LAST:' + items[items.length-1]?.textContent.trim().slice(0, 20);
  })()`);
  console.log('章节面板:', chapPanel);
  await cdp.screenshot('topbar-chapter-menu');

  // 4. 记录当前章节，切到另一章
  const before = await cdp.evalJs(`document.querySelector('button[title="切换章节"] span').textContent.trim()`);
  // 找当前章节在面板中的位置，点它的下一章（循环）
  const target = await cdp.evalJs(`(() => {
    const panels = [...document.querySelectorAll('.absolute.top-full')];
    const p = panels[panels.length - 1];
    const items = [...p.querySelectorAll('button')];
    const cur = items.findIndex(b => b.textContent.includes('✓'));
    const next = (cur + 1) % items.length;
    return { curTitle: items[cur]?.textContent.trim().slice(0,20), nextTitle: items[next]?.textContent.trim().slice(0,20), nextIdx: next };
  })()`);
  console.log('当前章节:', JSON.stringify(target));
  await cdp.evalJs(`(() => {
    const panels = [...document.querySelectorAll('.absolute.top-full')];
    const p = panels[panels.length - 1];
    const items = [...p.querySelectorAll('button')];
    const cur = items.findIndex(b => b.textContent.includes('✓'));
    items[(cur + 1) % items.length].click();
  })()`);
  await sleep(1200);

  // 5. 校验切换结果
  const after = await cdp.evalJs(`document.querySelector('button[title="切换章节"] span').textContent.trim()`);
  const editorWords = await cdp.evalJs(`(() => {
    const ed = document.querySelector('[contenteditable="true"]');
    return ed ? ed.textContent.length : 'NO_EDITOR';
  })()`);
  console.log('切换前:', before, '→ 切换后:', after, '| 正文长度:', editorWords);
  console.log(before !== after && Number(editorWords) > 0 ? '✅ 章节下拉切换 OK' : '❌ 切换失败');

  // 6. 复制按钮存在性 + 点击
  const copyBtns = await cdp.evalJs(`(() => ({
    title: !!document.querySelector('button[title="复制章节标题"]'),
    content: !!document.querySelector('button[title="复制本章内容"]'),
    disabled: document.querySelector('button[title="复制章节标题"]')?.disabled ?? null,
  }))()`);
  console.log('复制按钮:', JSON.stringify(copyBtns));
  await cdp.evalJs(`document.querySelector('button[title="复制章节标题"]').click()`);
  await sleep(600);
  await cdp.screenshot('topbar-after-copy');

  // 7. 面板收起验证（点外部）
  await cdp.evalJs(`document.querySelector('button[title="切换作品"]').click()`);
  await sleep(300);
  const openCount = await cdp.evalJs(`document.querySelectorAll('.absolute.top-full').length`);
  await cdp.evalJs(`document.querySelector('[contenteditable="true"]').dispatchEvent(new MouseEvent('mousedown', {bubbles: true}))`);
  await sleep(300);
  const openAfter = await cdp.evalJs(`document.querySelectorAll('.absolute.top-full').length`);
  console.log(`面板打开:${openCount} → 点外部后:${openAfter}`, openAfter === 0 ? '✅ 外点收起 OK' : '❌ 未收起');

  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
