import type { DesktopWorkspace } from "@minke/desktop/standalone-contract";

export type AgentMessageRole = "user" | "assistant";
export type AgentRunStatus = "idle" | "thinking" | "running-tool";

export interface AgentMessage {
  readonly id: string;
  readonly role: AgentMessageRole;
  readonly content: string;
  readonly createdAt: number;
  readonly interrupted?: boolean;
}

export interface AgentActivity {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly state: "active" | "complete" | "interrupted";
}

export interface AgentSession {
  readonly id: string;
  readonly workspaceId: string;
  readonly title: string;
  readonly messages: readonly AgentMessage[];
  readonly activities: readonly AgentActivity[];
  readonly status: AgentRunStatus;
}

export interface AgentRuntimeSnapshot {
  readonly sessions: readonly AgentSession[];
  readonly activeSessionId?: string;
}

/**
 * Harness-neutral boundary consumed by the Oru renderer.
 *
 * A Pi or Hermes integration implements this interface and translates its own
 * transport events into the stable session/message/activity model below.
 */
export interface AgentRuntime {
  readonly kind: string;
  readonly label: string;
  getSnapshot(): AgentRuntimeSnapshot;
  subscribe(listener: () => void): () => void;
  createSession(workspace: DesktopWorkspace): string;
  selectSession(sessionId: string): void;
  send(sessionId: string, prompt: string): void;
  abort(sessionId: string): void;
  dispose(): void;
}

const EMPTY_SNAPSHOT: AgentRuntimeSnapshot = { sessions: [] };

/** Deterministic local runtime used to demonstrate the shell without an agent. */
export class DemoAgentRuntime implements AgentRuntime {
  readonly kind = "demo";
  readonly label = "Scripted demo";

  #snapshot: AgentRuntimeSnapshot = EMPTY_SNAPSHOT;
  #listeners = new Set<() => void>();
  #timers = new Map<string, Set<ReturnType<typeof setTimeout>>>();
  #sequence = 0;

  getSnapshot = (): AgentRuntimeSnapshot => this.#snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  createSession(workspace: DesktopWorkspace): string {
    const id = this.#id("session");
    const session: AgentSession = {
      id,
      workspaceId: workspace.id,
      title: "New session",
      status: "idle",
      activities: [],
      messages: [{
        id: this.#id("message"),
        role: "assistant",
        content: `Ready in ${workspace.name}. I’m the built-in scripted demo, so I can show Oru’s interaction states without running an agent harness.`,
        createdAt: Date.now(),
      }],
    };
    this.#snapshot = {
      sessions: [session, ...this.#snapshot.sessions],
      activeSessionId: id,
    };
    this.#emit();
    return id;
  }

  selectSession(sessionId: string): void {
    if (!this.#snapshot.sessions.some((session) => session.id === sessionId)) {
      return;
    }
    this.#snapshot = { ...this.#snapshot, activeSessionId: sessionId };
    this.#emit();
  }

  send(sessionId: string, rawPrompt: string): void {
    const prompt = rawPrompt.trim();
    if (prompt === "") return;
    this.abort(sessionId);
    this.#updateSession(sessionId, (session) => ({
      ...session,
      title: session.messages.length <= 1
        ? prompt.slice(0, 42)
        : session.title,
      status: "thinking",
      activities: [{
        id: this.#id("activity"),
        label: "Thinking",
        detail: "Understanding the request",
        state: "active",
      }],
      messages: [...session.messages, {
        id: this.#id("message"),
        role: "user",
        content: prompt,
        createdAt: Date.now(),
      }],
    }));

    this.#schedule(sessionId, 650, () => {
      this.#updateSession(sessionId, (session) => ({
        ...session,
        status: "running-tool",
        activities: [
          ...session.activities.map((item) => ({
            ...item,
            state: "complete" as const,
          })),
          {
            id: this.#id("activity"),
            label: "Inspect workspace",
            detail: "Reading the project structure",
            state: "active",
          },
        ],
      }));
    });
    this.#schedule(sessionId, 1_550, () => {
      this.#updateSession(sessionId, (session) => ({
        ...session,
        status: "idle",
        activities: session.activities.map((item) => ({
          ...item,
          state: "complete" as const,
        })),
        messages: [...session.messages, {
          id: this.#id("message"),
          role: "assistant",
          content: "This is the standalone Oru UI responding through the AgentRuntime boundary. A Pi or Hermes adapter can replace this demo runtime while keeping the conversation, workspace, and tool surfaces unchanged.",
          createdAt: Date.now(),
        }],
      }));
      this.#clearTimers(sessionId);
    });
  }

  abort(sessionId: string): void {
    const hadTimers = (this.#timers.get(sessionId)?.size ?? 0) > 0;
    this.#clearTimers(sessionId);
    if (!hadTimers) return;
    this.#updateSession(sessionId, (session) => ({
      ...session,
      status: "idle",
      activities: session.activities.map((item) => item.state === "active"
        ? { ...item, state: "interrupted" as const }
        : item),
      messages: [...session.messages, {
        id: this.#id("message"),
        role: "assistant",
        content: "Run stopped.",
        createdAt: Date.now(),
        interrupted: true,
      }],
    }));
  }

  dispose(): void {
    for (const sessionId of this.#timers.keys()) this.#clearTimers(sessionId);
    this.#listeners.clear();
  }

  #id(prefix: string): string {
    this.#sequence += 1;
    return `${prefix}-${String(this.#sequence)}`;
  }

  #schedule(sessionId: string, delay: number, action: () => void): void {
    const timer = setTimeout(action, delay);
    const timers = this.#timers.get(sessionId) ?? new Set();
    timers.add(timer);
    this.#timers.set(sessionId, timers);
  }

  #clearTimers(sessionId: string): void {
    const timers = this.#timers.get(sessionId);
    if (timers === undefined) return;
    for (const timer of timers) clearTimeout(timer);
    this.#timers.delete(sessionId);
  }

  #updateSession(
    sessionId: string,
    update: (session: AgentSession) => AgentSession,
  ): void {
    let changed = false;
    const sessions = this.#snapshot.sessions.map((session) => {
      if (session.id !== sessionId) return session;
      changed = true;
      return update(session);
    });
    if (!changed) return;
    this.#snapshot = { ...this.#snapshot, sessions };
    this.#emit();
  }

  #emit(): void {
    for (const listener of this.#listeners) listener();
  }
}
