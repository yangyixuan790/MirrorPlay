# Free Mobile Game Mirroring — Software Plan

> Positioning: a TC Games-class "Android real-device mirroring + keyboard & mouse mobile gaming" experience, but **free throughout — no membership, no watermark, no ads, no account**.
> Project codename: **MirrorPlay** (replaceable). Document version v1.2, last updated 2026-09.
> v1.2 changes: **wireless mirroring removed; connection unified to USB cable + ADB**, zero install on the phone side. The phone-side app design and channel abstraction layer were removed accordingly, bringing the schedule back to 20 weeks.

English translation. The Chinese original is the authoritative version: [software-plan.zh.md](software-plan.zh.md)

---

## 1. Background and Goals

### 1.1 What Problem This Solves

Mobile gamers want their phone's picture on a big PC screen with keyboard & mouse control. The three mainstream options each have hard flaws:

| Option | Problem |
| --- | --- |
| Android emulators | Heavy, some games detect emulators and ban or downgrade graphics, account risk control |
| TC Games-class commercial mirroring | Free tier gutted: resolution locked to 640P, fps locked to 60, bitrate 16M, 1 device only, partial key mapping; 1080P/120FPS/multi-instance/full mapping/watermark removal all require VIP |
| Stock scrcpy | Completely free and strongest performance, but a command-line tool with no GUI and no key mapping — **game players can't use it** |

The gap is clear: **scrcpy's performance + TC Games' ease of use + never a membership wall**.

### 1.2 Product Goals

- **Connection goal**: **USB-wired only (ADB)**. Plug in the data cable and go; **zero install on the phone**, no residue after unplugging.
- **Experience goal**: end-to-end latency ≤ 70 ms, stable 1080P@60fps.
- **Feature goal**: mirroring + audio + complete key mapping (incl. joystick movement, crosshair view, macros/auto-click) + multi-device + screen recording & screenshots, all free.
- **Trust goal**: no data uploads, no account system, no ad SDK, no behavior telemetry, no cloud relay.
- **Platform goal**: phase one Windows 10/11 (the absolute majority of mobile gamers), phase two macOS / Linux.

### 1.3 Explicit Non-Goals

- **No wireless mirroring**: no Wi-Fi channel, no phone-side app, no QR/LAN discovery pairing. Rationale in 1.4.
- No emulator, no cloud streaming (local direct connection for latency and privacy).
- No iOS support (iOS has no equivalent jailbreak-free capture channel; technically infeasible and non-compliant).
- No game cheats: no aimbot, wallhack, scripted farming, protocol cracking. Keyboard & mouse mapping is "input-device translation" and must be clearly separated from "automation cheating" (see section 9, compliance).

### 1.4 Why No Wireless

Dropping wireless is not a compromise — it makes the product sharper:

| Dimension | Wireless's problem | Wired-only gain |
| --- | --- | --- |
| Latency | Network transit adds 15~60 ms, subject to router/walls/interference with uncontrollable jitter | Stable link, latency controllable at 40~70 ms, predictable gaming experience |
| Permission path | Preserving full key mapping over wireless requires a phone app to hold shell permissions (wireless debugging, one tap after each reboot, domestic ROMs kill background apps) | Plug in and connect; no ROM keep-alive adaptation burden |
| Development effort | Extra phone-side app (auth guidance, service hosting, keep-alive, LAN discovery, ROM compat matrix) | Saves ~4 weeks of schedule and the entire mobile maintenance cost |
| Stability reputation | Wireless disconnects are the #1 source of bad reviews for mirroring tools | Bad reviews stay within a controllable scope |
| User scenario | Mobile gamers sit at a PC with the phone on a stand anyway | USB is entirely sufficient; the cable also charges (essential for long sessions) |

> The cost must be stated clearly: users need a **data-capable cable** and must enable USB debugging once. Both are covered by guidance and detection in 4.1.

---

## 2. Competitor and Market Research

### 2.1 TC Games Free vs VIP (we implement the full VIP list, free)

