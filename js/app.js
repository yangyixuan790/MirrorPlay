/* ============================================================
   MirrorPlay · 应用逻辑：状态 / 导航 / 设备 / 设置 / 预设 / 交互
   ============================================================ */
'use strict';

const App = {
  page: 'cast',
  mapping: null,
  devices: [],
  activeDevice: null,
  quality: 'balanced',
  fill: 'contain',
  audioBuffer: 40,
  osd: { crosshair: true, stats: true },
  captureCb: null,
  modalOpen: false,
  saveTimer: null,
};

const LS_KEY = 'mirrorplay.prototype.v1';

/* ---------- 持久化 ---------- */
App.load = function () {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    if (s.mapping && Array.isArray(s.mapping.items)) App.mapping = normalizeKeymap(s.mapping);
    if (s.quality) App.quality = s.quality;
    if (s.fill) App.fill = s.fill;
    if (s.audioBuffer) App.audioBuffer = s.audioBuffer;
    if (s.osd) App.osd = Object.assign(App.osd, s.osd);
    return true;
  } catch (err) { return false; }
};
App.autosave = function () {
  clearTimeout(App.saveTimer);
  App.saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        mapping: App.mapping, quality: App.quality, fill: App.fill,
        audioBuffer: App.audioBuffer, osd: App.osd,
      }));
    } catch (err) {}
  }, 400);
};

/* ---------- Toast ---------- */
App.toast = function (msg, type) {
  const box = document.getElementById('toasts');
  const t = document.createElement('div');
  t.className = 'toast ' + (type || 'info');
  const ic = type === 'ok' ? 'check' : type === 'err' ? 'alert' : type === 'warn' ? 'alert' : 'info';
  t.innerHTML = icon(ic, 15) + '<span>' + msg + '</span>';
  box.appendChild(t);
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 320);
  }, 2600);
};

/* ---------- 模态框 ---------- */
App.openModal = function (opts) {
  App.closeModal();
  const root = document.getElementById('modal-root');
  const back = document.createElement('div');
  back.className = 'modal-back';
  const actions = (opts.actions || [{ label: '知道了', primary: true }]).map((a, i) =>
    '<button class="btn ' + (a.primary ? 'btn-primary' : '') + '" data-i="' + i + '">' + a.label + '</button>').join('');
  back.innerHTML =
    '<div class="modal">' +
    '<div class="modal-head"><h2>' + icon(opts.icon || 'info', 18) + opts.title + '</h2>' +
    '<button class="btn btn-icon" data-close="1">' + icon('x', 13) + '</button></div>' +
    '<div class="modal-body">' + opts.body + '</div>' +
    '<div class="modal-foot">' + actions + '</div></div>';
  root.appendChild(back);
  App.modalOpen = true;
  back.addEventListener('click', e => {
    if (e.target === back) { App.closeModal(); return; }
    if (e.target.closest('[data-close]')) { App.closeModal(); return; }
    const btn = e.target.closest('[data-i]');
    if (btn) {
      const a = (opts.actions || [])[parseInt(btn.dataset.i, 10)];
      if (a && a.onClick) a.onClick();
      if (!a || a.close !== false) App.closeModal();
    }
  });
};
App.closeModal = function () {
  document.getElementById('modal-root').innerHTML = '';
  App.modalOpen = false;
};

/* ---------- 新手引导 ---------- */
App.showGuide = function () {
  const steps = [
    ['插入数据线', '使用<strong>支持数据传输</strong>的 USB 线连接手机与电脑，优先插 USB 3.0 口（延迟 40~70ms，USB 2.0 会升到 80~150ms）。'],
    ['开启 USB 调试', '设置 → 关于手机 → 连点版本号 7 次 → 开发者选项 → 打开 USB 调试。部分小米/红米还需额外开「USB 调试（安全设置）」才能注入点击。'],
    ['授权连接', '手机上弹出授权框时勾选<strong>「一律允许」</strong>再点允许。检测不到设备时，按「线材 / 未授权 / 驱动」三步排查。'],
    ['选择画质', '右侧选画质档位：流畅 720P / 均衡 1080P60 / 高清 / 超清 120Hz。编码器自动实测挑选 H.265 → H.264 → AV1。'],
    ['开玩', '到预设库一键套用游戏键位，按 <kbd>~</kbd> 切换映射模式 / 普通触控模式。键位编辑器里拖拽即改，实时试玩。'],
  ];
  App.openModal({
    icon: 'info', title: '五步上手',
    body: '<div class="guide-steps">' + steps.map((s, i) =>
      '<div class="guide-step"><div class="guide-num">' + (i + 1) + '</div><div><b>' + s[0] + '</b><span>' + s[1] + '</span></div></div>').join('') + '</div>',
    actions: [{ label: '开始使用', primary: true }],
  });
};

