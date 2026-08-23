import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  packagedApplicationLayout,
} from "../scripts/forge/application-layout.mjs";

const projectRoot = "/project";

test("packaged layouts use the Oru product identity on every desktop OS", () => {
  assert.equal(
    packagedApplicationLayout(projectRoot, "linux", "x64").executablePath,
    join(projectRoot, "out", "Oru-linux-x64", "Oru"),
  );
  assert.equal(
    packagedApplicationLayout(projectRoot, "win32", "x64").executablePath,
    join(projectRoot, "out", "Oru-win32-x64", "Oru.exe"),
  );
  assert.equal(
    packagedApplicationLayout(projectRoot, "darwin", "arm64").executablePath,
    join(
      projectRoot,
      "out",
      "Oru-darwin-arm64",
      "Oru.app",
      "Contents",
      "MacOS",
      "Oru",
    ),
  );
});

test("package CI verifies Electron interactions without staging a legacy runtime", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/package.yml", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /name: Verify standalone desktop/u);
  assert.match(workflow, /xvfb-run --auto-servernum pnpm test:electron/u);
  assert.doesNotMatch(workflow, /submodules:\s*recursive/u);
  assert.doesNotMatch(workflow, /vendor\/deepseek-harness install/u);
});

test("macOS packaging unpacks and verifies node-pty's executable helper", async () => {
  const [forge, verifier] = await Promise.all([
    readFile(new URL("../forge.config.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../scripts/forge/standalone-artifact.ts", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(forge, /\{\*\.node,spawn-helper\}/u);
  assert.match(
    forge,
    /cp\(nodePtyPackageRoot,[\s\S]*?dereference: true,[\s\S]*?recursive: true/u,
  );
  assert.match(
    forge,
    /cp\(nodeAddonApiPackageRoot,[\s\S]*?dereference: true,[\s\S]*?recursive: true/u,
  );
  assert.match(forge, /chmod\(join\(prebuilds, target, "spawn-helper"\), 0o755\)/u);
  assert.match(verifier, /requireExecutable\(join\([\s\S]*?"spawn-helper"/u);
});
