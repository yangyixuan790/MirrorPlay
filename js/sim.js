/* ============================================================
   MirrorPlay · 投屏画面模拟引擎
   模拟 scrcpy 视频链路：解码帧渲染 + HUD + 键鼠输入驱动
   ============================================================ */
'use strict';

const Sim = {
  canvas: null, ctx: null,
  W: 1170, H: 540, S: 1.5,          // 内部绘制尺寸（19.5:9）
  mode: 'cast', playtest: false,
  ratio: 19.5 / 9,

  /* 视图状态 */
  angle: 0.6, pitch: 0, recoil: 0,
  cam: { x: 0, z: 0 },
  joy: { x: 0, y: 0 }, joyTarget: { x: 0, y: 0 },
  mouse: { x: 0, y: 0 }, mouseOver: false, locked: false,
  accum: { x: 0, y: 0 },
  viewDragging: false, rcmTimer: 0, rcmVec: { x: 0, y: 0 },

  /* 战斗状态 */
  firing: false, ammo: 30, mag: 30, reloading: 0, fireTimer: 0,
  muzzle: 0, jumpT: -1, skillCd: 0, kills: 0,
  tracers: [], orbs: [], feed: [], ripples: [],

  /* 输入状态表（对应设计文档 5.1 按键去抖） */
  keyState: {},

  mappingOn: true,
  overlay: null,          // 编辑器覆盖层绘制函数
  lastTs: 0,

  buildings: [], enemies: [], stars: [],
};

Sim.FIELD = 1100;
Sim.FOCAL = 0;

/* ---------- 初始化世界数据 ---------- */
Sim.init = function () {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 46; i++) {
    const a = rnd() * Math.PI * 2, d = 260 + rnd() * 900;
    Sim.buildings.push({
      x: Math.cos(a) * d, z: Math.sin(a) * d,
      w: 90 + rnd() * 200, h: 90 + rnd() * 320,
      hue: rnd(), lit: rnd() < .7,
    });
  }
  Sim.buildings.sort((p, q) => (q.x * q.x + q.z * q.z) - (p.x * p.x + p.z * p.z));
  for (let i = 0; i < 7; i++) {
    const a = rnd() * Math.PI * 2, d = 200 + rnd() * 600;
    Sim.enemies.push({ x: Math.cos(a) * d, z: Math.sin(a) * d });
  }
  for (let i = 0; i < 46; i++) {
    Sim.stars.push({ x: rnd(), y: rnd() * .42, r: rnd() * 1.3 + .4, tw: rnd() * 6 });
  }
};

/* ---------- 绑定画布 ---------- */
Sim.bind = function (canvas, ratio) {
  if (Sim.canvas) Sim._unbind();
  Sim.canvas = canvas;
  Sim.ctx = canvas.getContext('2d');
  Sim.ratio = ratio || (19.5 / 9);
  Sim.H = 540;
  Sim.W = Math.round(540 * Sim.ratio);
  Sim.FOCAL = Sim.W * 1.05;
  canvas.width = Math.round(Sim.W * Sim.S);
  canvas.height = Math.round(Sim.H * Sim.S);
  Sim.ctx.setTransform(Sim.S, 0, 0, Sim.S, 0, 0);
  Sim._onDown = Sim._handleDown.bind(Sim);
  Sim._onMove = Sim._handleMove.bind(Sim);
  Sim._onUp = Sim._handleUp.bind(Sim);
  Sim._onDocMove = Sim._handleDocMove.bind(Sim);
  Sim._onPL = Sim._handlePL.bind(Sim);
  Sim._onCtx = e => e.preventDefault();
  canvas.addEventListener('pointerdown', Sim._onDown);
  canvas.addEventListener('pointermove', Sim._onMove);
  canvas.addEventListener('pointerleave', () => { Sim.mouseOver = false; });
  canvas.addEventListener('contextmenu', Sim._onCtx);
  window.addEventListener('pointerup', Sim._onUp);
  document.addEventListener('pointermove', Sim._onDocMove);
  document.addEventListener('pointerlockchange', Sim._onPL);
};

Sim._unbind = function () {
  const c = Sim.canvas;
  c.removeEventListener('pointerdown', Sim._onDown);
  c.removeEventListener('pointermove', Sim._onMove);
  c.removeEventListener('contextmenu', Sim._onCtx);
  window.removeEventListener('pointerup', Sim._onUp);
  document.removeEventListener('pointermove', Sim._onDocMove);
  document.removeEventListener('pointerlockchange', Sim._onPL);
  Sim.canvas = null; Sim.ctx = null;
};

