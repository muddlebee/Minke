<p align="center">
  <img src="./resources/icons/icon.png" width="112" alt="Oru 图标">
</p>

<h1 align="center">Oru</h1>

<p align="center">
  <strong>面向编码智能体的 Harness 中立原生桌面工作空间</strong>
</p>

<p align="center">
  <a href="./README.md">English</a> · 简体中文
</p>

<p align="center">
  <a href="https://github.com/lencx/Minke/releases"><img src="https://img.shields.io/github/downloads/lencx/Minke/total.svg?style=flat" alt="Oru downloads"></a>
  <a href="https://discord.gg/XMX5BEX8K"><img src="https://img.shields.io/badge/Oru-discord-blue?style=flat&logo=discord&logoColor=f2f0ea" alt="Oru Discord"></a>
  <a href="https://x.com/lencx_"><img src="https://img.shields.io/twitter/url?url=https%3A%2F%2Fx.com%2Flencx_" alt="在 X 上关注 @lencx_"></a>
  <a href="https://www.buymeacoffee.com/lencx"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-blue.png" alt="请我喝杯咖啡" height="20"></a>
</p>

Oru 是一个专注、本地优先的智能体桌面外壳。对话、项目文件、终端、网页工具和原生桌面操作始终触手可及，同时不会将界面绑定到某一个 Agent runtime。

> [!IMPORTANT]
> Oru 正在持续开发中。当前独立版本使用明确标记的脚本化演示 runtime，外部 runtime 适配器仍在开发中。

## 核心亮点

- **完整的智能体工作台** — 文件、真实 PTY 终端和隔离的网页工具始终与当前对话相邻。
- **稳定的适配器边界** — 渲染器只依赖 `AgentRuntime`，Pi、Hermes 以及未来 runtime 均可接入，而无需替换桌面 UI。
- **本地优先，数据留在设备** — 桌面配置存放于 `~/.oru`，文件系统访问仅限当前启动期间由用户明确打开的目录。
- **原生桌面体验** — 原生菜单、主题同步和平台化窗口行为覆盖 macOS、Windows 与 Linux。

## 安装

请仅从 Oru 官方 [GitHub Releases](https://github.com/lencx/Minke/releases) 页面下载安装包。

| 平台 | 架构 | 安装包 |
| --- | --- | --- |
| macOS | Apple Silicon（`arm64`） | `.dmg` |
| macOS | Intel（`x64`） | `.dmg` |
| Windows | `x64` | `.exe` |
| Linux | `x64` | `.deb` 或 `.rpm` |

### macOS

1. 下载并打开 `.dmg` 文件。
2. 将 `Oru.app` 拖入“应用程序”目录。
3. 当前预发布版本尚未经过 Apple 公证。打开“终端”，移除已安装应用的 quarantine 属性：

   ```bash
   xattr -dr com.apple.quarantine "/Applications/Oru.app"
   ```

4. 从“应用程序”目录打开 Oru。

> [!CAUTION]
> 移除 quarantine 属性会绕过一项 macOS 安全检查。请仅对从官方 Releases 页面下载的 `Oru.app` 执行上述命令，不要将命令中的路径替换为宽泛目录。也可以尝试在 **系统设置 → 隐私与安全性** 中使用 Apple 提供的[“仍要打开”](https://support.apple.com/zh-cn/102445)流程。

### Windows

1. 下载 Windows x64 `.exe` 安装程序。
2. 运行安装程序，并按照界面提示完成安装。
3. 新发布的预览版本可能触发 Windows 信誉安全提示。请先确认安装程序来自 Oru 官方 Releases 页面，再决定是否继续。

### Linux

根据发行版下载对应安装包，可以通过图形化软件管理器打开，也可以在终端中安装。

Debian / Ubuntu：

```bash
sudo apt install "/path/to/oru-package.deb"
```

Fedora / RHEL：

```bash
sudo dnf install "/path/to/oru-package.rpm"
```

请将示例路径替换为实际下载的安装包路径。

## 从源码构建

请在与目标安装包相同的操作系统和 CPU 架构上构建 Oru。构建产物位于 `out/make`，本项目不支持在单一宿主机上进行跨平台打包。

环境依赖：

- Node.js 24 或更高版本。
- pnpm 11.7.0；执行脚本前需已安装仓库依赖。
- macOS：Apple Silicon 或 Intel Mac，并安装 Xcode Command Line Tools；`.dmg` 只能在 macOS 上构建。
- Windows：Windows x64；如果原生依赖需要在本地编译，可能还需要安装 Visual Studio 2022 Build Tools，并选择 **Desktop development with C++** 工作负载。
- Linux：Linux x64，并安装原生编译工具链、`fakeroot`、`dpkg`，以及 `rpm` 或 `rpm-build`。

首次检出源码后安装仓库依赖：

```bash
pnpm install
```

使用开发模式启动 Oru：

```bash
pnpm start
```

`pnpm start` 会构建桌面目标并启动开发应用，不会准备或启动外部 Agent harness。

为当前平台生成安装包：

```bash
pnpm make
```

`pnpm make` 会将当前平台的安装包生成到 `out/make`。

执行完整独立版本验证（包括真实 Electron 交互流程）：

```bash
pnpm verify
```

Electron 测试仅模拟原生目录选择器，并会实际验证渲染器、IPC、文件适配器、PTY 终端、隔离 Web 视图、主题与脚本化 Agent 生命周期。

## Runtime 适配器

`desktop/renderer/agent-runtime.ts` 定义了渲染器使用的稳定边界。内置的
`DemoAgentRuntime` 是确定性的，不包含模型或外部 Agent 进程。Pi、Hermes
或其他 runtime 只需实现 `AgentRuntime`，再通过根组件的 `runtime` 属性注入，
无需替换对话、工作区或桌面工具界面。

旧 DeepSeek 集成仅作为休眠的迁移参考保留在仓库中。Oru 的启动路径、验证
流程和安装包均不会构建、暂存或启动它。
