/// <reference types="vitest" />
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  base: "./",
  resolve: {
    alias: [
      // 官方 spine-ts 3.6 构建的 ESM 包装（见 vendor/spine-ts/3.6/PROVENANCE.md）
      { find: /^spine-webgl$/, replacement: r("./vendor/spine-ts/3.6/spine-webgl-esm.js") },
      { find: /^spine$/, replacement: r("./vendor/spine-ts/3.6/spine-core-esm.js") },
    ],
  },
  server: { port: 5174, strictPort: false },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
