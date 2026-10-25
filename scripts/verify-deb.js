/* ============================================================
   MirrorPlay · deb 校验器
   解析 ar → control.tar.gz / data.tar.gz → tar 条目，
   校验头部 checksum、权限位、关键文件与 md5sums。
   用法：node scripts/verify-deb.js [deb 路径]
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const debPath = process.argv[2] || path.join(__dirname, '..', 'dist', 'MirrorPlay-1.0.0-linux-amd64.deb');
const buf = fs.readFileSync(debPath);
let fail = 0;
const ok = m => console.log('  ✓ ' + m);
const bad = m => { console.log('  ✗ ' + m); fail++; };

/* ---------- ar 解析 ---------- */
console.log('[1] ar 容器');
if (buf.slice(0, 8).toString('ascii') !== '!<arch>\n') { bad('ar magic 无效'); process.exit(1); }
ok('ar magic 有效');

const members = [];
let off = 8;
while (off + 60 <= buf.length) {
  const h = buf.slice(off, off + 60);
  const name = h.slice(0, 16).toString('ascii').trim();
  const size = parseInt(h.slice(48, 58).toString('ascii').trim(), 10);
  const fmag = h.slice(58, 60).toString('ascii');
  if (fmag !== '`\n') { bad('成员 ' + name + ' fmag 无效: ' + JSON.stringify(fmag)); break; }
  members.push({ name: name, size: size, data: buf.slice(off + 60, off + 60 + size) });
  off += 60 + size + (size % 2);
}
const names = members.map(m => m.name);
if (names.join(',') !== 'debian-binary,control.tar.gz,data.tar.gz') bad('成员列表异常: ' + names.join(','));
else ok('成员: ' + names.join(' | '));

const db = members.find(m => m.name === 'debian-binary');
if (db && db.data.toString().trim() === '2.0') ok('debian-binary = 2.0');
else bad('debian-binary 内容异常');

