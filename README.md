# MirrorPlay · 免会员手游投屏

**中文** · [English](#english)

> 对标 TC Games 的「安卓真机投屏 + 键鼠玩手游」体验，但**全程免费、无会员、无水印、无广告、无账号**。
>
> **产品承诺：永不设会员墙、永不加水印、永不加广告、永不上传用户数据。**

[![Release](https://img.shields.io/github/v/release/yangyixuan790/MirrorPlay?style=flat-square)](https://github.com/yangyixuan790/MirrorPlay/releases)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-lightgrey?style=flat-square)](https://github.com/yangyixuan790/MirrorPlay/releases)

---

## 特性

- **仅 USB 有线（ADB）**：插线即用，手机端零安装、免 root，拔线无残留
- **完整键鼠映射引擎**（对标 TC Games VIP，永久免费）：
  - 摇杆走位（四键向量合成 · 死区 · 常驻/轻触双模式）
  - 虚拟准心视角（鼠标锁定 · 灵敏度曲线 · 边界回中）
  - 开火 / 连点 / 智能施法 / 取消施法 / 宏 / 方向滑动 / 右键行走 / 观察视角
- **所见即所得键位编辑器**：控件库拖拽落点、网格吸附、对齐辅助线、实时冲突检测、撤销重做、比例模拟（16:9 / 19.5:9 / 20:9）、一键试玩
- **相对坐标 0~1**：同一份键位在 720P / 1080P / 2K 设备上都不跑偏
- **JSON 键位分享**：导入/导出，社区自由交换；内置热门游戏预设
- **画质档位**：流畅 / 均衡 / 高清 / 超清（分辨率+码率+帧率+编码器组合）
- **隐私**：全程本地 USB 直连，不经过任何服务器，无账号体系

## 下载

前往 [Releases](https://github.com/yangyixuan790/MirrorPlay/releases) 页面：

| 平台 | 文件 | 说明 |
| --- | --- | --- |
| Windows | `MirrorPlay-*-win-x64.exe` | NSIS 安装包（可选安装目录、桌面/开始菜单快捷方式） |
| Windows | `MirrorPlay-*-win-x64.msi` | MSI 安装包（适合企业批量部署 / 组策略） |
| Linux | `MirrorPlay-*-linux-amd64.deb` | deb 包（Debian / Ubuntu / Deepin 等） |

Linux 安装后终端输入 `mirrorplay` 或从应用菜单启动。

## 快速上手

1. USB 数据线连接手机与电脑（**必须支持数据传输**，优先 USB 3.0 口）
2. 手机开启 USB 调试：设置 → 关于手机 → 连点版本号 7 次 → 开发者选项 → USB 调试
   （部分小米/红mi 还需额外开启「USB 调试（安全设置）」才能注入点击）
3. 手机弹窗勾选「一律允许」
4. 右侧选画质档位，到「预设库」一键套用游戏键位
5. 按 `~` 切换「映射模式 / 普通触控模式」，开玩

## 开发

```bash
git clone https://github.com/yangyixuan790/MirrorPlay.git
cd MirrorPlay
npm install
npm start          # Electron 开发模式
```

技术栈：Electron 33 + 原生 HTML/CSS/JS（无框架、无构建步骤），渲染层 Canvas 2D。

## 打包

```bash
npm run dist:win    # Windows：NSIS EXE + MSI
npm run dist:linux  # Linux：deb
npm run dist        # 全平台
npm run icons       # 重新生成应用图标
npm run verify:deb  # 校验 deb 结构
```

**国内网络构建**（electron 二进制与 electron-builder 工具链默认从 GitHub 下载）：

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install
export ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
```

仓库内置 `electronDist` 离线构建支持，工具链首次下载后会缓存，后续构建无需网络。

## 目录结构

```
├─ index.html / css/ / js/    应用本体（UI + 模拟引擎 + 键位编辑器）
├─ electron/                  Electron 主进程 + 预加载
├─ scripts/                   图标生成 / deb 打包 / deb 校验
├─ build/                     构建资源（图标）
├─ docs/                      设计文档（中英双语）
│  ├─ software-plan.*.md           《免会员手游投屏软件开发方案》
│  └─ keymap-engine.*.md           《键鼠映射引擎详细设计》
└─ LICENSE / LICENSE-NOTICE   许可证与第三方归属
```

## 合规红线

本工具仅做**输入设备转换**——把键鼠事件翻译成触摸事件，1:1 对应人的操作意图。

- ❌ 不做自动瞄准、透视、自动压枪、自动打怪、协议破解、内存修改
- ❌ 宏必须用户显式录制/编写，有速率上限（最短间隔 200ms、步骤 ≤ 32），禁止无人值守循环
- ⚠️ 用户因违规操作导致的封号责任自负

## 许可证

[Apache-2.0](LICENSE)。基于 scrcpy 协议（Apache-2.0）自研 GUI 与映射层，第三方归属见 [LICENSE-NOTICE](LICENSE-NOTICE)。

---
---

# English

**English** · [中文](#mirrorplay--免会员手游投屏)

> A TC Games-class "mirror your Android phone to PC and play with keyboard & mouse" experience — **completely free. No membership, no watermark, no ads, no account.**
>
> **Our promise: never a paywall, never a watermark, never ads, never uploading your data.**

## Features

- **USB-only (ADB)**: plug and play. Zero install on the phone, no root, no residue after unplugging
- **Complete keyboard & mouse mapping engine** (everything TC Games charges VIP for — free forever):
  - Virtual joystick (4-key vector synthesis · deadzone · hold/tap modes)
  - Crosshair view control (pointer lock · sensitivity curve · edge recenter)
  - Fire / auto-click / smart-cast / cancel-cast / macros / directional swipe / right-click move / observe
- **WYSIWYG keymap editor**: drag controls from the palette onto the screen, grid snapping, alignment guides, live conflict detection, undo/redo, aspect-ratio simulation (16:9 / 19.5:9 / 20:9), instant playtest
- **Relative coordinates (0~1)**: one keymap works across 720P / 1080P / 2K devices without drift
- **JSON keymap sharing**: import/export files, community exchange, built-in presets for popular games
- **Quality tiers**: Smooth / Balanced / HD / Ultra (resolution + bitrate + fps + encoder combos)
- **Privacy**: local USB-direct only. No server in the path, no account system

## Download

Grab installers from the [Releases](https://github.com/yangyixuan790/MirrorPlay/releases) page:

| Platform | File | Notes |
| --- | --- | --- |
| Windows | `MirrorPlay-*-win-x64.exe` | NSIS installer (custom dir, desktop & start-menu shortcuts) |
| Windows | `MirrorPlay-*-win-x64.msi` | MSI installer (enterprise deployment / group policy) |
| Linux | `MirrorPlay-*-linux-amd64.deb` | deb package (Debian / Ubuntu / Deepin, etc.) |

On Linux, run `mirrorplay` from a terminal or launch it from the app menu.

## Quick Start

1. Connect your phone via a **data-capable** USB cable (USB 3.0 port preferred)
2. Enable USB debugging: Settings → About phone → tap build number 7× → Developer options → USB debugging
   (Some Xiaomi/Redmi devices also need "USB debugging (Security settings)" for input injection)
3. Check "Always allow" on the phone's authorization dialog
4. Pick a quality tier, one-click apply a game preset from the preset library
5. Press `~` to toggle mapping mode / plain-touch mode. Have fun

## Development

```bash
git clone https://github.com/yangyixuan790/MirrorPlay.git
cd MirrorPlay
npm install
npm start          # Electron dev mode
```

Stack: Electron 33 + vanilla HTML/CSS/JS (no framework, no build step), Canvas 2D rendering.

## Building

```bash
npm run dist:win    # Windows: NSIS EXE + MSI
npm run dist:linux  # Linux: deb
npm run dist        # all platforms
npm run icons       # regenerate app icons
npm run verify:deb  # verify deb structure
```

**Building in China** (electron binaries and the electron-builder toolchain default to GitHub):

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install
export ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
```

The repo ships with `electronDist` offline-build support; once the toolchain is cached, subsequent builds need no network.

## Repository Layout

```
├─ index.html / css/ / js/    the app itself (UI + sim engine + keymap editor)
├─ electron/                  Electron main process + preload
├─ scripts/                   icon generation / deb packaging / deb verification
├─ build/                     build resources (icons)
├─ docs/                      design docs (bilingual)
│  ├─ software-plan.*.md           "Free Mobile Game Mirroring — Software Plan"
│  └─ keymap-engine.*.md           "Keyboard & Mouse Mapping Engine — Detailed Design"
└─ LICENSE / LICENSE-NOTICE   license & third-party attributions
```

## Compliance Red Lines

This tool performs **input-device translation only** — turning keyboard & mouse events into touch events, 1:1 with the user's intent.

- ❌ No aimbot, wallhack, recoil control, auto-farming, protocol cracking, or memory editing
- ❌ Macros must be explicitly recorded/authored by the user, rate-limited (≥200 ms interval, ≤32 steps), never unattended loops
- ⚠️ Users are solely responsible for any account bans resulting from violations

## License

[Apache-2.0](LICENSE). GUI and mapping layer built on the scrcpy protocol (Apache-2.0); third-party attributions in [LICENSE-NOTICE](LICENSE-NOTICE).