/* ---------- 合规声明 ---------- */
App.showAbout = function () {
  App.openModal({
    icon: 'check', title: '合规与承诺',
    body:
      '<p><strong>产品承诺</strong>：永不设会员墙、永不加水印、永不加广告、永不上传用户数据。全程本地 USB 直连，不经过任何服务器，无账号体系。</p>' +
      '<p><strong>技术立场</strong>：基于 scrcpy 协议（Apache-2.0）自研 GUI 与键鼠映射层；手机端零安装、免 root，退出即清理临时文件。</p>' +
      '<p><strong>反外挂红线</strong>：本工具仅做<strong>输入设备转换</strong>——把键鼠事件翻译成触摸事件。不提供自动瞄准、自动压枪、透视、自动打怪、协议破解、内存修改等任何作弊功能；映射引擎在架构上接触不到视频帧。用户因违规操作导致的封号责任自负。</p>' +
      '<p><strong>内容保护</strong>：部分 App 设置 FLAG_SECURE 防截屏，请尊重其内容保护与版权，请勿以此规避。</p>',
    actions: [{ label: '我已知晓', primary: true }],
  });
};

/* ---------- 设备 ---------- */
App.initDevices = function () {
  App.devices = [
    { id: 'd1', name: '小米 14', model: '23127PN0CC', android: 'Android 14', res: '2676×1200', usb: 'USB 3.0', encoder: 'H.265', status: 'connected' },
    { id: 'd2', name: 'Redmi K70', model: '2311DRK48C', android: 'Android 14', res: '3200×1440', usb: 'USB 2.0', encoder: 'H.265', status: 'unauthorized' },
    { id: 'd3', name: '一加 12', model: 'PJD110', android: 'Android 15', res: '3168×1440', usb: '—', encoder: 'H.265', status: 'offline' },
  ];
  App.activeDevice = 'd1';
};

App.renderDevices = function () {
  const box = document.getElementById('dev-list');
  box.innerHTML = '';
  for (const d of App.devices) {
    const el = document.createElement('button');
    el.className = 'dev' + (d.id === App.activeDevice ? ' active' : '');
    const statusMap = {
      connected: ['on', d.usb],
      unauthorized: ['wait', '未授权'],
      connecting: ['wait', '连接中'],
      offline: ['off', '离线'],
    };
    const [dot, tag] = statusMap[d.status] || ['off', ''];
    el.innerHTML =
      '<span class="dev-icon">' + icon('phone', 17) + '</span>' +
      '<span class="dev-meta"><span class="dev-name">' + d.name + '</span><br><span class="dev-sub">' + d.model + ' · ' + d.android + '</span></span>' +
      '<span class="dev-status"><span class="dot ' + dot + '"></span><span class="dev-tag">' + tag + '</span></span>';
    el.addEventListener('click', () => App.onDeviceClick(d));
    box.appendChild(el);
  }
  const n = App.devices.filter(d => d.status === 'connected').length;
  document.getElementById('sb-conn').textContent = '已连接 ' + n + ' 台';
  const act = App.activeDevice ? App.devices.find(d => d.id === App.activeDevice) : null;
  const chip = document.getElementById('tb-device-chip');
  if (act && act.status === 'connected') {
    chip.textContent = act.name + ' · ' + act.usb;
    chip.className = 'chip chip-accent';
    document.getElementById('cast-device-name').textContent = act.name + ' · ' + act.android + ' · ' + act.res;
    document.getElementById('sb-usb').textContent = act.usb;
  } else {
    chip.textContent = '未连接设备';
    chip.className = 'chip';
    document.getElementById('cast-device-name').textContent = '未连接';
    document.getElementById('sb-usb').textContent = 'USB —';
  }
  App.renderDeviceInfo();
};

