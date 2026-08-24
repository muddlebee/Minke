import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import {
  translateDesktop,
  type DesktopMessageKey,
  type DesktopTranslateParams,
} from "@minke/desktop/i18n";
import type { DesktopLocale } from "@minke/desktop/locale-contract";
import { normalizeWebTabUrl } from "@minke/harness-overlay/tabs/contract";
import type { TerminalEvent } from "@minke/harness-overlay/tabs/terminal-contract";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { DesktopWorkspace } from "@minke/desktop/standalone-contract";
import type {
  FileManagerEntry,
  FileManagerPreviewResult,
} from "@minke/harness-overlay/tabs/files-contract";

type ToolKind = "files" | "terminal" | "web";
type Translate = (
  key: DesktopMessageKey,
  params?: DesktopTranslateParams,
) => string;

function terminalTheme() {
  const styles = getComputedStyle(document.documentElement);
  return {
    background: "#00000000",
    foreground: styles.getPropertyValue("--text-primary").trim(),
    cursor: styles.getPropertyValue("--accent").trim(),
    selectionBackground: "#7f927955",
  };
}

export function ToolPanel(props: {
  hidden: boolean;
  locale: DesktopLocale;
  workspace: DesktopWorkspace;
  onClose(): void;
}): ReactNode {
  const [active, setActive] = useState<ToolKind>("files");
  const [terminalOpened, setTerminalOpened] = useState(false);
  const [webOpened, setWebOpened] = useState(false);
  const t: Translate = useCallback(
    (key, params) => translateDesktop(props.locale, key, params),
    [props.locale],
  );
  return (
    <aside className="tool-panel" hidden={props.hidden} aria-label={t("ui.tools.workspace")}>
      <header className="tool-panel__header">
        <div className="tool-tabs" role="tablist" aria-label={t("ui.tools.workspace")}>
          {(["files", "terminal", "web"] as const).map((kind) => (
            <button
              className="tool-tab"
              data-active={active === kind}
              key={kind}
              onClick={() => {
                setActive(kind);
                if (kind === "terminal") setTerminalOpened(true);
                if (kind === "web") setWebOpened(true);
              }}
              role="tab"
              aria-selected={active === kind}
              type="button"
            >
              {kind === "files" ? t("ui.tools.files") : kind === "terminal" ? t("ui.tools.terminal") : t("ui.tools.web")}
            </button>
          ))}
        </div>
        <button className="icon-button" onClick={props.onClose} type="button" aria-label={t("ui.tools.close")}>×</button>
      </header>
      <div className="tool-panel__body">
        <FilesTool
          hidden={active !== "files"}
          root={props.workspace.path}
          t={t}
        />
        {terminalOpened && (
          <TerminalTool
            cwd={props.workspace.path}
            hidden={active !== "terminal"}
            t={t}
          />
        )}
        {webOpened && <WebTool hidden={active !== "web"} t={t} />}
      </div>
    </aside>
  );
}

