import { randomUUID } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { basename, isAbsolute, relative } from "node:path";
import type { DesktopWorkspace } from "@minke/desktop/standalone-contract";

export interface AuthorizedWorkspacePath {
  readonly path: string;
  readonly root: string;
}

/** Window-lifetime capability registry for user-approved workspace paths. */
function isWithin(root: string, candidate: string): boolean {
  const child = relative(root, candidate);
  return child === "" || (!child.startsWith("..") && !isAbsolute(child));
}

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
      name: basename(path) || path,
      path,
    };
  }

  async authorize(candidate: string): Promise<string> {
    return (await this.authorizeWithRoot(candidate)).path;
  }

  async authorizeWithRoot(
    candidate: string,
    requestedRoot?: string,
  ): Promise<AuthorizedWorkspacePath> {
    if (!isAbsolute(candidate)) {
      throw new TypeError("workspace path must be absolute");
    }
    const canonical = await realpath(candidate);
    let root: string | undefined;
    if (requestedRoot !== undefined) {
      if (!isAbsolute(requestedRoot)) {
        throw new TypeError("workspace root must be absolute");
      }
      const canonicalRoot = await realpath(requestedRoot);
      if (!this.#roots.has(canonicalRoot)) {
        throw new Error("workspace root is not open");
      }
      root = canonicalRoot;
    } else {
      root = [...this.#roots]
        .filter((approvedRoot) => isWithin(approvedRoot, canonical))
        .sort((left, right) => right.length - left.length)[0];
    }
    if (root === undefined || !isWithin(root, canonical)) {
      throw new Error("path is outside an open workspace");
    }
    return { path: canonical, root };
  }

  clear(): void {
    this.#roots.clear();
  }
}
