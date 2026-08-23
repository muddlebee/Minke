import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { defineConfig } from "vite";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const packageManifest = require("./package.json") as {
  productName: string;
  version: string;
};

export default defineConfig({
  define: {
    ORU_PRODUCT_NAME: JSON.stringify(packageManifest.productName),
    ORU_VERSION: JSON.stringify(packageManifest.version),
  },
  resolve: {
    tsconfigPaths: true,
  },
  build: {
    emptyOutDir: false,
    outDir: resolve(projectRoot, ".vite", "build"),
    rollupOptions: {
      external: ["electron"],
      input: resolve(
        projectRoot,
        "desktop",
        "preload",
        "desktop-preload.ts",
      ),
      output: {
        entryFileNames: "desktop-preload.js",
        format: "cjs",
      },
    },
  },
});