App.renderDeviceInfo = function () {
  const dl = document.getElementById('panel-dev-info');
  const d = App.activeDevice ? App.devices.find(x => x.id === App.activeDevice) : null;
  if (!d) { dl.innerHTML = '<dt>状态</dt><dd>未连接</dd>'; return; }
  dl.innerHTML =
    '<dt>型号</dt><dd>' + d.name + '</dd>' +
    '<dt>系统</dt><dd>' + d.android + '</dd>' +
    '<dt>分辨率</dt><dd>' + d.res + '</dd>' +
    '<dt>接口</dt><dd>' + d.usb + '</dd>' +
    '<dt>编码器</dt><dd>' + d.encoder + '</dd>' +
    '<dt>注入</dt><dd>' + (App.mapping.settings.injectHz || 120) + ' Hz</dd>';
};

App.onDeviceClick = function (d) {
  if (d.status === 'connected') {
    App.activeDevice = d.id;
    App.renderDevices();
    App.toast('已切换投屏目标：' + d.name, 'ok');
  } else if (d.status === 'unauthorized') {
    App.openModal({
      icon: 'alert', title: 'USB 调试授权',
      body: '<p>是否允许这台计算机进行 USB 调试？</p><p style="font-family:Consolas,monospace;font-size:12px;color:var(--text-faint)">RSA 指纹：9a:3f:c2:11:8b:d4:…:e7:02</p>' +
        '<p style="font-size:12px">勾选「一律允许」后，下次插线自动连接，无需重复授权。</p>',
      actions: [
        { label: '拒绝', onClick: () => App.toast('已拒绝授权，设备无法连接', 'warn') },
        {
          label: '一律允许', primary: true, onClick: () => {
            d.status = 'connected';
            App.activeDevice = d.id;
            App.renderDevices();
            App.toast(d.name + ' 已连接 · 自动还原上次映射脚本', 'ok');
          },
        },
      ],
    });
  } else if (d.status === 'offline') {
    d.status = 'connecting';
    App.renderDevices();
    App.toast('正在连接 ' + d.name + '…', 'info');
    setTimeout(() => {
      d.status = 'connected';
      App.renderDevices();
      App.toast(d.name + ' 已插入并连接', 'ok');
    }, 1300);
  }
};

App.addMockDevice = function () {
  const used = App.devices.map(d => d.name);
  const pool = DEVICE_POOL.filter(d => !used.includes(d.name));
  if (!pool.length) { App.toast('模拟设备已全部插入', 'warn'); return; }
  const p = pool[Math.floor(Math.random() * pool.length)];
  const d = Object.assign({}, p, { id: 'd' + Date.now(), status: 'connecting' });
  App.devices.push(d);
  App.renderDevices();
  App.toast('检测到设备插入：' + d.name, 'info');
  setTimeout(() => {
    d.status = 'connected';
    App.renderDevices();
    App.toast(d.name + ' 连接成功（' + d.usb + '）', 'ok');
  }, 1400);
};

/* ---------- 画质 ---------- */
App.renderQuality = function () {
  const seg = document.getElementById('quality-seg');
  const list = document.getElementById('quality-list');
  seg.innerHTML = '';
  list.innerHTML = '';
  for (const q of QUALITY_TIERS) {
    const b = document.createElement('button');
    b.textContent = q.name;
    b.className = q.id === App.quality ? 'active' : '';
    b.addEventListener('click', () => App.setQuality(q.id));
    seg.appendChild(b);

    const item = document.createElement('button');
    item.className = 'q-item' + (q.id === App.quality ? ' active' : '');
    item.innerHTML = '<span class="q-name">' + q.name + '</span><span class="q-desc">' + q.res + ' · ' + q.fps + 'fps · ' + q.br + 'bps</span><span></span><span class="q-desc">' + q.desc + '</span>';
    item.addEventListener('click', () => App.setQuality(q.id));
    list.appendChild(item);
  }
  App.updateStageMeta();
};

App.setQuality = function (id) {
  App.quality = id;
  document.querySelectorAll('#quality-seg button').forEach((b, i) => b.classList.toggle('active', QUALITY_TIERS[i].id === id));
  document.querySelectorAll('#quality-list .q-item').forEach((b, i) => b.classList.toggle('active', QUALITY_TIERS[i].id === id));
  App.updateStageMeta();
  App.autosave();
  const q = QUALITY_TIERS.find(x => x.id === id);
  App.toast('画质：' + q.name + ' · ' + q.res + ' · ' + q.fps + 'fps · ' + q.br + 'bps', 'ok');
};

