/* ============================================================
   MirrorPlay · 图标生成（纯 Node，无第三方依赖）
   渲染 1024x1024 PNG（圆角渐变底 + 显示器/播放符），
   派生 hicolor 各尺寸 PNG 与 Windows ICO。
   用法：node scripts/make-icons.js
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'build');
const SIZES = [16, 32, 48, 64, 128, 256, 512, 1024];

/* ---------- PNG 编码 ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}
function encodeICO(pngBuf, size) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
  const ent = Buffer.alloc(16);
  ent[0] = size >= 256 ? 0 : size;   // width (0 = 256)
  ent[1] = size >= 256 ? 0 : size;   // height
  ent[2] = 0; ent[3] = 0;            // palette / reserved
  ent.writeUInt16LE(1, 4);           // color planes
  ent.writeUInt16LE(32, 6);          // bpp
  ent.writeUInt32LE(pngBuf.length, 8);
  ent.writeUInt32LE(22, 12);         // offset
  return Buffer.concat([head, ent, pngBuf]);
}

/* ---------- 几何 SDF ---------- */
function sdRoundRect(px, py, x0, y0, x1, y1, r) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const hw = (x1 - x0) / 2, hh = (y1 - y0) / 2;
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(ox, oy) - r;
}
function sdSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const wx = px - ax, wy = py - ay;
  const c1 = vx * wx + vy * wy;
  const c2 = vx * vx + vy * vy;
  const t = c2 <= 0 ? 0 : Math.max(0, Math.min(1, c1 / c2));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}
function inTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
  const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
  return !(hasNeg && hasPos);
}
const mix = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/* ---------- 渲染（2x 超采样） ---------- */
const SS = 2;
const CYAN = [53, 200, 245], VIOLET = [139, 124, 246], WHITE = [255, 255, 255];

function renderBase(size) {
  const W = size * SS, H = size * SS;
  const buf = Buffer.alloc(W * H * 4);
  const u = size / 1024;                    // 以 1024 为设计基准
  const rBg = 224 * u * SS;
  const mx0 = 224 * u * SS, my0 = 210 * u * SS, mx1 = 800 * u * SS, my1 = 590 * u * SS;
  const sw = 44 * u * SS;                   // 描边宽度
  const rMon = 48 * u * SS;
  const tri = [[470 * u * SS, 348 * u * SS], [585 * u * SS, 400 * u * SS], [470 * u * SS, 452 * u * SS]];
  const standX = 512 * u * SS, standTop = my1, standBot = 660 * u * SS;
  const baseY0 = 432 * u * SS, baseY1 = 592 * u * SS;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const dBg = sdRoundRect(x, y, 0, 0, W - 1, H - 1, rBg);
      if (dBg > 0) { buf[i + 3] = 0; continue; }

      /* 对角渐变底 */
      const t = (x / W) * 0.62 + (y / H) * 0.38;
      let col = mix(CYAN, VIOLET, t);

      /* 顶部微亮 */
      const lit = Math.max(0, 1 - y / (H * 0.55)) * 0.10;
      col = [col[0] + (255 - col[0]) * lit, col[1] + (255 - col[1]) * lit, col[2] + (255 - col[2]) * lit];

      /* 显示器描边（圆环） */
      const dOut = sdRoundRect(x, y, mx0, my0, mx1, my1, rMon);
      const dIn = sdRoundRect(x, y, mx0 + sw, my0 + sw, mx1 - sw, my1 - sw, Math.max(2, rMon - sw));
      if (dOut < 0 && dIn > 0) col = mix(col, WHITE, 0.97);

      /* 播放三角 */
      if (inTriangle(x, y, tri[0][0], tri[0][1], tri[1][0], tri[1][1], tri[2][0], tri[2][1])) {
        col = mix(col, WHITE, 0.97);
      }

      /* 支架 */
      if (sdSegment(x, y, standX, standTop, standX, standBot) <= sw / 2) col = mix(col, WHITE, 0.97);
      if (sdSegment(x, y, baseY0, standBot, baseY1, standBot) <= sw / 2) col = mix(col, WHITE, 0.97);

      buf[i] = col[0]; buf[i + 1] = col[1]; buf[i + 2] = col[2]; buf[i + 3] = 255;
    }
  }

  /* 盒式降采样回目标尺寸 */
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let dy = 0; dy < SS; dy++) for (let dx = 0; dx < SS; dx++) {
        const i = ((y * SS + dy) * W + (x * SS + dx)) * 4;
        r += buf[i]; g += buf[i + 1]; b += buf[i + 2]; a += buf[i + 3]; n++;
      }
      const o = (y * size + x) * 4;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = a / n;
    }
  }
  return out;
}

/* 区域平均缩放（源为 RGBA buffer） */
function areaAvg(src, sw, sh, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4);
  const xr = sw / dw, yr = sh / dh;
  for (let y = 0; y < dh; y++) {
    const y0 = y * yr, y1 = (y + 1) * yr;
    const iy0 = Math.floor(y0), iy1 = Math.min(sh, Math.ceil(y1));
    for (let x = 0; x < dw; x++) {
      const x0 = x * xr, x1 = (x + 1) * xr;
      const ix0 = Math.floor(x0), ix1 = Math.min(sw, Math.ceil(x1));
      let r = 0, g = 0, b = 0, a = 0, wsum = 0;
      for (let yy = iy0; yy < iy1; yy++) {
        const wy = Math.min(y1, yy + 1) - Math.max(y0, yy);
        for (let xx = ix0; xx < ix1; xx++) {
          const wx = Math.min(x1, xx + 1) - Math.max(x0, xx);
          const w = wx * wy; if (w <= 0) continue;
          const i = (yy * sw + xx) * 4;
          r += src[i] * w; g += src[i + 1] * w; b += src[i + 2] * w; a += src[i + 3] * w;
          wsum += w;
        }
      }
      const o = (y * dw + x) * 4;
      out[o] = r / wsum; out[o + 1] = g / wsum; out[o + 2] = b / wsum; out[o + 3] = a / wsum;
    }
  }
  return out;
}

/* ---------- 主流程 ---------- */
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.join(OUT, 'icons'), { recursive: true });

const base = renderBase(1024);
fs.writeFileSync(path.join(OUT, 'icon.png'), encodePNG(1024, 1024, base));
console.log('build/icon.png (1024x1024)');

for (const s of SIZES) {
  if (s === 1024) continue;
  const scaled = s === 512 ? base : areaAvg(base, 1024, 1024, s, s);
  fs.writeFileSync(path.join(OUT, 'icons', s + 'x' + s + '.png'), encodePNG(s, s, scaled));
}
console.log('build/icons/{16,32,48,64,128,256,512}x*.png');

const ico256 = encodePNG(256, 256, areaAvg(base, 1024, 1024, 256, 256));
fs.writeFileSync(path.join(OUT, 'icon.ico'), encodeICO(ico256, 256));
console.log('build/icon.ico (256x256 PNG entry)');
console.log('icons done');
