import { FuseV1Options, FuseVersion } from "@electron/fuses";
import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerDMG } from "@electron-forge/maker-dmg";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { VitePlugin } from "@electron-forge/plugin-vite";
import type { ForgeConfig } from "@electron-forge/shared-types";
import { chmod, cp, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { pruneMacElectronLocales } from "./scripts/forge/electron-locales.ts";
import { verifyStandalonePackage } from "./scripts/forge/standalone-artifact.ts";

const projectRoot = __dirname;
const iconRoot = join(projectRoot, "resources", "icons");
const appIcon = join(iconRoot, "icon.png");
const sysPackageRoot = join(projectRoot, "packages", "sys");
const nodePtyPackageRoot = join(projectRoot, "node_modules", "node-pty");
const nodeAddonApiPackageRoot = join(projectRoot, "node_modules", "node-addon-api");
const nativeUnpack = process.platform === "win32"
  ? "**/node_modules/node-pty/**/*.{dll,node}"
  : "**/node_modules/{node-pty,sys}/**/{*.node,spawn-helper}";

async function pruneForeignNodePtyPrebuilds(
  buildPath: string,
  platform: string,
  arch: string,
): Promise<void> {
  const prebuilds = join(buildPath, "node_modules", "node-pty", "prebuilds");
  const target = `${platform}-${arch}`;
  const entries = await readdir(prebuilds, { withFileTypes: true });
  await Promise.all(entries
    .filter((entry) => entry.name !== target)
    .map((entry) => rm(join(prebuilds, entry.name), {
      force: true,
      recursive: true,
    })));
  if (platform === "darwin") {
    await chmod(join(prebuilds, target, "spawn-helper"), 0o755);
  }
}

function logPackageStage(
  platform: string,
  arch: string,
  stage: string,
): void {
  console.log(`[packager:${platform}-${arch}] ${stage}`);
}

const config: ForgeConfig = {
  hooks: {
    packageAfterCopy: async (
      _forgeConfig,
      buildPath,
      _electronVersion,
      platform,
      arch,
    ) => {
      logPackageStage(
        platform,
        String(arch),
        "package copy hook started",
      );
      const nodeModulesRoot = join(buildPath, "node_modules");
      await mkdir(nodeModulesRoot, { recursive: true });
      await Promise.all([
        cp(nodePtyPackageRoot, join(nodeModulesRoot, "node-pty"), {
          recursive: true,
        }),
        cp(nodeAddonApiPackageRoot, join(nodeModulesRoot, "node-addon-api"), {
          recursive: true,
        }),
      ]);
      if (platform === "darwin") {
        await cp(sysPackageRoot, join(nodeModulesRoot, "sys"), {
          recursive: true,
        });
      }
      logPackageStage(
        platform,
        String(arch),
        "package copy hook completed",
      );
    },
    postPackage: async (_forgeConfig, { arch, outputPaths, platform }) => {
      for (const outputPath of outputPaths) {
        const report = await verifyStandalonePackage(
          outputPath,
          platform,
          String(arch),
        );
        console.log(
          `Verified standalone package (${(report.appBytes / 1024 / 1024).toFixed(1)} MiB): renderer and node-pty present, Harness absent`,
        );
      }
      logPackageStage(platform, String(arch), "standalone package verified");
    },
  },
  packagerConfig: {
    name: "Oru",
    executableName: "Oru",
    appBundleId: "me.lencx.oru",
    appCategoryType: "public.app-category.developer-tools",
    asar: {
      unpack: nativeUnpack,
    },
    // The Vite plugin copies only .vite and packageAfterCopy injects the sole
    // external native package on macOS. Packager pruning would otherwise walk
    // the complete pnpm graph before that ignore policy, retaining redundant
    // production packages and consuming several GiB on every desktop OS.
    prune: false,
    icon: join(iconRoot, "icon"),
    afterCopy: [
      (
        _buildPath,
        _electronVersion,
        platform,
        arch,
        callback,
      ) => {
        void pruneForeignNodePtyPrebuilds(
          _buildPath,
          platform,
          String(arch),
        ).then(() => {
          logPackageStage(
            platform,
            String(arch),
            "native dependencies ready",
          );
          callback();
        }, (error: unknown) => {
          callback(error instanceof Error ? error : new Error(String(error)));
        });
      },
    ],
    beforeAsar: [
      (
        _buildPath,
        _electronVersion,
        platform,
        arch,
        callback,
      ) => {
        logPackageStage(platform, String(arch), "asar started");
        callback();
      },
    ],
    afterAsar: [
      (
        _buildPath,
        _electronVersion,
        platform,
        arch,
        callback,
      ) => {
        logPackageStage(platform, String(arch), "asar completed");
        callback();
      },
    ],
    beforeCopyExtraResources: [
      (
        _buildPath,
        _electronVersion,
        platform,
        arch,
        callback,
      ) => {
        logPackageStage(
          platform,
          String(arch),
          "extra resources started",
        );
        callback();
      },
    ],
    afterCopyExtraResources: [
      (buildPath, _electronVersion, platform, arch, callback) => {
        if (platform !== "darwin") {
          logPackageStage(
            platform,
            String(arch),
            "extra resources completed",
          );
          callback();
          return;
        }
        void pruneMacElectronLocales(join(buildPath, "Oru.app")).then(
          (result) => {
            console.log(
              `Pruned ${String(result.removed.length)} unused Electron locales`,
            );
            logPackageStage(
              platform,
              String(arch),
              "extra resources completed",
            );
            callback();
          },
          (error: unknown) => {
            callback(
              error instanceof Error
                ? error
                : new Error(String(error)),
            );
          },
        );
      },
    ],
    afterComplete: [
      (
        _buildPath,
        _electronVersion,
        platform,
        arch,
        callback,
      ) => {
        logPackageStage(
          platform,
          String(arch),
          "package completed",
        );
        callback();
      },
    ],
    extraResource: [
      appIcon,
      join(iconRoot, "trayTemplate.png"),
      join(iconRoot, "trayTemplate@2x.png"),
    ],
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      name: "Oru",
      setupIcon: join(iconRoot, "icon.ico"),
    }),
    new MakerZIP({}, ["darwin"]),
    new MakerDMG({
      format: "ULFO",
      icon: join(iconRoot, "icon.icns"),
    }),
    new MakerRpm({
      options: {
        bin: "Oru",
        icon: appIcon,
      },
    }),
    new MakerDeb({
      options: {
        bin: "Oru",
        icon: appIcon,
      },
    }),
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: "desktop/main/main.ts",
          config: "vite.main.config.mts",
          target: "main",
        },
        {
          entry: "desktop/preload/desktop-preload.ts",
          config: "vite.preload.config.mts",
          target: "preload",
        },
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.mts",
        },
      ],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
