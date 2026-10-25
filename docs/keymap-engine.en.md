# MirrorPlay Keyboard & Mouse Mapping Engine — Detailed Design

> Companion document: *Free Mobile Game Mirroring — Software Plan* v1.2 (expansion of section 4.6)
> Version v1.0, last updated 2026-09
> Audience: client developers and QA responsible for this module

English translation. The Chinese original is the authoritative version: [keymap-engine.zh.md](keymap-engine.zh.md)

---

## 1. Module Positioning

### 1.1 Why It Is the Core

Screen mirroring itself is "a problem scrcpy already solved", and the GUI is "grunt work". The only thing that decides whether this product can compete is the keyboard & mouse mapping engine — precisely what TC Games sells as a VIP feature, and why the free tier only offers four basic mapping categories: walk / aim / fire / plain tap.

Goal of this module: **implement every TC Games VIP mapping type, make it feel right, and keep it free forever.**

### 1.2 Design Goals

| Goal | Metric |
| --- | --- |
| Latency | Key/mouse event from press to injection on device ≤ 15 ms |
| Precision | Cross-resolution (720P ↔ 1080P ↔ 2K) coordinate error < 1% |
| Concurrency | ≥ 4 simultaneous "fingers" (left joystick + right view + fire + skill) without interference |
| Feel | View control supports sensitivity, deadzone, and acceleration curves — tunable until it "feels like a PC game" |
| Extensibility | New mapping types require no changes to the engine core — just add one Strategy |

### 1.3 Explicit Red Lines

- **Input-device translation only**: translate keyboard/mouse events into touch events, 1:1 with human intent.
- **No** aimbot, auto recoil control, wallhack, auto-farming, or image-recognition-based auto decisions.
- Macros are **multi-step sequences explicitly recorded/authored by the user**, must have a rate cap and a "requires holding the key" constraint, and must never run unattended — this is the boundary against cheats; see section 9.

---

## 2. Overall Architecture

```
┌─ Input Capture Layer ────────────────────────────────┐
│  KeyboardHook (Raw Input / LowLevelKeyboardProc)      │
│  MouseHook    (Raw Input relative delta + absolute)   │
│  → unified into InputEvent{type, code, state, dx, dy, ts} │
└────────────────────┬─────────────────────────────────┘
                     │ lock-free ring buffer (single producer)
┌────────────────────▼─────────────────────────────────┐
│  MappingEngine (dedicated high-frequency thread)      │
│   ├ KeyRouter    : key → MappingItem (O(1) lookup)    │
│   ├ Strategy     : one state machine per type (§5)    │
│   ├ CoordMapper  : window coords → relative → device  │
│   ├ PointerPool  : pointer id alloc / reclaim / timeout│
│   └ EventMerger  : same-frame multi-pointer merge     │
└────────────────────┬─────────────────────────────────┘
                     │ Gesture{action, pointerId, x, y, ts}
┌────────────────────▼─────────────────────────────────┐
│  Injector                                            │
│   ├ throttle: align to injection frequency (60–120Hz)│
│   ├ serialize: control protocol messages             │
│   └ send: ADB control socket → device-side inject    │
└──────────────────────────────────────────────────────┘
```

Threading model: **capture thread → engine thread → injection thread**, three decoupled stages; a stall in any one stage never blocks the other two. Queues use single-producer/single-consumer lock-free ring buffers to avoid jitter from lock contention.

### 2.1 Why Raw Input for Capture

- Mouse: we need **raw relative deltas untouched by OS pointer acceleration**, otherwise view feel is polluted by Windows pointer acceleration. Raw Input's `RIDEV_NOLEGACY` gives us raw dx/dy.
- Keyboard: we must distinguish **physical keys** (`VK_` via scancode mapping) to avoid key mismatches from IME/keyboard-layout differences; we also need the key repeat state and handle it ourselves (see 5.1).

---

## 3. Coordinate System (the easiest place to get wrong — nail it down first)

A coordinate passes through four layers; any mistake shows up as "the tap landed in the wrong place".

```
① Window pixels (wx, wy)     mouse position inside the mirror window
        ↓ CoordMapper.windowToRelative()
② Relative coords (rx, ry)   0~1, resolution/DPI independent ★ only this layer is persisted
        ↓ CoordMapper.relativeToDevice()
③ Device render coords (dx, dy) device's current resolution (incl. rotation)
        ↓ device-side injection
④ In-game UI coords
```

