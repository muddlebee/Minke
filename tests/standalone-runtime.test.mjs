import assert from "node:assert/strict";
import test from "node:test";
import { DemoAgentRuntime } from "../desktop/renderer/agent-runtime.ts";
import { parseDesktopWorkspace } from "../desktop/standalone-contract.ts";
import { translateDesktop } from "../desktop/i18n.ts";

const workspace = Object.freeze({
  id: "workspace-test",
  name: "demo-project",
  path: "/tmp/demo-project",
});

test("standalone workspace contract copies valid desktop values", () => {
  assert.deepEqual(parseDesktopWorkspace(workspace), workspace);
  assert.throws(
    () => parseDesktopWorkspace({ ...workspace, path: "" }),
    /workspace is invalid/u,
  );
});

test("demo runtime exposes the same session boundary as future adapters", () => {
  const runtime = new DemoAgentRuntime();
  let updates = 0;
  const unsubscribe = runtime.subscribe(() => { updates += 1; });
  const sessionId = runtime.createSession(workspace);
  const created = runtime.getSnapshot().sessions[0];

  assert.equal(runtime.kind, "demo");
  assert.equal(runtime.getSnapshot().activeSessionId, sessionId);
  assert.equal(created?.workspaceId, workspace.id);
  assert.match(created?.messages[0]?.content ?? "", /scripted demo/u);

  runtime.send(sessionId, "  explain this project  ");
  const running = runtime.getSnapshot().sessions[0];
  assert.equal(running?.status, "thinking");
  assert.equal(running?.title, "explain this project");
  assert.equal(running?.messages.at(-1)?.content, "explain this project");

  runtime.abort(sessionId);
  const stopped = runtime.getSnapshot().sessions[0];
  assert.equal(stopped?.status, "idle");
  assert.equal(stopped?.activities[0]?.state, "interrupted");
  assert.equal(stopped?.messages.at(-1)?.interrupted, true);
  assert.ok(updates >= 3);

  unsubscribe();
  runtime.dispose();
});

test("standalone UI and demo runtime ship Chinese copy", () => {
  assert.equal(translateDesktop("zh", "workspace.openDialogTitle"), "打开文件夹");
  assert.equal(translateDesktop("zh", "ui.command.openFolder"), "打开文件夹");
  assert.equal(translateDesktop("zh", "ui.tools.terminal"), "终端");
  assert.match(translateDesktop("zh", "ui.welcome.lede"), /文件/u);

  const runtime = new DemoAgentRuntime("zh");
  runtime.createSession(workspace);
  const session = runtime.getSnapshot().sessions[0];
  assert.equal(session?.title, "新会话");
  assert.match(session?.messages[0]?.content ?? "", /已在 demo-project 中就绪/u);
  runtime.dispose();
});
