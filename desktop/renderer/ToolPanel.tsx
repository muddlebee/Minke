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
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import type { DesktopWorkspace } from "@minke/desktop/standalone-contract";
import type {
  FileManagerEntry,
  FileManagerPreviewResult,
} from "@minke/harness-overlay/tabs/files-contract";
import { Icon, type IconName } from "./Icon";

type ToolKind = "files" | "terminal" | "web";
type Translate = (
  key: DesktopMessageKey,
  params?: DesktopTranslateParams,
) => string;

const TOOL_TABS: readonly {
  kind: ToolKind;
  icon: IconName;
  label: DesktopMessageKey;
}[] = [
  { kind: "files", icon: "folder", label: "ui.tools.files" },
  { kind: "terminal", icon: "terminal", label: "ui.tools.terminal" },
  { kind: "web", icon: "globe", label: "ui.tools.web" },
];

/**
 * xterm measures cell metrics from a real resolved family, so it cannot take
 * `var(--font-mono)` the way CSS can. Keep this stack in sync with the
 * `--font-mono` token in styles.css.
 */
const TERMINAL_FONT_STACK =
  '"JetBrains Mono Variable", ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace';

const IMAGE_EXTENSION = /\.(?:apng|avif|bmp|gif|ico|jpe?g|png|svg|webp)$/iu;

/**
 * Resolve xterm's palette from the active theme tokens.
 *
 * The background must be a real color rather than a transparent one: xterm's
 * own stylesheet paints `.xterm-viewport` opaque black, and a zero-alpha theme
 * background never overrides it, so a light-theme terminal rendered dark text
 * on black.
 */