function FilesTool({
  hidden,
  root,
  t,
}: {
  hidden: boolean;
  root: string;
  t: Translate;
}): ReactNode {
  const [path, setPath] = useState(root);
  const [parent, setParent] = useState<string>();
  const [entries, setEntries] = useState<readonly FileManagerEntry[]>([]);
  const [preview, setPreview] = useState<FileManagerPreviewResult>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const previewRequest = useRef(0);

  useEffect(() => () => {
    previewRequest.current += 1;
  }, []);

  const navigateTo = (nextPath: string): void => {
    previewRequest.current += 1;
    setPreview(undefined);
    setError(undefined);
    setParent((current) => current ?? path);
    setPath(nextPath);
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(undefined);
    setPreview(undefined);
    setEntries([]);
    void window.oruDesktop.files.list({ path, root }).then((result) => {
      if (!active) return;
      setPath(result.path);
      setEntries(result.entries);
      setParent(result.parent);
    }).catch((reason: unknown) => {
      if (active) {
        console.warn("Unable to list Files directory:", reason);
        setError(t("ui.files.loadFailed"));
      }
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [path, root, t]);

  const choose = (entry: FileManagerEntry): void => {
    const request = ++previewRequest.current;
    setPreview(undefined);
    setError(undefined);
    if (entry.kind === "directory" || entry.targetKind === "directory") {
      navigateTo(entry.path);
      return;
    }
    void window.oruDesktop.files.preview({ path: entry.path, root })
      .then((result) => {
        if (previewRequest.current === request) setPreview(result);
      })
      .catch((reason: unknown) => {
        if (previewRequest.current === request) {
          console.warn("Unable to preview Files entry:", reason);
          setError(t("ui.files.previewFailed"));
        }
      });
  };

  return (
    <div className="files-tool" hidden={hidden}>
      <div className="files-address" title={path}>
        <button
          className="icon-button"
          disabled={path === root}
          onClick={() => parent !== undefined && navigateTo(parent)}
          type="button"
          aria-label={t("ui.files.parent")}
        >←</button>
        <span>{path === root ? root : path.slice(root.length) || "/"}</span>
      </div>
      <div className="files-content">
        <div className="file-list" aria-label={t("ui.files.list")}>
          {loading && <p className="muted-state">{t("ui.files.loading")}</p>}
          {!loading && entries.map((entry) => (
            <button className="file-row" key={entry.path} onClick={() => choose(entry)} type="button">
              <span aria-hidden="true">{entry.kind === "directory" || entry.targetKind === "directory" ? "▸" : "·"}</span>
              <span>{entry.name}</span>
            </button>
          ))}
        </div>
        <div className="file-preview">
          {error !== undefined && <p className="error-state">{error}</p>}
          {error === undefined && preview === undefined && <p className="muted-state">{t("ui.files.select")}</p>}
          {preview?.kind === "text" && <pre>{preview.content}</pre>}
          {preview?.kind === "image" && <img src={preview.dataUrl} alt={preview.name} />}
          {preview?.kind === "unsupported" && <p className="muted-state">{t("ui.files.previewUnavailable")}</p>}
        </div>
      </div>
    </div>
  );
}

function TerminalTool({
  cwd,
  hidden,
  t,
}: {
  cwd: string;
  hidden: boolean;
  t: Translate;
}): ReactNode {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;
    let sessionId: string | undefined;
    let disposed = false;
    let terminal: Terminal | undefined;
    let resize: ResizeObserver | undefined;
    let themeObserver: MutationObserver | undefined;
    let input: { dispose(): void } | undefined;
    let unsubscribe: (() => void) | undefined;
    const pending: TerminalEvent[] = [];

    const start = async (): Promise<void> => {
      const settings = await window.oruDesktop.terminal.readSettings();
      if (disposed) return;
      const activeTerminal = new Terminal({
        cursorBlink: true,
        fontFamily: settings.fontFamily || "var(--font-mono)",
        fontSize: settings.fontSize,
        lineHeight: settings.lineHeight,
        scrollback: 5_000,
        theme: terminalTheme(),
        allowTransparency: true,
      });
      terminal = activeTerminal;
      const fit = new FitAddon();
      activeTerminal.loadAddon(fit);
      activeTerminal.open(host);
      themeObserver = new MutationObserver(() => {
        activeTerminal.options.theme = terminalTheme();
      });
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
      });
      const deliver = (event: TerminalEvent): void => {
        if (event.type === "data") activeTerminal.write(event.data);
        else if (event.type === "exit") {
          activeTerminal.write(`\r\n\x1b[2m${t("ui.terminal.exit", { code: String(event.exitCode ?? "?") })}\x1b[0m\r\n`);
        } else {
          console.warn("Terminal runtime error:", event.message);
          activeTerminal.write(
            `\r\n\x1b[31m${t("ui.terminal.runtimeError")}\x1b[0m\r\n`,
          );
        }
      };
      unsubscribe = window.oruDesktop.terminal.subscribe((event) => {
        if (sessionId === undefined) pending.push(event);
        else if (event.sessionId === sessionId) deliver(event);
      });
      input = activeTerminal.onData((data) => {
        if (sessionId !== undefined) {
          window.oruDesktop.terminal.write({ sessionId, data });
        }
      });
      resize = new ResizeObserver(() => {
        if (host.clientWidth === 0 || host.clientHeight === 0) return;
        try {
          fit.fit();
          if (sessionId !== undefined) {
            window.oruDesktop.terminal.resize({
              sessionId,
              cols: activeTerminal.cols,
              rows: activeTerminal.rows,
            });
          }
        } catch {
          // The panel may be hidden during a layout change.
        }
      });
      resize.observe(host);
      fit.fit();
      const result = await window.oruDesktop.terminal.create({
        cwd,
        cols: activeTerminal.cols,
        rows: activeTerminal.rows,
      });
      if (disposed) {
        window.oruDesktop.terminal.close(result.sessionId);
        return;
      }
      sessionId = result.sessionId;
      for (const event of pending) {
        if (event.sessionId === sessionId) deliver(event);
      }
      pending.length = 0;
      activeTerminal.focus();
    };
    void start().catch((reason: unknown) => {
      if (!disposed) {
        console.warn("Unable to start Terminal:", reason);
        setError(t("ui.terminal.startFailed"));
      }
    });
    return () => {
      disposed = true;
      if (sessionId !== undefined) {
        window.oruDesktop.terminal.close(sessionId);
      }
      themeObserver?.disconnect();
      resize?.disconnect();
      input?.dispose();
      unsubscribe?.();
      terminal?.dispose();
    };
  }, [cwd, t]);

  return (
    <div className="terminal-tool" hidden={hidden}>
      {error !== undefined && <p className="error-state">{error}</p>}
      <div className="terminal-host" ref={hostRef} />
    </div>
  );
}

