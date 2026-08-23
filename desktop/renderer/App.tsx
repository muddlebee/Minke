import {
  useEffect,
  lazy,
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  Suspense,
  type FormEvent,
  type ReactNode,
} from "react";
import type { DesktopLocale } from "@minke/desktop/locale-contract";
import type { DesktopWorkspace } from "@minke/desktop/standalone-contract";
import {
  DemoAgentRuntime,
  type AgentRuntime,
  type AgentSession,
} from "./agent-runtime";

const ToolPanel = lazy(async () => {
  const module = await import("./ToolPanel");
  return { default: module.ToolPanel };
});

export interface AppProps {
  locale: DesktopLocale;
  /** Optional integration seam for Pi, Hermes, or another runtime adapter. */
  runtime?: AgentRuntime;
}

type ThemePreference = "system" | "light" | "dark";
const THEME_STORAGE_KEY = "oru.ui.theme.v1";

function useRuntime(runtime: AgentRuntime) {
  const subscribe = useCallback(
    (listener: () => void) => runtime.subscribe(listener),
    [runtime],
  );
  const getSnapshot = useCallback(() => runtime.getSnapshot(), [runtime]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export default function App({ locale, runtime: providedRuntime }: AppProps): ReactNode {
  const runtime = useMemo(
    () => providedRuntime ?? new DemoAgentRuntime(),
    [providedRuntime],
  );
  const snapshot = useRuntime(runtime);
  const [workspaces, setWorkspaces] = useState<readonly DesktopWorkspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [toolsOpen, setToolsOpen] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState<ThemePreference>(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY) ??
      localStorage.getItem("minke.theme");
    return stored === "light" || stored === "dark" ? stored : "system";
  });
  const activeWorkspace = workspaces.find((item) => item.id === activeWorkspaceId);
  const activeSession = snapshot.sessions.find((item) => item.id === snapshot.activeSessionId);

  useEffect(
    () => () => {
      if (providedRuntime === undefined) runtime.dispose();
    },
    [providedRuntime, runtime],
  );
  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    localStorage.removeItem("minke.theme");
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = (): void => {
      const resolved = theme === "system" ? (media.matches ? "dark" : "light") : theme;
      document.documentElement.dataset.theme = resolved;
      document.documentElement.style.colorScheme = resolved;
      window.oruDesktop.windowTheme.publish(theme, resolved);
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  const openWorkspace = useCallback(async (): Promise<void> => {
    const selected = await window.oruDesktop.workspace.open();
    if (selected === undefined) return;
    const existing = workspaces.find((item) => item.path === selected.path);
    if (existing !== undefined) {
      setActiveWorkspaceId(existing.id);
      const session = snapshot.sessions.find((item) => item.workspaceId === existing.id);
      if (session !== undefined) runtime.selectSession(session.id);
      return;
    }
    setWorkspaces((current) => [...current, selected]);
    setActiveWorkspaceId(selected.id);
    runtime.createSession(selected);
  }, [runtime, snapshot.sessions, workspaces]);

  const moveSession = useCallback((direction: "back" | "forward"): void => {
    if (activeWorkspace === undefined) return;
    const visible = snapshot.sessions.filter(
      (session) => session.workspaceId === activeWorkspace.id,
    );
    const currentIndex = visible.findIndex(
      (session) => session.id === snapshot.activeSessionId,
    );
    const nextIndex = currentIndex + (direction === "back" ? 1 : -1);
    const next = visible[nextIndex];
    if (next !== undefined) runtime.selectSession(next.id);
  }, [activeWorkspace, runtime, snapshot.activeSessionId, snapshot.sessions]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        if (paletteOpen) setPaletteOpen(false);
        else if (settingsOpen) setSettingsOpen(false);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "o") {
        event.preventDefault();
        void openWorkspace();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openWorkspace, paletteOpen, settingsOpen]);

  useEffect(() => {
    const unsubscribe = window.oruDesktop.shortcuts.subscribe((id) => {
      if (id === "palette.open") {
        setSettingsOpen(false);
        setPaletteOpen(true);
      } else if (id === "settings.open") {
        setPaletteOpen(false);
        setSettingsOpen(true);
      }
      else if (id === "session.new" && activeWorkspace !== undefined) {
        runtime.createSession(activeWorkspace);
      } else if (id === "session.back") {
        moveSession("back");
      } else if (id === "session.forward") {
        moveSession("forward");
      } else if (id === "sidebar.toggle") {
        setSidebarOpen((value) => !value);
      } else if (id === "tabs.toggle" || id === "tabs.bottom.toggle") {
        setToolsOpen((value) => !value);
      }
    });
    return unsubscribe;
  }, [activeWorkspace, moveSession, runtime]);

  return (
    <main
      className="app-shell"
      data-sidebar-open={sidebarOpen}
      data-tools-open={toolsOpen && activeWorkspace !== undefined}
    >
      <div className="titlebar-drag" aria-hidden="true" />
      {sidebarOpen && (
        <Sidebar
          workspaces={workspaces}
          sessions={snapshot.sessions}
          activeWorkspaceId={activeWorkspaceId}
          activeSessionId={snapshot.activeSessionId}
          runtimeLabel={runtime.label}
          onOpenWorkspace={() => void openWorkspace()}
          onSelectWorkspace={(workspace) => {
            setActiveWorkspaceId(workspace.id);
            const session = snapshot.sessions.find((item) => item.workspaceId === workspace.id);
            if (session !== undefined) runtime.selectSession(session.id);
          }}
          onSelectSession={(sessionId) => runtime.selectSession(sessionId)}
          onNewSession={() => activeWorkspace !== undefined && runtime.createSession(activeWorkspace)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}
      <section className="conversation-pane">
        <header className="conversation-header">
          <div><h1>{activeSession?.title ?? "Oru"}</h1><p>{activeWorkspace?.path ?? "Agent workspace"}</p></div>
          <div className="header-actions">
            <span className="runtime-badge"><span />{runtime.label}</span>
            <button className="compact-button" disabled={activeWorkspace === undefined} onClick={() => setToolsOpen((value) => !value)} type="button">
              {toolsOpen ? "Hide tools" : "Show tools"}
            </button>
          </div>
        </header>
        {activeWorkspace === undefined || activeSession === undefined
          ? <Welcome onOpen={() => void openWorkspace()} />
          : <Conversation session={activeSession} runtime={runtime} />}
      </section>
      {toolsOpen && activeWorkspace !== undefined && (
        <Suspense fallback={<aside className="tool-panel"><p className="muted-state">Loading tools…</p></aside>}>
          <ToolPanel
            key={activeWorkspace.id}
            workspace={activeWorkspace}
            onClose={() => setToolsOpen(false)}
          />
        </Suspense>
      )}
      {paletteOpen && (
        <CommandPalette
          canCreateSession={activeWorkspace !== undefined}
          toolsOpen={toolsOpen}
          onClose={() => setPaletteOpen(false)}
          onOpenWorkspace={() => {
            setPaletteOpen(false);
            void openWorkspace();
          }}
          onNewSession={() => {
            if (activeWorkspace !== undefined) runtime.createSession(activeWorkspace);
            setPaletteOpen(false);
          }}
          onToggleTools={() => {
            setToolsOpen((value) => !value);
            setPaletteOpen(false);
          }}
          onOpenSettings={() => {
            setPaletteOpen(false);
            setSettingsOpen(true);
          }}
        />
      )}
      {settingsOpen && (
        <SettingsDialog
          locale={locale}
          runtimeLabel={runtime.label}
          theme={theme}
          onTheme={setTheme}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </main>
  );
}

function CommandPalette(props: {
  canCreateSession: boolean;
  toolsOpen: boolean;
  onClose(): void;
  onOpenWorkspace(): void;
  onNewSession(): void;
  onToggleTools(): void;
  onOpenSettings(): void;
}): ReactNode {
  const actions = [
    { label: "Open folder", shortcut: "⌘O", run: props.onOpenWorkspace },
    { label: "New session", shortcut: "⌘N", run: props.onNewSession, disabled: !props.canCreateSession },
    { label: props.toolsOpen ? "Hide tools" : "Show tools", shortcut: "⌘P", run: props.onToggleTools },
    { label: "Settings", shortcut: "⌘,", run: props.onOpenSettings },
  ];
  return (
    <div className="dialog-backdrop command-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && props.onClose()}>
      <section className="command-palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <header><span>Run a command</span><kbd>Esc</kbd></header>
        <div>
          {actions.map((action, index) => (
            <button autoFocus={index === 0} disabled={action.disabled} key={action.label} onClick={action.run} type="button">
              <span>{action.label}</span><kbd>{action.shortcut}</kbd>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function Sidebar(props: {
  workspaces: readonly DesktopWorkspace[];
  sessions: readonly AgentSession[];
  activeWorkspaceId?: string;
  activeSessionId?: string;
  runtimeLabel: string;
  onOpenWorkspace(): void;
  onSelectWorkspace(workspace: DesktopWorkspace): void;
  onSelectSession(sessionId: string): void;
  onNewSession(): void;
  onOpenSettings(): void;
}): ReactNode {
  const visibleSessions = props.sessions.filter((session) => session.workspaceId === props.activeWorkspaceId);
  return (
    <aside className="sidebar">
      <div className="sidebar__brand"><img src="./oru.svg" alt="" /><strong>Oru</strong></div>
      <button className="primary-button" onClick={props.onOpenWorkspace} type="button"><span aria-hidden="true">＋</span> Open Folder</button>
      <div className="sidebar__section">
        <div className="section-label"><span>Workspaces</span><span>{props.workspaces.length}</span></div>
        <div className="sidebar-list">
          {props.workspaces.length === 0 && <p className="sidebar-empty">Folders you open appear here for this launch.</p>}
          {props.workspaces.map((workspace) => (
            <button className="sidebar-row" data-active={workspace.id === props.activeWorkspaceId} key={workspace.id} onClick={() => props.onSelectWorkspace(workspace)} type="button">
              <span className="workspace-mark">{workspace.name.slice(0, 1).toUpperCase()}</span>
              <span className="sidebar-row__copy"><strong>{workspace.name}</strong><small>{workspace.path}</small></span>
            </button>
          ))}
        </div>
      </div>
      {props.activeWorkspaceId !== undefined && (
        <div className="sidebar__section sidebar__section--sessions">
          <div className="section-label"><span>Sessions</span><button className="section-add" onClick={props.onNewSession} type="button" aria-label="New session">＋</button></div>
          <div className="sidebar-list">
            {visibleSessions.map((session) => (
              <button className="session-row" data-active={session.id === props.activeSessionId} key={session.id} onClick={() => props.onSelectSession(session.id)} type="button">
                <span>{session.title}</span>{session.status !== "idle" && <i aria-label={session.status} />}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="sidebar__footer">
        <button className="sidebar-footer-button" onClick={props.onOpenSettings} type="button">⚙ <span>Settings</span></button>
        <span className="sidebar-runtime">{props.runtimeLabel}</span>
      </div>
    </aside>
  );
}

function Welcome({ onOpen }: { onOpen(): void }): ReactNode {
  return (
    <div className="welcome">
      <div className="welcome__symbol">O</div>
      <p className="eyebrow">HARNESS-NEUTRAL DESKTOP</p>
      <h2>A focused home for<br />your coding agents.</h2>
      <p className="welcome__lede">Open a project to explore the standalone conversation shell, files, terminal, and web tools.</p>
      <button className="primary-button primary-button--large" onClick={onOpen} type="button">Open a folder <span>⌘O</span></button>
      <div className="welcome__details">
        <span><b>Local tools</b> Files and terminal stay on your machine</span>
        <span><b>Adapter ready</b> Built for Pi, Hermes, and future runtimes</span>
      </div>
    </div>
  );
}

function Conversation({ session, runtime }: { session: AgentSession; runtime: AgentRuntime }): ReactNode {
  const [prompt, setPrompt] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session.messages.length, session.activities.length]);
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (session.status !== "idle" || prompt.trim() === "") return;
    runtime.send(session.id, prompt);
    setPrompt("");
  };
  return (
    <div className="conversation">
      <div className="message-scroll"><div className="message-list">
        {session.messages.map((message) => (
          <article className="message" data-role={message.role} key={message.id}>
            <div className="message__avatar">{message.role === "assistant" ? "O" : "YOU"}</div>
            <div className="message__body"><div className="message__meta">{message.role === "assistant" ? "Oru" : "You"}{message.interrupted ? " · interrupted" : ""}</div><p>{message.content}</p></div>
          </article>
        ))}
        {session.activities.length > 0 && (
          <div className="activity-card" aria-label="Agent activity">
            {session.activities.map((item) => (
              <div className="activity-row" data-state={item.state} key={item.id}>
                <span>{item.state === "complete" ? "✓" : item.state === "interrupted" ? "×" : "·"}</span>
                <div><strong>{item.label}</strong><small>{item.detail}</small></div>
              </div>
            ))}
          </div>
        )}
        <div ref={endRef} />
      </div></div>
      <form className="composer" onSubmit={submit}>
        <textarea aria-label="Message" placeholder="Ask Oru about this project…" value={prompt} onChange={(event) => setPrompt(event.currentTarget.value)} onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }} />
        <div className="composer__footer">
          <span>Scripted demo · Enter to send · Shift+Enter for newline</span>
          {session.status === "idle"
            ? <button className="send-button" disabled={prompt.trim() === ""} type="submit" aria-label="Send">↑</button>
            : <button className="stop-button" onClick={() => runtime.abort(session.id)} type="button">■ Stop</button>}
        </div>
      </form>
    </div>
  );
}

function SettingsDialog(props: {
  locale: DesktopLocale;
  runtimeLabel: string;
  theme: ThemePreference;
  onTheme(theme: ThemePreference): void;
  onClose(): void;
}): ReactNode {
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && props.onClose()}>
      <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header><div><p className="eyebrow">PREFERENCES</p><h2 id="settings-title">Settings</h2></div><button className="icon-button" onClick={props.onClose} type="button" aria-label="Close">×</button></header>
        <div className="settings-section"><div><strong>Appearance</strong><p>Follow the system or choose a fixed theme.</p></div><div className="segmented">
          {(["system", "light", "dark"] as const).map((item) => <button data-active={props.theme === item} key={item} onClick={() => props.onTheme(item)} type="button">{item}</button>)}
        </div></div>
        <div className="settings-section"><div><strong>Language</strong><p>Currently follows the desktop locale.</p></div><span className="settings-value">{props.locale === "zh" ? "简体中文" : "English"}</span></div>
        <div className="settings-section"><div><strong>Runtime</strong><p>Implement AgentRuntime to connect another harness.</p></div><span className="runtime-badge"><span />{props.runtimeLabel}</span></div>
        <footer>Oru {window.oruDesktop.about.version} · {window.oruDesktop.about.platform} {window.oruDesktop.about.arch}</footer>
      </section>
    </div>
  );
}