| Dimension | TC Games Free | TC Games VIP | This project |
| --- | --- | --- | --- |
| Resolution | 640P | 1080P | **unrestricted (native/custom)** |
| Frame rate | 60FPS | 120FPS | **unrestricted (follows device)** |
| Bitrate | 16M | 60M | **unrestricted** |
| Device count | 1 | 5 | **unrestricted (PC performance and USB ports permitting)** |
| Key mapping | Partial (walk/aim/fire/tap) | All (drag swipe, directional swipe, view control, virtual crosshair, macros, smart cast, etc.) | **all free** |
| Recording watermark | Yes | No | **no watermark** |
| Phone mouse pointer display | VIP | VIP | free |
| Screen-off control / clipboard / cloud keymap storage | VIP | VIP | free (cloud storage replaced by local file export & sharing) |

### 2.2 State of the Free/Open-Source Camp

- **scrcpy** (Genymobile, Apache-2.0): the de facto standard kernel. No root, zero phone install, official latency 35~70 ms, 30~120fps, 1920×1080 and above. v2.0 added audio forwarding (Android 11+) and H.265/AV1; v2.2 camera mirroring; v2.7 gamepad support; v3.0 virtual display; community has v4.x, client migrated from SDL2 to SDL3, explicitly tuning MediaCodec `KEY_PRIORITY`/`KEY_LATENCY` to minimum for lower encoding latency. **The performance ceiling, but pure command line.**
- **QtScrcpy** (C++/Qt + FFmpeg + OpenGL): adds GUI, custom key mapping (JSON scripts), multi-device group control. Downside: mapping capability is basic, some advanced parameters missing, maintenance pace slowed in recent years.
- **escrcpy** (Electron): most modern UI, easiest to start, but Electron is large and resource-hungry.
- **AnLink**: no login, Chinese GUI, audio support, but Windows-only, infrequent updates, lags on Android 14+.

**Conclusion**: don't write the kernel from scratch. Building GUI + game-enhancement layers on top of the scrcpy protocol is this plan's core technical decision, compressing the schedule from years to months.

---

## 3. Overall Technical Approach

### 3.1 Route: Reuse the scrcpy Protocol + Self-built GUI and Mapping Layer

Three routes compared:

| Route | Effort | Performance | Risk |
| --- | --- | --- | --- |
| A. Fully self-built capture/encode/transport | Extreme | needs long-term tuning | High |
| B. Reuse scrcpy server + self-built PC client | Medium | **≈ native scrcpy** | Low |
| C. Command-line wrapper around scrcpy.exe | Small | limited by inter-process pipes; audio/input/multi-window hard to control finely | Medium |

**Choose B**: incorporate scrcpy's Android-side server as the "device-side agent" into the build (or link scrcpy's C client core directly), and self-build the Windows GUI shell + key mapping engine + multi-device manager. This inherits scrcpy's low-latency implementation while allowing free game-oriented features.

### 3.2 Architecture and Data Flow

```
┌─────────────── PC (Windows client) ────────────────┐
│  UI layer (WinUI3 / Qt)                             │
│   ├ device manager   ├ mapping editor  ├ settings  │
│   └ OSD crosshair layer └ macro script engine      │
│  Core layer                                         │
│   ├ ADB channel management (bundled adb, exclusive) │
│   ├ video: FFmpeg decode → D3D11/OpenGL (zero buf) │
│   ├ audio: Opus/AAC decode → WASAPI low latency    │
│   ├ input: event capture → control protocol → dev  │
│   └ recording: MP4/MKV mux (reuse raw stream)      │
└───────────────┬────────────────────────────────────┘
                 │ USB cable + ADB tunnel, 1~3 sockets
┌───────────────┴─────── Android device ─────────────┐
│  scrcpy-server (shell/UID 2000, app_process)       │
│   ├ ScreenCapture → MediaCodec hardware (H.264/265)│
│   ├ AudioRecord(REMOTE_SUBMIX) → Opus              │
│   └ Controller → InputManager.injectInputEvent     │
└─────────────────────────────────────────────────────┘
```

Key point: the server is pushed by PC-side adb into `/data/local/tmp`, runs as the **shell** user, and is cleaned up on exit — **no install traces on the phone, no root, no extra switches beyond the standard one**. The entire chain is local and passes through no server.

### 3.3 Division of Labor Across the Three Sockets

