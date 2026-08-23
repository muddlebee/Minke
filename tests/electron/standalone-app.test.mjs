import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import electronPath from "electron";
import { _electron as electron } from "playwright-core";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

async function startFixtureServer() {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end("<!doctype html><title>Oru Web Fixture</title><h1>Web tool is connected</h1>");
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
  await writeFile(join(fixtureRoot, "hello.txt"), "oru-file-preview-marker\n", "utf8");
  await mkdir(join(fixtureRoot, "src"));
  await writeFile(join(fixtureRoot, "src", "index.ts"), "export const ready = true;\n", "utf8");
  const server = await startFixtureServer();
  const artifacts = join(projectRoot, "test-results", "electron");
  await mkdir(artifacts, { recursive: true });

  const electronApp = await electron.launch({
    executablePath: electronPath,
    args: [projectRoot],
    cwd: projectRoot,
    env: { ...process.env, NODE_ENV: "test" },
    timeout: 45_000,
  });
  t.after(async () => {
    await electronApp.close().catch(() => {});
    await server.close().catch(() => {});
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  await electronApp.evaluate(({ dialog }, paths) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths });
  }, [fixtureRoot]);

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
  await invokeShortcut("palette.open");
  await page.getByRole("dialog", { name: "Command palette" }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog", { name: "Command palette" }).waitFor({ state: "hidden" });
  await invokeShortcut("sidebar.toggle");
  await page.waitForFunction(() => document.querySelector("main.app-shell")?.getAttribute("data-sidebar-open") === "false");
  assert.equal(await page.locator("main.app-shell").getAttribute("data-sidebar-open"), "false");
  await invokeShortcut("sidebar.toggle");
  await page.waitForFunction(() => document.querySelector("main.app-shell")?.getAttribute("data-sidebar-open") === "true");
  assert.equal(await page.locator("main.app-shell").getAttribute("data-sidebar-open"), "true");
  await page.getByRole("button", { name: "Open Folder" }).first().click();
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

  await page.getByRole("button", { name: "hello.txt" }).click();
  await page.getByText("oru-file-preview-marker", { exact: false }).waitFor();

  const composer = page.getByRole("textbox", { name: "Message" });
  await composer.fill("Explain the adapter boundary");
  await composer.press("Enter");
  await page.getByText("Inspect workspace", { exact: true }).waitFor();
  await page.getByText(/standalone Oru UI responding/u).waitFor({ timeout: 5_000 });

  await composer.fill("Start another run");
  await composer.press("Enter");
  await page.getByRole("button", { name: /Stop/u }).click();
  await page.getByText("Run stopped.", { exact: true }).waitFor();

  await page.getByRole("tab", { name: "Terminal" }).click();
  const terminal = page.locator(".terminal-host .xterm");
  await terminal.waitFor();
  await page.waitForTimeout(500);
  await terminal.click();
  await page.keyboard.type("printf 'oru-terminal-marker\\n'");
  await page.keyboard.press("Enter");
  await page.locator(".xterm-rows").getByText(/oru-terminal-marker/u).waitFor({ timeout: 8_000 });

  await page.getByRole("tab", { name: "Web" }).click();
  const address = page.getByRole("textbox", { name: "Web address" });
  await address.fill(server.url);
  await page.getByRole("button", { name: "Go" }).click();
  await page.waitForFunction((expected) => {
    const view = document.querySelector("webview");
    return view !== null && "getURL" in view && view.getURL().startsWith(expected);
  }, server.url);

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("dialog", { name: "Settings" }).waitFor();
  await page.getByRole("button", { name: "light" }).click();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
  await page.getByRole("button", { name: "dark" }).click();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await page.getByRole("button", { name: "Close", exact: true }).click();

  await page.screenshot({ path: join(artifacts, "standalone-workspace.png") });
  assert.deepEqual(rendererErrors, [], `renderer errors:\n${rendererErrors.join("\n")}`);
});