App.updateStageMeta = function () {
  const q = QUALITY_TIERS.find(x => x.id === App.quality);
  const el = document.getElementById('stage-meta-cast');
  el.innerHTML =
    '<span class="meta-chip">目标 <b>' + q.res + ' · ' + q.fps + 'fps</b></span>' +
    '<span class="meta-chip">码率 <b>' + q.br + 'bps</b></span>' +
    '<span class="meta-chip">解码 <b>D3D11VA 硬解</b></span>' +
    '<span class="meta-chip">编码 <b>H.265</b></span>' +
    '<span class="meta-chip">注入 <b>' + (App.mapping.settings.injectHz || 120) + 'Hz</b></span>' +
    '<span class="meta-chip">缓冲 <b>0（丢旧保新）</b></span>';
};

/* ---------- 页面切换 ---------- */
App.setPage = function (p) {
  App.page = p;
  document.querySelectorAll('.page').forEach(el => el.classList.toggle('active', el.id === 'page-' + p));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === p));
  document.getElementById('panel-cast').hidden = p !== 'cast';
  document.getElementById('panel-editor').hidden = p !== 'editor';
  if (p === 'cast' || p === 'editor') App.rebindSim();
  if (p === 'editor') {
    Editor.renderProps();
    Editor.renderConflicts();
    Editor.renderInfo();
  }
  if (p === 'presets') App.renderPresets();
};

App.rebindSim = function () {
  const isCast = App.page === 'cast';
  const canvas = document.getElementById(isCast ? 'screen-cast' : 'screen-editor');
  Sim.mode = isCast ? 'cast' : 'editor';
  Sim.bind(canvas, isCast ? (20 / 9) : Editor.ratio);
  if (!isCast) Editor.attach(canvas);
  App.syncSimLive();
  App.fitCanvas();
};

App.syncSimLive = function () {
  Sim.playtest = App.page === 'editor' && !Editor.frozen;
};

App.fitCanvas = function () {
  if (!Sim.canvas) return;
  const stage = document.getElementById(Sim.mode === 'cast' ? 'stage-cast' : 'stage-editor');
  if (!stage) return;
  const aw = stage.clientWidth - 44, ah = stage.clientHeight - 44;
  if (aw <= 0 || ah <= 0) return;
  const scale = Math.min(aw / Sim.W, ah / Sim.H);
  Sim.canvas.style.width = Math.floor(Sim.W * scale) + 'px';
  Sim.canvas.style.height = Math.floor(Sim.H * scale) + 'px';
};

/* ---------- 映射模式 ---------- */
App.toggleMappingMode = function () {
  const on = !Sim.mappingOn;
  Sim.setMappingMode(on);
  const btn = document.getElementById('btn-mode');
  btn.classList.toggle('on', on);
  btn.classList.toggle('off', !on);
  document.getElementById('btn-mode-text').textContent = on ? '映射模式' : '普通触控';
  const osd = document.getElementById('osd-mode');
  osd.textContent = on ? '映射模式 · ~' : '普通触控 · ~';
  osd.classList.toggle('touch', !on);
  const sb = document.getElementById('sb-mode');
  sb.textContent = on ? '映射' : '触控';
  sb.className = on ? 'ok' : '';
  App.toast(on ? '映射模式已开启 · 键鼠操作实时生效' : '已切回普通触控模式 · 映射暂停', on ? 'ok' : 'info');
};

/* ---------- 按键捕获 ---------- */
App.armKeyCapture = function (cb) {
  App.disarmKeyCapture();
  App.captureCb = cb;
  App.toast('请按下要绑定的按键（Esc 取消）…', 'info');
  document.addEventListener('pointerdown', App._capMouse, true);
  document.querySelectorAll('.keycap-btn.arming').forEach(b => b.classList.remove('arming'));
  const active = document.activeElement;
  if (active && active.classList && active.classList.contains('keycap-btn')) active.classList.add('arming');
};
App.disarmKeyCapture = function () {
  App.captureCb = null;
  document.removeEventListener('pointerdown', App._capMouse, true);
  document.querySelectorAll('.keycap-btn.arming').forEach(b => b.classList.remove('arming'));
};
App._capMouse = function (e) {
  if (!App.captureCb) return;
  e.preventDefault();
  e.stopPropagation();
  const code = e.button === 0 ? 'MouseLeft' : e.button === 2 ? 'MouseRight' : e.button === 1 ? 'MouseMiddle' : 'Mouse4';
  const cb = App.captureCb;
  App.disarmKeyCapture();
  cb(code);
};

