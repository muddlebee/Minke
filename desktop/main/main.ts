import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  // nativeImage,
  nativeTheme,
  session,
  shell,
  // Tray,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type WebContents,
} from "electron";
import started from "electron-squirrel-startup";
import { join } from "node:path";
import {
  DesktopLocaleRuntime,
  translateDesktop,
  type DesktopMessageKey,
  type DesktopTranslateParams,
} from "@minke/desktop/i18n";
import {
  resolveDesktopLocale,
  type DesktopLocale,
} from "@minke/desktop/locale-contract";
import {
  WORKSPACE_OPEN_CHANNEL,
  type DesktopWorkspace,
} from "@minke/desktop/standalone-contract";
import { TABS_WEB_PARTITION } from "@minke/harness-overlay/tabs/contract";
import {
  SHORTCUT_INVOKE_CHANNEL,
  type ProductShortcutActionId,
  type ShortcutBindings,
} from "@minke/harness-overlay/shortcut-contract";
import { configureAppDataPaths } from "./app-data-paths";
import { createStatefulMainWindow } from "./main-window-state";
import { oruConfigFilePath, OruConfigStore } from "./oru-config";
import { macOSWindowOptions } from "./macos-window";
import { bindMacOSWindowButtonSpacing } from "./macos-window-controls";
import { bindMainWindowDevToolsShortcut } from "./main-window-devtools";
import { isInternalNavigation } from "./navigation-policy";
import {
  bindShortcutMenu,
  type ShortcutMenuBinding,
} from "./shortcut-menu";
import {
  bindShortcutSettingsIpc,
  type ShortcutSettingsBinding,
} from "./shortcut-settings";
import {
  bindTerminalSettingsIpc,
  type TerminalSettingsBinding,
} from "./terminal-settings";
import { bindTabs, type TabsBinding } from "./tabs";
import { bindWindowLocale } from "./window-locale";
import { bindWindowTheme } from "./window-theme";
import {
  WorkspaceAccessRegistry,
  type AuthorizedWorkspacePath,
} from "./workspace-access";

const PRODUCT_NAME = "Oru";
const BACKGROUND_COLOR = "#111412";

let mainWindow: BrowserWindow | undefined;
let shortcutMenuBinding: ShortcutMenuBinding | undefined;
let shortcutSettingsBinding: ShortcutSettingsBinding | undefined;
let terminalSettingsBinding: TerminalSettingsBinding | undefined;
let tabsBinding: TabsBinding | undefined;
let desktopLocale: DesktopLocaleRuntime | undefined;
const workspaceAccess = new WorkspaceAccessRegistry();
// let appTray: Tray | undefined;

function activeDesktopLocale(): DesktopLocale {
  return desktopLocale?.getSnapshot().active ?? "en";
}

function desktopText(
  key: DesktopMessageKey,
  params?: DesktopTranslateParams,
): string {
  return desktopLocale?.t(key, params) ?? translateDesktop("en", key, params);
}

function bootstrapUrl(): string | undefined {
  return typeof MAIN_WINDOW_VITE_DEV_SERVER_URL === "string"
    ? MAIN_WINDOW_VITE_DEV_SERVER_URL || undefined
    : undefined;
}

function appIconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, "icon.png")
    : join(app.getAppPath(), "resources", "icons", "icon.png");
}

// function trayIconPath(): string {
//   return app.isPackaged
//     ? join(process.resourcesPath, "trayTemplate.png")
//     : join(app.getAppPath(), "resources", "icons", "trayTemplate.png");
// }