Sim.isLive = function () { return Sim.mode === 'cast' || Sim.playtest; };

/* ---------- 配置读取（与编辑器实时联动） ---------- */
Sim.cfg = function () {
  const m = (typeof App !== 'undefined' && App.mapping) ? App.mapping : null;
  if (!m) return { steer: null, view: null, fire: null, skill: null, settings: DEFAULT_SETTINGS };
  const items = m.items || [];
  const first = t => items.find(i => i.type === t) || null;
  return {
    steer: first('steering'), view: first('view'),
    fire: first('fire'), skill: first('smart_cast'),
    settings: m.settings || DEFAULT_SETTINGS,
  };
};

/* ---------- 坐标换算 ---------- */
Sim.toSim = function (e) {
  const r = Sim.canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) / r.width * Sim.W,
    y: (e.clientY - r.top) / r.height * Sim.H,
  };
};
Sim.rel = function (p) { return { x: p.x / Sim.W, y: p.y / Sim.H }; };
Sim.abs = function (rel) { return { x: rel.x * Sim.W, y: rel.y * Sim.H }; };

/* ---------- 输入事件 ---------- */
Sim._handleDown = function (e) {
  if (!Sim.isLive()) return;
  e.preventDefault();
  const p = Sim.toSim(e);
  Sim.mouse.x = p.x; Sim.mouse.y = p.y; Sim.mouseOver = true;
  try { Sim.canvas.setPointerCapture(e.pointerId); } catch (err) {}

  if (Sim.mappingOn) {
    const cfg = Sim.cfg();
    if (e.button === 0) {
      if (cfg.fire && cfg.fire.key === 'MouseLeft') {
        Sim.firing = true;
        if (!cfg.fire.hold) Sim.shot();
      } else {
        Sim.ripples.push({ x: p.x, y: p.y, t: 1 });
      }
    } else if (e.button === 2) {
      if (cfg.view && cfg.view.mode === 'drag') Sim.viewDragging = true;
      else if (cfg.steer) Sim._rcm(p);
      else Sim.ripples.push({ x: p.x, y: p.y, t: 1 });
    } else {
      Sim.ripples.push({ x: p.x, y: p.y, t: 1 });
    }
  } else {
    /* 普通触控模式：点 HUD 按钮 / 拖拽转视角 */
    const hit = Sim._hitButton(p);
    if (hit) Sim._doAction(hit.act);
    else Sim.viewDragging = true;
  }
};

Sim._handleMove = function (e) {
  if (!Sim.isLive()) return;
  const p = Sim.toSim(e);
  const dx = p.x - Sim.mouse.x;
  Sim.mouse.x = p.x; Sim.mouse.y = p.y; Sim.mouseOver = true;
  if (Sim.viewDragging) Sim.angle += dx * 0.0042;
};

Sim._handleDocMove = function (e) {
  if (Sim.locked && Sim.isLive() && Sim.mappingOn) {
    Sim.accum.x += e.movementX || 0;
    Sim.accum.y += e.movementY || 0;
  }
};

Sim._handleUp = function () {
  Sim.firing = false;
  Sim.viewDragging = false;
};

Sim._handlePL = function () {
  Sim.locked = document.pointerLockElement === Sim.canvas;
};

/* 右键行走：点击坐标 → 摇杆方向向量 */
Sim._rcm = function (p) {
  const cfg = Sim.cfg();
  const c = cfg.steer ? Sim.abs(cfg.steer.center) : { x: Sim.W * .16, y: Sim.H * .74 };
  let vx = p.x - c.x, vy = p.y - c.y;
  const len = Math.hypot(vx, vy) || 1;
  const r = (cfg.steer ? cfg.steer.radius : .11) * Sim.W;
  if (len < r * .3) { Sim.rcmVec = { x: 0, y: 0 }; Sim.rcmTimer = 0; return; }
  vx /= len; vy /= len;
  Sim.rcmVec = { x: vx, y: vy };
  Sim.rcmTimer = 0.45;
};

Sim._hitButton = function (p) {
  for (const b of Sim._buttons()) {
    if (Math.hypot(p.x - b.px, p.y - b.py) <= b.r + 8) return b;
  }
  return null;
};

Sim._doAction = function (act) {
  if (act === 'fire') Sim.shot();
  else if (act === 'jump') Sim.jump();
  else if (act === 'skill') Sim.cast();
  else if (act === 'reload') Sim.reload();
};

