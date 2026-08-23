import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import electronPath from "electron";
import { _electron as electron } from "playwright-core";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

async function startFixtureServer() {
  const server = createServer((request, response) => {
    if (request.url === "/redirect") {
      response.writeHead(302, { location: "/landed" });
      response.end();
      return;
    }
    const sendFixture = () => {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end("<!doctype html><title>Oru Web Fixture</title><h1>Web tool is connected</h1>");
    };
    if (request.url === "/slow-navigation") {
      setTimeout(sendFixture, 400);
      return;
    }
    sendFixture();
  });
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("fixture server did not expose a TCP port");
  }
  return {
    url: `http://127.0.0.1:${String(address.port)}`,
    close: () => new Promise((resolveClose, reject) => {
      server.close((error) => error === undefined ? resolveClose() : reject(error));
    }),
  };
}

test("standalone Electron shell supports the primary workspace workflow", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "oru-electron-"));
  const secondFixtureRoot = await mkdtemp(join(tmpdir(), "oru-electron-second-"));
  const profileRoot = await mkdtemp(join(tmpdir(), "oru-electron-profile-"));
  await writeFile(join(fixtureRoot, "hello.txt"), "oru-file-preview-marker\n", "utf8");
  const slowPreview = Buffer.alloc(8 * 1_024 * 1_024, "x");
  slowPreview.write("slow-preview-marker\n");
  await writeFile(join(fixtureRoot, "slow.txt"), slowPreview);
  await mkdir(join(fixtureRoot, "src"));
  await writeFile(join(fixtureRoot, "src", "index.ts"), "export const ready = true;\n", "utf8");
  await mkdir(join(fixtureRoot, "vanishing"));
  await mkdir(join(fixtureRoot, "vanishing", "missing-next"));
  await writeFile(join(fixtureRoot, "vanishing", "stale.txt"), "stale-row-marker\n", "utf8");
  await writeFile(join(fixtureRoot, "src", "slow-child.txt"), slowPreview);
  await writeFile(join(secondFixtureRoot, "second.txt"), "second-workspace-marker\n", "utf8");
  const server = await startFixtureServer();
  const artifacts = join(projectRoot, "test-results", "electron");
  await mkdir(artifacts, { recursive: true });

  const electronApp = await electron.launch({
    executablePath: electronPath,
    args: [projectRoot],
    cwd: projectRoot,
    env: {
      ...process.env,
      HOME: profileRoot,
      NODE_ENV: "test",
      USERPROFILE: profileRoot,
    },
    timeout: 45_000,
  });
  t.after(async () => {
    await electronApp.close().catch(() => {});
    await server.close().catch(() => {});
    await rm(fixtureRoot, { recursive: true, force: true });
    await rm(secondFixtureRoot, { recursive: true, force: true });
    await rm(profileRoot, { recursive: true, force: true });
  });

  await electronApp.evaluate(({ dialog }, paths) => {
    const pending = [...paths];
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [pending.shift() ?? paths.at(-1)],
    });
  }, [fixtureRoot, secondFixtureRoot]);

  const page = await electronApp.firstWindow();
  const invokeShortcut = async (id) => {
    await electronApp.evaluate(({ BrowserWindow }, actionId) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send(
        "oru:shortcut:invoke",
        actionId,
      );
    }, id);
  };
  const rendererErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") rendererErrors.push(message.text());
  });
  page.on("pageerror", (error) => rendererErrors.push(error.stack ?? error.message));

  await page.getByRole("heading", { name: /A focused home for your coding agents/u }).waitFor();
  const nativeOpenFolder = await electronApp.evaluate(({ Menu }) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById(
      "minke.shortcut.workspace.open",
    );
    return item === undefined
      ? null
      : { accelerator: item.accelerator, label: item.label };
  });
  assert.deepEqual(nativeOpenFolder, {
    accelerator: "CommandOrControl+O",
    label: "Open Folder",
  });
  await page.evaluate(async () => {
    await window.oruDesktop.shortcuts.write({
      "workspace.open": "Mod+Shift+O",
      "session.new": "",
    });
  });
  await invokeShortcut("palette.open");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await palette.waitFor();
  await palette.getByText(
    process.platform === "darwin" ? "⌘⇧O" : "Ctrl+Shift+O",
  ).waitFor();
  await palette.getByText("—", { exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog", { name: "Command palette" }).waitFor({ state: "hidden" });
  await invokeShortcut("sidebar.toggle");
  await page.waitForFunction(() => document.querySelector("main.app-shell")?.getAttribute("data-sidebar-open") === "false");
  assert.equal(await page.locator("main.app-shell").getAttribute("data-sidebar-open"), "false");
  await invokeShortcut("sidebar.toggle");
  await page.waitForFunction(() => document.querySelector("main.app-shell")?.getAttribute("data-sidebar-open") === "true");
  assert.equal(await page.locator("main.app-shell").getAttribute("data-sidebar-open"), "true");
  await page.getByRole("button", { name: /Open (?:a )?folder/iu }).first().click();
  await page.getByText(fixtureRoot, { exact: true }).first().waitFor();
  await page.getByText(/Ready in/u).waitFor();

  await invokeShortcut("session.new");
  await page.locator(".session-row").nth(1).waitFor();
  await page.locator(".session-row").nth(1).click();
  assert.equal(await page.locator(".session-row").nth(1).getAttribute("data-active"), "true");
  await page.locator(".session-row").first().click();
  assert.equal(await page.locator(".session-row").first().getAttribute("data-active"), "true");
  await invokeShortcut("session.back");
  await page.waitForFunction(() => document.querySelectorAll(".session-row")[1]?.getAttribute("data-active") === "true");
  assert.equal(await page.locator(".session-row").nth(1).getAttribute("data-active"), "true");
  await invokeShortcut("session.forward");
  await page.waitForFunction(() => document.querySelector(".session-row")?.getAttribute("data-active") === "true");
  assert.equal(await page.locator(".session-row").first().getAttribute("data-active"), "true");

  const composer = page.getByRole("textbox", { name: "Message" });
  await composer.fill("first-session-unsent-draft");
  await page.locator(".session-row").nth(1).click();
  assert.equal(await composer.inputValue(), "");
  await page.locator(".session-row").first().click();
  assert.equal(await composer.inputValue(), "");

  await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".file-row")];
    const slow = rows.find((row) => row.textContent?.includes("slow.txt"));
    const quick = rows.find((row) => row.textContent?.includes("hello.txt"));
    if (!(slow instanceof HTMLElement) || !(quick instanceof HTMLElement)) {
      throw new Error("preview race fixtures are missing");
    }
    slow.click();
    quick.click();
  });
  await page.getByText("oru-file-preview-marker", { exact: false }).waitFor();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "src" }).click();
  await page.getByRole("button", { name: "index.ts" }).click();
  await page.getByText("export const ready = true;", { exact: false }).waitFor();
  await page.getByRole("tab", { name: "Web" }).click();
  await page.getByRole("tab", { name: "Files" }).click();
  assert.equal(
    await page.locator(".files-address").getAttribute("title"),
    join(fixtureRoot, "src"),
  );
  await page.getByText("export const ready = true;", { exact: false }).waitFor();
  await page.getByRole("button", { name: "Parent folder" }).click();
  await page.getByRole("button", { name: "hello.txt" }).waitFor();
  assert.doesNotMatch(
    await page.locator(".file-preview").textContent() ?? "",
    /slow-preview-marker/u,
  );
  await page.getByRole("button", { name: "src" }).click();
  await page.getByRole("button", { name: "slow-child.txt" }).waitFor();
  await page.evaluate(() => {
    const slow = [...document.querySelectorAll(".file-row")]
      .find((row) => row.textContent?.includes("slow-child.txt"));
    const parent = document.querySelector(".files-address button");
    if (!(slow instanceof HTMLElement) || !(parent instanceof HTMLElement)) {
      throw new Error("parent preview race fixtures are missing");
    }
    slow.click();
    parent.click();
  });
  await page.getByRole("button", { name: "hello.txt" }).waitFor();
  await page.waitForTimeout(300);
  assert.doesNotMatch(
    await page.locator(".file-preview").textContent() ?? "",
    /slow-preview-marker/u,
  );

  await page.getByRole("button", { name: "vanishing" }).click();
  await page.getByRole("button", { name: "missing-next" }).waitFor();
  await rm(join(fixtureRoot, "vanishing"), { recursive: true, force: true });
  await page.getByRole("button", { name: "missing-next" }).click();
  await page.locator(".file-preview .error-state").waitFor();
  assert.equal(await page.locator(".file-row").count(), 0);

  await page.locator(".session-row").nth(1).click();
  await page.getByRole("button", { name: /Open (?:a )?folder/iu }).first().click();
  await page.getByText(secondFixtureRoot, { exact: true }).first().waitFor();
  await page.getByRole("button", { name: "second.txt" }).waitFor();
  await page.locator(".sidebar-row", { hasText: basename(fixtureRoot) }).click();
  assert.equal(
    await page.locator(".session-row").nth(1).getAttribute("data-active"),
    "true",
  );
  await page.getByRole("button", { name: "hello.txt" }).waitFor();

  await composer.fill("Explain the adapter boundary");
  await composer.press("Enter");
  await page.getByText("Inspect workspace", { exact: true }).waitFor();
  await page.getByText(/standalone Oru UI responding/u).waitFor({ timeout: 5_000 });

  await composer.fill("Start another run");
  await composer.press("Enter");
  await page.getByRole("button", { name: /Stop/u }).click();
  await page.getByText("Run stopped.", { exact: true }).waitFor();

  await page.evaluate(async () => {
    await window.oruDesktop.terminal.writeSettings({
      fontFamily: "monospace",
      fontSize: 17,
      lineHeight: 1.5,
    });
  });
  await page.getByRole("tab", { name: "Terminal" }).click();
  const terminal = page.locator(".terminal-host .xterm");
  await terminal.waitFor();
  assert.equal(
    await page.locator(".xterm-rows").evaluate(
      (element) => getComputedStyle(element).fontSize,
    ),
    "17px",
  );
  await page.waitForTimeout(500);
  await terminal.click();
  await page.keyboard.type("printf 'oru-terminal-marker\\n'");
  await page.keyboard.press("Enter");
  await page.locator(".xterm-rows").getByText("oru-terminal-marker", { exact: true }).waitFor({ timeout: 8_000 });
  await terminal.click();
  await page.keyboard.type("export ORU_PERSIST_TEST=kept");
  await page.keyboard.press("Enter");
  await page.getByRole("tab", { name: "Files" }).click();
  await page.getByRole("tab", { name: "Terminal" }).click();
  await terminal.click();
  await page.keyboard.type("printf 'session-%s\\n' \"$ORU_PERSIST_TEST\"");
  await page.keyboard.press("Enter");
  await page.locator(".xterm-rows").getByText("session-kept", { exact: true }).waitFor({ timeout: 8_000 });
  await page.getByRole("button", { name: "Hide tools" }).click();
  await page.getByRole("button", { name: "Show tools" }).click();
  await terminal.click();
  await page.keyboard.type("printf 'collapsed-%s\\n' \"$ORU_PERSIST_TEST\"");
  await page.keyboard.press("Enter");
  await page.locator(".xterm-rows").getByText("collapsed-kept", { exact: true }).waitFor({ timeout: 8_000 });

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("dialog", { name: "Settings" }).waitFor();
  await page.getByRole("button", { name: "light" }).click();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
  const lightTerminalForeground = await page.locator(".xterm-rows").evaluate(
    (element) => getComputedStyle(element).color,
  );
  await page.getByRole("button", { name: "dark" }).click();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await page.waitForFunction((previous) => {
    const rows = document.querySelector(".xterm-rows");
    return rows !== null && getComputedStyle(rows).color !== previous;
  }, lightTerminalForeground);
  await page.getByRole("button", { name: "Close", exact: true }).click();

  await page.getByRole("tab", { name: "Web" }).click();
  const address = page.getByRole("textbox", { name: "Web address" });
  await address.fill("https://user:secret@example.com/");
  await page.getByRole("button", { name: "Go" }).click();
  await page.getByText("Enter a credential-free HTTP(S) URL.").waitFor();
  await address.fill(server.url);
  await page.getByRole("button", { name: "Go" }).click();
  await page.waitForFunction((expected) => {
    const view = document.querySelector("webview");
    return view !== null && "getURL" in view && view.getURL().startsWith(expected);
  }, server.url);
  await address.fill(`${server.url}/redirect`);
  await page.getByRole("button", { name: "Go" }).click();
  await page.waitForFunction((expected) => {
    const input = document.querySelector(".web-address input");
    return input instanceof HTMLInputElement && input.value === expected;
  }, `${server.url}/landed`);
  await address.fill(`${server.url}/slow-navigation`);
  await page.getByRole("button", { name: "Go" }).click();
  await address.fill(`${server.url}/current`);
  await page.getByRole("button", { name: "Go" }).click();
  await page.waitForFunction((expected) => {
    const view = document.querySelector("webview");
    return view !== null && "getURL" in view && view.getURL() === expected;
  }, `${server.url}/current`);
  await page.waitForTimeout(500);
  assert.equal(await page.locator(".web-tool > .error-state").count(), 0);
  await page.getByRole("tab", { name: "Files" }).click();
  await page.getByRole("tab", { name: "Web" }).click();
  assert.equal(await address.inputValue(), `${server.url}/current`);
  await page.waitForFunction((expected) => {
    const view = document.querySelector("webview");
    return view !== null && "getURL" in view && view.getURL() === expected;
  }, `${server.url}/current`);

  await page.screenshot({ path: join(artifacts, "standalone-workspace.png") });
  assert.deepEqual(rendererErrors, [], `renderer errors:\n${rendererErrors.join("\n")}`);
});