| Socket | Direction | Content |
| --- | --- | --- |
| video | device → PC | device name + encoded stream (with PTS / packet-size header) |
| audio | device → PC | Opus/AAC stream; PC side maintains average buffering against jitter |
| control | bidirectional | PC input events upstream; device clipboard changes downstream |

> Practical tip: default to "network role reversal" — the client listens first and the server connects back, avoiding connection failures from races.

---

## 4. Key Module Designs

### 4.1 USB Connection and Device Discovery

- **Bundled adb**: self-packaged platform-tools (Apache-2.0, redistributable); the client starts `adb server` on an exclusive port to avoid "version mismatch" conflicts with a user's existing adb.
- **Hotplug listening**: WM_DEVICECHANGE / SetupAPI to detect plug/unplug, auto-identify serial and model; devices appear in the list on plug-in.
- **First-connection guidance**: step-by-step to enable "USB debugging" (Settings → About phone → tap build number → Developer options → USB debugging); on the authorization dialog, check "always allow".
- **Injection permission hints**: some domestic models (Xiaomi/Redmi etc.) also need "USB debugging (Security settings)" enabled to inject clicks; give per-model guidance pages and one-tap jumps.
- **Troubleshooting in three steps**: when no device is detected, split hints by "charge-only cable / unauthorized / missing driver" — the three most common beginner traps; must give actionable next steps, not just "connection failed".
- **Driver fallback**: bundle common Android ADB drivers (Google / major OEMs) with a one-click install entry.
- **Multi-port concurrency**: support USB hub multi-device connections; advise USB 3.0 ports (USB 2.0 works but latency rises to 80~150 ms).
- **Auto-reconnect**: retry within 3 seconds of an unexpected disconnect; restore the last window layout and mapping script on recovery.
- **Exit cleanup**: clean temp files and residual processes on the device on disconnect/exit; no traces after unplugging.

### 4.2 Video Capture and Encoding

- Capture: `SurfaceControl` / `MediaProjection`; supports "screen-off mirroring" (equivalent to `--turn-screen-off`, saves power and protects privacy — practical for long sessions).
- Encoder priority: **H.265 → H.264 → AV1** (picked by measuring `--list-encoders` results on the device). H.265 saves 30~50% bandwidth at equal quality, but some low-end devices encode with higher latency — measure and fall back.
- Low-latency config: explicitly set MediaCodec `KEY_PRIORITY = 0` (realtime), `KEY_LATENCY` to minimum; disable B-frames; use CBR instead of VBR for stable bandwidth.
- Reference parameters (1920×1080@60fps gaming): bitrate 6~8 Mbps; `--max-fps=60`; the fps cap follows the device's actual render rate dynamically to avoid encoding pile-up from "frame chasing".
- Dynamic adaptation: the PC side measures decode jitter and frame-drop rate, feeding back dynamic resolution downgrades (1080→720)/bitrate cuts to guarantee "fluency over sharpness".

### 4.3 Audio Forwarding (with degradation strategy)

| Android version | Approach | Notes |
| --- | --- | --- |
| ≥ 13 | `AudioRecord(playback)` + `--audio-dup` | phone and PC play simultaneously; some apps declare "uncapturable" and can't be captured |
| ≥ 12 | `AudioRecord(REMOTE_SUBMIX)` | works out of the box, forwards device output, mutes the phone |
| = 11 | same | **screen must be unlocked at startup**; needs a brief fake popup so the system thinks shell is foreground, else capture fails |
| ≤ 10 | unsupported | auto-degrade to video-only; UI states "system version limit" and suggests audio cable/Bluetooth alternatives |

- Default Opus 128 Kbps; auto-fallback to AAC when the device lacks an Opus encoder (direct fix for `Failed to initialize audio/opus`).
- Buffer defaults to 50 ms; viewing scenarios can relax to 200 ms for smoothness, gaming tightened to 20~40 ms.
- A/V sync: video defaults to zero buffer while audio must buffer — they're naturally misaligned; the PC side uses audio as the master clock with slight video delay alignment (±1 frame) to avoid "sound ahead of picture".

### 4.4 Decoding and Rendering

