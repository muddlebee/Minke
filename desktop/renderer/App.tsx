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
import {
  translateDesktop,
  type DesktopMessageKey,
  type DesktopTranslateParams,
} from "@minke/desktop/i18n";
import type { DesktopWorkspace } from "@minke/desktop/standalone-contract";
import {
  formatShortcutBinding,
  resolveProductShortcutBindings,
  type EffectiveProductShortcutBindings,
  type ProductShortcutActionId,
} from "@minke/harness-overlay/shortcut-contract";
import {
  DemoAgentRuntime,
  type AgentRuntime,
  type AgentSession,
} from "./agent-runtime";
import { Icon } from "./Icon";

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
type Translate = (
  key: DesktopMessageKey,
  params?: DesktopTranslateParams,
) => string;
const THEME_STORAGE_KEY = "oru.ui.theme.v1";

/**
 * Shorten a workspace path to its trailing segments.
 *
 * Plain CSS truncation keeps the useless head of a path (`/home/me/Code/…`),
 * and the usual `direction: rtl` workaround reorders the separators because
 * they are bidi-neutral. Trimming in advance keeps the identifying tail and
 * leaves the full path on the element's `title`.
 */
function shortenPath(path: string): string {
  const segments = path.split(/[\\/]/u).filter(Boolean);
  if (segments.length <= 2) return path;
  return `…/${segments.slice(-2).join("/")}`;
}

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
    () => providedRuntime ?? new DemoAgentRuntime(locale),
    [locale, providedRuntime],
  );
  const snapshot = useRuntime(runtime);
  const [workspaces, setWorkspaces] = useState<readonly DesktopWorkspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [toolsOpen, setToolsOpen] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [drafts, setDrafts] = useState<Readonly<Record<string, string>>>({});
  const [shortcutBindings, setShortcutBindings] =
    useState<EffectiveProductShortcutBindings>(
      () => resolveProductShortcutBindings(
        {},
        window.oruDesktop.about.platform,
      ),
    );
  const lastSessionByWorkspace = useRef(new Map<string, string>());
  const [theme, setTheme] = useState<ThemePreference>(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY) ??
      localStorage.getItem("minke.theme");
    return stored === "light" || stored === "dark" ? stored : "system";
  });
  const activeWorkspace = workspaces.find((item) => item.id === activeWorkspaceId);
  const activeSession = snapshot.sessions.find((item) => item.id === snapshot.activeSessionId);
  const shortcut = useCallback(
    (id: ProductShortcutActionId) =>
      shortcutBindings[id] === undefined ||
      shortcutBindings[id] === ""
        ? undefined
        : formatShortcutBinding(
            shortcutBindings[id],
            window.oruDesktop.about.platform,
          ),
    [shortcutBindings],
  );
  const t = useCallback(
    (key: DesktopMessageKey, params?: DesktopTranslateParams) =>
      translateDesktop(locale, key, params),
    [locale],
  );
  const runtimeLabel = runtime.kind === "demo"
    ? t("ui.runtime.demo")
    : runtime.label;

  useEffect(
    () => () => {
      if (providedRuntime === undefined) runtime.dispose();
    },
    [providedRuntime, runtime],
  );
  useEffect(() => {
    if (activeSession !== undefined) {
      lastSessionByWorkspace.current.set(
        activeSession.workspaceId,
        activeSession.id,
      );
    }
  }, [activeSession]);
  useEffect(() => {
    let active = true;
    void window.oruDesktop.shortcuts.read().then((overrides) => {
      if (active) {
        setShortcutBindings(
          resolveProductShortcutBindings(
            overrides,
            window.oruDesktop.about.platform,
          ),
        );
      }
    }).catch(() => {
      if (active) {
        setShortcutBindings(resolveProductShortcutBindings(
          {},
          window.oruDesktop.about.platform,
        ));
      }
    });
    return () => {
      active = false;
    };
  }, [paletteOpen]);
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

  const selectWorkspace = useCallback((workspace: DesktopWorkspace): void => {
    setActiveWorkspaceId(workspace.id);
    const remembered = lastSessionByWorkspace.current.get(workspace.id);
    const session = snapshot.sessions.find(
      (item) =>
        item.workspaceId === workspace.id &&
        item.id === remembered,
    ) ?? snapshot.sessions.find(
      (item) => item.workspaceId === workspace.id,
    );
    if (session !== undefined) runtime.selectSession(session.id);
  }, [runtime, snapshot.sessions]);

  const openWorkspace = useCallback(async (): Promise<void> => {
    const selected = await window.oruDesktop.workspace.open();
    if (selected === undefined) return;
    const existing = workspaces.find((item) => item.path === selected.path);
    if (existing !== undefined) {
      selectWorkspace(existing);
      return;
    }
    setWorkspaces((current) => [...current, selected]);
    setActiveWorkspaceId(selected.id);
    runtime.createSession(selected);
  }, [runtime, selectWorkspace, workspaces]);

  const updateDraft = useCallback((sessionId: string, value: string): void => {
    setDrafts((current) => {
      if (value === "") {
        const remaining = { ...current };
        delete remaining[sessionId];
        return remaining;
      }
      return { ...current, [sessionId]: value };
    });
  }, []);

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
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [paletteOpen, settingsOpen]);

  useEffect(() => {
    const unsubscribe = window.oruDesktop.shortcuts.subscribe((id) => {
      if (id === "workspace.open") {
        void openWorkspace();
      } else if (id === "palette.open") {
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
  }, [activeWorkspace, moveSession, openWorkspace, runtime]);

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
          runtimeLabel={runtimeLabel}
          t={t}
          onOpenWorkspace={() => void openWorkspace()}
          onSelectWorkspace={selectWorkspace}
          onSelectSession={(sessionId) => runtime.selectSession(sessionId)}
          onNewSession={() => activeWorkspace !== undefined && runtime.createSession(activeWorkspace)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}
      <section className="conversation-pane">
        <header className="conversation-header">
          <div>
            <h1>{activeSession?.title ?? "Oru"}</h1>
            <p title={activeWorkspace?.path}>
              {activeWorkspace === undefined
                ? t("ui.agentWorkspace")
                : shortenPath(activeWorkspace.path)}
            </p>
          </div>
          <div className="header-actions">
            <span className="runtime-badge"><span />{runtimeLabel}</span>
            <button className="compact-button" disabled={activeWorkspace === undefined} onClick={() => setToolsOpen((value) => !value)} type="button">
              <Icon name="panelRight" size={14} />
              {toolsOpen ? t("ui.tools.hide") : t("ui.tools.show")}
            </button>
          </div>
        </header>
        {activeWorkspace === undefined || activeSession === undefined
          ? <Welcome
              openShortcut={shortcut("workspace.open") ?? "—"}
              onOpen={() => void openWorkspace()}
              t={t}
            />
          : <Conversation
              draft={drafts[activeSession.id] ?? ""}
              session={activeSession}
              runtime={runtime}
              t={t}
              onDraft={(value) => updateDraft(activeSession.id, value)}
            />}
      </section>
      {workspaces.map((workspace) => (
        <Suspense
          key={workspace.id}
          fallback={
            toolsOpen && workspace.id === activeWorkspaceId
              ? <aside className="tool-panel"><p className="muted-state">{t("ui.tools.loading")}</p></aside>
              : null
          }
        >
          <ToolPanel
            hidden={!toolsOpen || workspace.id !== activeWorkspaceId}
            locale={locale}
            workspace={workspace}
            onClose={() => setToolsOpen(false)}
          />
        </Suspense>
      ))}
      {paletteOpen && (
        <CommandPalette
          canCreateSession={activeWorkspace !== undefined}
          shortcut={shortcut}
          t={t}
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
          runtimeLabel={runtimeLabel}
          t={t}
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
  shortcut(id: ProductShortcutActionId): string | undefined;
  t: Translate;
  toolsOpen: boolean;
  onClose(): void;
  onOpenWorkspace(): void;
  onNewSession(): void;
  onToggleTools(): void;
  onOpenSettings(): void;
}): ReactNode {
  const actions = [
    { label: props.t("ui.command.openFolder"), shortcut: props.shortcut("workspace.open") ?? "—", run: props.onOpenWorkspace },
    { label: props.t("ui.command.newSession"), shortcut: props.shortcut("session.new") ?? "—", run: props.onNewSession, disabled: !props.canCreateSession },
    { label: props.toolsOpen ? props.t("ui.tools.hide") : props.t("ui.tools.show"), shortcut: props.shortcut("tabs.toggle") ?? "—", run: props.onToggleTools },
    { label: props.t("ui.command.settings"), shortcut: props.shortcut("settings.open") ?? "—", run: props.onOpenSettings },
  ];
  return (
    <div className="dialog-backdrop command-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && props.onClose()}>
      <section className="command-palette" role="dialog" aria-modal="true" aria-label={props.t("ui.command.palette")}>
        <header><span>{props.t("ui.command.run")}</span><kbd>Esc</kbd></header>
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
  t: Translate;
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
      <button className="primary-button" onClick={props.onOpenWorkspace} type="button"><Icon name="plus" /> {props.t("ui.command.openFolder")}</button>
      <div className="sidebar__section">
        <div className="section-label"><span>{props.t("ui.sidebar.workspaces")}</span><span>{props.workspaces.length}</span></div>
        <div className="sidebar-list">
          {props.workspaces.length === 0 && <p className="sidebar-empty">{props.t("ui.sidebar.empty")}</p>}
          {props.workspaces.map((workspace) => (
            <button className="sidebar-row" data-active={workspace.id === props.activeWorkspaceId} key={workspace.id} onClick={() => props.onSelectWorkspace(workspace)} title={workspace.path} type="button">
              <span className="workspace-mark">{workspace.name.slice(0, 1).toUpperCase()}</span>
              <span className="sidebar-row__copy"><strong>{workspace.name}</strong><small>{shortenPath(workspace.path)}</small></span>
            </button>
          ))}
        </div>
      </div>
      {props.activeWorkspaceId !== undefined && (
        <div className="sidebar__section sidebar__section--sessions">
          <div className="section-label"><span>{props.t("ui.sidebar.sessions")}</span><button className="section-add" onClick={props.onNewSession} type="button" aria-label={props.t("ui.sidebar.newSession")}><Icon name="plus" size={14} /></button></div>
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
        <button className="sidebar-footer-button" onClick={props.onOpenSettings} type="button"><Icon name="sliders" size={14} /> <span>{props.t("ui.settings.title")}</span></button>
        <span className="sidebar-runtime">{props.runtimeLabel}</span>
      </div>
    </aside>
  );
}

function Welcome(props: {
  openShortcut: string;
  onOpen(): void;
  t: Translate;
}): ReactNode {
  return (
    <div className="welcome">
      <div className="welcome__symbol">O</div>
      <p className="eyebrow">{props.t("ui.welcome.eyebrow")}</p>
      <h2>{props.t("ui.welcome.titleFirst")}<br />{props.t("ui.welcome.titleSecond")}</h2>
      <p className="welcome__lede">{props.t("ui.welcome.lede")}</p>
      <button className="primary-button primary-button--large" onClick={props.onOpen} type="button">{props.t("ui.welcome.openFolder")} <span>{props.openShortcut}</span></button>
      <div className="welcome__details">
        <span><b>{props.t("ui.welcome.localTools")}</b> {props.t("ui.welcome.localToolsDetail")}</span>
        <span><b>{props.t("ui.welcome.adapterReady")}</b> {props.t("ui.welcome.adapterReadyDetail")}</span>
      </div>
    </div>
  );
}

function Conversation({
  draft,
  session,
  runtime,
  t,
  onDraft,
}: {
  draft: string;
  session: AgentSession;
  runtime: AgentRuntime;
  t: Translate;
  onDraft(value: string): void;
}): ReactNode {
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session.messages.length, session.activities.length]);
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (session.status !== "idle" || draft.trim() === "") return;
    runtime.send(session.id, draft);
    onDraft("");
  };
  return (
    <div className="conversation">
      <div className="message-scroll"><div className="message-list">
        {session.messages.map((message) => (
          <article className="message" data-role={message.role} key={message.id}>
            <div className="message__avatar">{message.role === "assistant" ? "O" : t("ui.message.you").slice(0, 1).toUpperCase()}</div>
            <div className="message__body"><div className="message__meta">{message.role === "assistant" ? "Oru" : t("ui.message.you")}{message.interrupted ? ` · ${t("ui.message.interrupted")}` : ""}</div><p>{message.content}</p></div>
          </article>
        ))}
        {session.activities.length > 0 && (
          <div className="activity-card" aria-label={t("ui.message.activity")}>
            {session.activities.map((item) => (
              <div className="activity-row" data-state={item.state} key={item.id}>
                <span>
                  <Icon
                    name={item.state === "complete" ? "check" : item.state === "interrupted" ? "x" : "dot"}
                    size={12}
                  />
                </span>
                <div><strong>{item.label}</strong><small>{item.detail}</small></div>
              </div>
            ))}
          </div>
        )}
        <div ref={endRef} />
      </div></div>
      <form className="composer" onSubmit={submit}>
        <textarea aria-label={t("ui.composer.message")} placeholder={t("ui.composer.placeholder")} value={draft} onChange={(event) => onDraft(event.currentTarget.value)} onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }} />
        <div className="composer__footer">
          <span>{t("ui.composer.hint")}</span>
          {session.status === "idle"
            ? <button className="send-button" disabled={draft.trim() === ""} type="submit" aria-label={t("ui.composer.send")}><Icon name="arrowUp" /></button>
            : <button className="stop-button" onClick={() => runtime.abort(session.id)} type="button"><Icon name="square" size={12} /> {t("ui.composer.stop")}</button>}
        </div>
      </form>
    </div>
  );
}

