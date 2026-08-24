import type { DesktopWorkspace } from "@minke/desktop/standalone-contract";
import type {
  FileManagerListRequest,
  FileManagerListResult,
  FileManagerOpenRequest,
  FileManagerPreviewRequest,
  FileManagerPreviewResult,
  FileManagerWriteRequest,
  FileManagerWriteResult,
} from "@minke/harness-overlay/tabs/files-contract";
import type {
  TerminalCreateRequest,
  TerminalCreateResult,
  TerminalEvent,
  TerminalResizeRequest,
  TerminalWriteRequest,
} from "@minke/harness-overlay/tabs/terminal-contract";
import type {
  TerminalSettings,
} from "@minke/harness-overlay/terminal-settings-contract";
import type {
  WindowColorScheme,
  WindowThemePreference,
} from "@minke/desktop/window-theme-contract";
import type {
  ProductShortcutActionId,
  ShortcutBindings,
} from "@minke/harness-overlay/shortcut-contract";

interface OruDesktopApi {
  readonly about: {
    readonly productName: string;
    readonly version: string;
    readonly platform: string;
    readonly arch: string;
  };
  readonly workspace: {
    open(): Promise<DesktopWorkspace | undefined>;
  };
  readonly files: {
    list(request: FileManagerListRequest): Promise<FileManagerListResult>;
    open(request: FileManagerOpenRequest): Promise<void>;
    preview(request: FileManagerPreviewRequest): Promise<FileManagerPreviewResult>;
    write(request: FileManagerWriteRequest): Promise<FileManagerWriteResult>;
  };
  readonly terminal: {
    readSettings(): Promise<TerminalSettings>;
    writeSettings(settings: TerminalSettings): Promise<void>;
    create(request: TerminalCreateRequest): Promise<TerminalCreateResult>;
    write(request: TerminalWriteRequest): void;
    resize(request: TerminalResizeRequest): void;
    close(sessionId: string): void;
    subscribe(listener: (event: TerminalEvent) => void): () => void;
  };
  readonly tabs: {
    openExternal(url: string): void;
  };
  readonly shortcuts: {
    read(): Promise<ShortcutBindings>;
    write(bindings: ShortcutBindings): Promise<void>;
    subscribe(listener: (id: ProductShortcutActionId) => void): () => void;
  };
  readonly windowTheme: {
    publish(
      preference: WindowThemePreference,
      colorScheme: WindowColorScheme,
    ): void;
  };
}

declare global {
  interface Window {
    readonly oruDesktop: OruDesktopApi;
  }
}

export {};