- Decoding: FFmpeg (libavcodec), hardware-first (Windows D3D11VA / DXVA2), explicit fallback to software with a notice on failure.
- Rendering: D3D11 + swap chain, YUV→RGB in shader, **zero buffer: render immediately after decode**; when frames pile up, actively drop old frames to keep the newest (gaming prefers dropped frames over latency).
- Window: borderless minimal mode (matching TC Games minimal mode), always-on-top, fullscreen, landscape stretch to remove bars (contain/stretch/cover selectable).

### 4.5 Input Injection

- Default `InputManager.injectInputEvent()` (SDK mode): supports multi-touch, pointer ID management.
- **HID mode**: present PC keyboard/mouse as a USB physical device (scrcpy v1.23+). More effective against games that block simulated injection — an important compatibility fallback, and it too travels over USB, a natural fit with the "wired-only" route.
- **OTG mode**: control without USB debugging (no video), as a special-scenario supplement.
- Pointer management pitfall: pointers/finger ids must be released correctly after injection, or "finger ids stay occupied" breaks all subsequent touches — a real bug hit in open-source implementations; needs a client-side id pool and timeout reclaim.
- Text input: via clipboard/text injection, enabling "type on the phone with the PC input method".

### 4.6 Keyboard & Mouse Mapping Engine (**core differentiator, invest heavily**)

This is where TC Games charges membership, and the only module needing genuinely original design.

> **See the companion document "Keyboard & Mouse Mapping Engine — Detailed Design"** for the four-layer coordinate system, full JSON schema, state machines and algorithms for 13 mapping types (joystick vector synthesis, view crosshair and recenter), multi-finger PointerPool management, injection rhythm and latency budget, editor interaction, compliance red lines and test plan, and the 12-task M2 breakdown.

Summary only below.

#### Mapping Data Model (JSON, importable/exportable/shareable)

```json
{
  "version": 1,
  "game": "com.tencent.tmgp.pubgmhd",
  "resolution": { "w": 2400, "h": 1080 },
  "items": [
    { "type": "click",      "key": "Key_F",  "pos": { "x": 0.82, "y": 0.61 } },
    { "type": "click_twice","key": "Key_G",  "pos": { "x": 0.70, "y": 0.55 } },
    { "type": "drag",       "key": "Key_R",  "start": { "x": 0.5, "y": 0.4 }, "end": { "x": 0.5, "y": 0.7 }, "durationMs": 120 },
    { "type": "steering",   "keys": { "up": "Key_W", "down": "Key_S", "left": "Key_A", "right": "Key_D" },
                            "center": { "x": 0.18, "y": 0.72 }, "radius": 0.12 },
    { "type": "view",       "mode": "crosshair", "center": { "x": 0.5, "y": 0.5 }, "sensitivity": 1.0 },
    { "type": "fire",       "key": "Mouse_Left", "pos": { "x": 0.88, "y": 0.45 }, "repeatMs": 0 },
    { "type": "macro",      "key": "Key_Q", "steps": [
        { "act": "click", "pos": { "x": 0.3, "y": 0.8 } },
        { "act": "wait", "ms": 50 },
        { "act": "swipe", "from": { "x": 0.3, "y": 0.8 }, "to": { "x": 0.6, "y": 0.8 }, "ms": 100 }
    ]}
  ]
}
```

Coordinates are always **relative 0~1**, naturally adapting to different resolutions and DPIs; changing devices causes no drift.

#### Mapping Types to Implement (matching and exceeding the TC Games VIP list)

| Type | Description | Implementation notes |
| --- | --- | --- |
| click / click_twice | plain tap, double tap | pointer down/up, adjustable interval |
| drag (swipe) | fixed start/end swipe | segmented interpolation injection, control duration and sample interval |
| swipe_direction | directional swipe | 8 directions + custom distance |
| sliding_attack | attack while swiping | combined pointer sequence |
| steering (joystick) | left-hand movement | 4-key vector synthesis → normalize into radius → continuous pointer move injection; recenter on release |
| view (view control) | right-hand look | mouse relative delta → center-screen drag; mind pointer capture and sensitivity curves |
| crosshair (virtual crosshair) | FPS view mode | mouse locked in window, crosshair drawn, right-click ADS, move to look |
| fire (shooting/auto-click) | left-click fire | supports hold-to-fire + configurable auto-click interval |
| macro (macro key) | multi-step sequence | timeline script with wait/click/swipe/key; **rate-limited**, no unattended high-frequency loops |
| smart_cast / cancel_cast | MOBA-oriented | press to show range, release to cast |
| right_click_move | click-to-move | coordinate → joystick direction |
| view_extend | widen view | screen ratio / render crop config |
| observe (observer view) | minimap drag view | region-limited drag |

