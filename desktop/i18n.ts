import type { DesktopLocale } from "./locale-contract.ts";

const zh = {
  "bootstrap.loading": "正在启动 Oru",
  "runtime.exitCode": "退出码：{value}",
  "runtime.signal": "信号：{value}",
  "runtime.stoppedTitle": "Agent 运行时已停止",
  "runtime.stoppedMessage": "Agent 运行时进程意外退出。",
  "runtime.restart": "重新启动",
  "runtime.quit": "退出 Oru",
  "runtime.restartFailedTitle": "无法重新启动 Agent 运行时",
  "runtime.startupFailedTitle": "Oru 启动失败",
  "workspace.openDialogTitle": "打开文件夹",
  "menu.file": "文件",
  "menu.view": "视图",
  "menu.commandPalette": "命令面板…",
  "menu.settings": "设置…",
  "menu.newSession": "新建会话",
  "menu.sessionBack": "返回上一会话",
  "menu.sessionForward": "前往下一会话",
  "menu.toggleSidebar": "展开或折叠左侧栏",
  "menu.toggleRightSidebar": "展开或折叠右侧栏",
  "menu.toggleBottomPanel": "展开或折叠底部栏",
  "dataHome.chooseDirectoryTitle": "选择 DSH 数据目录",
  "dataHome.chooseDirectoryButton": "选择目录",
  "sessionExport.saveDialogTitle": "导出 Session 日志",
  "sessionExport.zipFilter": "ZIP 归档",
  "sessionExport.failedTitle": "无法导出 Session 日志",
  "sessionExport.failedMessage": "Session 日志导出失败。",
  "sessionExport.ok": "确定",
  "ui.agentWorkspace": "Agent 工作区",
  "ui.tools.show": "显示工具",
  "ui.tools.hide": "隐藏工具",
  "ui.tools.loading": "正在加载工具…",
  "ui.tools.close": "关闭工具",
  "ui.tools.workspace": "工作区工具",
  "ui.tools.files": "文件",
  "ui.tools.terminal": "终端",
  "ui.tools.web": "网页",
  "ui.command.run": "运行命令",
  "ui.command.palette": "命令面板",
  "ui.command.openFolder": "打开文件夹",
  "ui.command.newSession": "新建会话",
  "ui.command.settings": "设置",
  "ui.sidebar.workspaces": "工作区",
  "ui.sidebar.sessions": "会话",
  "ui.sidebar.empty": "本次启动中打开的文件夹会显示在这里。",
  "ui.sidebar.newSession": "新建会话",
  "ui.welcome.eyebrow": "HARNESS 中立桌面应用",
  "ui.welcome.titleFirst": "专注服务于",
  "ui.welcome.titleSecond": "你的编码 Agent。",
  "ui.welcome.lede": "打开项目，体验独立的对话界面、文件、终端与网页工具。",
  "ui.welcome.openFolder": "打开文件夹",
  "ui.welcome.localTools": "本地工具",
  "ui.welcome.localToolsDetail": "文件和终端始终留在你的设备上",
  "ui.welcome.adapterReady": "适配器就绪",
  "ui.welcome.adapterReadyDetail": "面向 Pi、Hermes 与未来 runtime 构建",
  "ui.message.you": "你",
  "ui.message.interrupted": "已中断",
  "ui.message.activity": "Agent 活动",
  "ui.composer.placeholder": "向 Oru 询问这个项目…",
  "ui.composer.message": "消息",
  "ui.composer.hint": "脚本化演示 · Enter 发送 · Shift+Enter 换行",
  "ui.composer.send": "发送",
  "ui.composer.stop": "停止",
  "ui.settings.eyebrow": "偏好设置",
  "ui.settings.title": "设置",
  "ui.settings.close": "关闭",
  "ui.settings.appearance": "外观",
  "ui.settings.appearanceDetail": "跟随系统或选择固定主题。",
  "ui.settings.system": "系统",
  "ui.settings.light": "浅色",
  "ui.settings.dark": "深色",
  "ui.settings.language": "语言",
  "ui.settings.languageDetail": "当前跟随桌面语言。",
  "ui.settings.english": "English",
  "ui.settings.chinese": "简体中文",
  "ui.settings.runtime": "Runtime",
  "ui.settings.runtimeDetail": "实现 AgentRuntime 即可连接其他 harness。",
  "ui.runtime.demo": "脚本化演示",
  "ui.files.loading": "正在加载…",
  "ui.files.loadFailed": "无法加载此文件夹。",
  "ui.files.previewFailed": "无法预览此文件。",
  "ui.files.list": "文件",
  "ui.files.parent": "上级文件夹",
  "ui.files.select": "选择文件以预览",
  "ui.files.previewUnavailable": "无法预览此文件。",
  "ui.terminal.exit": "进程已退出（{code}）",
  "ui.terminal.startFailed": "无法启动终端。",
  "ui.terminal.runtimeError": "终端遇到错误。",
  "ui.web.invalid": "请输入不含凭据的 HTTP(S) URL。",
  "ui.web.navigationFailed": "无法加载此网页。",
  "ui.web.reload": "重新加载",
  "ui.web.address": "网页地址",
  "ui.files.breadcrumbs": "文件夹路径",
  "ui.files.emptyFolder": "此文件夹为空。",
  "ui.files.resize": "调整预览区高度",
  "ui.web.back": "后退",
  "ui.web.forward": "前进",
  "ui.web.loading": "正在加载页面",
  "ui.web.go": "前往",
  "demo.ready": "已在 {workspace} 中就绪。我是内置脚本化演示，无需运行 Agent harness 即可展示 Oru 的交互状态。",
  "demo.newSession": "新会话",
  "demo.thinking": "正在思考",
  "demo.understanding": "正在理解请求",
  "demo.inspect": "检查工作区",
  "demo.reading": "正在读取项目结构",
  "demo.response": "这是通过 AgentRuntime 边界响应的独立 Oru UI。Pi 或 Hermes 适配器可以替换演示 runtime，同时保留对话、工作区和工具界面。",
  "demo.stopped": "运行已停止。",
} as const;

