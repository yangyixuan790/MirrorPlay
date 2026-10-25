/* ============================================================
   MirrorPlay · 键位映射编辑器（所见即所得）
   覆盖层渲染 + 拖拽交互 + 属性面板 + 冲突检测 + 撤销重做
   ============================================================ */
'use strict';

const Editor = {
  snap: true,
  frozen: true,          // true = 冻结当前帧，方便取点
  playtest: false,
  selected: null,
  drag: null,
  guide: null,
  history: [], hIdx: -1,
  hits: [],
  ratio: 19.5 / 9,
  _listeners: false,
};

/* ---------- 工具 ---------- */
function edSel() {
  return App.mapping.items.find(i => i.id === Editor.selected) || null;
}
function itemCenter(it) {
  if (it.pos) return it.pos;
  if (it.center) return it.center;
  if (it.from && it.to) return { x: (it.from.x + it.to.x) / 2, y: (it.from.y + it.to.y) / 2 };
  return { x: .5, y: .5 };
}
function deep(o) { return JSON.parse(JSON.stringify(o)); }
function snapV(v) { return Editor.snap ? Math.round(v / .005) * .005 : v; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

/* ---------- 历史 ---------- */
Editor.pushHistory = function () {
  const snap = deep(App.mapping.items);
  Editor.history = Editor.history.slice(0, Editor.hIdx + 1);
  Editor.history.push(snap);
  if (Editor.history.length > 60) Editor.history.shift();
  Editor.hIdx = Editor.history.length - 1;
  Editor.syncHistoryButtons();
};
Editor.undo = function () {
  if (Editor.hIdx <= 0) return;
  Editor.hIdx--;
  App.mapping.items = deep(Editor.history[Editor.hIdx]);
  Editor.afterChange(false);
  App.toast('已撤销', 'info');
};
Editor.redo = function () {
  if (Editor.hIdx >= Editor.history.length - 1) return;
  Editor.hIdx++;
  App.mapping.items = deep(Editor.history[Editor.hIdx]);
  Editor.afterChange(false);
  App.toast('已重做', 'info');
};
Editor.syncHistoryButtons = function () {
  const u = document.getElementById('ed-undo'), r = document.getElementById('ed-redo');
  if (u) u.disabled = Editor.hIdx <= 0;
  if (r) r.disabled = Editor.hIdx >= Editor.history.length - 1;
};

/* ---------- 变更后统一刷新 ---------- */
Editor.afterChange = function (commit) {
  if (commit) Editor.pushHistory();
  if (!edSel() || !App.mapping.items.find(i => i.id === Editor.selected)) Editor.selected = null;
  Editor.renderProps();
  Editor.renderConflicts();
  Editor.renderInfo();
  App.autosave();
};

/* ---------- 控件增删 ---------- */
Editor.addItemAt = function (type, rel) {
  const def = TYPES[type];
  if (!def) return;
  const it = def.defaults();
  const p = { x: clamp(rel.x, .04, .96), y: clamp(rel.y, .04, .96) };
  if (it.pos) it.pos = p;
  if (it.center) it.center = p;
  if (it.from && it.to) {
    it.from = { x: p.x, y: Math.max(.03, p.y - .15) };
    it.to = { x: p.x, y: Math.min(.97, p.y + .15) };
  }
  App.mapping.items.push(it);
  Editor.selected = it.id;
  Editor.afterChange(true);
  App.toast('已添加「' + def.label + '」，在右侧编辑属性', 'ok');
};

Editor.deleteItem = function (id) {
  const i = App.mapping.items.findIndex(x => x.id === id);
  if (i < 0) return;
  App.mapping.items.splice(i, 1);
  if (Editor.selected === id) Editor.selected = null;
  Editor.afterChange(true);
};
Editor.duplicateItem = function (id) {
  const it = App.mapping.items.find(x => x.id === id);
  if (!it) return;
  const c = deep(it);
  c.id = uid();
  if (c.pos) { c.pos.x = clamp(c.pos.x + .04, .03, .97); }
  if (c.center) { c.center.x = clamp(c.center.x + .04, .03, .97); }
  App.mapping.items.push(c);
  Editor.selected = c.id;
  Editor.afterChange(true);
};

/* ---------- 冲突检测（对应设计文档 4.2） ---------- */
Editor.checkConflicts = function () {
  const errors = [], warns = [];
  const ids = new Set();
  const byKey = {};
  const reg = (key, item, name) => {
    if (!key) return;
    (byKey[key] = byKey[key] || []).push({ item: item, name: name });
  };
  const sw = (App.mapping.settings || DEFAULT_SETTINGS).switchKey;
  for (const it of App.mapping.items) {
    const def = TYPES[it.type];
    if (it.key) reg(it.key, it, def.label);
    if (it.keys) for (const k of Object.keys(it.keys)) if (it.keys[k]) reg(it.keys[k], it, def.label + '·' + ({ up: '上', down: '下', left: '左', right: '右' })[k]);
    if (it.dragKey && it.mode === 'drag') reg(it.dragKey, it, def.label + '·拖拽键');
  }
  for (const key of Object.keys(byKey)) {
    const arr = byKey[key];
    if (arr.length > 1) {
      errors.push({ msg: '按键 <b>' + keyLabel(key) + '</b> 被 ' + arr.length + ' 个控件同时绑定：' + arr.map(a => a.name).join('、') });
      arr.forEach(a => ids.add(a.item.id));
    }
    if (key === sw) {
      errors.push({ msg: '按键 <b>' + keyLabel(key) + '</b> 是模式切换键，不能绑定控件' });
      arr.forEach(a => ids.add(a.item.id));
    }
  }
  const steer = App.mapping.items.find(i => i.type === 'steering');
  const view = App.mapping.items.find(i => i.type === 'view');
  if (steer && view) {
    const d = Math.hypot(steer.center.x - view.center.x, (steer.center.y - view.center.y));
    if (d < steer.radius + view.radius) {
      warns.push({ msg: '摇杆区与视角区重叠，可能互相吞事件，建议调小半径或移动位置' });
    }
  }
  return { errors: errors, warns: warns, ids: ids };
};

/* ---------- 覆盖层渲染 ---------- */
function ratioText() {
  return Editor.ratio === 16 / 9 ? '16:9' : (Editor.ratio > 2.2 ? '20:9' : '19.5:9');
}
Editor.drawOverlay = function (ctx, W, H) {
  Editor.hits = [];
  const conf = Editor.checkConflicts();

  /* 网格 */
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,255,255,.045)';
  ctx.beginPath();
  for (let x = 0; x <= W; x += 60) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let y = 0; y <= H; y += 60) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(53,200,245,.09)';
  ctx.beginPath();
  for (let x = 0; x <= W; x += 300) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let y = 0; y <= H; y += 300) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();

  /* 控件 */
  for (const it of App.mapping.items) Editor._drawItem(ctx, W, H, it, conf.ids.has(it.id));

  /* 对齐辅助线 */
  if (Editor.guide) {
    ctx.strokeStyle = 'rgba(245,196,81,.55)';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    if (Editor.guide.x != null) { ctx.moveTo(Editor.guide.x, 0); ctx.lineTo(Editor.guide.x, H); }
    if (Editor.guide.y != null) { ctx.moveTo(0, Editor.guide.y); ctx.lineTo(W, Editor.guide.y); }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /* 比例标尺 */
  ctx.font = '10px Consolas, monospace';
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(143,161,187,.55)';
  ctx.fillText('屏幕比例模拟 ' + ratioText() + ' · 相对坐标 0~1', W - 14, H - 12);
};

