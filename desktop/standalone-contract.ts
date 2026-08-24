/** IPC channels owned by the standalone Oru shell. */
export const WORKSPACE_OPEN_CHANNEL = "oru:workspace:open";

export interface DesktopWorkspace {
  readonly id: string;
  readonly name: string;
  readonly path: string;
}

export function parseDesktopWorkspace(value: unknown): DesktopWorkspace {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("workspace must be an object");
  }
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.id !== "string" || candidate.id.length === 0 ||
    typeof candidate.name !== "string" || candidate.name.length === 0 ||
    typeof candidate.path !== "string" || candidate.path.length === 0
  ) {
    throw new TypeError("workspace is invalid");
  }
  return {
    id: candidate.id,
    name: candidate.name,
    path: candidate.path,
  };
}