**Persist relative coordinates only**: keymap JSON always stores 0~1. The same keymap then stays accurate on 720P, 1080P, and 2K phones — this is why the data model in 4.6 uses `pos: {x: 0.82, y: 0.61}`.

### 3.1 Window → Relative Coordinates (letterbox must be subtracted)

The mirror window keeps the aspect ratio and often has black bars (letterbox); computing from raw window coordinates introduces offset.

```
// given: client area wndW×wndH, actual video area videoRect{x,y,w,h}
rx = (wx - videoRect.x) / videoRect.w
ry = (wy - videoRect.y) / videoRect.h
// clamp to [0,1]; taps outside the video area are dropped
```

Three supported fill modes (matching window settings in plan 4.4):

| Mode | videoRect computation | Tap outside bounds |
| --- | --- | --- |
| Contain (default) | centered with bars | dropped |
| Stretch | fills window | allowed, but coordinates are stretched |
| Cover | fills and crops overflow | dropped |

### 3.2 Relative → Device Coordinates (rotation must be handled)

```
// device's current width/height (rotation already applied)
if (rotation == 90 || rotation == 270) { devW = H; devH = W; } else { devW = W; devH = H; }

dx = rx * devW
dy = ry * devH
```

**Key pitfall**: device-side injection uses the **device's current coordinate system**. When a landscape game runs while the device itself is in portrait rotation, the actual rotation must be read before converting. Rotation changes must become events from M1 onward (recompute all active pointer positions when the device rotates).

### 3.3 Video Resolution ≠ Device Resolution

During mirroring, `--max-size` scaling reduces bandwidth: video frames may be 720P while the device is 1080P. Because the middle layer uses relative coordinates, this difference is absorbed naturally — the second reason relative coordinates are mandatory.

---

## 4. Data Model (Full Schema)

```jsonc
{
  "schema": 2,
  "game": {
    "pkg": "com.tencent.tmgp.pubgmhd",
    "name": "Example Game",
    "orientation": "landscape"          // landscape | portrait | auto
  },
  "target": { "w": 2400, "h": 1080 },   // reference resolution used when authoring; editor display only
  "settings": {
    "switchKey": "Backquote",           // ~ toggles mapping mode / plain touch mode
    "mouseSensitivity": 1.0,
    "mouseAccel": 0.0,                  // 0 = linear, >0 enables acceleration curve
    "steeringDeadzone": 0.08,
    "injectHz": 120                     // injection frequency
  },
  "items": [
    {
      "id": "move",
      "type": "steering",
      "center": { "x": 0.18, "y": 0.72 },
      "radius": 0.12,
      "mode": "hold",                   // hold = finger stays; tap = full gesture per trigger
      "keys": { "up": "KeyW", "down": "KeyS", "left": "KeyA", "right": "KeyD" },
      "smoothing": 0.0
    },
    {
      "id": "look",
      "type": "view",
      "mode": "crosshair",              // crosshair = pointer lock + crosshair; drag = hold to drag
      "center": { "x": 0.62, "y": 0.50 },
      "dragKey": "MouseRight",
      "sensitivity": 1.0,
      "invertY": false,
      "radius": 0.15                    // max drag radius per gesture (prevents swallowed input)
    },
    { "id": "fire",  "type": "fire",   "key": "MouseLeft", "pos": { "x": 0.88, "y": 0.45 },
      "hold": true, "repeatMs": 0 },
    { "id": "jump",  "type": "click",  "key": "Space", "pos": { "x": 0.93, "y": 0.78 },
      "pressMs": 40 },
    { "id": "reload","type": "click",  "key": "KeyR", "pos": { "x": 0.80, "y": 0.62 } },
    { "id": "skill1","type": "smart_cast", "key": "KeyQ", "pos": { "x": 0.55, "y": 0.80 },
      "aim": "view" },                  // cast direction follows the view pointer
    { "id": "combo", "type": "macro",  "key": "KeyE", "loop": false, "minIntervalMs": 200,
      "steps": [
        { "act": "click", "pos": { "x": 0.3, "y": 0.8 } },
        { "act": "wait", "ms": 60 },
        { "act": "swipe", "from": { "x": 0.3, "y": 0.8 }, "to": { "x": 0.6, "y": 0.8 }, "ms": 120 }
      ]}
  ]
}
```

