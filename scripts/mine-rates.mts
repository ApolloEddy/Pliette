/**
 * 速率标定：采样原动画中控制器对应骨骼的旋转曲线，提取动画师本人使用的峰值角速度。
 * 依据：资产原生节奏是"该骨架视觉语言可支撑的速度"的最直接证据（指导书 Spec 5.1-4 / 8.4）。
 * 用法: npx vite-node scripts/mine-rates.mts
 * 输出: experiments/rig-calibration/lafei_8/rate-samples.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSkeleton } from "../src/assets/loader.js";
import { spine36 as spine } from "spine-webgl";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const dummyTexture = () => ({
  setFilters() {}, setWraps() {}, getImage: () => ({ width: 4, height: 4 }), getWidth: () => 4, getHeight: () => 4, dispose() {},
});
const bundle = loadSkeleton({
  name: "lafei_8",
  skeletonJson: JSON.parse(readFileSync(resolve(root, "public/assets-local/lafei_8/lafei_8.json"), "utf-8")),
  atlasText: readFileSync(resolve(root, "public/assets-local/lafei_8/lafei_8.atlas.txt"), "utf-8"),
  createTexture: dummyTexture,
});
const data = bundle.skeletonData;

const TRACKS = [
  { bone: "hand_R", label: "arm.right.raise", prop: "rotate" },
  { bone: "hand_R3", label: "arm.right.forearm", prop: "rotate" },
  { bone: "hand_L", label: "arm.left.raise", prop: "rotate" },
  { bone: "hand_L3", label: "arm.left.forearm", prop: "rotate" },
  { bone: "face", label: "head.nod", prop: "rotate" },
  { bone: "body", label: "torso.lean", prop: "rotate" },
  { bone: "body", label: "torso.bob", prop: "translate" },
];

// 在隔离 Skeleton 上逐帧应用动画，采样骨骼局部旋转（相对 setup 的偏移）。
// 用官方 Animation.apply(skeleton, lastTime, time, events, alpha, blend, mix)——不经过 AnimationState。
const skel = new spine.Skeleton(data);
const setupOf = new Map(skel.bones.map((b) => [b.data.name, b.data.rotation]));
const DT = 1 / 30;

const out: Record<string, { anim: string; peakPerSec: number; atSec: number }[]> = {};
for (const { bone, label, prop } of TRACKS) {
  const boneIndex = skel.findBoneIndex(bone);
  if (boneIndex < 0) continue;
  out[label] = [];
  for (const anim of data.animations) {
    let peak = 0;
    let peakAt = 0;
    let prev: number | null = null;
    for (let t = 0; t <= anim.duration; t += DT) {
      skel.setToSetupPose();
      // 3.6 签名：apply(skeleton, lastTime, time, loop, events, alpha, pose, direction)
      anim.apply(skel, t, t, false, [], 1, spine.MixPose.setup, spine.MixDirection.in);
      const b = skel.bones[boneIndex];
      const offset = prop === "rotate" ? b.rotation - setupOf.get(bone)! : Math.hypot(b.x - b.data.x, b.y - b.data.y);
      if (prev != null) {
        const rate = Math.abs(offset - prev) / DT;
        if (rate > peak) { peak = rate; peakAt = t; }
      }
      prev = offset;
    }
    if (peak > 0) out[label].push({ anim: anim.name, peakPerSec: Math.round(peak), atSec: Number(peakAt.toFixed(2)) });
  }
  out[label].sort((a, b) => b.peakPerSec - a.peakPerSec);
  const top = out[label][0];
  const unit = prop === "rotate" ? "°/s" : "单位/s";
  console.log(`${label.padEnd(20)} 峰值 ${top?.peakPerSec ?? 0}${unit}（${top?.anim}@${top?.atSec}s） 次峰 ${out[label][1]?.peakPerSec ?? 0}（${out[label][1]?.anim}）`);
}

const outFile = resolve(root, "experiments/rig-calibration/lafei_8/rate-samples.json");
writeFileSync(outFile, JSON.stringify({ date: new Date().toISOString().slice(0, 10), dt: DT, note: "原动画逐帧采样的骨骼局部角速度峰值（动画师原生节奏）", rates: out }, null, 2) + "\n");
console.log("记录 ->", relative(root, outFile));
