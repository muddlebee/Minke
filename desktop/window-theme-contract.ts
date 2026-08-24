/** Renderer-to-main channel carrying the app's native window appearance. */
export const WINDOW_THEME_CHANNEL = "oru:window-theme";

/** Resolved color schemes supported by Electron's native theme bridge. */
export type WindowColorScheme = "light" | "dark";

/** Built-in preference owned by the renderer's theme service. */
export type WindowThemePreference = "light" | "dark" | "system";

/** Early boot projection, before the renderer theme service is available. */
export type ResolvedWindowThemeMessage = Readonly<{
  colorScheme: WindowColorScheme;
}>;

/** Authoritative renderer snapshot, including whether the OS stays in charge. */
export type RendererWindowThemeMessage = Readonly<{
  preference: WindowThemePreference;
  colorScheme: WindowColorScheme;
}>;

/** @deprecated Use RendererWindowThemeMessage. */
export type HarnessWindowThemeMessage = RendererWindowThemeMessage;

export type WindowThemeMessage =
  | ResolvedWindowThemeMessage
  | RendererWindowThemeMessage;

/** Validate untrusted renderer data before it can change process-wide native UI. */
export function isWindowThemeMessage(
  value: unknown,
): value is WindowThemeMessage {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  const colorScheme = record.colorScheme;
  if (colorScheme !== "light" && colorScheme !== "dark") return false;
  if (keys.length === 1) return true;
  if (keys.length !== 2) return false;
  const preference = record.preference;
  return (
    preference === "system" ||
    preference === colorScheme
  );
}
