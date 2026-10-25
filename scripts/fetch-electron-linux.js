/* 下载 electron linux-x64 发行 zip 到 electron-dist/（供离线打包 deb） */
'use strict';
const https = require('https');
const fs = require('fs');
const path = require('path');

const VERSION = require('../node_modules/electron/package.json').version;
const OUT = path.join(__dirname, '..', 'electron-dist', 'electron-v' + VERSION + '-linux-x64.zip');

function get(url, depth, cb) {
  if (depth > 8) return cb(new Error('too many redirects'));
  https.get(url, res => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      res.resume();
      return get(res.headers.location, depth + 1, cb);
    }
    if (res.statusCode !== 200) { res.resume(); return cb(new Error('status ' + res.statusCode)); }
    const chunks = [];
    res.on('data', c => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  }).on('error', cb);
}

const url = 'https://npmmirror.com/mirrors/electron/' + VERSION + '/electron-v' + VERSION + '-linux-x64.zip';
console.log('downloading', url);
get(url, 0, (err, buf) => {
  if (err) { console.log('FAIL', err.message); process.exit(1); }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, buf);
  console.log('saved', OUT, buf.length, 'bytes');
});
