/* ============================================================
   MirrorPlay · 通过 GitHub Git Data API 推送代码
   （github.com 的 git 端点在本机被网络阻断时，改走 api.github.com：
     blob → tree → commit → ref，等价于 git push）
   用法：node scripts/gh-push-api.js [owner/repo]
   ============================================================ */
'use strict';

const https = require('https');
const fs = require('fs');
const { execSync } = require('child_process');

const repoArg = process.argv[2] || 'yangyixuan790/MirrorPlay';
const [OWNER, REPO] = repoArg.split('/');
const TOKEN = execSync('gh auth token').toString().trim();
const BRANCH = 'main';

function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      host: 'api.github.com',
      method: method,
      path: path,
      timeout: 120000,
      headers: {
        'Authorization': 'token ' + TOKEN,
        'User-Agent': 'MirrorPlay-API-Push',
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'Content-Length': data ? Buffer.byteLength(data) : 0,
      },
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const txt = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(txt); } catch (e) { /* keep raw */ }
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(json || txt);
        else reject(new Error(method + ' ' + path + ' -> ' + res.statusCode + ' ' + txt.slice(0, 300)));
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout ' + method + ' ' + path)); });
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  /* 1. 收集 git 追踪的文件 */
  const files = execSync('git ls-files').toString().trim().split('\n').filter(Boolean);
  console.log('[push] ' + files.length + ' 个文件待推送');

  /* 2. 创建 blobs */
  const tree = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const content = fs.readFileSync(f).toString('base64');
    const blob = await api('POST', '/repos/' + OWNER + '/' + REPO + '/git/blobs', { content: content, encoding: 'base64' });
    tree.push({ path: f.replace(/\\/g, '/'), mode: '100644', type: 'blob', sha: blob.sha });
    if ((i + 1) % 10 === 0 || i === files.length - 1) console.log('[push] blobs ' + (i + 1) + '/' + files.length);
  }

  /* 3. 创建 tree */
  const t = await api('POST', '/repos/' + OWNER + '/' + REPO + '/git/trees', { tree: tree });
  console.log('[push] tree ' + t.sha);

  /* 4. 创建 commit（沿用本地提交信息） */
  const msg = execSync('git log -1 --format=%B').toString().trim();
  const name = execSync('git log -1 --format=%an').toString().trim();
  const email = execSync('git log -1 --format=%ae').toString().trim();
  const c = await api('POST', '/repos/' + OWNER + '/' + REPO + '/git/commits', {
    message: msg,
    tree: t.sha,
    author: { name: name, email: email },
  });
  console.log('[push] commit ' + c.sha);

  /* 5. 创建/更新 ref */
  try {
    await api('POST', '/repos/' + OWNER + '/' + REPO + '/git/refs', { ref: 'refs/heads/' + BRANCH, sha: c.sha });
    console.log('[push] ref refs/heads/' + BRANCH + ' 已创建');
  } catch (e) {
    if (/already exists/.test(e.message)) {
      await api('PATCH', '/repos/' + OWNER + '/' + REPO + '/git/refs/heads/' + BRANCH, { sha: c.sha, force: true });
      console.log('[push] ref refs/heads/' + BRANCH + ' 已更新');
    } else throw e;
  }

  console.log('[push] 完成 → https://github.com/' + OWNER + '/' + REPO);
})().catch(e => { console.error('[push] 失败:', e.message); process.exit(1); });
