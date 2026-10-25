/* ============================================================
   MirrorPlay · 数据层：映射类型 / 图标 / 默认键位 / 预设 / 设备
   ============================================================ */
'use strict';

/* ---------- 按键显示名 ---------- */
const KEY_LABELS = {
  KeyW: 'W', KeyA: 'A', KeyS: 'S', KeyD: 'D', KeyQ: 'Q', KeyE: 'E', KeyR: 'R', KeyF: 'F',
  KeyG: 'G', KeyC: 'C', KeyV: 'V', KeyX: 'X', KeyZ: 'Z', KeyB: 'B', KeyN: 'N', KeyM: 'M',
  KeyH: 'H', KeyJ: 'J', KeyK: 'K', KeyL: 'L', KeyP: 'P', KeyT: 'T', KeyY: 'Y', KeyU: 'U',
  KeyI: 'I', KeyO: 'O', KeyH: 'H',
  Space: '空格', Backquote: '~', Tab: 'Tab', Enter: '回车', Escape: 'Esc',
  ShiftLeft: '左 Shift', ShiftRight: '右 Shift',
  ControlLeft: '左 Ctrl', ControlRight: '右 Ctrl',
  AltLeft: '左 Alt', AltRight: '右 Alt',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4', Digit5: '5',
  MouseLeft: '鼠标左键', MouseRight: '鼠标右键', MouseMiddle: '鼠标中键',
  Mouse4: '鼠标侧键4', Mouse5: '鼠标侧键5',
};
function keyLabel(code) {
  if (!code) return '未绑定';
  return KEY_LABELS[code] || code.replace(/^Key/, '').replace(/^Digit/, '');
}

/* ---------- 线性图标 ---------- */
const ICONS = {
  cursor: '<path d="M5 3l14 8-6.5 1.5L10 19z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/>',
  doubleTap: '<path d="M8 6a4 4 0 1 1 8 0v3h2v4h-2v3H10v-3H8V9" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M16 16l5 5M21 16l-5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  joystick: '<circle cx="12" cy="13" r="6.5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 3v6M12 3l-2.5 2.5M12 3l2.5 2.5M6 13H3M21 13h-3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="13" r="1.8" fill="currentColor"/>',
  crosshair: '<circle cx="12" cy="12" r="7" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 2v6M12 16v6M2 12h6M16 12h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>',
  flame: '<path d="M12 3s5 4.5 5 9a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3 1-5 1-7.5z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/>',
  sparkles: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/><path d="M18 15l.9 2.4 2.4.9-2.4.9L18 21.6l-.9-2.4-2.4-.9 2.4-.9z" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linejoin="round"/>',
  macro: '<path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="18.5" cy="18" r="2.2" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M18.5 15.8v1.4l1 .8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
  dragMove: '<path d="M4 12h16M14 6l6 6-6 6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  swipe: '<path d="M3 12h13M11 7l5 5-5 5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 5v14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="2 2"/>',
  mouseMove: '<path d="M8 4a4 4 0 1 1 8 0v8a4 4 0 0 1-8 0z" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 8v3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M3 18l4-4 4 4 4-4 4 4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  scan: '<path d="M4 8V6a2 2 0 0 1 2-2h2M20 8V6a2 2 0 0 0-2-2h-2M4 16v2a2 2 0 0 0 2 2h2M20 16v2a2 2 0 0 1-2 2h-2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.5" fill="none"/>',
  expand: '<path d="M12 3v18M3 12h18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M8 7l4-4 4 4M8 17l4 4 4-4M7 8l-4 4 4 4M17 8l4 4-4 4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M10.5 5h3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
  alert: '<path d="M12 3 2.5 20h19z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M12 9.5v4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="12" cy="17" r="1" fill="currentColor"/>',
  info: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 11v5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="12" cy="7.6" r="1.1" fill="currentColor"/>',
  check: '<path d="M4 12.5 9.5 18 20 6.5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  trash: '<path d="M4 6h16M9 6V4h6v2M6 6l1 14h10l1-14" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  x: '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M16 5.5A2.5 2.5 0 0 0 13.5 3H6.5A2.5 2.5 0 0 0 4 5.5v7A2.5 2.5 0 0 0 6.5 15" stroke="currentColor" stroke-width="1.5" fill="none"/>',
};
function icon(name, size) {
  const s = size || 16;
  return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '">' + (ICONS[name] || '') + '</svg>';
}

