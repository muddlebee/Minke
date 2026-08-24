import { join } from "node:path";

export function applicationResourcesRoot(appRoot, platform) {
  return platform === "darwin"
    ? join(appRoot, "Contents", "Resources")
    : join(appRoot, "resources");
}

export function applicationExecutablePath(appRoot, platform) {
  if (platform === "darwin") {
    return join(appRoot, "Contents", "MacOS", "Oru");
  }
  return join(appRoot, platform === "win32" ? "Oru.exe" : "Oru");
}

export function packagedApplicationLayout(
  projectRoot,
  platform = process.platform,
  arch = process.arch,
) {
  const outputRoot = join(
    projectRoot,
    "out",
    `Oru-${platform}-${arch}`,
  );
  const appRoot =
    platform === "darwin" ? join(outputRoot, "Oru.app") : outputRoot;
  return {
    appRoot,
    executablePath: applicationExecutablePath(appRoot, platform),
    outputRoot,
    resourcesRoot: applicationResourcesRoot(appRoot, platform),
  };
}
