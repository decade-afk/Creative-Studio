/**
 * 应用图标生成器（零依赖，Node 内置 zlib 直接编码 PNG）
 *
 * 设计与应用主题一致：
 * - 圆角方形底板，对角渐变（取自标题栏 Logo 的品牌色 #a07d5e → #8b6342）
 * - 中央白色羽毛笔（复刻 TitleBar 中的二次贝塞尔曲线笔触），带笔缝与笔孔
 *
 * 用法：node scripts/generate-icon.mjs [输出路径]   （默认 app-icon.png，1024×1024）
 */

import zlib from 'node:zlib';
import fs from 'node:fs';

const SIZE = 1024;
const OUTPUT = process.argv[2] || 'app-icon.png';

// ---------- 几何与颜色参数 ----------
const RADIUS = 200;                 // 圆角半径
const BRAND_LIGHT = [160, 125, 94]; // #a07d5e
const BRAND_DARK = [139, 99, 66];   // #8b6342
const QUILL_W = 52;                 // 笔触宽度（半径 26）
const QUILL = {                     // 二次贝塞尔：顶点/控制点/底点
  p0: { x: 536, y: 268 },
  p1: { x: 424, y: 512 },
  p2: { x: 536, y: 756 },
};
const NIB_HOLE = { x: 512, y: 620, r: 20 };  // 笔孔
const SLIT = { x: 512, y: 652, x2: 512, y2: 756, halfW: 7 }; // 笔缝

// ---------- 距离函数 ----------
/** 圆角方形 SDF（中心对称） */
function sdRoundBox(px, py, bx, by, r) {
  const qx = Math.abs(px) - bx + r;
  const qy = Math.abs(py) - by + r;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

/** 点到线段距离 */
function sdSegment(px, py, a, b) {
  const abx = b.x - a.x, aby = b.y - a.y;
  const apx = px - a.x, apy = py - a.y;
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / (abx * abx + aby * aby)));
  return Math.hypot(px - (a.x + abx * t), py - (a.y + aby * t));
}

/** 预采样贝塞尔曲线点列（用于近似最短距离） */
function sampleBezier(n = 220) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const mt = 1 - t;
    pts.push({
      x: mt * mt * QUILL.p0.x + 2 * mt * t * QUILL.p1.x + t * t * QUILL.p2.x,
      y: mt * mt * QUILL.p0.y + 2 * mt * t * QUILL.p1.y + t * t * QUILL.p2.y,
    });
  }
  return pts;
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));
/** SDF → 抗锯齿覆盖率 */
const coverage = (d) => clamp01(0.5 - d);

// ---------- 像素渲染 ----------
const BEZIER = sampleBezier();
const curveMinX = Math.min(...BEZIER.map((p) => p.x)) - QUILL_W;
const curveMaxX = Math.max(...BEZIER.map((p) => p.x)) + QUILL_W;
const curveMinY = Math.min(...BEZIER.map((p) => p.y)) - QUILL_W;
const curveMaxY = Math.max(...BEZIER.map((p) => p.y)) + QUILL_W;

/** 单像素覆盖：返回 { bg, fg }，bg=底板覆盖，fg=羽毛笔覆盖 */
function pixelCoverage(x, y) {
  const bg = coverage(sdRoundBox(x - SIZE / 2, y - SIZE / 2, SIZE / 2, SIZE / 2, RADIUS));
  if (bg <= 0) return { bg: 0, fg: 0 };

  let fg = 0;
  if (x >= curveMinX && x <= curveMaxX && y >= curveMinY && y <= curveMaxY) {
    let minDist = Infinity;
    for (const p of BEZIER) {
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < minDist) minDist = d;
    }
    fg = coverage(minDist - QUILL_W / 2);
  }

  // 笔孔与笔缝：从羽毛笔覆盖中扣除
  const hole = coverage(Math.hypot(x - NIB_HOLE.x, y - NIB_HOLE.y) - NIB_HOLE.r);
  const slit = coverage(sdSegment(x, y, SLIT, { x: SLIT.x2, y: SLIT.y2 }) - SLIT.halfW);
  fg *= 1 - clamp01(hole + slit);

  return { bg, fg };
}

/** 像素颜色：品牌渐变 */
function bgColor(x, y) {
  const t = clamp01((x + y) / (2 * SIZE));
  return [
    BRAND_LIGHT[0] + (BRAND_DARK[0] - BRAND_LIGHT[0]) * t,
    BRAND_LIGHT[1] + (BRAND_DARK[1] - BRAND_LIGHT[1]) * t,
    BRAND_LIGHT[2] + (BRAND_DARK[2] - BRAND_LIGHT[2]) * t,
  ];
}

// ---------- 主流程（2×2 超采样） ----------
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1)); // 每行前置 filter byte 0
for (let y = 0; y < SIZE; y++) {
  const rowStart = y * (SIZE * 4 + 1);
  raw[rowStart] = 0;
  for (let x = 0; x < SIZE; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (const [ox, oy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
      const px = x + ox, py = y + oy;
      const { bg, fg } = pixelCoverage(px, py);
      const [br, bgc, bb] = bgColor(px, py);
      r += (br * bg) * (1 - fg) + 255 * fg * bg;
      g += (bgc * bg) * (1 - fg) + 255 * fg * bg;
      b += (bb * bg) * (1 - fg) + 255 * fg * bg;
      a += bg * 255;
    }
    const n = 4;
    const off = rowStart + 1 + x * 4;
    raw[off] = Math.round(r / n);
    raw[off + 1] = Math.round(g / n);
    raw[off + 2] = Math.round(b / n);
    raw[off + 3] = Math.round(a / n);
  }
}

// ---------- PNG 编码 ----------
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32 ? zlib.crc32(body) : crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Node < 22 兜底 CRC32 */
function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 6;  // RGBA

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

fs.writeFileSync(OUTPUT, png);
console.log(`✅ 图标已生成: ${OUTPUT} (${SIZE}x${SIZE}, ${png.length} bytes)`);
