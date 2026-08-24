import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { FileManagerRuntime } from "@minke/desktop/main/tabs/files.ts";
import {
  protectTabWebviewGuest,
  secureTabWebview,
} from "@minke/desktop/main/tabs/security.ts";
import {
  normalizeWebTabUrl,
  TABS_WEB_PARTITION,
} from "@minke/harness-overlay/tabs/contract.ts";

test("standalone Web URLs stay credential-free and isolated", () => {
  assert.equal(
    normalizeWebTabUrl("https://example.com/docs?q=1"),
    "https://example.com/docs?q=1",
  );
  for (const candidate of [
    "file:///tmp/report.html",
    "javascript:alert(1)",
    "https://user:secret@example.com/",
    "not a url",
  ]) {
    assert.equal(normalizeWebTabUrl(candidate), undefined);
  }

  const preferences = {
    contextIsolation: false,
    nodeIntegration: true,
    preload: "/tmp/untrusted.cjs",
    sandbox: false,
    webSecurity: false,
  };
  const params = {
    src: "https://example.com/docs",
    allowpopups: "",
    partition: "persist:attacker",
    preload: "file:///tmp/untrusted.cjs",
  };
  assert.equal(secureTabWebview(preferences, params), true);
  assert.equal(params.partition, TABS_WEB_PARTITION);
  assert.equal(Object.hasOwn(params, "allowpopups"), false);
  assert.equal(Object.hasOwn(params, "preload"), false);
  assert.equal(Object.hasOwn(preferences, "preload"), false);
  assert.equal(preferences.contextIsolation, true);
  assert.equal(preferences.nodeIntegration, false);
  assert.equal(preferences.sandbox, true);
  assert.equal(preferences.webSecurity, true);
});

test("standalone Web guests keep external navigation in the host", () => {
  const listeners = new Map();
  const opened = [];
  let openWindow;
  protectTabWebviewGuest({
    on(name, listener) {
      listeners.set(name, listener);
    },
    setWindowOpenHandler(handler) {
      openWindow = handler;
    },
  }, {
    openExternal(url) {
      opened.push(url);
      return Promise.resolve();
    },
  });

  let prevented = false;
  listeners.get("will-redirect")({
    isMainFrame: true,
    url: "mailto:hello@example.com",
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  assert.deepEqual(openWindow({ url: "https://example.com/popup" }), {
    action: "deny",
  });
  assert.deepEqual(opened, [
    "mailto:hello@example.com",
    "https://example.com/popup",
  ]);
});

test("standalone Files runtime cannot follow symlinks outside its workspace", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "oru-files-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = join(root, "workspace");
  const outside = join(root, "outside");
  await Promise.all([mkdir(workspace), mkdir(outside)]);
  await writeFile(join(workspace, "inside.txt"), "inside", "utf8");
  await writeFile(join(outside, "secret.txt"), "outside", "utf8");
  await symlink(outside, join(workspace, "escape"), process.platform === "win32" ? "junction" : "dir");

  const runtime = new FileManagerRuntime({
    rootPath: workspace,
    openPath: async () => "",
  });
  const listing = await runtime.list({ path: workspace });
  assert.deepEqual(
    listing.entries.map((entry) => entry.name).sort(),
    ["escape", "inside.txt"],
  );
  const preview = await runtime.preview({
    path: join(workspace, "inside.txt"),
  });
  assert.equal(preview.kind, "text");
  assert.equal(preview.content, "inside");
  await assert.rejects(
    runtime.preview({ path: join(workspace, "escape", "secret.txt") }),
    /outside .*root/iu,
  );
});
