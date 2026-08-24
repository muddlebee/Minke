import { defineConfig } from "vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  build: {
    ssr: resolve(projectRoot, "desktop", "main", "main.ts"),
    sourcemap: false,
    emptyOutDir: false,
    outDir: resolve(projectRoot, ".vite", "build"),
    rollupOptions: {
      external: ["electron", "node-pty", "sys"],
      output: {
        entryFileNames: "main.js",
        format: "cjs",
      },
    },
  },
  ssr: {
    noExternal: true,
  },
});
