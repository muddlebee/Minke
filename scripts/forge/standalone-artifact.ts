import { extractFile, listPackage } from "@electron/asar";
import { lstat, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { applicationResourcesRoot } from "./application-layout.mjs";

export interface StandalonePackageReport {
  readonly appBytes: number;
  readonly entries: number;
}

async function requireFile(path: string): Promise<number> {
  const details = await lstat(path);
  if (!details.isFile()) throw new Error(`required package file is missing: ${path}`);
  return details.size;
}

async function requireMissing(path: string): Promise<void> {
  try {
    await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  throw new Error(`standalone package contains forbidden legacy resource: ${path}`);
}

async function applicationRoot(outputPath: string, platform: string): Promise<string> {
  if (platform !== "darwin" || basename(outputPath).endsWith(".app")) {
    return outputPath;
  }
  const applications = (await readdir(outputPath, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.endsWith(".app"));
  if (applications.length !== 1) {
    throw new Error(`expected one macOS application in ${outputPath}`);
  }
  return join(outputPath, applications[0]?.name ?? "");
}

/** Verify the distributable boundary for the harness-neutral desktop app. */
export async function verifyStandalonePackage(
  outputPath: string,
  platform: string,
  arch: string,
): Promise<StandalonePackageReport> {
  const appRoot = await applicationRoot(outputPath, platform);
  const resources = applicationResourcesRoot(appRoot, platform);
  const asarPath = join(resources, "app.asar");
  const appBytes = await requireFile(asarPath);
  const entries = listPackage(asarPath, { isPack: false });
  const requiredEntries = [
    "/.vite/build/main.js",
    "/.vite/build/desktop-preload.js",
    "/.vite/renderer/main_window/index.html",
    "/node_modules/node-pty/lib/index.js",
  ];
  for (const entry of requiredEntries) {
    if (!entries.includes(entry)) {
      throw new Error(`standalone package is missing ${entry}`);
    }
  }
  const forbiddenFragments = [
    "deepseek-harness",
    "desktop-style-extension",
    "/runtime/host",
  ];
  for (const entry of entries) {
    if (forbiddenFragments.some((fragment) => entry.includes(fragment))) {
      throw new Error(`standalone package contains forbidden legacy entry ${entry}`);
    }
  }
  const bundledApplication = entries
    .filter((entry) =>
      entry.startsWith("/.vite/") &&
      /\.(?:css|html|js|json|map)$/u.test(entry)
    )
    .map((entry) => extractFile(asarPath, entry.slice(1)).toString("utf8"))
    .join("\n");
  if (/deepseek/iu.test(bundledApplication)) {
    throw new Error("standalone package still contains a DeepSeek application reference");
  }
  if (/\bMinke\b/u.test(bundledApplication)) {
    throw new Error("standalone package still contains the previous product brand");
  }
  await Promise.all([
    requireMissing(join(resources, "host")),
    requireMissing(join(resources, "desktop-style-extension")),
    requireMissing(join(resources, "licenses")),
  ]);
  const nativeRoot = join(
    resources,
    "app.asar.unpacked",
    "node_modules",
    "node-pty",
  );
  const nativeCandidates = platform === "win32"
    ? [
        join(nativeRoot, "build", "Release", "conpty.node"),
        join(nativeRoot, "prebuilds", `win32-${arch}`, "conpty.node"),
      ]
    : [
        join(nativeRoot, "build", "Release", "pty.node"),
        join(nativeRoot, "prebuilds", `${platform}-${arch}`, "pty.node"),
      ];
  let nativeFound = false;
  for (const candidate of nativeCandidates) {
    try {
      await requireFile(candidate);
      nativeFound = true;
      break;
    } catch {
      // The rebuild and prebuild layouts are both supported.
    }
  }
  if (!nativeFound) throw new Error("standalone package is missing the node-pty native module");
  return { appBytes, entries: entries.length };
}
