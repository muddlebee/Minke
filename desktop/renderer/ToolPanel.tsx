import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { normalizeWebTabUrl } from "@minke/harness-overlay/tabs/contract";
import type { TerminalEvent } from "@minke/harness-overlay/tabs/terminal-contract";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { DesktopWorkspace } from "@minke/desktop/standalone-contract";
import type {
  FileManagerEntry,
  FileManagerPreviewResult,
} from "@minke/harness-overlay/tabs/files-contract";

type ToolKind = "files" | "terminal" | "web";

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
  workspace: DesktopWorkspace;
  onClose(): void;
}): ReactNode {
  const [active, setActive] = useState<ToolKind>("files");
  return (
    <aside className="tool-panel" aria-label="Workspace tools">
      <header className="tool-panel__header">
        <div className="tool-tabs" role="tablist" aria-label="Tools">
          {(["files", "terminal", "web"] as const).map((kind) => (
            <button
              className="tool-tab"
              data-active={active === kind}
              key={kind}
              onClick={() => setActive(kind)}
              role="tab"
              aria-selected={active === kind}
              type="button"
            >
              {kind === "files" ? "Files" : kind === "terminal" ? "Terminal" : "Web"}
            </button>
          ))}
        </div>
        <button className="icon-button" onClick={props.onClose} type="button" aria-label="Close tools">×</button>
      </header>
      <div className="tool-panel__body">
        {active === "files" && <FilesTool root={props.workspace.path} />}
        {active === "terminal" && <TerminalTool cwd={props.workspace.path} />}
        {active === "web" && <WebTool />}
      </div>
    </aside>
  );
}

