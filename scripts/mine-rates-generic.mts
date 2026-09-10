/**
 * 速率标定（通用版）：对任意资产按控制-骨骼清单采样原动画峰值角速度。
 * 用法: npx vite-node scripts/mine-rates-generic.mts <jsonPath> <atlasPath> <bone1,label1> <bone2,label2> ...
 * 输出: experiments/rig-calibration/<asset>/rate-samples.json（asset 取 json 文件名主体）
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, relative, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSkeleton } from "../src/assets/loader.js";
import { spine36 as spine } from "spine-webgl";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const [jsonPath, atlasPath, ...trackArgs] = process.argv.slice(2);
if (!jsonPath || !atlasPath || trackArgs.length === 0) {
  console.error("用法: npx vite-node scripts/mine-rates-generic.mts <json> <atlas> <bone,label> ...");
  process.exit(1);
}
const asset = basename(jsonPath).replace(/-pro\.json$/, "").replace(/\.json$/, "");
const dummyTexture = () => ({
  setFilters() {}, setWraps() {}, getImage: () => ({ width: 4, height: 4 }), getWidth: () => 4, getHeight: () => 4, dispose() {},
});
const bundle = loadSkeleton({
  name: asset,
  skeletonJson: JSON.parse(readFileSync(resolve(root, jsonPath), "utf-8")),
  atlasText: readFileSync(resolve(root, atlasPath), "utf-8"),
  createTexture: dummyTexture,
});
const data = bundle.skeletonData;
const skel = new spine.Skeleton(data);
const DT = 1 / 30;

const out: Record<string, { anim: string; peakDegPerSec: number; atSec: number }[]> = {};
for (const arg of trackArgs) {
  const [bone, label] = arg.split(",");
  const boneIndex = skel.findBoneIndex(bone);
  if (boneIndex < 0) { console.error(`骨骼不存在：${bone}`); continue; }
  const setupRot = data.bones[boneIndex].rotation;
  out[label] = [];
  for (const anim of data.animations) {
    let peak = 0;
    let peakAt = 0;
    let prev: number | null = null;
    for (let i = 0; ; i++) {
      const t = Math.min(i * DT, anim.duration);
      skel.setToSetupPose();
      anim.apply(skel, t, t, false, [], 1, spine.MixPose.setup, spine.MixDirection.in);
      const offset = skel.bones[boneIndex].rotation - setupRot;
      if (prev != null) {
        const rate = Math.abs(offset - prev) / DT;
        if (rate > peak) { peak = rate; peakAt = t; }
      }
      prev = offset;
      if (t >= anim.duration) break;
    }
    if (peak > 0) out[label].push({ anim: anim.name, peakDegPerSec: Math.round(peak), atSec: Number(peakAt.toFixed(2)) });
  }
  out[label].sort((a, b) => b.peakDegPerSec - a.peakDegPerSec);
  console.log(`${label.padEnd(18)} 峰值 ${out[label][0]?.peakDegPerSec ?? 0}°/s（${out[label][0]?.anim}@${out[label][0]?.atSec}s） 次峰 ${out[label][1]?.peakDegPerSec ?? 0}（${out[label][1]?.anim}）`);
}

const outFile = resolve(root, "experiments/rig-calibration", asset, "rate-samples.json");
writeFileSync(outFile, JSON.stringify({ date: new Date().toISOString().slice(0, 10), dt: DT, note: "原动画逐帧采样的骨骼局部角速度峰值（动画师原生节奏）", rates: out }, null, 2) + "\n");
console.log("记录 ->", relative(root, outFile));