test("standalone Electron shell renders its Chinese locale", { timeout: 45_000 }, async (t) => {
  const profileRoot = await mkdtemp(join(tmpdir(), "oru-electron-zh-profile-"));
  const electronApp = await electron.launch({
    executablePath: electronPath,
    args: [projectRoot, "--lang=zh-CN"],
    cwd: projectRoot,
    env: {
      ...process.env,
      HOME: profileRoot,
      NODE_ENV: "test",
      USERPROFILE: profileRoot,
    },
    timeout: 30_000,
  });
  t.after(async () => {
    await electronApp.close().catch(() => {});
    await rm(profileRoot, { recursive: true, force: true });
  });
  const page = await electronApp.firstWindow();
  await page.getByRole("heading", { name: /专注服务于.*编码 Agent/u }).waitFor();
  await electronApp.evaluate(({ dialog }) => {
    globalThis.__oruWorkspaceDialogTitle = undefined;
    dialog.showOpenDialog = async (_window, options) => {
      globalThis.__oruWorkspaceDialogTitle = options.title;
      return { canceled: true, filePaths: [] };
    };
  });
  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send(
      "oru:shortcut:invoke",
      "workspace.open",
    );
  });
  await page.waitForTimeout(100);
  assert.equal(
    await electronApp.evaluate(() => globalThis.__oruWorkspaceDialogTitle),
    "打开文件夹",
  );
  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send(
      "oru:shortcut:invoke",
      "palette.open",
    );
  });
  const palette = page.getByRole("dialog", { name: "命令面板" });
  await palette.waitFor();
  await palette.getByRole("button", { name: /打开文件夹/u }).waitFor();
});