/* ---------- ID ---------- */
function uid() { return 'i' + Math.random().toString(36).slice(2, 9); }

/* ---------- 映射类型注册表 ---------- */
const TYPES = {
  click: {
    label: '点击', desc: '按下触发一次触摸', icon: 'cursor', keyed: true, hasPos: true,
    defaults: () => ({ id: uid(), type: 'click', key: '', pos: { x: .5, y: .5 }, pressMs: 40 }),
  },
  click_twice: {
    label: '双击', desc: '两次完整点击', icon: 'doubleTap', keyed: true, hasPos: true,
    defaults: () => ({ id: uid(), type: 'click_twice', key: '', pos: { x: .5, y: .5 }, pressMs: 40, intervalMs: 80 }),
  },
  steering: {
    label: '摇杆', desc: '四键合成向量走位', icon: 'joystick', keyed: false, hasRadius: true, triggerKeys: ['up', 'down', 'left', 'right'],
    defaults: () => ({ id: uid(), type: 'steering', center: { x: .16, y: .74 }, radius: .11, mode: 'hold', keys: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' }, deadzone: .08, smoothing: 0 }),
  },
  view: {
    label: '视角控制', desc: '鼠标转视角 / 准心', icon: 'crosshair', keyed: false, hasRadius: true,
    defaults: () => ({ id: uid(), type: 'view', mode: 'crosshair', center: { x: .62, y: .5 }, dragKey: 'MouseRight', sensitivity: 1, invertY: false, radius: .15 }),
  },
  fire: {
    label: '开火 / 连点', desc: '按住持续或连点', icon: 'flame', keyed: true, hasPos: true,
    defaults: () => ({ id: uid(), type: 'fire', key: 'MouseLeft', pos: { x: .90, y: .60 }, hold: true, repeatMs: 0 }),
  },
  smart_cast: {
    label: '智能施法', desc: '按下选方向抬起释放', icon: 'sparkles', keyed: true, hasPos: true,
    defaults: () => ({ id: uid(), type: 'smart_cast', key: '', pos: { x: .70, y: .86 }, aim: 'view' }),
  },
  macro: {
    label: '宏', desc: '多步序列 · 限速约束', icon: 'macro', keyed: true, hasPos: false,
    defaults: () => ({ id: uid(), type: 'macro', key: '', loop: false, minIntervalMs: 200, steps: [{ act: 'click', pos: { x: .3, y: .8 } }, { act: 'wait', ms: 60 }, { act: 'swipe', from: { x: .3, y: .8 }, to: { x: .6, y: .8 }, ms: 120 }] }),
  },
  drag: {
    label: '拖拽滑动', desc: '固定起止点滑动', icon: 'dragMove', keyed: true, hasEndpoints: true,
    defaults: () => ({ id: uid(), type: 'drag', key: '', from: { x: .5, y: .4 }, to: { x: .5, y: .7 }, durationMs: 120 }),
  },
  swipe_direction: {
    label: '方向滑动', desc: '八方向 + 自定义距离', icon: 'swipe', keyed: true, hasPos: true,
    defaults: () => ({ id: uid(), type: 'swipe_direction', key: '', center: { x: .5, y: .5 }, direction: 'up', distance: .15, durationMs: 240 }),
  },
  right_click_move: {
    label: '右键行走', desc: '点哪走哪', icon: 'mouseMove', keyed: true, hasRadius: true,
    defaults: () => ({ id: uid(), type: 'right_click_move', key: 'MouseRight', center: { x: .16, y: .74 }, radius: .12 }),
  },
  observe: {
    label: '观察视角', desc: '小地图区域拖拽', icon: 'scan', keyed: true, hasRadius: true,
    defaults: () => ({ id: uid(), type: 'observe', key: '', center: { x: .85, y: .12 }, radius: .1 }),
  },
  view_extend: {
    label: '视野扩展', desc: '仅渲染配置，无输入', icon: 'expand', keyed: false, hasPos: false,
    defaults: () => ({ id: uid(), type: 'view_extend', scale: 1 }),
  },
};
const PALETTE_ORDER = ['click', 'click_twice', 'steering', 'view', 'fire', 'smart_cast', 'macro', 'drag', 'swipe_direction', 'right_click_move', 'observe'];

/* ---------- 全局默认设置（对应 schema v2 settings） ---------- */
const DEFAULT_SETTINGS = {
  switchKey: 'Backquote',
  mouseSensitivity: 1.0,
  mouseAccel: 0.0,
  steeringDeadzone: 0.08,
  injectHz: 120,
};

/* ---------- 画质档位 ---------- */
const QUALITY_TIERS = [
  { id: 'smooth',   name: '流畅', res: '720P',   fps: 60,  br: '4M',  desc: '低配机 / USB 2.0 口' },
  { id: 'balanced', name: '均衡', res: '1080P',  fps: 60,  br: '8M',  desc: '推荐 · 主流机型' },
  { id: 'hd',       name: '高清', res: '1080P',  fps: 60,  br: '12M', desc: '画质优先' },
  { id: 'ultra',    name: '超清', res: '原生',   fps: 120, br: '16M', desc: '高刷屏 · USB 3.0' },
  { id: 'custom',   name: '自定义', res: '自定义', fps: 60,  br: '8M',  desc: '手动调参' },
];

/* ---------- 模拟设备 ---------- */
const DEVICE_POOL = [
  { name: '小米 14', model: '23127PN0CC', android: 'Android 14', res: '2676×1200', usb: 'USB 3.0', encoder: 'H.265' },
  { name: 'Redmi K70', model: '2311DRK48C', android: 'Android 14', res: '3200×1440', usb: 'USB 2.0', encoder: 'H.265' },
  { name: '一加 12', model: 'PJD110', android: 'Android 15', res: '3168×1440', usb: 'USB 3.0', encoder: 'H.265' },
  { name: '荣耀 100 Pro', model: 'MAO-AN10', android: 'Android 13', res: '2700×1224', usb: 'USB 2.0', encoder: 'H.264' },
  { name: 'vivo X100', model: 'V2309A', android: 'Android 14', res: '2800×1260', usb: 'USB 3.0', encoder: 'H.265' },
  { name: 'iQOO 12', model: 'V2307A', android: 'Android 14', res: '2800×1260', usb: 'USB 3.0', encoder: 'H.264' },
  { name: 'OPPO Find X7', model: 'PHZ110', android: 'Android 14', res: '2780×1264', usb: 'USB 3.0', encoder: 'H.265' },
];

/* ---------- 预设键位 ---------- */
const PRESETS = [
  {
    id: 'pubgm', name: '和平精英', pkg: 'com.tencent.tmgp.pubgmhd',
    orientation: 'landscape', target: { w: 2400, h: 1080 },
    tags: ['FPS', '热门', '标准布局'], hot: true,
    desc: '左手摇杆走位 + 虚拟准心转视角 + 左键开火，附技能/宏进阶位。',
    grad: 'linear-gradient(120deg,#3a4a6b,#22304e)',
    items: [
      { type: 'steering', center: { x: .16, y: .74 }, radius: .11, mode: 'hold', keys: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' }, deadzone: .08, smoothing: 0 },
      { type: 'view', mode: 'crosshair', center: { x: .62, y: .5 }, dragKey: 'MouseRight', sensitivity: 1.15, invertY: false, radius: .15 },
      { type: 'fire', key: 'MouseLeft', pos: { x: .90, y: .60 }, hold: true, repeatMs: 0 },
      { type: 'smart_cast', key: 'KeyQ', pos: { x: .70, y: .86 }, aim: 'view' },
      { type: 'click', key: 'Space', pos: { x: .82, y: .86 }, pressMs: 40 },
      { type: 'click', key: 'KeyR', pos: { x: .90, y: .86 }, pressMs: 40 },
      { type: 'click', key: 'KeyC', pos: { x: .55, y: .86 }, pressMs: 40 },
      { type: 'macro', key: 'KeyE', loop: false, minIntervalMs: 200, steps: [{ act: 'click', pos: { x: .5, y: .92 } }, { act: 'wait', ms: 60 }, { act: 'swipe', from: { x: .5, y: .92 }, to: { x: .75, y: .92 }, ms: 120 }] },
    ],
  },
  {
    id: 'honorofkings', name: '王者荣耀', pkg: 'com.tencent.tmgp.sgame',
    orientation: 'landscape', target: { w: 2400, h: 1080 },
    tags: ['MOBA', '智能施法'], hot: true,
    desc: 'WASD 走位 + 右键拖拽视角 + 左键攻击，四个技能全部智能施法。',
    grad: 'linear-gradient(120deg,#5b3a6b,#2e2240)',
    items: [
      { type: 'steering', center: { x: .14, y: .76 }, radius: .10, mode: 'hold', keys: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' }, deadzone: .08, smoothing: 0 },
      { type: 'view', mode: 'drag', center: { x: .5, y: .45 }, dragKey: 'MouseRight', sensitivity: 1, invertY: false, radius: .35 },
      { type: 'fire', key: 'MouseLeft', pos: { x: .88, y: .78 }, hold: true, repeatMs: 0 },
      { type: 'smart_cast', key: 'KeyQ', pos: { x: .66, y: .90 }, aim: 'view' },
      { type: 'smart_cast', key: 'KeyW', pos: { x: .55, y: .74 }, aim: 'view' },
      { type: 'smart_cast', key: 'KeyE', pos: { x: .55, y: .90 }, aim: 'view' },
      { type: 'smart_cast', key: 'KeyR', pos: { x: .80, y: .66 }, aim: 'view' },
      { type: 'click', key: 'KeyB', pos: { x: .08, y: .28 }, pressMs: 40 },
      { type: 'click', key: 'KeyN', pos: { x: .93, y: .26 }, pressMs: 40 },
      { type: 'macro', key: 'KeyF', loop: false, minIntervalMs: 200, steps: [{ act: 'click', pos: { x: .93, y: .26 } }, { act: 'wait', ms: 80 }, { act: 'click', pos: { x: .85, y: .42 } }] },
    ],
  },
  {
    id: 'genshin', name: '原神', pkg: 'com.miHoYo.Yuanshen',
    orientation: 'landscape', target: { w: 2400, h: 1080 },
    tags: ['开放世界', '视角控制'], hot: false,
    desc: '准心转视角 + 普攻/元素战技/元素爆发，奔跑与跳跃独立键位。',
    grad: 'linear-gradient(120deg,#2e5b4a,#1c3a30)',
    items: [
      { type: 'steering', center: { x: .16, y: .74 }, radius: .11, mode: 'hold', keys: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' }, deadzone: .06, smoothing: 0 },
      { type: 'view', mode: 'crosshair', center: { x: .60, y: .48 }, dragKey: 'MouseRight', sensitivity: 1.2, invertY: false, radius: .15 },
      { type: 'fire', key: 'MouseLeft', pos: { x: .90, y: .55 }, hold: true, repeatMs: 0 },
      { type: 'smart_cast', key: 'KeyE', pos: { x: .68, y: .86 }, aim: 'view' },
      { type: 'smart_cast', key: 'KeyQ', pos: { x: .86, y: .86 }, aim: 'view' },
      { type: 'click', key: 'Space', pos: { x: .78, y: .86 }, pressMs: 40 },
      { type: 'click', key: 'KeyF', pos: { x: .58, y: .86 }, pressMs: 40 },
      { type: 'click', key: 'KeyM', pos: { x: .95, y: .10 }, pressMs: 40 },
      { type: 'click', key: 'KeyB', pos: { x: .89, y: .10 }, pressMs: 40 },
    ],
  },
  {
    id: 'codm', name: '使命召唤手游', pkg: 'com.tencent.tmgp.cf',
    orientation: 'landscape', target: { w: 2400, h: 1080 },
    tags: ['FPS', '进阶布局'], hot: false,
    desc: 'FPS 进阶：连续身形（蹲/趴/切枪）+ 手雷 + 大招，含一个连发宏。',
    grad: 'linear-gradient(120deg,#6b4a2e,#3a2a1c)',
    items: [
      { type: 'steering', center: { x: .16, y: .74 }, radius: .11, mode: 'hold', keys: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' }, deadzone: .08, smoothing: 0 },
      { type: 'view', mode: 'crosshair', center: { x: .62, y: .5 }, dragKey: 'MouseRight', sensitivity: 1.1, invertY: false, radius: .15 },
      { type: 'fire', key: 'MouseLeft', pos: { x: .90, y: .60 }, hold: true, repeatMs: 0 },
      { type: 'click', key: 'KeyR', pos: { x: .90, y: .86 }, pressMs: 40 },
      { type: 'click', key: 'KeyC', pos: { x: .55, y: .86 }, pressMs: 40 },
      { type: 'click', key: 'KeyZ', pos: { x: .44, y: .86 }, pressMs: 40 },
      { type: 'click', key: 'KeyG', pos: { x: .68, y: .74 }, pressMs: 40 },
      { type: 'smart_cast', key: 'KeyQ', pos: { x: .70, y: .86 }, aim: 'view' },
      { type: 'macro', key: 'KeyE', loop: false, minIntervalMs: 200, steps: [{ act: 'click', pos: { x: .44, y: .86 } }, { act: 'wait', ms: 50 }, { act: 'click', pos: { x: .44, y: .86 } }] },
    ],
  },
];

/* ---------- 默认键位（= 和平精英标准布局） ---------- */
function defaultMapping() {
  const p = PRESETS.find(x => x.id === 'pubgm');
  return {
    schema: 2,
    game: { pkg: p.pkg, name: p.name, orientation: p.orientation },
    target: { w: p.target.w, h: p.target.h },
    settings: Object.assign({}, DEFAULT_SETTINGS),
    items: p.items.map(it => Object.assign({ id: uid() }, JSON.parse(JSON.stringify(it)))),
  };
}

/* ---------- 键位归一化（兼容 schema v1） ---------- */
function normalizeKeyCode(k) {
  if (!k || typeof k !== 'string') return '';
  let s = k.trim();
  s = s.replace(/_/g, '');                       // Key_F -> KeyF, Mouse_Left -> MouseLeft
  if (/^mouse/i.test(s)) s = 'Mouse' + s.slice(5).replace(/^./, c => c.toUpperCase());
  if (/^key/i.test(s) && !/^Key[A-Z]$/.test(s)) s = 'Key' + s.slice(3);
  return s;
}

function normalizeKeymap(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('不是有效的 JSON 对象');
  const src = raw.schema ? raw : (raw.version ? Object.assign({}, raw, { schema: 2 }) : raw);
  if (!Array.isArray(src.items)) throw new Error('缺少 items 数组');
  const game = typeof src.game === 'string' ? { pkg: src.game, name: src.game, orientation: 'landscape' }
    : (src.game || { pkg: 'unknown', name: '导入的键位', orientation: 'landscape' });
  const items = src.items.map(it => {
    const n = JSON.parse(JSON.stringify(it));
    if (!n.id) n.id = uid();
    if (!TYPES[n.type]) throw new Error('未知映射类型: ' + n.type);
    if (typeof n.key === 'string') n.key = normalizeKeyCode(n.key);
    if (n.keys) for (const k of Object.keys(n.keys)) n.keys[k] = normalizeKeyCode(n.keys[k]);
    if (n.dragKey) n.dragKey = normalizeKeyCode(n.dragKey);
    if (n.center && typeof n.center.x !== 'number') throw new Error('center 坐标非法');
    return n;
  });
  return {
    schema: 2,
    game: { pkg: game.pkg || 'unknown', name: game.name || '导入的键位', orientation: game.orientation || 'landscape' },
    target: src.target || (src.resolution ? { w: src.resolution.w, h: src.resolution.h } : { w: 2400, h: 1080 }),
    settings: Object.assign({}, DEFAULT_SETTINGS, src.settings || {}),
    items,
  };
}