export type DesktopMessageKey = keyof typeof zh;

const en: Record<DesktopMessageKey, string> = {
  "bootstrap.loading": "Starting Oru",
  "runtime.exitCode": "Exit code: {value}",
  "runtime.signal": "Signal: {value}",
  "runtime.stoppedTitle": "Agent runtime stopped",
  "runtime.stoppedMessage":
    "The local agent runtime process exited unexpectedly.",
  "runtime.restart": "Restart",
  "runtime.quit": "Quit Oru",
  "runtime.restartFailedTitle":
    "Unable to restart agent runtime",
  "runtime.startupFailedTitle": "Oru failed to start",
  "workspace.openDialogTitle": "Open Folder",
  "menu.file": "File",
  "menu.view": "View",
  "menu.commandPalette": "Command Palette…",
  "menu.settings": "Settings…",
  "menu.newSession": "New Session",
  "menu.sessionBack": "Back to Previous Session",
  "menu.sessionForward": "Forward to Next Session",
  "menu.toggleSidebar": "Toggle Sidebar",
  "menu.toggleRightSidebar": "Toggle Right Sidebar",
  "menu.toggleBottomPanel": "Toggle Bottom Panel",
  "dataHome.chooseDirectoryTitle": "Choose DSH data directory",
  "dataHome.chooseDirectoryButton": "Choose folder",
  "sessionExport.saveDialogTitle": "Export Session log",
  "sessionExport.zipFilter": "ZIP archives",
  "sessionExport.failedTitle": "Unable to export Session log",
  "sessionExport.failedMessage":
    "The Session log could not be exported.",
  "sessionExport.ok": "OK",
  "ui.agentWorkspace": "Agent workspace",
  "ui.tools.show": "Show tools",
  "ui.tools.hide": "Hide tools",
  "ui.tools.loading": "Loading tools…",
  "ui.tools.close": "Close tools",
  "ui.tools.workspace": "Workspace tools",
  "ui.tools.files": "Files",
  "ui.tools.terminal": "Terminal",
  "ui.tools.web": "Web",
  "ui.command.run": "Run a command",
  "ui.command.palette": "Command palette",
  "ui.command.openFolder": "Open folder",
  "ui.command.newSession": "New session",
  "ui.command.settings": "Settings",
  "ui.sidebar.workspaces": "Workspaces",
  "ui.sidebar.sessions": "Sessions",
  "ui.sidebar.empty": "Folders you open appear here for this launch.",
  "ui.sidebar.newSession": "New session",
  "ui.welcome.eyebrow": "HARNESS-NEUTRAL DESKTOP",
  "ui.welcome.titleFirst": "A focused home for",
  "ui.welcome.titleSecond": "your coding agents.",
  "ui.welcome.lede": "Open a project to explore the standalone conversation shell, files, terminal, and web tools.",
  "ui.welcome.openFolder": "Open a folder",
  "ui.welcome.localTools": "Local tools",
  "ui.welcome.localToolsDetail": "Files and terminal stay on your machine",
  "ui.welcome.adapterReady": "Adapter ready",
  "ui.welcome.adapterReadyDetail": "Built for Pi, Hermes, and future runtimes",
  "ui.message.you": "You",
  "ui.message.interrupted": "interrupted",
  "ui.message.activity": "Agent activity",
  "ui.composer.placeholder": "Ask Oru about this project…",
  "ui.composer.message": "Message",
  "ui.composer.hint": "Scripted demo · Enter to send · Shift+Enter for newline",
  "ui.composer.send": "Send",
  "ui.composer.stop": "Stop",
  "ui.settings.eyebrow": "PREFERENCES",
  "ui.settings.title": "Settings",
  "ui.settings.close": "Close",
  "ui.settings.appearance": "Appearance",
  "ui.settings.appearanceDetail": "Follow the system or choose a fixed theme.",
  "ui.settings.system": "system",
  "ui.settings.light": "light",
  "ui.settings.dark": "dark",
  "ui.settings.language": "Language",
  "ui.settings.languageDetail": "Currently follows the desktop locale.",
  "ui.settings.english": "English",
  "ui.settings.chinese": "简体中文",
  "ui.settings.runtime": "Runtime",
  "ui.settings.runtimeDetail": "Implement AgentRuntime to connect another harness.",
  "ui.runtime.demo": "Scripted demo",
  "ui.files.loading": "Loading…",
  "ui.files.loadFailed": "Unable to load this folder.",
  "ui.files.previewFailed": "Unable to preview this file.",
  "ui.files.list": "Files",
  "ui.files.parent": "Parent folder",
  "ui.files.select": "Select a file to preview",
  "ui.files.previewUnavailable": "Preview unavailable for this file.",
  "ui.terminal.exit": "Process exited ({code})",
  "ui.terminal.startFailed": "Unable to start the terminal.",
  "ui.terminal.runtimeError": "The terminal encountered an error.",
  "ui.web.invalid": "Enter a credential-free HTTP(S) URL.",
  "ui.web.navigationFailed": "Unable to load this page.",
  "ui.web.reload": "Reload",
  "ui.web.address": "Web address",
  "ui.files.breadcrumbs": "Folder path",
  "ui.files.emptyFolder": "This folder is empty.",
  "ui.files.resize": "Resize preview",
  "ui.web.back": "Back",
  "ui.web.forward": "Forward",
  "ui.web.loading": "Loading page",
  "ui.web.go": "Go",
  "demo.ready": "Ready in {workspace}. I’m the built-in scripted demo, so I can show Oru’s interaction states without running an agent harness.",
  "demo.newSession": "New session",
  "demo.thinking": "Thinking",
  "demo.understanding": "Understanding the request",
  "demo.inspect": "Inspect workspace",
  "demo.reading": "Reading the project structure",
  "demo.response": "This is the standalone Oru UI responding through the AgentRuntime boundary. A Pi or Hermes adapter can replace this demo runtime while keeping the conversation, workspace, and tool surfaces unchanged.",
  "demo.stopped": "Run stopped.",
};