/* ---------- 设置页 ---------- */
App.bindSettings = function () {
  const S = () => App.mapping.settings;
  const range = (id, valId, fmt, apply) => {
    const r = document.getElementById(id);
    const v = document.getElementById(valId);
    const paint = () => {
      v.textContent = fmt(parseFloat(r.value));
      r.style.setProperty('--fill', (r.value - r.min) / (r.max - r.min) * 100 + '%');
    };
    r.addEventListener('input', () => { paint(); apply(parseFloat(r.value)); App.autosave(); });
    paint();
  };
  range('set-sens', 'set-sens-val', v => v.toFixed(2), v => { S().mouseSensitivity = v; });
  range('set-accel', 'set-accel-val', v => v.toFixed(2), v => { S().mouseAccel = v; });
  range('set-dead', 'set-dead-val', v => v.toFixed(2), v => { S().steeringDeadzone = v; });
  range('set-audiobuf', 'set-audiobuf-val', v => v + ' ms', v => { App.audioBuffer = v; App.syncPanelAudio(); });

  const sw = document.getElementById('set-switchkey');
  const paintSw = () => { sw.textContent = keyLabel(S().switchKey); };
  sw.addEventListener('click', () => {
    App.armKeyCapture(code => { S().switchKey = code; paintSw(); App.autosave(); App.toast('模式切换键已设为 ' + keyLabel(code), 'ok'); });
  });
  paintSw();

  const hz = document.getElementById('set-hz');
  hz.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    hz.querySelectorAll('button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    S().injectHz = parseInt(b.dataset.v, 10);
    document.getElementById('sb-hz').textContent = S().injectHz + ' Hz';
    App.updateStageMeta();
    App.renderDeviceInfo();
    App.autosave();
  }));

  const fill = document.getElementById('set-fill');
  fill.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    fill.querySelectorAll('button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    App.fill = b.dataset.v;
    App.autosave();
  }));

  document.getElementById('set-codec').addEventListener('change', e => App.toast('编码偏好：' + e.target.options[e.target.selectedIndex].text, 'info'));
  document.getElementById('set-audiosrc').addEventListener('change', e => App.toast('音源已切换：' + e.target.options[e.target.selectedIndex].text, 'info'));
  document.getElementById('set-top').addEventListener('change', e => App.toast(e.target.checked ? '窗口置顶已开启' : '窗口置顶已关闭', 'info'));
  document.getElementById('set-minimal').addEventListener('change', e => App.toast(e.target.checked ? '极简模式（无边框）' : '退出极简模式', 'info'));

  document.getElementById('btn-about-2').addEventListener('click', App.showAbout);
  document.getElementById('btn-guide-2').addEventListener('click', App.showGuide);
};

App.syncPanelAudio = function () {
  const r = document.getElementById('panel-audiobuf');
  const v = document.getElementById('panel-audiobuf-val');
  r.value = App.audioBuffer;
  v.textContent = App.audioBuffer + ' ms';
  r.style.setProperty('--fill', (r.value - r.min) / (r.max - r.min) * 100 + '%');
};

App.bindPanel = function () {
  const r = document.getElementById('panel-audiobuf');
  r.addEventListener('input', () => {
    App.audioBuffer = parseInt(r.value, 10);
    document.getElementById('panel-audiobuf-val').textContent = App.audioBuffer + ' ms';
    r.style.setProperty('--fill', (r.value - r.min) / (r.max - r.min) * 100 + '%');
    App.autosave();
  });
  document.getElementById('panel-crosshair').addEventListener('change', e => {
    App.osd.crosshair = e.target.checked;
    App.autosave();
  });
  document.getElementById('panel-stats').addEventListener('change', e => {
    App.osd.stats = e.target.checked;
    document.getElementById('osd-stats').style.display = e.target.checked ? '' : 'none';
    App.autosave();
  });
};