Editor._drawItem = function (ctx, W, H, it, bad) {
  const sel = it.id === Editor.selected;
  const c = itemCenter(it);
  const px = c.x * W, py = c.y * H;
  const accent = bad ? '#ff6b6b' : sel ? '#35c8f5' : 'rgba(53,200,245,.75)';

  ctx.save();
  if (it.type === 'steering' || it.type === 'view' || it.type === 'right_click_move' || it.type === 'observe') {
    const r = (it.radius || .12) * W;
    ctx.fillStyle = it.type === 'view' ? 'rgba(139,124,246,.07)' : 'rgba(53,200,245,.06)';
    ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.fill();
    ctx.strokeStyle = it.type === 'view' ? (bad ? '#ff6b6b' : 'rgba(139,124,246,.5)') : accent;
    ctx.lineWidth = sel ? 2 : 1.4;
    ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.stroke();
    ctx.setLineDash([]);
    /* 中心点 */
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.arc(px, py, 4, 0, 7); ctx.fill();
    /* 半径手柄 */
    ctx.fillStyle = sel ? '#35c8f5' : 'rgba(53,200,245,.5)';
    ctx.beginPath(); ctx.arc(px + r, py, 5, 0, 7); ctx.fill();
    Editor.hits.push({ id: it.id, kind: 'radius', x: px, y: py, r: r });
    /* 标签 */
    ctx.font = '11px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = bad ? 'rgba(255,107,107,.9)' : 'rgba(232,238,249,.85)';
    const name = TYPES[it.type].label;
    if (it.type === 'steering') {
      const k = it.keys || {};
      ctx.font = '10px Consolas, monospace';
      ctx.fillStyle = 'rgba(53,200,245,.8)';
      ctx.fillText(keyLabel(k.up) + '  ' + keyLabel(k.left) + ' ' + keyLabel(k.down) + ' ' + keyLabel(k.right), px, py + r + 16);
      ctx.font = '11px "Microsoft YaHei", sans-serif';
      ctx.fillStyle = bad ? 'rgba(255,107,107,.9)' : 'rgba(232,238,249,.85)';
      ctx.fillText(name + ' · ' + (it.mode === 'hold' ? '常驻' : '轻触'), px, py - r - 8);
    } else if (it.type === 'view') {
      ctx.fillText(name + ' · ' + (it.mode === 'crosshair' ? '准心' : '拖拽') + ' · ' + (it.sensitivity || 1).toFixed(2), px, py - r - 8);
    } else {
      ctx.fillText(name, px, py - r - 8);
    }
    Editor.hits.push({ id: it.id, kind: 'move', x: px, y: py, r: r });
  } else if (it.type === 'drag') {
    const f = { x: it.from.x * W, y: it.from.y * H }, t = { x: it.to.x * W, y: it.to.y * H };
    ctx.strokeStyle = accent; ctx.lineWidth = sel ? 2.4 : 1.6;
    ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(t.x, t.y); ctx.stroke();
    /* 箭头 */
    const a = Math.atan2(t.y - f.y, t.x - f.x);
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(t.x, t.y);
    ctx.lineTo(t.x - Math.cos(a - .5) * 12, t.y - Math.sin(a - .5) * 12);
    ctx.lineTo(t.x - Math.cos(a + .5) * 12, t.y - Math.sin(a + .5) * 12);
    ctx.closePath(); ctx.fill();
    for (const p of [{ x: f.x, y: f.y, k: 'from' }, { x: t.x, y: t.y, k: 'to' }]) {
      ctx.fillStyle = sel ? '#35c8f5' : 'rgba(53,200,245,.6)';
      ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, 7); ctx.fill();
      Editor.hits.push({ id: it.id, kind: p.k, x: p.x, y: p.y, r: 8 });
    }
    ctx.font = '10px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(143,161,187,.8)';
    ctx.fillText(TYPES.drag.label + ' ' + (it.durationMs || 120) + 'ms', (f.x + t.x) / 2, (f.y + t.y) / 2 - 10);
    Editor.hits.push({ id: it.id, kind: 'move', x: (f.x + t.x) / 2, y: (f.y + t.y) / 2, r: 14 });
  } else if (it.type === 'swipe_direction') {
    const dirs = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0], up_left: [-.7, -.7], up_right: [.7, -.7], down_left: [-.7, .7], down_right: [.7, .7] };
    const d = dirs[it.direction] || dirs.up;
    const len = (it.distance || .15) * W;
    const ex = px + d[0] * len, ey = py + d[1] * len;
    ctx.strokeStyle = accent; ctx.lineWidth = sel ? 2.2 : 1.6;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(ex, ey); ctx.stroke();
    const a = Math.atan2(ey - py, ex - px);
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - Math.cos(a - .45) * 12, ey - Math.sin(a - .45) * 12);
    ctx.lineTo(ex - Math.cos(a + .45) * 12, ey - Math.sin(a + .45) * 12);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.arc(px, py, 5, 0, 7); ctx.fill();
    Editor.hits.push({ id: it.id, kind: 'move', x: px, y: py, r: 12 });
  } else if (it.type === 'view_extend') {
    ctx.font = '11px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(143,161,187,.8)';
    ctx.fillText('视野扩展 ×' + (it.scale || 1).toFixed(2) + '（无输入，仅渲染配置）', px, py);
    Editor.hits.push({ id: it.id, kind: 'move', x: px, y: py, r: 26 });
  } else {
    /* 键帽类：click / click_twice / fire / smart_cast / macro */
    const w = 78, h = 42;
    const x = px - w / 2, y = py - h / 2;
    ctx.fillStyle = sel ? 'rgba(53,200,245,.16)' : 'rgba(7,11,18,.62)';
    Editor._roundRect(ctx, x, y, w, h, 9);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = sel ? 2 : 1.3;
    Editor._roundRect(ctx, x, y, w, h, 9);
    ctx.stroke();
    if (sel) {
      ctx.shadowColor = 'rgba(53,200,245,.5)';
      ctx.shadowBlur = 12;
      Editor._roundRect(ctx, x, y, w, h, 9);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.font = '600 13px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = it.key ? 'rgba(232,238,249,.95)' : 'rgba(143,161,187,.6)';
    ctx.fillText(it.key ? keyLabel(it.key) : '未绑定', px, py + 5);
    ctx.font = '10px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = 'rgba(143,161,187,.75)';
    ctx.fillText(TYPES[it.type].label, px, y - 8);
    Editor.hits.push({ id: it.id, kind: 'move', x: px, y: py, r: Math.max(w, h) / 2 });
  }
  ctx.restore();
};

