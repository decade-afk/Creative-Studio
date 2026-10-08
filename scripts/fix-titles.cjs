/* 批量修复章节标题重复前缀 */
const http = require('http');
const WID = '8cdc2351-84d2-462a-8fd8-570e35a0fd72';

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const r = http.request({ hostname: '127.0.0.1', port: 8765, path, method, headers: { 'Content-Type': 'application/json' } }, (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d));
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

(async () => {
  const chapters = JSON.parse(await req('GET', `/api/works/${WID}/chapters`));
  for (const c of chapters) {
    const fixed = c.title.replace(/^(第\d+章\s*){2,}/, (m) => m.match(/第\d+章\s*/g).slice(-1)[0]).replace(/^第(\d+)章\s+第\d+章\s*/, '第$1章 ');
    // 更精准：去掉第一个「第N章 」前缀，保留后面的「第N章 标题」
    const cleaner = c.title.replace(/^第\d+章\s+/, '');
    const finalTitle = /^第\d+章/.test(cleaner) ? cleaner : c.title;
    if (finalTitle !== c.title) {
      await req('PUT', `/api/chapters/${c.id}/title`, { title: finalTitle });
      console.log('fixed:', c.title, '->', finalTitle);
    } else {
      console.log('ok:', c.title);
    }
  }
  console.log('done');
  process.exit(0);
})();