#### Editor Design

- **WYSIWYG on the mirrored picture**: drag a key onto a screen position → pick type → tune parameters → live playtest.
- Built-in hot-game presets (10~15 mainstream FPS/MOBA at launch), one-click download of the cloud preset library (pure JSON static hosting, no login).
- Import/export/share (files, text snippets) for free community keymap exchange — **this is the free replacement for "cloud storage" and the cold-start word-of-mouth source**.
- One-key toggle of "mapping mode / plain touch mode" (e.g. `~`) to avoid accidental mapping triggers.

### 4.7 Multi-Device and Group Control

- Each device gets an independent window + independent server instance, distinguished by random `scid` for multiple clients on the same device.
- Group-control mode: main-window operations sync to checked devices (coordinates mapped proportionally).
- Batch APK install, batch script execution; window grid auto-arrangement (2×2 / 3×3).
- Performance red line: N devices × 1080P@60 decoding is linear PC cost, **and multiple USB shares host-controller bandwidth** — the UI must state recommended configs (advise USB 3.0 dedicated ports or powered 3.0 hubs) and support "secondary devices drop bitrate".

### 4.8 Screen Recording and Screenshots

- Recording **reuses the device-side stream muxing** (MP4/MKV) with no re-encoding: lossless quality at near-zero CPU cost.
- Timestamp naming, region recording, mute phone during recording (avoids echo), **never add a watermark**.
- Screenshots: PC-side current-frame PNG; also supports `adb exec-out screencap` for native resolution.

### 4.9 GUI Design Points

- Main UI in three blocks: device list / parameter panel / mapping editor; first run has a "five-step onboarding" (plug in → enable USB debugging → connect → tune quality → pick a keymap and play).
- Quality tiers: Smooth / Balanced / HD / Ultra / Custom, each mapping directly to a resolution + bitrate + fps + encoder combo.
- All-Chinese, no account, no login, settings in local JSON only.
- Cable hints: when unstable connection is detected, proactively suggest "switch to a data-capable cable / use a USB 3.0 port".

---

## 5. Technology Selection

| Layer | Choice | Rationale / license |
| --- | --- | --- |
| Device-side kernel | scrcpy-server (Java, compiled into jar/APK) | no root, zero phone install; Apache-2.0 |
| PC client language | C++20 (recommended) or Rust | close to FFmpeg/SDL, controls memory and latency |
| GUI | Qt 6 (LGPLv3, dynamic-linking compliant) or WinUI 3 | Qt: cross-platform, signal/slot async, mature community; WinUI 3: native Windows look |
| Rendering | SDL3 / D3D11 + custom shaders | SDL adopted by scrcpy mainline; D3D11 eases Windows hardware-decode coupling |
| Decoding | FFmpeg 6.x (LGPL/GPL, mind the license — see section 9) | best hardware-decode compatibility |
| Audio output | WASAPI (exclusive/low-latency shared) + SDL Audio | Windows low latency |
| Channel | bundled adb (platform-tools), USB only | Apache-2.0 |
| Packaging | CMake + vcpkg; Inno Setup / MSIX | — |
| Config/keymaps | JSON (nlohmann/json or Qt QJson) | easy to share |

---

## 6. Performance Goals and Latency Budget

End-to-end latency breakdown (USB 3.0 targets):

| Stage | Budget |
| --- | --- |
| Screen capture + hardware encode | 15~25 ms |
| Transport (USB 3.0) | 3~8 ms (USB 2.0 rises to 80~150 ms total) |
| PC decode | 3~8 ms |
| Render to screen | 5~10 ms |
| Input injection | 5~15 ms |
| **Total** | **40~70 ms** |

Optimization checklist:

