/// <reference types="vitest" />
import { defineConfig, type Plugin } from "vite";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * dev-only：Lab 生成 P1 候选后保存到 public/motions/（Spec 12 导入与导出）。
 * 仅在 vite dev server 生效，不进入产物；只接受白名单文件名，写 JSON。
 */
function saveMotionPlugin(): Plugin {
  const motionsDir = r("./public/motions");
  return {
    name: "pliette-save-motion",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__save-motion", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("POST only");
          return;
        }
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          try {
            const { id, draft } = JSON.parse(body);
            if (!/^[a-z0-9_.-]+$/i.test(String(id))) throw new Error("非法 id");
            mkdirSync(motionsDir, { recursive: true });
            writeFileSync(resolve(motionsDir, `${id}.json`), JSON.stringify(draft, null, 2));
            const indexPath = resolve(motionsDir, "index.json");
            let index: string[] = existsSync(indexPath)
              ? JSON.parse(readFileSync(indexPath, "utf8"))
              : [];
            if (!index.includes(id)) {
              index.push(id);
              writeFileSync(indexPath, JSON.stringify(index, null, 2));
            }
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ ok: true, saved: `${id}.json` }));
          } catch (e) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: String((e as Error).message ?? e) }));
          }
        });
      });
    },
  };
}

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
  plugins: [saveMotionPlugin()],
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
