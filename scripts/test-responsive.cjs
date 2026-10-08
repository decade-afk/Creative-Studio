/* 自适应扫描：在多个窗口宽度下检查各视图的水平溢出与元素碰撞 */
const { Cdp } = require('./cdp-driver.cjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WIDTHS = [1280, 1100, 960, 800];

(async () => {
  const cdp = await Cdp.connect(9223);
  await sleep(1500);

  for (const w of WIDTHS) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: w, height: 760, deviceScaleFactor: 0, mobile: false,
    });
    await sleep(500);
    const r = await cdp.evalJs(`(() => {
      const doc = document.documentElement;
      const overflowX = doc.scrollWidth - window.innerWidth;
      // 找出超出视口的元素
      const offenders = [];
      [...document.querySelectorAll('body *')].forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.right > window.innerWidth + 2 && rect.left >= 0) {
          const cls = (typeof el.className === 'string' ? el.className : '').slice(0, 50);
          offenders.push(el.tagName + '.' + cls + ' right=' + Math.round(rect.right));
        }
      });
      // 顶栏左右两组是否重叠
      const bar = document.querySelector('.h-16');
      let barOverlap = 'no-bar';
      if (bar) {
        const groups = [...bar.children].filter(c => c.tagName === 'DIV');
        if (groups.length >= 2) {
          const l = groups[0].getBoundingClientRect();
          const rt = groups[groups.length - 1].getBoundingClientRect();
          barOverlap = (l.right > rt.left) ? 'OVERLAP@' + Math.round(l.right - rt.left) : 'ok';
        }
      }
      return JSON.stringify({ w: ${w}, innerW: window.innerWidth, overflowX, barOverlap, offenders: offenders.slice(0, 6) });
    })()`);
    console.log(r);
    await cdp.screenshot('resp-w' + w);
  }
  await cdp.send('Emulation.clearDeviceMetricsOverride', {});
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