/* HUD 按钮定义（与默认键位布局一致，编辑器改动会实时反映） */
Sim._buttons = function () {
  const cfg = Sim.cfg();
  const list = [];
  if (cfg.fire) list.push({ act: 'fire', key: cfg.fire.key, label: '开火', rel: cfg.fire.pos, r: 36 });
  list.push({ act: 'jump', key: 'Space', label: '跳', rel: { x: .82, y: .86 }, r: 30 });
  list.push({ act: 'skill', key: cfg.skill ? cfg.skill.key : 'KeyQ', label: '技', rel: cfg.skill ? cfg.skill.pos : { x: .70, y: .86 }, r: 30 });
  list.push({ act: 'reload', key: 'KeyR', label: '换', rel: { x: .90, y: .86 }, r: 30 });
  return list.map(b => { const a = Sim.abs(b.rel); return Object.assign({}, b, { px: a.x, py: a.y }); });
};

/* ---------- 键盘 ---------- */
Sim.onKey = function (code, down) {
  if (!Sim.isLive()) return;
  Sim.keyState[code] = down;
  const cfg = Sim.cfg();
  if (down) {
    if (code === 'Space') Sim.jump();
    if (code === 'KeyR') Sim.reload();
    if (cfg.fire && code === cfg.fire.key) {
      Sim.firing = true;
      if (!cfg.fire.hold) Sim.shot();
    }
    if (cfg.skill && code === cfg.skill.key) Sim.cast();
  } else {
    if (cfg.fire && code === cfg.fire.key) Sim.firing = false;
  }
};