function SettingsDialog(props: {
  locale: DesktopLocale;
  runtimeLabel: string;
  t: Translate;
  theme: ThemePreference;
  onTheme(theme: ThemePreference): void;
  onClose(): void;
}): ReactNode {
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && props.onClose()}>
      <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header><div><p className="eyebrow">{props.t("ui.settings.eyebrow")}</p><h2 id="settings-title">{props.t("ui.settings.title")}</h2></div><button className="icon-button icon-button--ghost" onClick={props.onClose} type="button" aria-label={props.t("ui.settings.close")}><Icon name="x" /></button></header>
        <div className="settings-section"><div><strong>{props.t("ui.settings.appearance")}</strong><p>{props.t("ui.settings.appearanceDetail")}</p></div><div className="segmented">
          {(["system", "light", "dark"] as const).map((item) => <button data-active={props.theme === item} key={item} onClick={() => props.onTheme(item)} type="button">{props.t(`ui.settings.${item}`)}</button>)}
        </div></div>
        <div className="settings-section"><div><strong>{props.t("ui.settings.language")}</strong><p>{props.t("ui.settings.languageDetail")}</p></div><span className="settings-value">{props.locale === "zh" ? props.t("ui.settings.chinese") : props.t("ui.settings.english")}</span></div>
        <div className="settings-section"><div><strong>{props.t("ui.settings.runtime")}</strong><p>{props.t("ui.settings.runtimeDetail")}</p></div><span className="runtime-badge"><span />{props.runtimeLabel}</span></div>
        <footer>Oru {window.oruDesktop.about.version} · {window.oruDesktop.about.platform} {window.oruDesktop.about.arch}</footer>
      </section>
    </div>
  );
}
