/** 第 1 轮修订候选导出：wave(Tune 参数修订) + nod(Author 增躯干联动)。原始 candidate-01 保留不动。 */
import { wavePrimitive } from "../src/motion/authoring/primitives.js";
import { P1_FIRST_OUTPUT } from "../src/motion/authoring/p1-drafts.js";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const expDir = resolve(here, "../experiments/p1-llm-motion");
const motionsDir = resolve(here, "../public/motions");

// wave candidate-02：Tune 模式——只改数值参数，函数不动（review-round1 依据：±18° 视觉幅度偏小）
const waveC2 = wavePrimitive({ hand: "right", liftDeg: 30, wagDeg: 24, cycles: 2, tempo: 1.15 }, "lafei_8.front.v1", 2);
waveC2.id = "wave_right_primitive_c2";

// nod candidate-02：Author 模式——增加躯干 1.5° 跟随（点头协调），头部曲线不变
const nodC1 = P1_FIRST_OUTPUT.nod;
const nodC2 = structuredClone(nodC1);
nodC2.id = "nod_c2";
nodC2.channels = ["head", "torso"];
nodC2.curves.push({
  role: "body.root",
  property: "rotate",
  mode: "relativeToReference",
  keys: [
    { t: 0, value: 0, ease: "bezier", bezierCP: [0.3, 0, 0.7, 1] },
    { t: 0.28, value: 1.5, ease: "bezier", bezierCP: [0.3, 0, 0.7, 1] },
    { t: 0.56, value: 0.2, ease: "bezier", bezierCP: [0.3, 0, 0.7, 1] },
    { t: 0.8, value: 0, ease: "linear" },
  ],
});
nodC2.provenance = { ...nodC1.provenance, candidate: 2, note: "修订1：躯干 1.5° 跟随提升协调（review-round1）" };

for (const [key, draft] of [["wave", waveC2], ["nod", nodC2]] as const) {
  const dir = resolve(expDir, key);
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, "candidate-02.json");
  if (!existsSync(file)) writeFileSync(file, JSON.stringify(draft, null, 2));
  writeFileSync(resolve(motionsDir, `${draft.id}.json`), JSON.stringify(draft, null, 2));
  console.log(`修订候选: ${key}/candidate-02.json → motions/${draft.id}.json`);
}
const indexPath = resolve(motionsDir, "index.json");
const index: string[] = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, "utf8")) : [];
for (const id of [waveC2.id, nodC2.id]) if (!index.includes(id)) index.push(id);
writeFileSync(indexPath, JSON.stringify(index, null, 2));
console.log("index:", index.join(", "));