1. Client-side **zero video buffering**; drop old frames when they pile up.
2. Encoder-side `KEY_PRIORITY=realtime`, minimum `KEY_LATENCY`, no B-frames, CBR.
3. Hardware decode first; on failure, state it explicitly rather than silently degrading quality.
4. Bitrate adaptation: closed-loop resolution/bitrate reduction based on frame-drop/jitter feedback.
5. Audio and video buffers per scenario (gaming 20~40 ms / viewing 150~200 ms).
6. Render, decode, and input threads separated, never blocking each other.
7. USB port selection guidance: prefer USB 3.0, avoid front panels or cheap hubs.

---

## 7. How "Free Forever" Survives (sustainability model)

No membership sales, no feature unlocks — so what sustains it? Optional combinations:

1. **Open source + voluntary donations**: GitHub Sponsors / 爱发电 / Alipay-WeChat donation codes; main repo fully open source under Apache-2.0, which is itself the best distribution and trust endorsement.
2. **One-time purchase (optional)**: sell **services** like "offline installer + priority tech support + keymap customization", not software features; features stay 100% free to honor the promise.
3. **Merch/hardware**: low-latency USB cables, phone cooling clips, stands — strongly related to the product, non-intrusive (wired-only makes "good cable" recommendations natural).
4. **Enterprise/bulk licensing**: separately charge **group-control enterprise editions** for mobile game studios, guilds, and test teams (multi-device orchestration, batch scripts, centralized management); personal version stays free forever.
5. **Cost side**: no server relay (pure local USB direct) → bandwidth and server costs are zero; the keymap preset library is covered by free static hosting/CDN quotas.

> The principle goes on the homepage: **never a paywall, never a watermark, never ads, never upload user data**. This promise itself is the strongest marketing point against competitors.

---

## 8. Development Roadmap (~20 weeks / 5 months, 3-person team)

| Phase | Duration | Deliverable | Acceptance criteria |
| --- | --- | --- | --- |
| **M0 Tech validation** | Weeks 1-2 | scrcpy server + minimal self-built client working | stable 1080P@60 output; measured USB latency ≤70 ms; injected taps work |
| **M1 Core mirroring** | Weeks 3-6 | GUI shell, device manager, quality tiers, audio forwarding, recording/screenshots, screen-off control | ≥90% connect success on 10 mainstream models; audio works on Android 11+; ≤10 degrades correctly |
| **M2 Mapping engine** | Weeks 7-12 | all mapping types + WYSIWYG editor + preset library | 3 mainstream FPS/MOBA fully playable with key & mouse; coordinates don't drift across resolutions |
| **M3 Multi-device & polish** | Weeks 13-16 | multi-window, group control, auto-reconnect, macro engine, performance adaptation | 4 devices stable at 720P@60; auto-recovery within 3 s of disconnect |
| **M4 Public beta** | Weeks 17-18 | installer, code signing, website, docs, feedback channel | 500-person beta, crash rate <1%, reviews concentrated on "please add XX game presets" |
| **M5 Official release** | Weeks 19-20 | GitHub open source + website download + launch preset pack | license manifest complete, compliance review passed |

Future plans (M6+): macOS/Linux versions, gamepad mapping, virtual camera output (for OBS streaming), keymap community marketplace.

---

## 9. Legal and Compliance (confirm before starting work)

1. **Open-source licenses**: scrcpy is Apache-2.0, commercially usable and modifiable; Qt under LGPLv3 requires dynamic linking and replacement capability; **FFmpeg with GPL components enabled forces the whole project to GPL** — closed-source commercial use needs an LGPL build or a commercial license. This is the easiest pitfall.
2. **Ads/SDK**: this plan includes no third-party analytics or ad SDK; the privacy policy can state "we collect no data" — a hard promise.
3. **Anti-cheat red line**: key mapping is "input-device translation", but **must not** provide aimbot, recoil control, wallhack, auto-farming, protocol cracking, or memory modification. The product must prominently state "this tool provides no game cheating features; users bear responsibility for bans caused by violations".
4. **FLAG_SECURE**: some apps (banking, copyrighted content, IM, etc.) set anti-screenshot flags; system-level capture may still grab them — the product should proactively remind users to respect apps' content protection and copyright, and not market this as a feature.
5. **Distribution**: Windows needs a code-signing certificate (otherwise SmartScreen severely hurts install rates); website and download pages need ICP filing/compliance (for mainland China users).
6. **Disclaimer**: no built-in cracking, ad-removal, or game-client modification; no bundled installs.