/* ---------- 预设库 ---------- */
App.renderPresets = function () {
  const grid = document.getElementById('preset-grid');
  grid.innerHTML = '';
  for (const p of PRESETS) {
    const card = document.createElement('div');
    card.className = 'preset-card';
    card.innerHTML =
      '<div class="preset-banner" style="background:' + p.grad + '"><span>' + p.name + '</span></div>' +
      '<div class="preset-body">' +
      '<div class="preset-tags">' + p.tags.map((t, i) => '<span class="ptag' + (i === 0 && p.hot ? ' hot' : '') + '">' + t + '</span>').join('') + '</div>' +
      '<div class="preset-desc">' + p.desc + '</div>' +
      '<div class="preset-acts">' +
      '<button class="btn btn-primary" data-act="apply">套用</button>' +
      '<button class="btn" data-act="export">导出</button>' +
      '</div></div>';
    card.querySelector('[data-act="apply"]').addEventListener('click', () => {
      Editor.applyPreset(p);
      App.setPage('editor');
      App.toast('已套用「' + p.name + '」标准布局 · 可继续微调', 'ok');
    });
    card.querySelector('[data-act="export"]').addEventListener('click', () => {
      const payload = {
        schema: 2,
        game: { pkg: p.pkg, name: p.name, orientation: p.orientation },
        target: { w: p.target.w, h: p.target.h },
        settings: App.mapping.settings,
        items: p.items.map(it => Object.assign({ id: uid() }, deep(it))),
      };
      downloadJSON(payload, 'mirrorplay-' + p.pkg + '.json');
      App.toast('已导出「' + p.name + '」键位', 'ok');
    });
    grid.appendChild(card);
  }
};

function downloadJSON(obj, name) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ---------- 工具栏 ---------- */
App.bindToolbar = function () {
  /* 导航 */
  document.querySelectorAll('.nav-item').forEach(b => b.addEventListener('click', () => App.setPage(b.dataset.page)));

  /* 标题栏（桌面端为真实窗口控制，浏览器演示态仅提示） */
  document.querySelectorAll('.wc').forEach(b => b.addEventListener('click', () => {
    if (window.desktop) window.desktop.control(b.dataset.wc);
    else App.toast('原型演示：窗口控件仅在桌面端生效', 'info');
  }));

  /* 设备 */
  document.getElementById('btn-add-device').addEventListener('click', App.addMockDevice);

  /* 引导 / 关于 */
  document.getElementById('btn-guide').addEventListener('click', App.showGuide);
  document.getElementById('btn-about').addEventListener('click', App.showAbout);

  /* 投屏工具栏 */
  document.getElementById('btn-mode').addEventListener('click', App.toggleMappingMode);
  document.getElementById('btn-fullscreen').addEventListener('click', () => {
    const el = document.getElementById('stage-cast');
    if (document.fullscreenElement) document.exitFullscreen();
    else if (el.requestFullscreen) el.requestFullscreen().catch(() => App.toast('当前环境不支持全屏', 'warn'));
    else App.toast('当前环境不支持全屏', 'warn');
  });
  let recording = false;
  document.getElementById('btn-record').addEventListener('click', e => {
    recording = !recording;
    e.currentTarget.classList.toggle('on', recording);
    App.toast(recording ? '开始录制 · MP4 复用码流 · 无水印' : '录制已停止 · 已保存到视频目录', recording ? 'ok' : 'info');
  });
  document.getElementById('btn-shot').addEventListener('click', () => App.toast('截图已保存（PNG，当前帧）', 'ok'));
  let screenOff = false;
  document.getElementById('btn-screenoff').addEventListener('click', e => {
    screenOff = !screenOff;
    e.currentTarget.classList.toggle('on', screenOff);
    App.toast(screenOff ? '手机已息屏 · 继续投屏（省电）' : '手机屏幕已点亮', 'info');
  });

  /* 编辑器工具栏 */
  document.getElementById('ed-freeze').addEventListener('click', () => {
    Editor.setFrozen(!Editor.frozen);
    App.toast(Editor.frozen ? '帧已冻结 · 方便取点' : '实时预览中', 'info');
  });
  document.getElementById('ed-ratio').addEventListener('change', e => {
    const r = e.target.value;
    Editor.setRatio(r === '16:9' ? 16 / 9 : r === '20:9' ? 20 / 9 : 19.5 / 9);
  });
  document.getElementById('ed-snap').addEventListener('click', e => {
    Editor.snap = !Editor.snap;
    e.currentTarget.classList.toggle('on', Editor.snap);
    document.getElementById('ed-snap-text').textContent = '吸附: ' + (Editor.snap ? '开' : '关');
    Editor.renderInfo();
  });
  document.getElementById('ed-undo').addEventListener('click', Editor.undo);
  document.getElementById('ed-redo').addEventListener('click', Editor.redo);
  document.getElementById('ed-playtest').addEventListener('click', () => Editor.setPlaytest(!Editor.playtest));
  document.getElementById('ed-save').addEventListener('click', () => {
    App.autosave();
    clearTimeout(App.saveTimer);
    try { localStorage.setItem(LS_KEY, JSON.stringify({ mapping: App.mapping, quality: App.quality, fill: App.fill, audioBuffer: App.audioBuffer, osd: App.osd })); } catch (err) {}
    App.toast('键位已保存到本地 · ' + App.mapping.items.length + ' 个控件', 'ok');
  });
  document.getElementById('ed-export').addEventListener('click', Editor.export);
  document.getElementById('ed-import').addEventListener('click', () => document.getElementById('import-file').click());
  document.getElementById('import-file').addEventListener('change', e => {
    if (e.target.files && e.target.files[0]) Editor.importFile(e.target.files[0]);
    e.target.value = '';
  });

  /* 预设库导入 */
  document.getElementById('btn-preset-import').addEventListener('click', () => document.getElementById('import-file').click());
  const zone = document.getElementById('preset-drop');
  zone.addEventListener('click', () => document.getElementById('import-file').click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('over');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) Editor.importFile(e.dataTransfer.files[0]);
  });
};

