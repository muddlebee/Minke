import assert from "node:assert/strict";
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, parse } from "node:path";
import test from "node:test";
import { WorkspaceAccessRegistry } from "../desktop/main/workspace-access.ts";

test("workspace capabilities allow children and reject siblings and symlink escapes", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "oru-workspace-access-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = join(root, "workspace");
  const outside = join(root, "outside");
  await Promise.all([mkdir(workspace), mkdir(outside)]);
  const nested = join(workspace, "nested");
  await mkdir(nested);
  const child = join(workspace, "child.txt");
  const dotChild = join(workspace, "..cache");
  const nestedChild = join(nested, "nested.txt");
  const secret = join(outside, "secret.txt");
  await Promise.all([
    writeFile(child, "inside", "utf8"),
    writeFile(dotChild, "dot child", "utf8"),
    writeFile(nestedChild, "nested", "utf8"),
    writeFile(secret, "outside", "utf8"),
  ]);
  const escape = join(workspace, "escape");
  await symlink(outside, escape, process.platform === "win32" ? "junction" : "dir");

  const access = new WorkspaceAccessRegistry();
  await assert.rejects(access.approve(child), /must be a directory/u);
  const approved = await access.approve(workspace);
  assert.equal(approved.path, await realpath(workspace));
  assert.equal(await access.authorize(child), await realpath(child));
  assert.equal(await access.authorize(dotChild), await realpath(dotChild));
  assert.deepEqual(await access.authorizeWithRoot(child), {
    path: await realpath(child),
    root: await realpath(workspace),
  });
  const approvedNested = await access.approve(nested);
  assert.deepEqual(
    await access.authorizeWithRoot(nestedChild, approved.path),
    {
      path: await realpath(nestedChild),
      root: approved.path,
    },
  );
  assert.deepEqual(
    await access.authorizeWithRoot(nestedChild, approvedNested.path),
    {
      path: await realpath(nestedChild),
      root: approvedNested.path,
    },
  );
  await assert.rejects(access.authorize(secret), /outside an open workspace/u);
  await assert.rejects(
    access.authorize(join(escape, "secret.txt")),
    /outside an open workspace/u,
  );

  access.clear();
  await assert.rejects(access.authorize(child), /outside an open workspace/u);

  const rootAccess = new WorkspaceAccessRegistry();
  const systemRoot = await rootAccess.approve(parse(tmpdir()).root);
  assert.notEqual(systemRoot.name, "");
});