interface OruWebviewElement extends HTMLElement {
  loadURL(url: string): Promise<void>;
  reload(): void;
}

interface OruWebviewNavigationEvent extends Event {
  readonly url?: unknown;
}

function WebTool({
  hidden,
  t,
}: {
  hidden: boolean;
  t: Translate;
}): ReactNode {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<OruWebviewElement | undefined>(undefined);
  const navigationRequest = useRef(0);
  const [input, setInput] = useState("https://example.com");
  const [error, setError] = useState<string>();

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;
    const view = document.createElement("webview") as OruWebviewElement;
    view.className = "web-tool__guest";
    view.setAttribute("src", input);
    view.setAttribute("partition", "persist:oru-tabs-web");
    view.setAttribute("webpreferences", "contextIsolation=yes,nodeIntegration=no,sandbox=yes,webSecurity=yes");
    const syncAddress = (event: Event): void => {
      navigationRequest.current += 1;
      const candidate = (event as OruWebviewNavigationEvent).url;
      const normalized = typeof candidate === "string"
        ? normalizeWebTabUrl(candidate)
        : undefined;
      if (normalized === undefined) {
        setInput("");
        setError(t("ui.web.invalid"));
        return;
      }
      setInput(normalized);
      setError(undefined);
    };
    view.addEventListener("did-navigate", syncAddress);
    view.addEventListener("did-navigate-in-page", syncAddress);
    host.append(view);
    viewRef.current = view;
    return () => {
      navigationRequest.current += 1;
      view.removeEventListener("did-navigate", syncAddress);
      view.removeEventListener("did-navigate-in-page", syncAddress);
      view.remove();
      viewRef.current = undefined;
    };
  // The initial page is intentionally created once; navigation uses loadURL.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigate = (): void => {
    const request = ++navigationRequest.current;
    const candidate = /^https?:\/\//iu.test(input) ? input : `https://${input}`;
    const normalized = normalizeWebTabUrl(candidate);
    if (normalized === undefined) {
      setError(t("ui.web.invalid"));
      return;
    }
    setInput(normalized);
    setError(undefined);
    void viewRef.current?.loadURL(normalized).catch((reason: unknown) => {
      if (navigationRequest.current === request) {
        console.warn("Unable to navigate Web tool:", reason);
        setError(t("ui.web.navigationFailed"));
      }
    });
  };

  return (
    <div className="web-tool" hidden={hidden}>
      <form className="web-address" onSubmit={(event) => { event.preventDefault(); navigate(); }}>
        <button className="icon-button" onClick={() => viewRef.current?.reload()} type="button" aria-label={t("ui.web.reload")}>↻</button>
        <input value={input} onChange={(event) => setInput(event.currentTarget.value)} aria-label={t("ui.web.address")} />
        <button className="compact-button" type="submit">{t("ui.web.go")}</button>
      </form>
      {error !== undefined && <p className="error-state">{error}</p>}
      <div className="web-tool__host" ref={hostRef} />
    </div>
  );
}