function FilesTool({ root }: { root: string }): ReactNode {
  const [path, setPath] = useState(root);
  const [parent, setParent] = useState<string>();
  const [entries, setEntries] = useState<readonly FileManagerEntry[]>([]);
  const [preview, setPreview] = useState<FileManagerPreviewResult>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const previewRequest = useRef(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(undefined);
    setPreview(undefined);
    void window.oruDesktop.files.list({ path }).then((result) => {
      if (!active) return;
      setEntries(result.entries);
      setParent(result.parent);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : String(reason));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [path]);

  const choose = (entry: FileManagerEntry): void => {
    const request = ++previewRequest.current;
    setPreview(undefined);
    setError(undefined);
    if (entry.kind === "directory" || entry.targetKind === "directory") {
      setPath(entry.path);
      return;
    }
    void window.oruDesktop.files.preview({ path: entry.path })
      .then((result) => {
        if (previewRequest.current === request) setPreview(result);
      })
      .catch((reason: unknown) => {
        if (previewRequest.current === request) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      });
  };

  return (
    <div className="files-tool">
      <div className="files-address" title={path}>
        <button
          className="icon-button"
          disabled={path === root}
          onClick={() => parent !== undefined && setPath(parent)}
          type="button"
          aria-label="Parent folder"
        >←</button>
        <span>{path === root ? root : path.slice(root.length) || "/"}</span>
      </div>
      <div className="files-content">
        <div className="file-list" aria-label="Files">
          {loading && <p className="muted-state">Loading…</p>}
          {!loading && entries.map((entry) => (
            <button className="file-row" key={entry.path} onClick={() => choose(entry)} type="button">
              <span aria-hidden="true">{entry.kind === "directory" || entry.targetKind === "directory" ? "▸" : "·"}</span>
              <span>{entry.name}</span>
            </button>
          ))}
        </div>
        <div className="file-preview">
          {error !== undefined && <p className="error-state">{error}</p>}
          {error === undefined && preview === undefined && <p className="muted-state">Select a file to preview</p>}
          {preview?.kind === "text" && <pre>{preview.content}</pre>}
          {preview?.kind === "image" && <img src={preview.dataUrl} alt={preview.name} />}
          {preview?.kind === "unsupported" && <p className="muted-state">Preview unavailable for this file.</p>}
        </div>
      </div>
    </div>
  );
}

function TerminalTool({ cwd }: { cwd: string }): ReactNode {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;
    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: "var(--font-mono)",
      fontSize: 12,
      lineHeight: 1.25,
      scrollback: 5_000,
      theme: terminalTheme(),
      allowTransparency: true,
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(host);
    const themeObserver = new MutationObserver(() => {
      terminal.options.theme = terminalTheme();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    let sessionId: string | undefined;
    let disposed = false;
    const pending: TerminalEvent[] = [];
    const deliver = (event: TerminalEvent): void => {
      if (event.type === "data") terminal.write(event.data);
      else if (event.type === "exit") {
        terminal.write(`\r\n\x1b[2mProcess exited (${String(event.exitCode ?? "?")})\x1b[0m\r\n`);
      } else {
        terminal.write(`\r\n\x1b[31m${event.message}\x1b[0m\r\n`);
      }
    };
    const unsubscribe = window.oruDesktop.terminal.subscribe((event) => {
      if (sessionId === undefined) pending.push(event);
      else if (event.sessionId === sessionId) deliver(event);
    });
    const input = terminal.onData((data) => {
      if (sessionId !== undefined) window.oruDesktop.terminal.write({ sessionId, data });
    });
    const resize = new ResizeObserver(() => {
      if (host.clientWidth === 0 || host.clientHeight === 0) return;
      try {
        fit.fit();
        if (sessionId !== undefined) {
          window.oruDesktop.terminal.resize({ sessionId, cols: terminal.cols, rows: terminal.rows });
        }
      } catch {
        // The panel may be hidden during a layout change.
      }
    });
    resize.observe(host);
    fit.fit();
    void window.oruDesktop.terminal.create({ cwd, cols: terminal.cols, rows: terminal.rows })
      .then((result) => {
        if (disposed) {
          window.oruDesktop.terminal.close(result.sessionId);
          return;
        }
        sessionId = result.sessionId;
        for (const event of pending) if (event.sessionId === sessionId) deliver(event);
        pending.length = 0;
        terminal.focus();
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)));
    return () => {
      disposed = true;
      if (sessionId !== undefined) window.oruDesktop.terminal.close(sessionId);
      themeObserver.disconnect();
      resize.disconnect();
      input.dispose();
      unsubscribe();
      terminal.dispose();
    };
  }, [cwd]);

  return (
    <div className="terminal-tool">
      {error !== undefined && <p className="error-state">{error}</p>}
      <div className="terminal-host" ref={hostRef} />
    </div>
  );
}

interface OruWebviewElement extends HTMLElement {
  loadURL(url: string): Promise<void>;
  reload(): void;
}

function WebTool(): ReactNode {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<OruWebviewElement | undefined>(undefined);
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
    host.append(view);
    viewRef.current = view;
    return () => {
      view.remove();
      viewRef.current = undefined;
    };
  // The initial page is intentionally created once; navigation uses loadURL.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigate = (): void => {
    const candidate = /^https?:\/\//iu.test(input) ? input : `https://${input}`;
    const normalized = normalizeWebTabUrl(candidate);
    if (normalized === undefined) {
      setError("Enter a credential-free HTTP(S) URL.");
      return;
    }
    setInput(normalized);
    setError(undefined);
    void viewRef.current?.loadURL(normalized).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason));
    });
  };

  return (
    <div className="web-tool">
      <form className="web-address" onSubmit={(event) => { event.preventDefault(); navigate(); }}>
        <button className="icon-button" onClick={() => viewRef.current?.reload()} type="button" aria-label="Reload">↻</button>
        <input value={input} onChange={(event) => setInput(event.currentTarget.value)} aria-label="Web address" />
        <button className="compact-button" type="submit">Go</button>
      </form>
      {error !== undefined && <p className="error-state">{error}</p>}
      <div className="web-tool__host" ref={hostRef} />
    </div>
  );
}
