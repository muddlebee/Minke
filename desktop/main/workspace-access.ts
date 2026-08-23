import { randomUUID } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { basename, isAbsolute, relative } from "node:path";
import type { DesktopWorkspace } from "@minke/desktop/standalone-contract";

/** Window-lifetime capability registry for user-approved workspace paths. */
export class WorkspaceAccessRegistry {
  readonly #roots = new Set<string>();

  async approve(candidate: string): Promise<DesktopWorkspace> {
    if (!isAbsolute(candidate)) {
      throw new TypeError("workspace path must be absolute");
    }
    const path = await realpath(candidate);
    if (!(await stat(path)).isDirectory()) {
      throw new TypeError("workspace path must be a directory");
    }
    this.#roots.add(path);
    return {
      id: `workspace-${randomUUID()}`,
      name: basename(path),
      path,
    };
  }

  async authorize(candidate: string): Promise<string> {
    if (!isAbsolute(candidate)) {
      throw new TypeError("workspace path must be absolute");
    }
    const canonical = await realpath(candidate);
    const allowed = [...this.#roots].some((root) => {
      const child = relative(root, canonical);
      return child === "" || (!child.startsWith("..") && !isAbsolute(child));
    });
    if (!allowed) throw new Error("path is outside an open workspace");
    return canonical;
  }

  clear(): void {
    this.#roots.clear();
  }
}