/* ---------- 控件库拖拽 ---------- */
App.bindPaletteDrag = function () {
  let ghost = null;
  document.getElementById('palette').addEventListener('pointerdown', e => {
    const card = e.target.closest('.pcard');
    if (!card) return;
    e.preventDefault();
    ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    ghost.textContent = TYPES[card.dataset.type].label;
    document.body.appendChild(ghost);
    const move = ev => {
      ghost.style.left = ev.clientX + 'px';
      ghost.style.top = ev.clientY + 'px';
    };
    move(e);
    const up = ev => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      ghost.remove();
      const canvas = document.getElementById('screen-editor');
      const r = canvas.getBoundingClientRect();
      if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) {
        Editor.addItemAt(card.dataset.type, {
          x: (ev.clientX - r.left) / r.width,
          y: (ev.clientY - r.top) / r.height,
        });
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
};

/* ---------- 全局键盘 ---------- */
App.bindKeys = function () {
  window.addEventListener('keydown', e => {
    if (App.modalOpen) {
      if (e.code === 'Escape') App.closeModal();
      return;
    }
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;

    /* 按键捕获优先 */
    if (App.captureCb) {
      if (e.code === 'Escape') { App.disarmKeyCapture(); App.toast('已取消绑定', 'warn'); }
      else {
        e.preventDefault();
        const cb = App.captureCb;
        App.disarmKeyCapture();
        cb(e.code);
      }
      return;
    }

    if (e.code === 'Escape') {
      if (document.pointerLockElement) document.exitPointerLock();
      if (App.page === 'editor' && !Editor.frozen) Editor.setPlaytest(false);
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
      if (App.page === 'editor') { e.preventDefault(); e.shiftKey ? Editor.redo() : Editor.undo(); }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') {
      if (App.page === 'editor') { e.preventDefault(); Editor.redo(); }
      return;
    }

    if (App.page === 'editor' && !Sim.isLive() && (e.code === 'Delete' || e.code === 'Backspace') && Editor.selected) {
      e.preventDefault();
      Editor.deleteItem(Editor.selected);
      return;
    }

    /* 模式切换键 */
    if (e.code === App.mapping.settings.switchKey) {
      if (App.page === 'cast' || (App.page === 'editor' && !Editor.frozen)) {
        e.preventDefault();
        App.toggleMappingMode();
        return;
      }
    }

    /* 游戏按键 */
    if (Sim.isLive()) {
      if (['Space', 'Tab', 'Backquote', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.code) >= 0) e.preventDefault();
      if (!e.repeat) Sim.onKey(e.code, true);
    }
  });

  window.addEventListener('keyup', e => {
    if (App.captureCb || App.modalOpen) return;
    if (Sim.isLive() && !e.repeat) Sim.onKey(e.code, false);
  });

  /* 失焦保护（设计文档 5.1） */
  const onBlur = () => {
    if (Sim.isLive() && Sim.mappingOn) {
      Sim.resetAll();
      App.toast('窗口失焦 · 已归位全部手指（失焦保护）', 'warn');
    }
  };
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', () => { if (document.hidden) onBlur(); });
};

/* ---------- 遥测 ---------- */
App.bindTelemetry = function () {
  setInterval(() => {
    const q = QUALITY_TIERS.find(x => x.id === App.quality);
    const br = parseFloat(q.br) * (0.92 + Math.random() * 0.16);
    const lat = 38 + Math.random() * 14;
    document.getElementById('sb-br').textContent = br.toFixed(1) + ' Mbps';
    document.getElementById('sb-lat').textContent = lat.toFixed(0) + ' ms';
    document.getElementById('osd-br').textContent = br.toFixed(1) + ' Mbps';
    document.getElementById('osd-lat').textContent = lat.toFixed(0) + ' ms';
  }, 900);
};

/* ---------- 主循环 ---------- */
App.startLoop = function () {
  let last = performance.now(), fpsT = 0, fpsN = 0;
  function frame(ts) {
    const dt = Math.min(.05, (ts - last) / 1000);
    last = ts;
    Sim.update(dt);
    if (Sim.canvas && Sim.canvas.offsetParent !== null) Sim.render();
    fpsN++; fpsT += dt;
    if (fpsT >= .5) {
      const fps = Math.round(fpsN / fpsT);
      document.getElementById('sb-fps').textContent = fps;
      document.getElementById('osd-fps').textContent = fps;
      fpsN = 0; fpsT = 0;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
};

/* ---------- Electron 桌面端接线 ---------- */
App.bindDesktop = function () {
  if (!window.desktop) return;
  window.desktop.onWinState(st => {
    document.querySelectorAll('.wc').forEach(b => {
      if (b.dataset.wc !== 'toggle-maximize') return;
      const rect = b.querySelector('rect');
      if (rect) rect.setAttribute('stroke-width', st.maximized ? '2.4' : '1.2');
      b.title = st.maximized ? '向下还原' : '最大化';
    });
  });
  window.desktop.onMeta(meta => {
    const plat = meta.platform === 'win32' ? 'Windows' : meta.platform === 'linux' ? 'Linux' : meta.platform;
    const el = document.querySelector('.brand-text span');
    if (el) el.textContent = '免会员手游投屏 · v' + meta.version + ' · ' + plat + ' ' + meta.arch + (meta.packaged ? '' : ' · dev');
    document.title = 'MirrorPlay · 免会员手游投屏';
  });
};

/* ---------- 启动 ---------- */
App.init = function () {
  App.load();
  if (!App.mapping) App.mapping = defaultMapping();
  App.initDevices();

  Sim.init();
  App.renderDevices();
  App.renderQuality();
  App.bindSettings();
  App.bindPanel();
  App.syncPanelAudio();
  App.bindToolbar();
  App.bindDesktop();
  App.bindPaletteDrag();
  App.bindKeys();
  App.bindTelemetry();

  Editor.renderPalette();
  Editor.bindProps();
  Editor.pushHistory();
  Editor.renderConflicts();
  Editor.renderInfo();
  Editor.syncHistoryButtons();

  /* 恢复 OSD 开关 */
  document.getElementById('panel-crosshair').checked = App.osd.crosshair;
  document.getElementById('panel-stats').checked = App.osd.stats;
  document.getElementById('osd-stats').style.display = App.osd.stats ? '' : 'none';

  App.setPage('cast');
  App.startLoop();

  window.addEventListener('resize', App.fitCanvas);

  if (!localStorage.getItem('mirrorplay.guideSeen')) {
    localStorage.setItem('mirrorplay.guideSeen', '1');
    setTimeout(App.showGuide, 400);
  }
};

document.addEventListener('DOMContentLoaded', App.init);
