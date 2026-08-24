import type { ReactNode } from "react";

/**
 * Inline SVG icon set.
 *
 * Oru previously drew its affordances with Unicode glyphs (＋ ↻ ← × ▸ ↑ ⚙).
 * Those resolve through per-platform font fallback, so weight, size, and
 * baseline drifted between machines. These paths ship with the renderer and
 * inherit `currentColor`, keeping every control identical everywhere.
 */
export type IconName =
  | "arrowLeft"
  | "arrowRight"
  | "arrowUp"
  | "check"
  | "chevronRight"
  | "dot"
  | "file"
  | "folder"
  | "globe"
  | "image"
  | "panelRight"
  | "plus"
  | "refresh"
  | "sliders"
  | "square"
  | "terminal"
  | "x";

/** Icons drawn as solid shapes rather than 1.5px strokes. */
const FILLED = new Set<IconName>(["dot", "square"]);

const PATHS: Readonly<Record<IconName, ReactNode>> = {
  arrowLeft: <path d="M12.75 8h-9.5M7.5 3.75 3.25 8l4.25 4.25" />,
  arrowRight: <path d="M3.25 8h9.5M8.5 3.75 12.75 8 8.5 12.25" />,
  arrowUp: <path d="M8 12.75v-9.5M3.75 7.5 8 3.25l4.25 4.25" />,
  check: <path d="m3.5 8.25 3 3 6-6.5" />,
  chevronRight: <path d="m6.5 4 4 4-4 4" />,
  dot: <circle cx="8" cy="8" r="2.25" />,
  file: (
    <path d="M9.25 2.25H5a1.25 1.25 0 0 0-1.25 1.25v9A1.25 1.25 0 0 0 5 13.75h6A1.25 1.25 0 0 0 12.25 12.5V5.25zm0 0v3h3" />
  ),
  folder: (
    <path d="M2.25 4.25a1 1 0 0 1 1-1h2.6a1 1 0 0 1 .7.3l.9.9a1 1 0 0 0 .7.3h4.6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-9.5a1 1 0 0 1-1-1z" />
  ),
  globe: (
    <>
      <circle cx="8" cy="8" r="5.75" />
      <path d="M2.4 8h11.2M8 2.25a12 12 0 0 1 0 11.5 12 12 0 0 1 0-11.5" />
    </>
  ),
  image: (
    <>
      <rect x="2.25" y="3.25" width="11.5" height="9.5" rx="1.25" />
      <path d="m2.5 10.5 2.75-2.75 3 3 2-2 3.25 3.25" />
      <circle cx="10" cy="6" r="1" />
    </>
  ),
  panelRight: (
    <>
      <rect x="2.25" y="3.25" width="11.5" height="9.5" rx="1.5" />
      <path d="M10 3.25v9.5" />
    </>
  ),
  plus: <path d="M8 3.25v9.5M3.25 8h9.5" />,
  refresh: (
    <path d="M12.9 6.9A5 5 0 1 0 13 9M13 3v4h-4" />
  ),
  sliders: (
    <>
      <path d="M2.5 5h2.25M7.75 5h5.75M2.5 11h5.75M11.25 11h2.25" />
      <circle cx="6.25" cy="5" r="1.5" />
      <circle cx="9.75" cy="11" r="1.5" />
    </>
  ),
  square: <rect x="4.5" y="4.5" width="7" height="7" rx="1.5" />,
  terminal: <path d="m3.5 4.75 3.25 3.25L3.5 11.25M8.75 11.75h3.75" />,
  x: <path d="m4.25 4.25 7.5 7.5M11.75 4.25l-7.5 7.5" />,
};

/** Render one 16px grid icon that inherits the current text color. */
export function Icon({
  name,
  size = 16,
}: {
  name: IconName;
  size?: number;
}): ReactNode {
  const filled = FILLED.has(name);
  return (
    <svg
      aria-hidden="true"
      className="icon"
      fill={filled ? "currentColor" : "none"}
      focusable="false"
      height={size}
      stroke={filled ? "none" : "currentColor"}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      viewBox="0 0 16 16"
      width={size}
    >
      {PATHS[name]}
    </svg>
  );
}