Editor._roundRect = function (ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

/* ---------- 画布交互 ---------- */
Editor.attach = function (canvas) {
  if (Editor._listeners) return;
  Editor._listeners = true;
  const down = e => {
    if (Sim.mode !== 'editor' || Sim.playtest) return;
    e.preventDefault();
    const p = Sim.toSim(e);
    const hit = Editor._hit(p);
    if (hit) {
      Editor.selected = hit.id;
      const it = edSel();
      Editor.drag = { id: hit.id, kind: hit.kind, start: p, orig: deep(it), pushed: false };
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    } else {
      Editor.selected = null;
    }
    Editor.renderProps();
  };
  const move = e => {
    if (!Editor.drag || Sim.mode !== 'editor') return;
    const p = Sim.toSim(e);
    const it = edSel();
    if (!it) return;
    if (!Editor.drag.pushed) { Editor.pushHistory(); Editor.drag.pushed = true; }
    const W = Sim.W, H = Sim.H;
    if (Editor.drag.kind === 'move') {
      const dx = (p.x - Editor.drag.start.x) / W;
      const dy = (p.y - Editor.drag.start.y) / H;
      const oc = itemCenter(Editor.drag.orig);
      let nx = clamp(oc.x + dx, .02, .98);
      let ny = clamp(oc.y + dy, .02, .98);
      /* 对齐辅助线 */
      Editor.guide = null;
      for (const o of App.mapping.items) {
        if (o.id === it.id) continue;
        const c = itemCenter(o);
        if (Math.abs(c.x * W - nx * W) < 8) { nx = c.x; Editor.guide = { x: c.x * W, y: null }; }
        if (Math.abs(c.y * H - ny * H) < 8) { ny = c.y; Editor.guide = Object.assign({}, Editor.guide || {}, { y: c.y * H }); }
      }
      nx = snapV(nx); ny = snapV(ny);
      if (it.pos) it.pos = { x: nx, y: ny };
      if (it.center) it.center = { x: nx, y: ny };
      if (it.from && it.to) {
        const odx = nx - oc.x, ody = ny - oc.y;
        it.from = { x: clamp(Editor.drag.orig.from.x + odx, .02, .98), y: clamp(Editor.drag.orig.from.y + ody, .02, .98) };
        it.to = { x: clamp(Editor.drag.orig.to.x + odx, .02, .98), y: clamp(Editor.drag.orig.to.y + ody, .02, .98) };
      }
    } else if (Editor.drag.kind === 'radius') {
      const c = itemCenter(Editor.drag.orig);
      const d = Math.hypot(p.x - c.x * W, p.y - c.y * H) / W;
      it.radius = clamp(snapV(d), .03, .45);
    } else if (Editor.drag.kind === 'from' || Editor.drag.kind === 'to') {
      it[Editor.drag.kind] = { x: clamp(snapV(p.x / W), .02, .98), y: clamp(snapV(p.y / H), .02, .98) };
    }
    Editor.renderInfo();
  };
  const up = () => {
    if (Editor.drag && Editor.drag.pushed) Editor.afterChange(false);
    Editor.drag = null;
    Editor.guide = null;
  };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  Editor._detach = () => {
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    Editor._listeners = false;
  };
};

Editor._hit = function (p) {
  for (let i = Editor.hits.length - 1; i >= 0; i--) {
    const h = Editor.hits[i];
    if (Math.hypot(p.x - h.x, p.y - h.y) <= h.r) return h;
  }
  return null;
};

/* ---------- 控件库 ---------- */
Editor.renderPalette = function () {
  const box = document.getElementById('palette');
  if (!box) return;
  box.innerHTML = '';
  for (const t of PALETTE_ORDER) {
    const def = TYPES[t];
    const card = document.createElement('button');
    card.className = 'pcard';
    card.dataset.type = t;
    card.title = '拖到画面上放置';
    card.innerHTML = '<div class="icon-tile">' + icon(def.icon, 16) + '</div><b>' + def.label + '</b><span>' + def.desc + '</span>';
    box.appendChild(card);
  }
};

/* ---------- 属性面板 ---------- */
Editor.renderProps = function () {
  const form = document.getElementById('prop-form');
  const nameEl = document.getElementById('prop-type-name');
  const it = edSel();
  if (!form) return;
  if (!it) {
    form.innerHTML = '';
    if (nameEl) nameEl.textContent = '';
    return;
  }
  if (nameEl) nameEl.textContent = TYPES[it.type].label;
  const rows = [];

  const keyRow = (label, get, set) => {
    rows.push('<div class="prow"><label>' + label + '</label>' +
      '<button class="keycap-btn ' + (get() ? '' : 'unbound') + '" data-cap="1" data-capfield="' + set._f + '">' +
      (get() ? keyLabel(get()) : '点击设置') + '</button></div>');
  };
  const numRow = (label, field, min, max, step, unit, fmt) => {
    const v = it[field];
    const disp = fmt ? fmt(v) : v;
    rows.push('<div class="prow"><label>' + label + '</label><div class="range-row">' +
      '<input type="range" data-range="1" data-field="' + field + '" data-unit="' + (unit || '') + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + v + '">' +
      '<b class="range-val">' + disp + (unit || '') + '</b></div></div>');
  };
  const selRow = (label, field, opts) => {
    rows.push('<div class="prow"><label>' + label + '</label><div class="sel-wrap"><select class="sel" data-select="1" data-field="' + field + '">' +
      opts.map(o => '<option value="' + o[0] + '"' + (String(it[field]) === String(o[0]) ? ' selected' : '') + '>' + o[1] + '</option>').join('') +
      '</select></div></div>');
  };
  const checkRow = (label, field) => {
    rows.push('<div class="prow"><label>' + label + '</label><label class="switch"><input type="checkbox" data-check="1" data-field="' + field + '"' + (it[field] ? ' checked' : '') + '><span></span></label></div>');
  };

  if (it.type === 'click' || it.type === 'click_twice' || it.type === 'fire' || it.type === 'smart_cast') {
    keyRow('按键', () => it.key, Object.assign(v => { it.key = v; }, { _f: 'key' }));
    if (it.type === 'click' || it.type === 'click_twice') numRow('按压时长', 'pressMs', 16, 200, 2, ' ms');
    if (it.type === 'click_twice') numRow('双击间隔', 'intervalMs', 40, 300, 10, ' ms');
    if (it.type === 'fire') {
      checkRow('按住持续', 'hold');
      numRow('连点间隔', 'repeatMs', 50, 500, 10, ' ms');
      rows.push('<div class="prow-note">repeatMs = 0 时为按住持续；连点间隔下限 50ms（合规红线）。</div>');
    }
    if (it.type === 'smart_cast') selRow('方向来源', 'aim', [['view', '跟随视角指向'], ['manual', '手动拖拽']]);
  } else if (it.type === 'steering') {
    keyRow('上', () => it.keys.up, Object.assign(v => { it.keys.up = v; }, { _f: 'keys.up' }));
    keyRow('下', () => it.keys.down, Object.assign(v => { it.keys.down = v; }, { _f: 'keys.down' }));
    keyRow('左', () => it.keys.left, Object.assign(v => { it.keys.left = v; }, { _f: 'keys.left' }));
    keyRow('右', () => it.keys.right, Object.assign(v => { it.keys.right = v; }, { _f: 'keys.right' }));
    numRow('半径', 'radius', .04, .4, .005, '', v => v.toFixed(3));
    selRow('模式', 'mode', [['hold', '常驻（推荐，延迟最低）'], ['tap', '轻触（兼容回退）']]);
    numRow('死区', 'deadzone', 0, .3, .01, '', v => v.toFixed(2));
    numRow('回中平滑', 'smoothing', 0, .9, .05, '', v => v.toFixed(2));
  } else if (it.type === 'view') {
    selRow('模式', 'mode', [['crosshair', '虚拟准心（FPS）'], ['drag', '按住拖拽（MOBA）']]);
    if (it.mode === 'drag') keyRow('拖拽键', () => it.dragKey, Object.assign(v => { it.dragKey = v; }, { _f: 'dragKey' }));
    numRow('灵敏度', 'sensitivity', .2, 3, .05, '×', v => v.toFixed(2));
    numRow('最大半径', 'radius', .05, .4, .005, '', v => v.toFixed(3));
    checkRow('反转 Y 轴', 'invertY');
  } else if (it.type === 'macro') {
    keyRow('按键', () => it.key, Object.assign(v => { it.key = v; }, { _f: 'key' }));
    checkRow('循环（须按住）', 'loop');
    numRow('最短间隔', 'minIntervalMs', 200, 2000, 50, ' ms');
    rows.push('<div class="prow-note">步骤 ' + (it.steps || []).length + ' / 32 · ' +
      (it.steps || []).map(s => s.act).join(' → ') + '<br>合规红线：松键立即中止；禁止无人值守循环。</div>');
  } else if (it.type === 'drag') {
    keyRow('按键', () => it.key, Object.assign(v => { it.key = v; }, { _f: 'key' }));
    numRow('滑动时长', 'durationMs', 60, 600, 10, ' ms');
    rows.push('<div class="prow-note">直接拖动画面上的圆点调整起止点。</div>');
  } else if (it.type === 'swipe_direction') {
    keyRow('按键', () => it.key, Object.assign(v => { it.key = v; }, { _f: 'key' }));
    selRow('方向', 'direction', [['up', '上'], ['down', '下'], ['left', '左'], ['right', '右'], ['up_left', '左上'], ['up_right', '右上'], ['down_left', '左下'], ['down_right', '右下']]);
    numRow('距离', 'distance', .05, .5, .01, '', v => v.toFixed(2));
    numRow('时长', 'durationMs', 120, 600, 20, ' ms');
  } else if (it.type === 'right_click_move' || it.type === 'observe') {
    keyRow('按键', () => it.key, Object.assign(v => { it.key = v; }, { _f: 'key' }));
    numRow('半径', 'radius', .04, .4, .005, '', v => v.toFixed(3));
  } else if (it.type === 'view_extend') {
    numRow('视野倍率', 'scale', .8, 1.5, .05, '×', v => v.toFixed(2));
  }

  const c = itemCenter(it);
  rows.push('<div class="prow"><label>相对坐标</label><span class="prow-pos">x ' + c.x.toFixed(3) + ' · y ' + c.y.toFixed(3) + '</span></div>');

  form.innerHTML =
    '<div class="prop-head"><b>' + TYPES[it.type].label + '</b><div class="prop-acts">' +
    '<button class="btn" data-act="dup" title="复制">' + icon('copy', 13) + '</button>' +
    '<button class="btn" data-act="del" title="删除">' + icon('trash', 13) + '</button>' +
    '</div></div>' + rows.join('');

  /* 滑杆填充度 */
  form.querySelectorAll('input[type="range"]').forEach(r => {
    const f = (r.value - r.min) / (r.max - r.min) * 100;
    r.style.setProperty('--fill', f + '%');
  });
};

/* 属性面板事件委托 */
Editor.bindProps = function () {
  const form = document.getElementById('prop-form');
  if (!form) return;

  form.addEventListener('click', e => {
    const cap = e.target.closest('[data-cap]');
    if (cap) {
      const field = cap.dataset.capfield;
      App.armKeyCapture(code => {
        const it = edSel();
        if (!it) return;
        if (field.indexOf('.') > 0) {
          const [a, b] = field.split('.');
          it[a][b] = code;
        } else it[field] = code;
        Editor.afterChange(true);
      });
      return;
    }
    const act = e.target.closest('[data-act]');
    if (act && Editor.selected) {
      if (act.dataset.act === 'del') Editor.deleteItem(Editor.selected);
      else if (act.dataset.act === 'dup') Editor.duplicateItem(Editor.selected);
    }
  });

  form.addEventListener('input', e => {
    const r = e.target;
    if (!r.dataset.range) return;
    const it = edSel();
    if (!it) return;
    it[r.dataset.field] = parseFloat(r.value);
    const out = r.parentElement.querySelector('.range-val');
    if (out) {
      const step = r.step.includes('.') ? r.step.split('.')[1].length : 0;
      out.textContent = (step >= 2 ? parseFloat(r.value).toFixed(step) : parseFloat(r.value)) + (r.dataset.unit || '');
    }
    r.style.setProperty('--fill', (r.value - r.min) / (r.max - r.min) * 100 + '%');
    Editor.renderInfo();
  });

  form.addEventListener('change', e => {
    const it = edSel();
    if (!it) return;
    if (e.target.dataset.range) {
      it[e.target.dataset.field] = parseFloat(e.target.value);
      Editor.afterChange(true);
    } else if (e.target.dataset.select) {
      it[e.target.dataset.field] = e.target.value;
      Editor.afterChange(true);
    } else if (e.target.dataset.check) {
      it[e.target.dataset.field] = e.target.checked;
      Editor.afterChange(true);
    }
  });
};

/* ---------- 冲突列表 ---------- */
Editor.renderConflicts = function () {
  const box = document.getElementById('conflict-list');
  const cnt = document.getElementById('conflict-count');
  if (!box) return;
  const c = Editor.checkConflicts();
  if (cnt) {
    cnt.textContent = c.errors.length ? (c.errors.length + ' 个错误') : (c.warns.length ? (c.warns.length + ' 个提醒') : '通过');
    cnt.style.color = c.errors.length ? 'var(--bad)' : c.warns.length ? 'var(--warn)' : 'var(--good)';
  }
  if (!c.errors.length && !c.warns.length) {
    box.innerHTML = '<div class="conflict-empty">未检测到冲突 · 键位可安全保存</div>';
    return;
  }
  box.innerHTML = c.errors.map(e => '<div class="conflict-item error">' + icon('alert', 14) + '<div>' + e.msg + '</div></div>').join('') +
    c.warns.map(w => '<div class="conflict-item warn">' + icon('info', 14) + '<div>' + w.msg + '</div></div>').join('');
};

/* ---------- 编辑器信息条 ---------- */
Editor.renderInfo = function () {
  const el = document.getElementById('osd-editor-info');
  if (!el) return;
  const c = Editor.checkConflicts();
  el.innerHTML =
    '<span>比例 <b>' + ratioText() + '</b></span>' +
    '<span>吸附 <b>' + (Editor.snap ? '开' : '关') + '</b></span>' +
    '<span>控件 <b>' + App.mapping.items.length + '</b></span>' +
    '<span>冲突 <b class="' + (c.errors.length ? 'bad' : '') + '">' + c.errors.length + '</b></span>' +
    '<span>状态 <b>' + (Editor.frozen ? '帧已冻结' : '实时预览') + '</b></span>';
};

/* ---------- 冻结 / 试玩 / 比例 ---------- */
Editor.setFrozen = function (f) {
  Editor.frozen = f;
  if (!f) Editor.playtest = false;
  const t = document.getElementById('ed-freeze-text');
  if (t) t.textContent = f ? '冻结帧' : '实时预览';
  document.getElementById('ed-freeze').classList.toggle('on', !f);
  const pt = document.getElementById('ed-playtest-text');
  if (pt) pt.textContent = '试玩';
  App.syncSimLive();
  Editor.renderInfo();
};
Editor.setPlaytest = function (on) {
  Editor.playtest = on;
  if (on) { Editor.frozen = false; Sim.setMappingMode(true); }
  const t = document.getElementById('ed-playtest-text');
  if (t) t.textContent = on ? '结束试玩' : '试玩';
  document.getElementById('ed-playtest').classList.toggle('on', on);
  document.getElementById('ed-freeze-text').textContent = Editor.frozen ? '冻结帧' : '实时预览';
  App.syncSimLive();
  Editor.renderInfo();
  App.toast(on ? '试玩中：键鼠操作实时生效，ESC 结束' : '试玩结束，已冻结帧', on ? 'ok' : 'info');
};
Editor.setRatio = function (r) {
  Editor.ratio = r;
  App.rebindSim();
  Editor.renderInfo();
};

/* ---------- 导入 / 导出 ---------- */
Editor.export = function () {
  const payload = {
    schema: 2,
    game: App.mapping.game,
    target: App.mapping.target,
    settings: App.mapping.settings,
    items: App.mapping.items,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'mirrorplay-' + (App.mapping.game.pkg || 'keymap') + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  App.toast('已导出键位 JSON（相对坐标，跨设备通用）', 'ok');
};

Editor.importFile = function (file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const raw = JSON.parse(reader.result);
      const km = normalizeKeymap(raw);
      App.mapping.game = km.game;
      App.mapping.target = km.target;
      App.mapping.settings = km.settings;
      App.mapping.items = km.items;
      Editor.selected = null;
      Editor.afterChange(true);
      App.toast('已导入「' + km.game.name + '」· ' + km.items.length + ' 个控件', 'ok');
    } catch (err) {
      App.toast('导入失败：' + err.message, 'err');
    }
  };
  reader.readAsText(file);
};

/* ---------- 应用预设 ---------- */
Editor.applyPreset = function (p) {
  App.mapping.game = { pkg: p.pkg, name: p.name, orientation: p.orientation };
  App.mapping.target = { w: p.target.w, h: p.target.h };
  App.mapping.items = p.items.map(it => Object.assign({ id: uid() }, deep(it)));
  Editor.selected = null;
  Editor.afterChange(true);
};