---

## 10. Risk List and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Games block simulated injection | key & mouse dead | HID mode fallback (also USB, fits this plan); build a crowdsourced "compatible devices/games" list |
| Domestic ROM permission differences (need "USB debugging (Security settings)") | high connect failure rate | per-vendor guidance pages; built-in common-model FAQ; one-tap settings jump |
| User has a charge-only cable | device undetected, beginners quit immediately | three-step troubleshooting with explicit cable-swap advice; recommended cables on the website |
| USB 2.0 port bandwidth insufficient | latency rises to 80~150 ms | detect port speed at startup and advise switching to USB 3.0 |
| Multi-device shared USB controller bandwidth | multi-instance collective stutter | advise powered USB 3.0 hubs; secondary devices auto-drop bitrate |
| Low-end device H.265 encode latency high | stutter | encoder benchmark scoring + auto-fallback to H.264 |
| Android 11 audio needs unlocked screen | audio failure | fake popup + explicit prompt at startup; auto-degrade to video-only on failure |
| Some users just want wireless | lose a share of potential users | clear product positioning (latency first); explain trade-offs in FAQ; don't compromise the main experience for wireless |
| Qt/installer size hurts distribution | install rate drops | choose Qt or native; provide a portable no-install version |
| Misjudged as a cheat by competitors/platforms | reputation and distribution blocked | prominent red-line statement on the homepage; zero automated gameplay features |
| Upstream scrcpy protocol changes | upgrade cost | lock server version; strong client/server version validation (mismatch = hard error) |

---

## 11. Acceptance Test Cases (summary)

- Connection: 20 USB hotplug cycles with no leaks or residual processes; multiple devices identified correctly.
- Cable and port speed: test charge/data cables and USB 2.0/3.0 ports separately; verify hint accuracy.
- Quality: 640P→1080P→native tiers, 30/60/90/120 fps switching without crashes.
- Latency: measure on 3 device models using high-speed camera / PTS stamping; produce a measured table.
- Audio: one device each on Android 10/11/12/13+/14; verify degradation and `--audio-dup` behavior.
- Mapping: at least 1 real-game case per mapping type; cross-resolution (1080P ↔ 720P) coordinate consistency.
- Stability: 8 hours continuous run with no memory growth; 50 unplug/replug cycles with ≥95% success.
- Uninstall: no residual files/processes on the phone after exit (verify `/data/local/tmp` cleanup).

---

## 12. Appendix

### A. Common Parameters Quick Reference (for GUI tier mapping)

```
--max-size=1920        cap the long edge, reduce resolution for fluency
--video-bit-rate=8M    bitrate (6~8M recommended for 1080P@60)
--max-fps=60           fps cap
--video-codec=h265     H.265/AV1 optional, saves 30~50% bandwidth
--audio-buffer=40      audio buffer (default 50 ms, gaming 20~40 ms)
--video-buffer=0       zero buffer by default
--turn-screen-off      keep mirroring with phone screen off
--no-audio / --no-video / --no-control
--record=file.mp4      stream-reuse recording, no re-encoding
--list-encoders        list device encoders for auto-selection
```

### B. Recommended Repository Structure

```
MirrorPlay/
├─ core/            # client core: ADB channel, decode, render, input, recording
├─ server/          # Android-side kernel (from scrcpy, Apache-2.0 attribution retained)
├─ keymap/          # mapping engine + preset JSON
├─ ui/              # GUI shell
├─ third_party/     # adb / FFmpeg / SDL / Qt
├─ docs/            # getting started, device compat table, cable & port FAQ, keymap sharing spec
└─ LICENSE-NOTICE   # third-party licenses and attributions
```

### C. References

- scrcpy official repo and developer docs (protocol, server permissions, socket model): `github.com/Genymobile/scrcpy`
- scrcpy audio docs (Android 11/12/13 differences, sources, buffers, codecs)
- QtScrcpy (mature reference for GUI + JSON key mapping)
- TC Games official feature comparison (free/VIP differences, as the requirements source)

### D. Companion Document

- "Keyboard & Mouse Mapping Engine — Detailed Design" — the expansion of section 4.6, this project's core module design.