function terminalTheme() {
  const styles = getComputedStyle(document.documentElement);
  const token = (name: string): string =>
    styles.getPropertyValue(name).trim();
  return {
    background: token("--surface-solid"),
    foreground: token("--text-primary"),
    cursor: token("--accent"),
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
          {TOOL_TABS.map((tab) => (
            <button
              className="tool-tab"
              data-active={active === tab.kind}
              key={tab.kind}
              onClick={() => {
                setActive(tab.kind);
                if (tab.kind === "terminal") setTerminalOpened(true);
                if (tab.kind === "web") setWebOpened(true);
              }}
              role="tab"
              aria-label={t(tab.label)}
              aria-selected={active === tab.kind}
              type="button"
            >
              <Icon name={tab.icon} size={14} />
              <span>{t(tab.label)}</span>
            </button>
          ))}
        </div>
        <button
          className="icon-button icon-button--ghost"
          onClick={props.onClose}
          type="button"
          aria-label={t("ui.tools.close")}
        >
          <Icon name="x" />
        </button>
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

interface Crumb {
  readonly name: string;
  readonly path: string;
}

/**
 * Split a workspace-relative path into clickable crumbs.
 *
 * Every crumb path is sliced out of the original string, so the platform's own
 * separators survive untouched on Windows as well as POSIX.
 */
function buildCrumbs(root: string, path: string): readonly Crumb[] {
  const rootName = root.split(/[\\/]/u).filter(Boolean).at(-1) ?? root;
  const crumbs: Crumb[] = [{ name: rootName, path: root }];
  if (!path.startsWith(root)) return crumbs;
  const relative = path.slice(root.length);
  if (
    relative === "" ||
    (!/[\\/]$/u.test(root) && !/^[\\/]/u.test(relative))
  ) {
    return crumbs;
  }
  for (const match of relative.matchAll(/[^\\/]+/gu)) {
    const end = root.length + (match.index ?? 0) + match[0].length;
    crumbs.push({ name: match[0], path: path.slice(0, end) });
  }
  return crumbs;
}

function entryIcon(entry: FileManagerEntry): IconName {
  if (entry.kind === "directory" || entry.targetKind === "directory") {
    return "folder";
  }
  return IMAGE_EXTENSION.test(entry.name) ? "image" : "file";
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
  const [selected, setSelected] = useState<string>();
  const [preview, setPreview] = useState<FileManagerPreviewResult>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [split, setSplit] = useState(45);
  const [dragging, setDragging] = useState(false);
  const previewRequest = useRef(0);
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => () => {
    previewRequest.current += 1;
  }, []);

  const navigateTo = (nextPath: string): void => {
    previewRequest.current += 1;
    setPreview(undefined);
    setSelected(undefined);
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
    setSelected(entry.path);
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

  const resizeTo = (clientY: number): void => {
    const content = contentRef.current;
    if (content === null) return;
    const bounds = content.getBoundingClientRect();
    if (bounds.height === 0) return;
    const ratio = ((clientY - bounds.top) / bounds.height) * 100;
    setSplit(Math.min(80, Math.max(15, ratio)));
  };

  const startResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const continueResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (dragging) resizeTo(event.clientY);
  };

  const endResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
  };

  const nudgeResize = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const step = event.key === "ArrowUp" ? -4 : event.key === "ArrowDown" ? 4 : 0;
    if (step === 0) return;
    event.preventDefault();
    setSplit((current) => Math.min(80, Math.max(15, current + step)));
  };

  const crumbs = buildCrumbs(root, path);
  const visibleCrumbs = crumbs.length > 4
    ? [crumbs[0] as Crumb, ...crumbs.slice(-2)]
    : crumbs;

  return (
    <div className="files-tool" hidden={hidden}>
      <div className="tool-bar files-address" title={path}>
        <button
          className="icon-button icon-button--ghost"
          disabled={path === root || parent === undefined}
          onClick={() => parent !== undefined && navigateTo(parent)}
          type="button"
          aria-label={t("ui.files.parent")}
        >
          <Icon name="arrowUp" />
        </button>
        <nav className="breadcrumbs" aria-label={t("ui.files.breadcrumbs")}>
          {visibleCrumbs.map((crumb, index) => (
            <span key={crumb.path} className="breadcrumbs__item">
              {index > 0 && (
                <span className="breadcrumbs__separator" aria-hidden="true">
                  <Icon name="chevronRight" size={12} />
                </span>
              )}
              {index === 1 && visibleCrumbs.length < crumbs.length && (
                <span className="breadcrumbs__ellipsis" aria-hidden="true">…</span>
              )}
              <button
                className="breadcrumb"
                disabled={crumb.path === path}
                onClick={() => navigateTo(crumb.path)}
                type="button"
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </nav>
      </div>
      <div
        className="files-content"
        ref={contentRef}
        style={{ "--files-split": `${split}%` } as CSSProperties}
      >
        <div className="file-list" aria-label={t("ui.files.list")}>
          {loading && <p className="muted-state">{t("ui.files.loading")}</p>}
          {!loading && entries.length === 0 && error === undefined && (
            <p className="muted-state">{t("ui.files.emptyFolder")}</p>
          )}
          {!loading && entries.map((entry) => {
            const kind = entry.kind === "directory" || entry.targetKind === "directory"
              ? "directory"
              : "file";
            return (
              <button
                className="file-row"
                data-active={entry.path === selected}
                data-kind={kind}
                key={entry.path}
                onClick={() => choose(entry)}
                type="button"
              >
                <Icon name={entryIcon(entry)} size={14} />
                <span>{entry.name}</span>
              </button>
            );
          })}
        </div>
        <div
          aria-label={t("ui.files.resize")}
          aria-orientation="horizontal"
          aria-valuemax={80}
          aria-valuemin={15}
          aria-valuenow={Math.round(split)}
          className="split-handle"
          data-dragging={dragging}
          onKeyDown={nudgeResize}
          onPointerCancel={endResize}
          onPointerDown={startResize}
          onPointerMove={continueResize}
          onPointerUp={endResize}
          role="separator"
          tabIndex={0}
        />
        <div className="file-preview">
          {error !== undefined && <p className="error-state">{error}</p>}
          {error === undefined && preview === undefined && (
            <div className="empty-state">
              <Icon name="file" size={22} />
              <p>{t("ui.files.select")}</p>
            </div>
          )}
          {preview?.kind === "text" && <pre>{preview.content}</pre>}
          {preview?.kind === "image" && <img src={preview.dataUrl} alt={preview.name} />}
          {preview?.kind === "unsupported" && (
            <div className="empty-state">
              <Icon name="file" size={22} />
              <p>{t("ui.files.previewUnavailable")}</p>
            </div>
          )}
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
      const fontFamily = settings.fontFamily || TERMINAL_FONT_STACK;
      // Cell metrics are measured once at open time. Wait for the bundled face
      // so the grid is not sized against a fallback font and then reflowed.
      await document.fonts.load(`${settings.fontSize}px ${fontFamily}`)
        .catch(() => undefined);
      await document.fonts.ready.catch(() => undefined);
      if (disposed) return;
      const activeTerminal = new Terminal({
        cursorBlink: true,
        fontFamily,
        fontSize: settings.fontSize,
        lineHeight: settings.lineHeight,
        scrollback: 5_000,
        theme: terminalTheme(),
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
  goBack(): void;
  goForward(): void;
  canGoBack(): boolean;
  canGoForward(): boolean;
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
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState({ back: false, forward: false });

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;
    const view = document.createElement("webview") as OruWebviewElement;
    view.className = "web-tool__guest";
    view.setAttribute("src", input);
    view.setAttribute("partition", "persist:oru-tabs-web");
    view.setAttribute("webpreferences", "contextIsolation=yes,nodeIntegration=no,sandbox=yes,webSecurity=yes");
    const syncHistory = (): void => {
      setHistory({ back: view.canGoBack(), forward: view.canGoForward() });
    };
    const syncAddress = (event: Event): void => {
      navigationRequest.current += 1;
      syncHistory();
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
    const startLoading = (): void => setLoading(true);
    const stopLoading = (): void => {
      setLoading(false);
      syncHistory();
    };
    view.addEventListener("did-navigate", syncAddress);
    view.addEventListener("did-navigate-in-page", syncAddress);
    view.addEventListener("did-start-loading", startLoading);
    view.addEventListener("did-stop-loading", stopLoading);
    host.append(view);
    viewRef.current = view;
    return () => {
      navigationRequest.current += 1;
      view.removeEventListener("did-navigate", syncAddress);
      view.removeEventListener("did-navigate-in-page", syncAddress);
      view.removeEventListener("did-start-loading", startLoading);
      view.removeEventListener("did-stop-loading", stopLoading);
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
      <form
        className="tool-bar web-address"
        onSubmit={(event) => { event.preventDefault(); navigate(); }}
      >
        <button
          className="icon-button icon-button--ghost"
          disabled={!history.back}
          onClick={() => viewRef.current?.goBack()}
          type="button"
          aria-label={t("ui.web.back")}
        >
          <Icon name="arrowLeft" />
        </button>
        <button
          className="icon-button icon-button--ghost"
          disabled={!history.forward}
          onClick={() => viewRef.current?.goForward()}
          type="button"
          aria-label={t("ui.web.forward")}
        >
          <Icon name="arrowRight" />
        </button>
        <button
          className="icon-button icon-button--ghost"
          onClick={() => viewRef.current?.reload()}
          type="button"
          aria-label={t("ui.web.reload")}
        >
          <Icon name="refresh" />
        </button>
        <input
          value={input}
          onChange={(event) => setInput(event.currentTarget.value)}
          aria-label={t("ui.web.address")}
          spellCheck={false}
        />
        <button className="compact-button" type="submit">{t("ui.web.go")}</button>
      </form>
      {loading && <div className="web-progress" role="progressbar" aria-label={t("ui.web.loading")} />}
      {error !== undefined && <p className="error-state">{error}</p>}
      <div className="web-tool__host" ref={hostRef} />
    </div>
  );
}
