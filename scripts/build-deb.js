/* ============================================================
   MirrorPlay · Linux deb 打包器（纯 Node，无需 fpm/dpkg）
   输入：dist/linux-unpacked（由 electron-builder --linux dir 产出）
   输出：dist/MirrorPlay-<version>-linux-amd64.deb
   用法：node scripts/build-deb.js
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SRC = path.join(DIST, 'linux-unpacked');
const ICONS = path.join(ROOT, 'build', 'icons');
const VERSION = require(path.join(ROOT, 'package.json')).version;
const EXEC = ((require(path.join(ROOT, 'package.json')).build || {}).linux || {}).executableName || 'mirrorplay';
const OUT_DEB = path.join(DIST, 'MirrorPlay-' + VERSION + '-linux-amd64.deb');
const FIXED_MTIME = 1735689600; // 2025-01-01，保证可复现

if (!fs.existsSync(SRC)) {
  console.error('[deb] dist/linux-unpacked 不存在。请先执行: npx electron-builder --linux dir --x64');
  process.exit(1);
}

/* ================= tar 写入器（ustar 格式） ================= */
function octal(n, len) { return n.toString(8).padStart(len - 1, '0') + '\0'; }

function tarHeader(name, opt) {
  const h = Buffer.alloc(512);
  h.write(name, 0, 100, 'utf8');
  h.write(octal(opt.mode, 8), 100, 8, 'ascii');
  h.write(octal(opt.uid || 0, 8), 108, 8, 'ascii');
  h.write(octal(opt.gid || 0, 8), 116, 8, 'ascii');
  h.write(octal(opt.size || 0, 12), 124, 12, 'ascii');
  h.write(octal(opt.mtime || 0, 12), 136, 12, 'ascii');
  h.fill(0x20, 148, 156);                                   // chksum 位先填空格
  h.write(opt.type, 156, 1, 'ascii');
  h.write(opt.linkname || '', 157, 100, 'utf8');
  h.write('ustar\0', 257, 6, 'ascii');
  h.write('00', 263, 2, 'ascii');
  h.write('root', 265, 32, 'utf8');
  h.write('root', 297, 32, 'utf8');
  h.write(octal(0, 8), 329, 8, 'ascii');
  h.write(octal(0, 8), 337, 8, 'ascii');
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += h[i];
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
  return h;
}

function pad512(buf) {
  const r = buf.length % 512;
  return r === 0 ? buf : Buffer.concat([buf, Buffer.alloc(512 - r)]);
}

function tar(entries) {
  const blocks = [];
  for (const e of entries) {
    const data = e.type === 'file' ? pad512(e.data) : null;
    blocks.push(tarHeader(e.name, {
      mode: e.mode, size: e.type === 'file' ? e.data.length : 0, mtime: FIXED_MTIME,
      type: e.type === 'dir' ? '5' : e.type === 'symlink' ? '2' : '0',
      linkname: e.linkname || '',
    }));
    if (data) blocks.push(data);
  }
  blocks.push(Buffer.alloc(1024));
  return Buffer.concat(blocks);
}

/* ================= ar 写入器（.deb 容器） ================= */
function arMember(name, data) {
  const h = Buffer.alloc(60);
  h.write(name.padEnd(16), 0, 16, 'ascii');
  h.write(String(FIXED_MTIME).padStart(12), 16, 12, 'ascii');
  h.write('0'.padStart(6), 28, 6, 'ascii');
  h.write('0'.padStart(6), 34, 6, 'ascii');
  h.write('100644'.padStart(8), 40, 8, 'ascii');
  h.write(String(data.length).padStart(10), 48, 10, 'ascii');
  h.write('`\n', 58, 2, 'ascii');
  const pad = data.length % 2 === 1 ? Buffer.from('\n') : Buffer.alloc(0);
  return Buffer.concat([h, data, pad]);
}

/* ================= 收集 data 文件树 ================= */
const dirs = new Set(['./']);
const files = [];   // { arc, data, mode }

function addDir(arc) {
  arc = arc.endsWith('/') ? arc : arc + '/';
  dirs.add(arc);
  /* 逐级补齐父目录条目（dpkg 要求目录链完整） */
  const parts = arc.replace(/^\.\//, '').split('/').filter(Boolean);
  let p = './';
  for (const part of parts) {
    p += part + '/';
    dirs.add(p);
  }
}
function addFile(abs, arc, mode, dataOverride) {
  files.push({ arc: arc, data: dataOverride != null ? dataOverride : fs.readFileSync(abs), mode: mode });
}

/* 1) Electron 运行时 → /opt/MirrorPlay */
function walk(dir, prefix) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    const arc = prefix + ent.name;
    if (ent.isDirectory()) {
      addDir(arc);
      walk(abs, arc + '/');
    } else if (ent.isFile()) {
      let mode = 0o644;
      if (ent.name === EXEC || ent.name === 'chrome_crashpad_handler') mode = 0o755;
      if (ent.name === 'chrome-sandbox') mode = 0o4755;    // SUID，沙箱必需
      addFile(abs, arc, mode);
    }
  }
}
walk(SRC, './opt/MirrorPlay/');