### 4.1 Field Design Notes

- `schema` version number: **mandatory**. Future fields/semantics rely on it for migration, otherwise old keymap files silently break — the most common landmine in any scriptable feature.
- `target.w/h`: editor background ruler display only, **never used at runtime** (runtime always goes through relative coordinates).
- `id`: stable unique per item, used for pointer binding and conflict detection.
- `switchKey`: mandatory. Players often need to briefly return to plain touch (dragging a backpack, tapping menus); one-key switching is a hard requirement.

### 4.2 Conflict Detection Rules (live validation in the editor)

| Conflict | Handling |
| --- | --- |
| One key bound to multiple items | error, rebind required (view + fire on different keys don't conflict) |
| Two steering/view items occupying the same screen region | warning (may swallow each other's events) |
| macro and click on the same key | error |
| Bound to a system-reserved key (e.g. `switchKey` itself, Alt+F4) | error |

---

## 5. Mapping Types: State Machines and Algorithms

Every type implements the same interface:

```cpp
class IMappingStrategy {
public:
    virtual void onKeyDown(const KeyEvent& e) = 0;
    virtual void onKeyUp(const KeyEvent& e)   = 0;
    virtual void onMouse(const MouseEvent& e) = 0;   // includes relative delta dx/dy
    virtual void onTick(int64_t nowMs)        = 0;   // driven by the engine main loop, for continuous gestures
    virtual void onReset()                    = 0;   // force home on mode switch / disconnect
};
```

### 5.1 General: Key Debounce and Repeat Handling

Windows keeps sending keydown while a key is held. The engine must maintain its own key-state table:

```
onKeyDown(k): if (keyState[k]) return;   // ignore repeat
              keyState[k] = true; dispatch(k, DOWN);
onKeyUp(k):   if (!keyState[k]) return;
              keyState[k] = false; dispatch(k, UP);
```

**Focus-loss protection**: when the window loses focus (Alt+Tab), force all keyState to false and call `onReset()` on every strategy — otherwise you get the classic "released the key but the character keeps running" bug with a stuck joystick. This must be done on day one of M2.

### 5.2 click / click_twice (plain tap, double tap)

Simplest, with two details:

- `pressMs`: gap between down and up, default 40 ms. **Too fast (<16 ms) and some games won't register it**; too slow reads as a long-press. Make it adjustable, default 40 ms.
- Double tap: two down-up cycles, interval recommended 60~100 ms, also adjustable.

### 5.3 steering (joystick / directional movement) ★ the core of feel

**Algorithm** (runs per tick or on each key-state change):

```
vx = (right?1:0) - (left?1:0)
vy = (down?1:0)  - (up?1:0)          // screen y axis points down
len = hypot(vx, vy)
if (len > 1) { vx /= len; vy /= len; }   // normalize: diagonals don't accelerate
if (len < deadzone) { vx = 0; vy = 0; }  // deadzone: light-touch misfire protection

targetX = center.x + vx * radius
targetY = center.y + vy * radius
```

**Two modes:**

| Mode | Behavior | Use case |
| --- | --- | --- |
| `hold` (default, recommended) | On entering mapping mode, `DOWN` at center and **keep the finger down**; continuous `MOVE` while keys are held; return to center on release | Most games, lowest latency |
| `tap` (compat fallback) | Each key press triggers a full `DOWN → MOVE → UP` | Games that detect long-press, or where the joystick only responds if pressed at center |

**Why hold mode**: FPS movement is continuous. Re-issuing down on every keypress adds gesture-setup overhead, and some games respond unstably to rapid joystick tapping. In hold mode the finger stays down and only moves — closest to a real finger resting on the stick.

**Move step limiting**: a single move's displacement must not exceed `radius * 0.5`; larger jumps are interpolated over multiple frames — prevents instant large displacements from being flagged as anomalous gestures or triggering "blink"-style misfires.

**Recenter**: releasing all direction keys → move back to center (`smoothing` can add a 2~3 frame transition to avoid a snap-to-zero being read as release).

### 5.4 view / crosshair (view control) ★ the hardest part

This is the watershed of "does it feel like a PC game".

#### crosshair (virtual crosshair) mode

1. Enter mapping mode → pointer locked inside the window (`ClipCursor`) + system cursor hidden + **OSD crosshair drawn**.
2. Mouse relative deltas `(dx, dy)` accumulate into `accum`.
3. Each injection period: take this period's delta from `accum`, scale by sensitivity, convert into one drag of the view region.
4. The view finger also stays (`hold`): `DOWN` at `center` → continuous `MOVE` → `UP` only when leaving mapping mode.

```
// per period
stepX = accumX * sensitivity * (1 + accel * speedFactor)
stepY = accumY * sensitivity * (1 + accel * speedFactor)   // negated when invertY
accum -= step                                  // consume this period, avoid drift
newPos = clamp(lastPos + (stepX, stepY), center ± radius)
inject(MOVE, viewPointerId, newPos)
```

**Radius clamp is mandatory**: view dragging cannot accumulate indefinitely, or the finger slides off-screen and gets discarded by the system. The mainstream approach is "relative sliding" — after the finger reaches the boundary it springs back to center and keeps accumulating (the recenter strategy). Implementation: if `|newPos - center| > radius`, inject one move back to center and continue. This recenter must be imperceptible (completed within the same move sequence), or players feel the view "jump".

#### drag (hold to drag) mode

Hold `dragKey` (default right button) → DOWN → follow the mouse MOVE → release UP. Suits MOBA/turn-based; FPS players generally choose crosshair.

#### Sensitivity and Acceleration

- Default linear (`mouseAccel = 0`); most FPS players prefer linear.
- When accel > 0, enable the curve: fine at low speed, wide sweep at high speed. Provide a 0~1 slider with live preview.
- Sensitivity should optionally split horizontal/vertical — some players want different Y speed.

### 5.5 fire (shooting / auto-click)

- `hold: true` → continuous while held (most common), finger stays at `pos`.
- `repeatMs > 0` → auto-click mode at a fixed interval. **A minimum must be enforced** (recommended ≥ 50 ms) to avoid building an auto-clicker.
- Coexists with view: the fire finger and view finger are **two different pointers**, no interference (see 5.8).

### 5.6 smart_cast / cancel_cast (smart cast / cancel cast)

MOBA essential: press the skill key → show range → drag to pick direction → release to cast; drag into the cancel zone to cancel.

```
onKeyDown: pointer DOWN at the skill key pos
onTick:    if aim == "view", direction follows the view pointer → MOVE to pos + dir*range
onKeyUp:   if the pointer is inside cancelZone → MOVE to cancel zone then UP (triggers cancel)
           otherwise → UP at the current position (triggers cast)
```

### 5.7 macro (macro keys)

Timeline steps:

```jsonc
"steps": [
  { "act": "click", "pos": {...} },
  { "act": "wait",  "ms": 60 },
  { "act": "swipe", "from": {...}, "to": {...}, "ms": 120 },
  { "act": "key",   "code": "KeyF" }     // triggers another mapping item
]
```

**Hard constraints (compliance red line, not configurable around)**:

| Constraint | Value |
| --- | --- |
| `loop` defaults to false; when true it must bind to "hold the key" | release = stop |
| Minimum interval between macro runs `minIntervalMs` | ≥ 200 ms (default) |
| No image recognition, conditional branches, or memory reads inside macros | structurally unsupported |
| Macro step count cap | ≤ 32 |

When executing a macro, **releasing the key immediately aborts** the remaining steps and homes all pointers.

### 5.8 PointerPool: Multi-finger Concurrency Management

Holding "W to move + mouse to look + left click to fire + Q for skill" is the norm, requiring 4 independent fingers.

```
ACTION_DOWN          → first finger
ACTION_POINTER_DOWN  → 2nd~Nth finger (with pointerId, pointerIndex must be correct)
ACTION_MOVE          → batch update (one event can carry multiple pointers' coords)
ACTION_POINTER_UP    → lift one (others stay)
ACTION_UP            → the last one
```

**Pitfalls that must be handled (really hit in scrcpy's implementation)**:

1. **Pointer id leaks**: injecting down without a matching up leaves the id occupied long-term and all subsequent touches fail. Must have an id pool + timeout reclaim (force UP after ≥5 s of inactivity).
2. **MOVE event merging**: multiple fingers moving in the same injection period → synthesize **one** multi-pointer MOVE event rather than N single-pointer events. Saves bandwidth and guarantees the game sees the same multi-finger state at the same instant (separate sends read as jitter).
3. **index and id are not the same thing**: `pointerIndex` is the index within the current event (changes), `pointerId` is the finger's stable identity. Confusing them causes multi-finger chaos.
4. **onReset full coverage**: focus loss, disconnect, mode switch, script switch — all must walk the pool and UP every active finger.

### 5.9 Other Types at a Glance

| Type | Implementation notes |
| --- | --- |
| drag (swipe) | Fixed start/end, interpolated injection per `durationMs` (default 120 ms, 8~12 sample points) |
| swipe_direction | 8 directions + custom distance, `durationMs` recommended 200~400 ms (too fast doesn't trigger) |
| sliding_attack | Swipe sequence + attack-key pointer in parallel |
| right_click_move | Clicked coordinate → vector to steering center → converted to steering input |
| view_extend | Window render ratio / crop configuration, produces no input events |
| observe (observer view) | Region-limited drag, pointer clamped inside the minimap range |

---

## 6. Injection Rhythm and Latency Control

### 6.1 Injection Frequency

| Scenario | Recommended injectHz |
| --- | --- |
| View movement (FPS) | 120 (aligned with high-refresh displays) |
| Joystick movement | 60~90 |
| Plain taps | event-driven, no fixed frequency needed |

Higher injection frequency does not improve responsiveness — it only piles up `injectInputEvent` on the device side and increases latency. The engine throttles **per item type**: view at high frequency, joystick at medium, taps event-driven.

### 6.2 Latency Budget (internal to this module)

| Stage | Budget |
| --- | --- |
| Raw Input capture | < 1 ms |
| Queue handoff | < 1 ms |
| Mapping computation (lookup + vector synthesis) | < 1 ms |
| Serialization + send | 1~3 ms |
| Device-side injection (server side) | 5~15 ms |
| **Module total** | **≤ 15 ms** (excluding mirror video latency) |

### 6.3 Backpressure and Frame Dropping

When the queue is full: **drop the oldest mouse move** (in view scenarios, keeping the latest position beats keeping intermediate frames), but **never drop down/up** (one lost event = a stuck finger). This is an explicit priority policy.

---

## 7. Editor Design (WYSIWYG)

### 7.1 Interaction Flow

```
① Connect the device and start mirroring, enter the game's target screen
② Open the mapping editor → a translucent editing layer overlays the video
③ Drag a control type from the right "control palette" onto the screen → drop point = relative coordinate
④ Adjust parameters on the right property panel (key, radius, sensitivity, duration…)
⑤ Click "Playtest" → changes apply live, tune while playing
⑥ Save → generate JSON, auto-associated with the game package name
```

### 7.2 Key Capability Checklist

| Capability | Notes |
| --- | --- |
| Frame freeze for point-picking | The game keeps moving, making points hard to place → "freeze current frame" then mark coordinates |
| Grid snapping + alignment guides | Joysticks/buttons are usually symmetric; snap to existing controls' horizontal/vertical lines |
| Multi-select batch move | Move a whole UI group (e.g. four skill-bar keys) together |
| Live conflict highlighting | Duplicate keys, region overlap highlighted instantly (see 4.2) |
| Aspect-ratio simulation | Switch 16:9 / 19.5:9 / 20:9 preview in the editor to check keys on non-standard screens |
| Import / export / share | Export a JSON file or a text snippet for free community exchange |
| Undo / redo | Ctrl+Z / Ctrl+Y, basic editor hygiene |
| Cloud preset library | Static JSON hosting, one-click download without login; local cache + version-diff updates |

### 7.3 Launch Presets

Recommend covering 10~15 titles at launch: 3~4 FPS (including the two most popular battle royales domestically), 2~3 MOBA, the rest open-world/competitive. Each ships with a "standard layout" and an "advanced layout (with macros/smart cast)".

---

## 8. Compatibility and Fallbacks

### 8.1 Games That Block Simulated Injection

Some games detect non-physical touch sources. Fallback chain:

```
SDK injection (injectInputEvent)
   ↓ ineffective
HID mode (present PC keyboard/mouse as a USB physical keyboard/mouse, scrcpy v1.23+)
   ↓ still ineffective
Flag the game as "incompatible", add to the crowdsourced list
```

HID mode also travels over USB, a natural fit with this product's "wired-only" route and a major advantage over wireless solutions.

**Note**: in HID mode input appears as a physical device and the coordinate system may differ (absolute-coordinate device); the engine must switch its coordinate output mode in HID mode — handle this together with HID work in M3.

### 8.2 Lists Requiring Crowdsourced Maintenance

- Joystick `hold` vs `tap`: which games require `tap`
- Effective `pressMs` range: some games won't tap below 30 ms
- Effective view `radius` values: view-region sensitivity varies widely across games
- Whether "USB debugging (Security settings)" is mandatory: record per device model

Publishing this list as an openly editable document/repository is an important source of community engagement.

---

## 9. Compliance Red Lines (hard constraints at the engine level)

| Item | Engine implementation |
| --- | --- |
| No aimbot | The engine provides no "detect enemy → move crosshair" capability; input can only come from user key/mouse events |
| No image-recognition decisions | The engine never feeds video frames into decisions (architectural isolation: the mapping engine cannot access video frames) |
| Macro rate limiting | `minIntervalMs ≥ 200`, steps ≤ 32, `loop` must bind to a held key |
| Auto-click rate limiting | `repeatMs ≥ 50` |
| No memory/protocol access | No such interfaces |

**Architectural isolation is the strongest statement**: making the mapping engine **structurally unable to access video frames** makes aimbot impossible at the root — both a compliance guarantee and the most powerful explanation when questioned.

---

## 10. Test Plan

### 10.1 Unit Tests (no device needed)

| Case | Verification |
| --- | --- |
| Vector synthesis | 4-key combos → correct normalization, diagonals don't overspeed (\|v\| ≤ 1) |
| Deadzone | Tiny inputs filtered, boundary values correct |
| Coordinate transforms | Four combinations incl. letterbox/stretch/rotation; forward/inverse reversible, error < 0.5% |
| recenter | View finger springs back at the boundary, displacement continuous with no jumps |
| Pointer pool | 4-finger concurrent alloc/reclaim, forced release on timeout, no leaks |
| Focus-loss homing | Simulate Alt+Tab; all keyState cleared, all pointers UP |

### 10.2 Integration Tests (real device + real games)

- At least 1 playable real-game case per mapping type.
- **Cross-resolution consistency**: the same keymap hits the same UI element on 720P / 1080P / 2K devices.
- **Concurrency stress**: joystick + view + fire + skill simultaneously for 5 minutes, no stuck fingers, no id leaks.
- **Long-running**: 2 hours of continuous play, no memory growth, no latency degradation.
- **Focus loss / disconnect**: Alt+Tab, unplug/replug 20× each, no residual fingers after recovery.

### 10.3 Feel Tests (subjective but mandatory)

Organize 5~10 FPS players for blind A/B testing against TC Games VIP, focused on three questions: **does the view feel responsive, is there movement lag, do sustained operations stick fingers**.

---

## 11. Task Breakdown (M2 phase, ~6 weeks)

| # | Task | Duration | Deliverable |
| --- | --- | --- | --- |
| 1 | Input capture layer (Raw Input, key-state table, focus-loss protection) | 3 days | printable key/mouse event stream |
| 2 | Coordinate system + CoordMapper (incl. letterbox/rotation unit tests) | 3 days | unit tests pass |
| 3 | PointerPool + injection layer (multi-finger, merging, timeout reclaim) | 4 days | 4-finger concurrency stress passes |
| 4 | click / click_twice / drag / swipe basic types | 3 days | basic operations usable |
| 5 | steering (vector synthesis, hold/tap, deadzone) | 4 days | MOBA/FPS movement usable |
| 6 | view / crosshair (crosshair, sensitivity, recenter) | 6 days | FPS view feel meets bar |
| 7 | fire / smart_cast / remaining types | 4 days | all types complete |
| 8 | macro engine (incl. compliance rate limits) | 3 days | macros recordable/playable |
| 9 | JSON schema + import/export + conflict detection | 3 days | keymap files shareable |
| 10 | Editor UI (drag, snapping, property panel, playtest) | 7 days | WYSIWYG |
| 11 | Preset library + first-launch 10~15 keymaps | 5 days | works out of the box |
| 12 | Real-device integration + feel tuning | 5 days | all test cases pass |

**The critical path is 5 → 6** (joystick and view). Without these two done well the product has no soul; assign the developer with the best feel experience and bring players into blind testing early.
