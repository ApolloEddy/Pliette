/**
 * 计算角色 assetDigest（指导书 Spec 3.1）：对实际服务文件的 SHA-256 组合摘要。
 * 用法: node scripts/compute-asset-digest.mjs <name> <file1> <file2> ...
 * 输出: { name, files: {path: sha256}, digest: "sha256-<hex>" }，写入 experiments/rig-calibration/<name>/asset-digest.json
 * 摘要组合方式：canonical 排序后按 "path=hash" 拼接再取 SHA-256，任何文件内容或集合变动都会改变 digest。
 */
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const [name, ...files] = process.argv.slice(2);
if (!name || files.length === 0) {
  console.error("用法: node scripts/compute-asset-digest.mjs <name> <file1> <file2> ...");
  process.exit(1);
}

const hashes = {};
for (const f of files) {
  const abs = resolve(root, f);
  hashes[relative(root, abs).replaceAll("\\", "/")] = createHash("sha256").update(readFileSync(abs)).digest("hex");
}

const combined = Object.keys(hashes).sort().map((p) => `${p}=${hashes[p]}`).join("\n");
const digest = `sha256-${createHash("sha256").update(combined).digest("hex")}`;
const out = { name, files: hashes, digest, date: new Date().toISOString().slice(0, 10) };

const outDir = resolve(root, "experiments/rig-calibration", name);
mkdirSync(outDir, { recursive: true });
const outFile = resolve(outDir, "asset-digest.json");
writeFileSync(outFile, JSON.stringify(out, null, 2) + "\n");
console.log("assetDigest =", digest);
console.log("记录 ->", relative(root, outFile));
for (const [p, h] of Object.entries(hashes)) console.log(`  ${p}: ${h.slice(0, 16)}…`);