/* 2) 启动包装 → /usr/bin/mirrorplay */
addDir('./usr/bin/');
addFile(null, './usr/bin/mirrorplay', 0o755, Buffer.from(
  '#!/bin/sh\n' +
  '# MirrorPlay 启动器\n' +
  'APP=/opt/MirrorPlay\n' +
  'if [ -f "$APP/resources/app.asar" ]; then\n' +
  '  exec "$APP/' + EXEC + '" "$APP/resources/app.asar" "$@"\n' +
  'fi\n' +
  'exec "$APP/' + EXEC + '" "$APP/resources/app" "$@"\n', 'utf8'));

/* 3) 桌面入口 */
addDir('./usr/share/applications/');
addFile(null, './usr/share/applications/mirrorplay.desktop', 0o644, Buffer.from(
  '[Desktop Entry]\n' +
  'Type=Application\n' +
  'Name=MirrorPlay\n' +
  'Name[zh_CN]=MirrorPlay 免会员手游投屏\n' +
  'Comment=USB 手游投屏 + 键鼠映射\n' +
  'Comment[zh_CN]=USB 有线投屏，完整键鼠映射，永久免费\n' +
  'Exec=/usr/bin/mirrorplay %U\n' +
  'Icon=mirrorplay\n' +
  'Terminal=false\n' +
  'Categories=Game;Utility;\n' +
  'Keywords=android;mirror;scrcpy;keymap;投屏;\n' +
  'StartupWMClass=MirrorPlay\n', 'utf8'));

/* 4) hicolor 图标 */
for (const s of [16, 32, 48, 64, 128, 256, 512]) {
  const src = path.join(ICONS, s + 'x' + s + '.png');
  if (!fs.existsSync(src)) continue;
  addDir('./usr/share/icons/hicolor/' + s + 'x' + s + '/apps');
  addFile(src, './usr/share/icons/hicolor/' + s + 'x' + s + '/apps/mirrorplay.png', 0o644);
}

/* ================= control / postinst / md5sums ================= */
const installedKB = Math.ceil(files.reduce((n, f) => n + f.data.length, 0) / 1024);

const control =
  'Package: mirrorplay\n' +
  'Version: ' + VERSION + '\n' +
  'Section: games\n' +
  'Priority: optional\n' +
  'Architecture: amd64\n' +
  'Depends: libgtk-3-0, libnotify4, libnss3, libxss1, libxtst6, libatspi2.0-0, libuuid1, libsecret-1-0, libasound2, xdg-utils\n' +
  'Maintainer: MirrorPlay Team <noreply@mirrorplay.app>\n' +
  'Installed-Size: ' + installedKB + '\n' +
  'Homepage: https://mirrorplay.app\n' +
  'Description: MirrorPlay - free mobile game mirroring with keyboard/mouse mapping\n' +
  ' MirrorPlay mirrors your Android phone to PC over USB (scrcpy protocol,\n' +
  ' phone-side zero install, no root) and lets you play mobile games with\n' +
  ' keyboard and mouse. Complete mapping engine: virtual joystick, crosshair\n' +
  ' view control, fire/macro/smart-cast. All free - no membership, no\n' +
  ' watermark, no ads, no account.\n';

const postinst =
  '#!/bin/sh\n' +
  'set -e\n' +
  'if [ "$1" = "configure" ]; then\n' +
  '    update-desktop-database -q /usr/share/applications 2>/dev/null || true\n' +
  '    gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor 2>/dev/null || true\n' +
  'fi\n' +
  'exit 0\n';

const md5sums = files.map(f => crypto.createHash('md5').update(f.data).digest('hex') + '  ' + f.arc.replace(/^\.\//, '')).join('\n') + '\n';

const controlEntries = [
  { name: './', type: 'dir', mode: 0o755 },
  { name: './control', type: 'file', data: Buffer.from(control), mode: 0o644 },
  { name: './postinst', type: 'file', data: Buffer.from(postinst), mode: 0o755 },
  { name: './md5sums', type: 'file', data: Buffer.from(md5sums), mode: 0o644 },
];

/* ================= data.tar ================= */
const dataEntries = [
  { name: './', type: 'dir', mode: 0o755 },
  ...[...dirs].filter(d => d !== './').sort().map(d => ({ name: d, type: 'dir', mode: 0o755 })),
  ...files.sort((a, b) => a.arc.localeCompare(b.arc)).map(f => ({ name: f.arc, type: 'file', data: f.data, mode: f.mode })),
];

const controlTarGz = zlib.gzipSync(tar(controlEntries), { level: 9 });
const dataTarGz = zlib.gzipSync(tar(dataEntries), { level: 6 });

const deb = Buffer.concat([
  Buffer.from('!<arch>\n'),
  arMember('debian-binary', Buffer.from('2.0\n')),
  arMember('control.tar.gz', controlTarGz),
  arMember('data.tar.gz', dataTarGz),
]);

fs.writeFileSync(OUT_DEB, deb);
console.log('[deb] 已生成 ' + OUT_DEB);
console.log('[deb] 大小 ' + (deb.length / 1024 / 1024).toFixed(1) + ' MB · 文件 ' + files.length + ' 个 · 安装体积 ' + installedKB + ' KB');