export const desktopDictionaries = Object.freeze({
  zh: Object.freeze(zh),
  en: Object.freeze(en),
});

export type DesktopTranslateParams = Readonly<
  Record<string, unknown>
>;

/** Translate one desktop-owned native string using named braces. */
export function translateDesktop(
  locale: DesktopLocale,
  key: DesktopMessageKey,
  params?: DesktopTranslateParams,
): string {
  const template = desktopDictionaries[locale][key];
  return template.replace(/\{(\w+)\}/gu, (match, name: string) =>
    params !== undefined && Object.hasOwn(params, name)
      ? String(params[name])
      : match,
  );
}

export type DesktopLocaleSnapshot = Readonly<{
  active: DesktopLocale;
  revision: number;
}>;

/** In-memory desktop projection of the renderer's active locale. */
export class DesktopLocaleRuntime {
  #snapshot: DesktopLocaleSnapshot;
  readonly #listeners = new Set<() => void>();

  constructor(initial: DesktopLocale) {
    this.#snapshot = Object.freeze({
      active: initial,
      revision: 0,
    });
  }

  getSnapshot(): DesktopLocaleSnapshot {
    return this.#snapshot;
  }

  setLocale(locale: DesktopLocale): void {
    if (locale === this.#snapshot.active) return;
    this.#snapshot = Object.freeze({
      active: locale,
      revision: this.#snapshot.revision + 1,
    });
    for (const listener of this.#listeners) listener();
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  t(
    key: DesktopMessageKey,
    params?: DesktopTranslateParams,
  ): string {
    return translateDesktop(this.#snapshot.active, key, params);
  }
}