Sim._steerVec = function () {
  const cfg = Sim.cfg();
  const k = cfg.steer ? (cfg.steer.keys || {}) : { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' };
  const vx = (Sim.keyState[k.right] ? 1 : 0) - (Sim.keyState[k.left] ? 1 : 0);
  const vy = (Sim.keyState[k.down] ? 1 : 0) - (Sim.keyState[k.up] ? 1 : 0);
  return { x: vx, y: vy, len: Math.hypot(vx, vy) };
};

/* ---------- 动作 ---------- */
Sim.shot = function () {
  if (Sim.reloading > 0 || Sim.ammo <= 0) return;
  Sim.ammo--;
  Sim.muzzle = 1;
  Sim.recoil = Math.min(.05, Sim.recoil + .0042);
  Sim.fireTimer = (function () {
    const f = Sim.cfg().fire;
    return (f && f.repeatMs > 0) ? Math.max(50, f.repeatMs) / 1000 : .11;
  })();
  const hit = Math.random() < .32;
  Sim.tracers.push({ a: Sim.angle + (Math.random() - .5) * .035, life: 1, len: 240 + Math.random() * 520, hit: hit });
  if (hit) {
    Sim.kills++;
    Sim.feed.push({ text: '你 淘汰了 玩家' + (100 + Math.floor(Math.random() * 89)), t: 3 });
    if (Sim.feed.length > 3) Sim.feed.shift();
  }
};
Sim.jump = function () { if (Sim.jumpT < 0) Sim.jumpT = 0; };
Sim.cast = function () {
  if (Sim.skillCd > 0) return;
  Sim.skillCd = 8;
  Sim.orbs.push({ x: Sim.cam.x + Math.sin(Sim.angle) * 90, z: Sim.cam.z + Math.cos(Sim.angle) * 90, life: 1.25 });
};
Sim.reload = function () {
  if (Sim.reloading <= 0 && Sim.ammo < Sim.mag) Sim.reloading = 1.8;
};

/* 失焦保护（设计文档 5.1）：清空按键表 + 归位全部手指 */
Sim.resetAll = function () {
  Sim.keyState = {};
  Sim.joyTarget = { x: 0, y: 0 };
  Sim.firing = false;
  Sim.viewDragging = false;
  Sim.rcmTimer = 0;
};

Sim.setMappingMode = function (on) {
  Sim.mappingOn = on;
  if (!on) {
    Sim.resetAll();
    if (document.pointerLockElement === Sim.canvas) document.exitPointerLock();
    Sim.locked = false;
  } else if (Sim.mode === 'cast' && Sim.canvas && Sim.canvas.requestPointerLock) {
    try { Sim.canvas.requestPointerLock(); } catch (err) {}
  }
};

/* ---------- 主更新 ---------- */
Sim.update = function (dt) {
  if (!Sim.isLive()) return;
  const cfg = Sim.cfg();
  const st = cfg.settings;
  const sens = st.mouseSensitivity || 1;
  const accel = st.mouseAccel || 0;

  /* 摇杆向量合成（5.3） */
  const v = Sim._steerVec();
  let vx = v.x, vy = v.y;
  if (v.len > 1) { vx /= v.len; vy /= v.len; }
  const dead = st.steeringDeadzone != null ? st.steeringDeadzone : .08;
  if (v.len < dead) { vx = 0; vy = 0; }
  if (Sim.rcmTimer > 0) { Sim.rcmTimer -= dt; vx = Sim.rcmVec.x; vy = Sim.rcmVec.y; }
  const rPx = (cfg.steer ? cfg.steer.radius : .11) * Sim.W;
  Sim.joyTarget = { x: vx * rPx, y: vy * rPx };
  const smooth = cfg.steer ? (cfg.steer.smoothing || 0) : 0;
  const k = smooth > 0 ? (1 - smooth) * 14 + 2 : 22;
  Sim.joy.x += (Sim.joyTarget.x - Sim.joy.x) * Math.min(1, k * dt);
  Sim.joy.y += (Sim.joyTarget.y - Sim.joy.y) * Math.min(1, k * dt);

  /* 位移（相对视角方向） */
  const speed = 400;
  const dir = { x: Math.sin(Sim.angle), z: Math.cos(Sim.angle) };
  const right = { x: Math.cos(Sim.angle), z: -Math.sin(Sim.angle) };
  Sim.cam.x += (dir.x * -vy + right.x * vx) * speed * dt;
  Sim.cam.z += (dir.z * -vy + right.z * vx) * speed * dt;
  Sim.cam.x = Math.max(-Sim.FIELD, Math.min(Sim.FIELD, Sim.cam.x));
  Sim.cam.z = Math.max(-Sim.FIELD, Math.min(Sim.FIELD, Sim.cam.z));

  /* 视角（5.4 crosshair：鼠标位移 → 累积 → 每周期取出） */
  if (Sim.mappingOn && cfg.view) {
    if (Sim.locked) {
      const f = 1 + accel * Math.min(2, Math.abs(Sim.accum.x) / 26);
      Sim.angle += Sim.accum.x * 0.0026 * sens * f;
      Sim.pitch = Math.max(-.06, Math.min(.06, Sim.pitch + Sim.accum.y * 0.0016));
      Sim.accum.x = 0; Sim.accum.y = 0;
    } else if (Sim.mouseOver) {
      const off = Math.max(-1, Math.min(1, (Sim.mouse.x - Sim.W / 2) / (Sim.W * .42)));
      Sim.angle += off * 2.6 * sens * (1 + accel) * dt;
    }
  }
  if (Sim.viewDragging) Sim.pitch *= (1 - Math.min(1, 4 * dt));

  /* 后坐力与俯仰回复 */
  Sim.recoil *= Math.exp(-5.5 * dt);
  Sim.angle -= Sim.recoil;
  Sim.pitch *= (1 - Math.min(1, 1.6 * dt));

  /* 开火 / 换弹 / 技能 */
  Sim.fireTimer -= dt;
  if (Sim.firing && Sim.fireTimer <= 0) Sim.shot();
  if (Sim.reloading > 0) {
    Sim.reloading -= dt;
    if (Sim.reloading <= 0) { Sim.reloading = 0; Sim.ammo = Sim.mag; }
  }
  Sim.muzzle = Math.max(0, Sim.muzzle - dt * 9);
  Sim.skillCd = Math.max(0, Sim.skillCd - dt);
  if (Sim.jumpT >= 0) {
    Sim.jumpT += dt * 1.5;
    if (Sim.jumpT > 1) Sim.jumpT = -1;
  }

  /* 弹道 / 法球 / 涟漪 / 播报衰减 */
  for (let i = Sim.tracers.length - 1; i >= 0; i--) {
    Sim.tracers[i].life -= dt * 2.6;
    if (Sim.tracers[i].life <= 0) Sim.tracers.splice(i, 1);
  }
  for (let i = Sim.orbs.length - 1; i >= 0; i--) {
    const o = Sim.orbs[i];
    o.x += Math.sin(Sim.angle) * 1050 * dt;
    o.z += Math.cos(Sim.angle) * 1050 * dt;
    o.life -= dt;
    if (o.life <= 0) Sim.orbs.splice(i, 1);
  }
  for (let i = Sim.ripples.length - 1; i >= 0; i--) {
    Sim.ripples[i].t -= dt * 1.8;
    if (Sim.ripples[i].t <= 0) Sim.ripples.splice(i, 1);
  }
  for (let i = Sim.feed.length - 1; i >= 0; i--) {
    Sim.feed[i].t -= dt;
    if (Sim.feed[i].t <= 0) Sim.feed.splice(i, 1);
  }
};

/* ---------- 投影 ---------- */
Sim._proj = function (wx, wz, h) {
  const dx = wx - Sim.cam.x, dz = wz - Sim.cam.z;
  const c = Math.cos(Sim.angle), s = Math.sin(Sim.angle);
  const cz = dx * c + dz * s;
  const cx = -dx * s + dz * c;
  if (cz < 24) return null;
  return {
    x: Sim.W / 2 + (cx / cz) * Sim.FOCAL,
    y: Sim.horizon() - (h / cz) * Sim.FOCAL,
    cz: cz,
  };
};
Sim.horizon = function () {
  return Sim.H * .52 + Sim.pitch * Sim.H * .9 + (Sim.jumpT >= 0 ? Math.sin(Sim.jumpT * Math.PI) * 26 : 0);
};

/* ---------- 渲染 ---------- */
Sim.render = function () {
  const ctx = Sim.ctx;
  if (!ctx) return;
  const W = Sim.W, H = Sim.H, hz = Sim.horizon();

  /* 天空 */
  const sky = ctx.createLinearGradient(0, 0, 0, hz);
  sky.addColorStop(0, '#0a0f24');
  sky.addColorStop(.45, '#2b2350');
  sky.addColorStop(.78, '#7a3f5e');
  sky.addColorStop(1, '#c9714a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, hz + 1);

  /* 星星 */
  const time = performance.now() / 1000;
  ctx.fillStyle = '#fff';
  for (const s of Sim.stars) {
    ctx.globalAlpha = .25 + .3 * Math.abs(Math.sin(time * .6 + s.tw));
    ctx.fillRect(s.x * W, s.y * hz, s.r, s.r);
  }
  ctx.globalAlpha = 1;

  /* 太阳 */
  const sunX = ((W * .74 - Sim.angle * 150) % (W * 1.7) + W * 1.7) % (W * 1.7) - W * .35;
  const sunY = hz - 34;
  const glow = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 130);
  glow.addColorStop(0, 'rgba(255,214,150,.95)');
  glow.addColorStop(.25, 'rgba(255,150,90,.45)');
  glow.addColorStop(1, 'rgba(255,120,80,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sunX - 140, sunY - 140, 280, 280);
  ctx.fillStyle = '#ffd9a0';
  ctx.beginPath(); ctx.arc(sunX, sunY, 21, 0, 7); ctx.fill();

  /* 远山剪影（两层视差） */
  const layer = (par, color, base, amp, step) => {
    const off = -Sim.angle * par * 90;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-40, hz);
    for (let x = -40; x <= W + 40; x += step) {
      const wx = x + off;
      const y = hz - base - amp * (Math.sin(wx * .008) + .5 * Math.sin(wx * .021 + 1.7));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W + 40, hz);
    ctx.closePath(); ctx.fill();
  };
  layer(2.2, '#241d3d', 46, 34, 26);
  layer(1.2, '#181430', 24, 20, 20);

  /* 地面 */
  const gnd = ctx.createLinearGradient(0, hz, 0, H);
  gnd.addColorStop(0, '#241c33');
  gnd.addColorStop(.35, '#141a2c');
  gnd.addColorStop(1, '#0b0e18');
  ctx.fillStyle = gnd;
  ctx.fillRect(0, hz, W, H - hz);

  /* 地面网格 */
  ctx.lineWidth = 1;
  const G = 90;
  for (let g = -7; g <= 7; g++) {
    /* 横向线（沿 z） */
    ctx.strokeStyle = 'rgba(53,200,245,' + (g === 0 ? .16 : .07) + ')';
    ctx.beginPath();
    let started = false;
    for (let x = -G * 3; x <= G * 3; x += G / 2) {
      const p = Sim._proj(Sim.cam.x + x, Sim.cam.z + g * G, 0);
      if (!p) { started = false; continue; }
      if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    /* 纵向线（沿 x） */
    ctx.beginPath();
    started = false;
    for (let z = -G * 3; z <= G * 3; z += G / 2) {
      const p = Sim._proj(Sim.cam.x + g * G, Sim.cam.z + z, 0);
      if (!p) { started = false; continue; }
      if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }

  /* 建筑（远 → 近） */
  const list = Sim.buildings
    .map(b => ({ b: b, p: Sim._proj(b.x, b.z, 0), t: Sim._proj(b.x, b.z, b.h) }))
    .filter(o => o.p && o.t && o.p.cz > 40 && o.p.x > -400 && o.p.x < W + 400)
    .sort((a, c) => c.p.cz - a.p.cz);
  for (const o of list) {
    const wpx = (o.b.w / o.p.cz) * Sim.FOCAL;
    const x = o.t.x - wpx / 2, y = o.t.y, w = wpx, h = o.p.y - o.t.y;
    if (h < 2 || w < 1) continue;
    ctx.fillStyle = o.b.hue > .5 ? '#0d1322' : '#10141f';
    ctx.fillRect(x, y, w, h);
    /* 受光边 */
    ctx.fillStyle = 'rgba(255,150,100,.14)';
    ctx.fillRect(x, y, Math.max(1, w * .06), h);
    /* 亮窗 */
    if (o.b.lit && w > 14 && h > 20) {
      ctx.fillStyle = 'rgba(255,196,110,.5)';
      const cols = Math.max(1, Math.floor(w / 16)), rows = Math.max(1, Math.floor(h / 20));
      for (let cx = 0; cx < cols; cx++) for (let cy = 0; cy < rows; cy++) {
        if ((cx * 7 + cy * 13 + Math.floor(o.b.x)) % 5 === 0) {
          ctx.fillRect(x + 5 + cx * 16, y + 6 + cy * 20, 5, 7);
        }
      }
    }
  }

  /* 技能法球 */
  for (const o of Sim.orbs) {
    const p = Sim._proj(o.x, o.z, 60);
    if (!p) continue;
    const r = Math.max(4, 90 / p.cz * Sim.FOCAL);
    const g2 = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, r * 2);
    g2.addColorStop(0, 'rgba(139,124,246,.9)');
    g2.addColorStop(1, 'rgba(139,124,246,0)');
    ctx.fillStyle = g2;
    ctx.beginPath(); ctx.arc(p.x, p.y, r * 2, 0, 7); ctx.fill();
    ctx.fillStyle = '#cfc4ff';
    ctx.beginPath(); ctx.arc(p.x, p.y, r * .5, 0, 7); ctx.fill();
  }

  /* 武器 */
  Sim._drawWeapon(ctx, W, H);

  /* 弹道 */
  const cx0 = W / 2, cy0 = H / 2 + Sim.pitch * H * .9;
  for (const t of Sim.tracers) {
    const dx = Math.sin(t.a), dy = -Math.cos(t.a);
    ctx.strokeStyle = 'rgba(255,230,160,' + (t.life * .85) + ')';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cx0, cy0);
    ctx.lineTo(cx0 + dx * t.len, cy0 + dy * t.len);
    ctx.stroke();
    if (t.hit) {
      const hx = cx0 + dx * t.len, hy = cy0 + dy * t.len;
      ctx.strokeStyle = 'rgba(255,255,255,' + t.life + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(hx - 6, hy - 6); ctx.lineTo(hx + 6, hy + 6);
      ctx.moveTo(hx + 6, hy - 6); ctx.lineTo(hx - 6, hy + 6);
      ctx.stroke();
    }
  }

  /* HUD */
  Sim._drawHUD(ctx, W, H, cx0, cy0);

  /* 点击涟漪 */
  for (const r of Sim.ripples) {
    ctx.strokeStyle = 'rgba(255,255,255,' + (r.t * .7) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(r.x, r.y, (1 - r.t) * 42 + 6, 0, 7); ctx.stroke();
  }

  /* 编辑器覆盖层 */
  if (Sim.overlay) Sim.overlay(ctx, W, H);
};

Sim._drawWeapon = function (ctx, W, H) {
  const kick = Sim.recoil * 34;
  ctx.save();
  ctx.translate(W * .68, H + 66 - kick);
  ctx.rotate(-.05 + Sim.recoil * .45);
  /* 枪身 */
  ctx.fillStyle = '#1c2436';
  ctx.beginPath();
  ctx.moveTo(-46, -150); ctx.lineTo(168, -166); ctx.lineTo(192, -108);
  ctx.lineTo(168, -66); ctx.lineTo(-46, -56);
  ctx.closePath(); ctx.fill();
  /* 受光边 */
  ctx.fillStyle = 'rgba(53,200,245,.10)';
  ctx.fillRect(-46, -166, 240, 6);
  /* 弹匣 */
  ctx.fillStyle = '#27324c';
  ctx.fillRect(-30, -92, 46, 96);
  ctx.strokeStyle = 'rgba(53,200,245,.30)';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(-30, -92, 46, 96);
  /* 瞄准镜 */
  ctx.fillStyle = '#31406b';
  ctx.fillRect(46, -196, 66, 22);
  ctx.fillStyle = '#8b7cf6';
  ctx.fillRect(52, -192, 8, 14);
  /* 枪管 */
  ctx.fillStyle = '#0f1420';
  ctx.fillRect(124, -148, 26, 44);
  /* 枪口火光 */
  if (Sim.muzzle > 0) {
    const mx = 150, my = -126;
    const g = ctx.createRadialGradient(mx, my, 2, mx, my, 52 * Sim.muzzle);
    g.addColorStop(0, 'rgba(255,240,190,' + Sim.muzzle + ')');
    g.addColorStop(.4, 'rgba(255,170,70,' + Sim.muzzle * .7 + ')');
    g.addColorStop(1, 'rgba(255,140,50,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(mx, my, 52 * Sim.muzzle, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,245,210,' + Sim.muzzle * .9 + ')';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(mx - 26 * Sim.muzzle, my); ctx.lineTo(mx + 26 * Sim.muzzle, my);
    ctx.moveTo(mx, my - 22 * Sim.muzzle); ctx.lineTo(mx, my + 22 * Sim.muzzle);
    ctx.stroke();
  }
  ctx.restore();
};

Sim._drawHUD = function (ctx, W, H, cx, cy) {
  const cfg = Sim.cfg();

  /* ---- 小地图 ---- */
  const mx = 86, my = 86, mr = 56;
  ctx.fillStyle = 'rgba(7,11,18,.66)';
  ctx.beginPath(); ctx.arc(mx, my, mr, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(53,200,245,.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  const sc = mr / 1300;
  ctx.save();
  ctx.translate(mx, my); ctx.rotate(-Sim.angle);
  ctx.strokeStyle = 'rgba(53,200,245,.12)';
  ctx.lineWidth = 1;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath(); ctx.moveTo(-mr, i * 26); ctx.lineTo(mr, i * 26); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(i * 26, -mr); ctx.lineTo(i * 26, mr); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,107,107,.9)';
  for (const e of Sim.enemies) {
    const ex = (e.x - Sim.cam.x) * sc, ey = (e.z - Sim.cam.z) * sc;
    if (Math.hypot(ex, ey) < mr - 4) {
      ctx.beginPath(); ctx.arc(ex, ey, 3, 0, 7); ctx.fill();
    }
  }
  ctx.restore();
  ctx.fillStyle = '#e8eef9';
  ctx.beginPath();
  ctx.moveTo(mx, my - 9); ctx.lineTo(mx - 6, my + 7); ctx.lineTo(mx + 6, my + 7);
  ctx.closePath(); ctx.fill();

  /* ---- 顶部信息 ---- */
  ctx.font = '600 13px ' + 'Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(232,238,249,.92)';
  ctx.fillText('存活 96   ·   淘汰 ' + Sim.kills, W / 2, 34);

  /* ---- 击杀播报 ---- */
  ctx.textAlign = 'right';
  ctx.font = '12px Consolas, monospace';
  Sim.feed.forEach((f, i) => {
    ctx.globalAlpha = Math.min(1, f.t);
    ctx.fillStyle = 'rgba(245,196,81,.95)';
    ctx.fillText(f.text, W - 24, 30 + i * 20);
  });
  ctx.globalAlpha = 1;

  /* ---- 准心 ---- */
  if (Sim.mappingOn) {
    const px = Sim.locked ? W / 2 : Sim.mouse.x;
    const py = Sim.locked ? H / 2 : Sim.mouse.y;
    const spread = 8 + Sim.recoil * 700 + (Math.hypot(Sim.joy.x, Sim.joy.y) / (Sim.W * .11)) * 6;
    ctx.strokeStyle = 'rgba(53,200,245,.95)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(px - spread - 8, py); ctx.lineTo(px - spread, py);
    ctx.moveTo(px + spread, py); ctx.lineTo(px + spread + 8, py);
    ctx.moveTo(px, py - spread - 8); ctx.lineTo(px, py - spread);
    ctx.moveTo(px, py + spread); ctx.lineTo(px, py + spread + 8);
    ctx.stroke();
    ctx.fillStyle = 'rgba(53,200,245,.9)';
    ctx.fillRect(px - 1, py - 1, 2, 2);
  }

  /* ---- 映射可视化（与编辑器实时联动） ---- */
  if (Sim.mappingOn) {
    if (cfg.steer) {
      const c = Sim.abs(cfg.steer.center), r = cfg.steer.radius * W;
      ctx.fillStyle = 'rgba(53,200,245,.05)';
      ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(53,200,245,.28)';
      ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, 7); ctx.stroke();
      ctx.setLineDash([]);
      /* 摇杆滑块 */
      const kx = c.x + Sim.joy.x, ky = c.y + Sim.joy.y;
      ctx.fillStyle = 'rgba(53,200,245,.75)';
      ctx.beginPath(); ctx.arc(kx, ky, r * .42, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(7,11,18,.8)';
      ctx.beginPath(); ctx.arc(kx, ky, r * .30, 0, 7); ctx.fill();
      ctx.font = '10px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(53,200,245,.6)';
      ctx.fillText('摇杆区', c.x, c.y + r + 16);
    }
    if (cfg.view) {
      const c = Sim.abs(cfg.view.center), r = cfg.view.radius * W;
      ctx.strokeStyle = 'rgba(139,124,246,.30)';
      ctx.setLineDash([4, 8]);
      ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, 7); ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = '10px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(139,124,246,.65)';
      ctx.fillText('视角区 · 灵敏度 ' + (cfg.view.sensitivity || 1).toFixed(2), c.x, c.y - r - 10);
    }
  }

  /* ---- 功能按钮 ---- */
  for (const b of Sim._buttons()) {
    const active = (b.act === 'fire' && Sim.firing);
    ctx.fillStyle = active ? 'rgba(53,200,245,.30)' : 'rgba(7,11,18,.55)';
    ctx.beginPath(); ctx.arc(b.px, b.py, b.r, 0, 7); ctx.fill();
    ctx.strokeStyle = active ? 'rgba(53,200,245,.9)' : 'rgba(53,200,245,.35)';
    ctx.lineWidth = active ? 2 : 1.4;
    ctx.stroke();
    /* 冷却 / 换弹进度 */
    if (b.act === 'skill' && Sim.skillCd > 0) {
      ctx.strokeStyle = 'rgba(139,124,246,.85)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(b.px, b.py, b.r - 4, -Math.PI / 2, -Math.PI / 2 + (1 - Sim.skillCd / 8) * Math.PI * 2);
      ctx.stroke();
    }
    if (b.act === 'reload' && Sim.reloading > 0) {
      ctx.strokeStyle = 'rgba(245,196,81,.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(b.px, b.py, b.r - 4, -Math.PI / 2, -Math.PI / 2 + (1 - Sim.reloading / 1.8) * Math.PI * 2);
      ctx.stroke();
    }
    ctx.font = '600 13px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(232,238,249,.9)';
    ctx.fillText(b.label, b.px, b.py + 4);
    /* 键帽标注 */
    ctx.font = '9.5px Consolas, monospace';
    ctx.fillStyle = 'rgba(53,200,245,.85)';
    ctx.fillText(keyLabel(b.key), b.px, b.py + b.r + 14);
  }

  /* ---- 弹药 ---- */
  ctx.textAlign = 'right';
  ctx.font = '600 15px Consolas, monospace';
  ctx.fillStyle = Sim.ammo > 0 ? 'rgba(232,238,249,.92)' : 'rgba(255,107,107,.95)';
  ctx.fillText(Sim.ammo + ' / ' + Sim.mag, W - 118, 66);
  ctx.font = '10px "Microsoft YaHei", sans-serif';
  ctx.fillStyle = 'rgba(143,161,187,.8)';
  ctx.fillText('M416 · 自动', W - 118, 82);
  if (Sim.reloading > 0) {
    ctx.fillStyle = 'rgba(245,196,81,.95)';
    ctx.fillText('换弹中…', W - 118, 98);
  }

  /* ---- 触控模式提示 ---- */
  if (!Sim.mappingOn && Sim.isLive()) {
    ctx.textAlign = 'center';
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = 'rgba(143,161,187,.75)';
    ctx.fillText('普通触控模式 · 拖动转视角 · 按 ~ 切回映射模式', W / 2, H - 20);
  }
};