function showMainWindow(): void {
  if (mainWindow === undefined) {
    void createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function isMainFrame(
  window: BrowserWindow,
  event: IpcMainEvent | IpcMainInvokeEvent,
): boolean {
  return event.sender === window.webContents &&
    event.senderFrame === window.webContents.mainFrame;
}

async function invokeShortcutAction(id: ProductShortcutActionId): Promise<void> {
  const window = mainWindow ?? await createWindow();
  if (window.isDestroyed() || window.webContents.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
  window.webContents.send(SHORTCUT_INVOKE_CHANNEL, id);
}

// function installMacOSTray(): void {
//   if (process.platform !== "darwin") return;
//   const image = nativeImage.createFromPath(trayIconPath());
//   if (image.isEmpty()) {
//     throw new Error(`Tray image is missing at ${trayIconPath()}`);
//   }
//   image.setTemplateImage(true);
//   appTray = new Tray(image);
//   appTray.setToolTip(PRODUCT_NAME);
//   appTray.on("click", showMainWindow);
// }

async function loadRenderer(window: BrowserWindow): Promise<void> {
  const developmentUrl = bootstrapUrl();
  if (developmentUrl !== undefined) {
    const url = new URL(developmentUrl);
    url.searchParams.set("locale", activeDesktopLocale());
    await window.loadURL(url.toString());
    return;
  }
  await window.loadFile(
    join(
      __dirname,
      "../renderer",
      typeof MAIN_WINDOW_VITE_NAME === "string"
        ? MAIN_WINDOW_VITE_NAME
        : "main_window",
      "index.html",
    ),
    { query: { locale: activeDesktopLocale() } },
  );
}

function canOpenExternally(value: string): boolean {
  try {
    return ["https:", "http:", "mailto:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function protectNavigation(webContents: WebContents): void {
  webContents.on("will-navigate", (details) => {
    if (isInternalNavigation(details.url, [bootstrapUrl()])) return;
    details.preventDefault();
    if (canOpenExternally(details.url)) void shell.openExternal(details.url);
  });
  webContents.setWindowOpenHandler(({ url }) => {
    if (canOpenExternally(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
}

async function authorizeWorkspacePath(
  candidate: string,
): Promise<AuthorizedWorkspacePath> {
  return await workspaceAccess.authorizeWithRoot(candidate);
}

function bindWorkspacePicker(window: BrowserWindow): () => void {
  const handleOpen = async (
    event: IpcMainInvokeEvent,
  ): Promise<DesktopWorkspace | undefined> => {
    if (!isMainFrame(window, event)) throw new Error("unauthorized workspace request");
    const result = await dialog.showOpenDialog(window, {
      title: "Open Folder",
      properties: ["openDirectory", "createDirectory"],
    });
    const selected = result.filePaths[0];
    if (result.canceled || selected === undefined) return undefined;
    return await workspaceAccess.approve(selected);
  };
  ipcMain.handle(WORKSPACE_OPEN_CHANNEL, handleOpen);
  return () => ipcMain.removeHandler(WORKSPACE_OPEN_CHANNEL);
}

async function createWindow(): Promise<BrowserWindow> {
  const window = createStatefulMainWindow(
    oruConfigFilePath(app.getPath("userData")),
    (bounds) => new BrowserWindow({
      title: PRODUCT_NAME,
      icon: appIconPath(),
      ...bounds,
      minWidth: 960,
      minHeight: 640,
      show: false,
      backgroundColor: BACKGROUND_COLOR,
      ...macOSWindowOptions(),
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: join(__dirname, "desktop-preload.js"),
        sandbox: true,
        webSecurity: true,
        webviewTag: true,
        transparent: process.platform === "darwin",
      },
    }),
  );
  const windowButtonSpacing = process.platform === "darwin"
    ? bindMacOSWindowButtonSpacing(window, { platform: process.platform })
    : undefined;
  bindMainWindowDevToolsShortcut(Menu);
  const windowTheme = bindWindowTheme(window, nativeTheme);
  const localeRuntime = desktopLocale;
  if (localeRuntime === undefined) throw new Error("desktop locale was not initialized");
  const windowLocale = bindWindowLocale(
    window,
    localeRuntime,
    (candidate) => isMainFrame(window, candidate as IpcMainEvent),
  );
  const unbindWorkspacePicker = bindWorkspacePicker(window);
  mainWindow = window;
  shortcutMenuBinding?.refreshBaseMenu();
  protectNavigation(window.webContents);
  tabsBinding = bindTabs(
    ipcMain,
    window.webContents,
    shell,
    (candidate) => isMainFrame(window, candidate),
    {
      runtimeRoot: app.getAppPath(),
      defaultCwd: app.getPath("home"),
      fileSystemRoot: app.getPath("home"),
      authorizePath: authorizeWorkspacePath,
    },
  );
  window.once("ready-to-show", () => window.show());
  window.once("closed", () => {
    windowButtonSpacing?.dispose();
    tabsBinding?.dispose();
    tabsBinding = undefined;
    unbindWorkspacePicker();
    windowLocale.dispose();
    windowTheme.dispose();
    workspaceAccess.clear();
    if (mainWindow === window) mainWindow = undefined;
  });
  await loadRenderer(window);
  return window;
}

function installPermissionPolicy(): void {
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  const tabsWebSession = session.fromPartition(TABS_WEB_PARTITION);
  tabsWebSession.setPermissionCheckHandler(() => false);
  tabsWebSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
}

async function bootstrap(): Promise<void> {
  app.setName(PRODUCT_NAME);
  configureAppDataPaths(app);
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  app.on("second-instance", showMainWindow);
  await app.whenReady();
  desktopLocale = new DesktopLocaleRuntime(resolveDesktopLocale(app.getLocale()));
  installPermissionPolicy();
  const oruConfig = new OruConfigStore(app.getPath("userData"));
  let shortcutBindings: ShortcutBindings = {};
  try {
    shortcutBindings = await oruConfig.shortcuts.read();
  } catch (error) {
    console.error("Unable to read native shortcut menu settings:", error);
  }
  await createWindow();
  // installMacOSTray();
  shortcutMenuBinding = bindShortcutMenu(
    Menu,
    desktopLocale,
    shortcutBindings,
    (id) => void invokeShortcutAction(id),
  );
  shortcutSettingsBinding = bindShortcutSettingsIpc(
    ipcMain,
    oruConfig.shortcuts,
    (candidate) => mainWindow !== undefined &&
      isMainFrame(mainWindow, candidate as IpcMainInvokeEvent),
    (bindings) => shortcutMenuBinding?.updateBindings(bindings),
  );
  terminalSettingsBinding = bindTerminalSettingsIpc(
    ipcMain,
    oruConfig.terminal,
    (candidate) => mainWindow !== undefined &&
      isMainFrame(mainWindow, candidate as IpcMainInvokeEvent),
  );
  app.on("activate", showMainWindow);
}

app.on("before-quit", () => {
  // appTray?.destroy();
  // appTray = undefined;
  shortcutMenuBinding?.dispose();
  shortcutMenuBinding = undefined;
  shortcutSettingsBinding?.dispose();
  shortcutSettingsBinding = undefined;
  terminalSettingsBinding?.dispose();
  terminalSettingsBinding = undefined;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

if (started) {
  app.quit();
} else {
  void bootstrap().catch((error) => {
    console.error("Oru startup failed:", error);
    dialog.showErrorBox(
      desktopText("runtime.startupFailedTitle"),
      error instanceof Error ? error.stack ?? error.message : String(error),
    );
    app.quit();
  });
}