/* ---------- tar 解析 ---------- */
function parseTar(tarBuf) {
  const out = [];
  let o = 0;
  while (o + 512 <= tarBuf.length) {
    const h = tarBuf.slice(o, o + 512);
    if (h.every(b => b === 0)) break;
    const name = h.slice(0, 100).toString('utf8').replace(/\0.*$/, '');
    const mode = parseInt(h.slice(100, 108).toString('ascii').replace(/\0/g, '').trim(), 8);
    const size = parseInt(h.slice(124, 136).toString('ascii').replace(/\0/g, '').trim(), 8);
    const type = String.fromCharCode(h[156]);
    const linkname = h.slice(157, 257).toString('utf8').replace(/\0.*$/, '');
    /* 校验 checksum */
    const stored = parseInt(h.slice(148, 156).toString('ascii').replace(/\0/g, '').trim(), 8);
    const tmp = Buffer.from(h);
    tmp.fill(0x20, 148, 156);
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += tmp[i];
    const chkOk = sum === stored;
    const data = type === '0' ? tarBuf.slice(o + 512, o + 512 + size) : null;
    out.push({ name: name, mode: mode, size: size, type: type, linkname: linkname, chkOk: chkOk, data: data });
    o += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}

console.log('[2] control.tar.gz');
const ctl = members.find(m => m.name === 'control.tar.gz');
const ctlEntries = parseTar(zlib.gunzipSync(ctl.data));
if (ctlEntries.every(e => e.chkOk)) ok('tar 头部 checksum 全部正确（' + ctlEntries.length + ' 条目）');
else bad('存在 checksum 错误的条目');
const control = ctlEntries.find(e => e.name === './control');
if (!control) { bad('缺少 control'); process.exit(1); }
const controlTxt = control.data.toString('utf8');
console.log(controlTxt.split('\n').map(l => '    ' + l).join('\n'));
for (const need of ['Package: mirrorplay', 'Architecture: amd64', 'Depends: libgtk-3-0']) {
  if (controlTxt.includes(need)) ok('control 含 ' + need);
  else bad('control 缺少 ' + need);
}
const postinst = ctlEntries.find(e => e.name === './postinst');
if (postinst && (postinst.mode & 0o111)) ok('postinst 存在且可执行');
else bad('postinst 缺失或不可执行');

console.log('[3] data.tar.gz');
const dat = members.find(m => m.name === 'data.tar.gz');
const dataEntries = parseTar(zlib.gunzipSync(dat.data));
if (dataEntries.every(e => e.chkOk)) ok('tar 头部 checksum 全部正确（' + dataEntries.length + ' 条目）');
else bad('存在 checksum 错误的条目: ' + dataEntries.filter(e => !e.chkOk).map(e => e.name).join(','));

const byName = n => dataEntries.find(e => e.name === n);
const checks = [
  ['./usr/bin/mirrorplay', 0o755],
  ['./usr/share/applications/mirrorplay.desktop', 0o644],
  ['./opt/MirrorPlay/mirrorplay', 0o755],
  ['./opt/MirrorPlay/chrome-sandbox', 0o4755],
  ['./opt/MirrorPlay/icudtl.dat', 0o644],
  ['./opt/MirrorPlay/resources/app.asar', 0o644],
  ['./usr/share/icons/hicolor/256x256/apps/mirrorplay.png', 0o644],
  ['./usr/share/icons/hicolor/512x512/apps/mirrorplay.png', 0o644],
];
for (const [n, wantMode] of checks) {
  const e = byName(n);
  if (!e) { bad('缺少 ' + n); continue; }
  if (e.mode !== wantMode) { bad(n + ' 权限 ' + e.mode.toString(8) + '，期望 ' + wantMode.toString(8)); continue; }
  ok(n + '  权限 ' + e.mode.toString(8) + '  ' + (e.size / 1024).toFixed(0) + ' KB');
}

/* asar 内容抽查：头部 JSON 应包含应用入口文件 */
const asar = byName('./opt/MirrorPlay/resources/app.asar');
if (asar) {
  const head = asar.data.toString('latin1');
  const needs = ['index.html', 'js/app.js', 'css/style.css', 'js/sim.js', 'js/editor.js'];
  const miss = needs.filter(x => !head.includes(x));
  if (miss.length === 0) ok('app.asar 包含应用文件（index.html / js / css）');
  else bad('app.asar 缺少: ' + miss.join(', '));
} else bad('app.asar 不存在');

/* md5sums 一致性 */
const md5e = ctlEntries.find(e => e.name === './md5sums');
if (md5e) {
  const lines = md5e.data.toString('utf8').trim().split('\n');
  let md5Fail = 0;
  for (const line of lines) {
    const m = line.match(/^([0-9a-f]{32})\s+(.+)$/);
    if (!m) continue;
    const e = byName('./' + m[2]);
    if (!e) { md5Fail++; continue; }
    const actual = crypto.createHash('md5').update(e.data).digest('hex');
    if (actual !== m[1]) md5Fail++;
  }
  if (md5Fail === 0) ok('md5sums 全部一致（' + lines.length + ' 条）');
  else bad(md5Fail + ' 条 md5 不匹配');
} else bad('缺少 md5sums');

/* 目录条目完整性 */
const needDirs = ['./opt/', './opt/MirrorPlay/', './usr/', './usr/bin/', './usr/share/', './usr/share/applications/', './usr/share/icons/', './usr/share/icons/hicolor/'];
for (const d of needDirs) {
  const e = byName(d);
  if (e && e.type === '5') ok('目录 ' + d);
  else bad('目录缺失或类型错误 ' + d);
}

console.log('');
console.log(fail === 0 ? 'VERIFY_OK —— deb 结构有效' : 'VERIFY_FAILED —— ' + fail + ' 个问题');
process.exit(fail === 0 ? 0 : 1);
