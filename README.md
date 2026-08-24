<p align="center">
  <img src="./resources/icons/icon.png" width="112" alt="Oru icon">
</p>

<h1 align="center">Oru</h1>

<p align="center">
  <strong>A harness-neutral desktop workspace for coding agents</strong>
</p>

<p align="center">
  English · <a href="./README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="https://github.com/lencx/Minke/releases"><img src="https://img.shields.io/github/downloads/lencx/Minke/total.svg?style=flat" alt="Oru downloads"></a>
  <a href="https://discord.gg/XMX5BEX8K"><img src="https://img.shields.io/badge/Oru-discord-blue?style=flat&logo=discord&logoColor=f2f0ea" alt="Oru Discord"></a>
  <a href="https://x.com/lencx_"><img src="https://img.shields.io/twitter/url?url=https%3A%2F%2Fx.com%2Flencx_" alt="Follow @lencx_ on X"></a>
  <a href="https://www.buymeacoffee.com/lencx"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-blue.png" alt="Buy Me A Coffee" height="20"></a>
</p>

Oru is a focused, local-first desktop shell for agentic work. Conversations,
project files, terminals, web tools, and native desktop actions stay within
reach without binding the interface to one agent runtime.

> [!IMPORTANT]
> Oru is under active development. The current standalone build uses a
> clearly labelled scripted demo runtime while external runtime adapters are
> being developed.

## Highlights

- **A complete workspace for agentic work** — Files, a real PTY terminal, and
  isolated web tools stay beside the active conversation.
- **A stable adapter boundary** — The renderer consumes `AgentRuntime`, so Pi,
  Hermes, and future runtimes can translate their event streams without
  replacing the desktop UI.
- **Local-first by design** — Desktop preferences live under `~/.oru` and
  filesystem access is restricted to folders explicitly opened for the current
  launch.
- **A native desktop experience** — Native menus, synchronized themes, and
  platform-aware window behavior target macOS, Windows, and Linux.

## Installation

Download Oru only from the official [GitHub Releases](https://github.com/lencx/Minke/releases) page. The links below always point to the latest stable release.

| Platform | Architecture | Package |
| --- | --- | --- |
| macOS | Apple Silicon (`arm64`) | [Download `.dmg`](https://github.com/lencx/Minke/releases/latest/download/Oru-macos-arm64.dmg) |
| macOS | Intel (`x64`) | [Download `.dmg`](https://github.com/lencx/Minke/releases/latest/download/Oru-macos-x64.dmg) |
| Windows | `x64` | [Download `.exe`](https://github.com/lencx/Minke/releases/latest/download/Oru-windows-x64.exe) |
| Linux | Debian / Ubuntu (`x64`) | [Download `.deb`](https://github.com/lencx/Minke/releases/latest/download/Oru-linux-x64.deb) |
| Linux | Fedora / RHEL (`x64`) | [Download `.rpm`](https://github.com/lencx/Minke/releases/latest/download/Oru-linux-x64.rpm) |
| Linux | Any distro (portable) | [Download `.AppImage`](https://github.com/lencx/Minke/releases/latest/download/Oru-linux-x64.AppImage) |

Release checksums are available in [`SHA256SUMS`](https://github.com/lencx/Minke/releases/latest/download/SHA256SUMS).

### macOS

1. Download the `.dmg` file and open it.
2. Drag `Oru.app` into the Applications folder.
3. Current pre-release builds are not notarized. Open Terminal and remove the quarantine attribute from the installed app:

   ```bash
   xattr -dr com.apple.quarantine "/Applications/Oru.app"
   ```

4. Open Oru from the Applications folder.

> [!CAUTION]
> Removing the quarantine attribute bypasses a macOS security check. Run this command only for `Oru.app` downloaded from the official Releases page, and never replace the path with a broad directory. You can also try Apple's [Open Anyway](https://support.apple.com/en-us/102445) flow under **System Settings → Privacy & Security**.

### Windows

1. Download the Windows x64 `.exe` installer.
2. Run the installer and follow the on-screen instructions.
3. Windows may show a reputation-based warning for a new pre-release build. Continue only after confirming that the installer came from the official Oru Releases page.

### Linux

Download the package for your distribution, then open it with your graphical package manager or install it from a terminal.

Debian / Ubuntu:

```bash
sudo apt install "/path/to/oru-package.deb"
```

Fedora / RHEL:

```bash
sudo dnf install "/path/to/oru-package.rpm"
```

Replace the example path with the downloaded package path.

## Build from source

Build Oru on the same operating system and CPU architecture as the package you need. The build produces distributables for the current host under `out/make`; this project does not support cross-platform packaging from a single host.

Prerequisites:

- Node.js 24 or newer.
- pnpm 11.7.0, with the repository dependencies installed before running the scripts.
- macOS: an Apple Silicon or Intel Mac with Xcode Command Line Tools. The `.dmg` target can only be built on macOS.
- Windows: a Windows x64 host. Visual Studio 2022 Build Tools with the **Desktop development with C++** workload may be needed if a native dependency must be compiled locally.
- Linux: a Linux x64 host with a native build toolchain, `fakeroot`, `dpkg`, and either `rpm` or `rpm-build`.

On a fresh checkout, install the repository dependencies:

```bash
pnpm install
```

Start Oru in development mode with:

```bash
pnpm start
```

`pnpm start` builds the desktop targets and launches the development app. It
does not stage or start an external agent harness.

Create the distributable package for the current platform with:

```bash
pnpm make
```

`pnpm make` writes the platform package to `out/make`.

Run all standalone verification, including the real Electron interaction flow,
with:

```bash
pnpm verify
```

The Electron test mocks only the native folder picker. It exercises the real
renderer, IPC boundary, filesystem adapter, PTY terminal, isolated Web view,
themes, and scripted agent lifecycle.

## Runtime adapters

`desktop/renderer/agent-runtime.ts` defines the renderer-facing contract. The
built-in `DemoAgentRuntime` is intentionally deterministic and contains no model
or external agent process. A production adapter should translate its runtime's
session, message, tool, completion, error, and cancellation events into this
contract. Pi RPC is the intended first external adapter; Hermes' TUI Gateway is
a compatible future target.

Adapters are injected through the root component instead of being imported by
the reusable UI:

```tsx
const runtime = new PiAgentRuntime(/* transport options */);
root.render(<App locale={locale} runtime={runtime} />);
```

This keeps the conversation and desktop tools independent from adapter startup,
authentication, transport, and process-lifecycle details.

The previous DeepSeek integration remains in the repository only as dormant
migration source. Oru's startup path, verification workflow, and packaged
artifacts do not build, stage, or launch it.

## 中国用户

如在使用中遇到问题，或希望进一步交流 Oru，可关注公众号「浮之静」，发送 `dsh` 获取进群码。也欢迎大家贡献 PR 或分享给更多朋友，您的每一次 Star 都是对开源项目的巨大支持，感恩。

<p>
  <img width="150" alt="qrcode" src="https://github.com/user-attachments/assets/f7194e28-a290-444f-89a2-9f656c59e218" />
  <img width="172" src="https://user-images.githubusercontent.com/16164244/207228300-ea5c4688-c916-4c55-a8c3-7f862888f351.png" alt="浮之静公众号">
  <img width="200" src="https://user-images.githubusercontent.com/16164244/207228025-117b5f77-c5d2-48c2-a070-774b7a1596f2.png" alt="Oru 用户交流群">
</p>
