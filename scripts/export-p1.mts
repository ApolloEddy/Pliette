/** 导出 P1 六项首次输出为实验记录 + Lab 可加载的 motions 目录（单一来源：p1-drafts.ts）。 */
import { P1_FIRST_OUTPUT } from "../src/motion/authoring/p1-drafts.js";
import { checkWaveParams } from "../src/motion/authoring/primitives.js";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const expDir = resolve(here, "../experiments/p1-llm-motion");
const motionsDir = resolve(here, "../public/motions");

const wave = P1_FIRST_OUTPUT.wave;
const waveParamsErrors = checkWaveParams({ hand: "right", liftDeg: 30, wagDeg: 18, cycles: 2, tempo: 1.0 });
console.log("wave Tune 参数域检查:", waveParamsErrors.length ? waveParamsErrors : "通过");

mkdirSync(motionsDir, { recursive: true });
const index: string[] = [];
for (const [key, draft] of Object.entries(P1_FIRST_OUTPUT)) {
  const dir = resolve(expDir, key);
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, "candidate-01.json");
  if (!existsSync(file)) {
    writeFileSync(file, JSON.stringify(draft, null, 2));
    console.log(`首次输出留存: experiments/p1-llm-motion/${key}/candidate-01.json`);
  } else {
    console.log(`已存在（保留原始）: ${key}/candidate-01.json`);
  }
  writeFileSync(resolve(motionsDir, `${draft.id}.json`), JSON.stringify(draft, null, 2));
  index.push(draft.id);
}
writeFileSync(resolve(motionsDir, "index.json"), JSON.stringify(index, null, 2));
console.log("motions 索引:", index.join(", "));
void wave; void readFileSync;
