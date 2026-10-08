/* 全视图自适应扫描：5 个视图 × 4 个宽度，检查溢出并截图 */
const { Cdp } = require('./cdp-driver.cjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WIDTHS = [1280, 1100, 960, 800];
const VIEWS = ['创作', '规划', '导演', '投递', '设置'];

(async () => {
  const cdp = await Cdp.connect(9223);
  await sleep(1000);

  for (const view of VIEWS) {
    await cdp.evalJs(`[...document.querySelectorAll('button')].find(b => b.title === ${JSON.stringify(view)})?.click()`);
    await sleep(900);
    for (const w of WIDTHS) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: w, height: 760, deviceScaleFactor: 0, mobile: false,
      });
      await sleep(450);
      const r = await cdp.evalJs(`(() => {
        const offenders = [];
        [...document.querySelectorAll('body *')].forEach(el => {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.right > window.innerWidth + 2 && rect.left >= 0) {
            offenders.push(el.tagName + '.' + (typeof el.className === 'string' ? el.className : '').slice(0, 60) + ' R' + Math.round(rect.right));
          }
        });
        const hOverflow = document.documentElement.scrollWidth - window.innerWidth;
        return JSON.stringify({ view: ${JSON.stringify(view)}, w: ${w}, hOverflow, n: offenders.length, offenders: offenders.slice(0, 4) });
      })()`);
      console.log(r);
      if (w === 800 || w === 1280) {
        await cdp.screenshot('resp-' + view + '-' + w);
      }
    }
  }
  await cdp.send('Emulation.clearDeviceMetricsOverride', {});
  // 回到创作视图
  await cdp.evalJs(`[...document.querySelectorAll('button')].find(b => b.title === '创作')?.click()`);
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
