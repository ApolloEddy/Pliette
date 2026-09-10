/**
 * 无头加载拉菲资产（官方 3.6 运行时，无渲染），输出：
 * 1) 参考姿态（setup）digest —— 填入 characters/lafei_8.rig-profile.json
 * 2) 关键骨骼 setup 变换（档案静态事实复核）
 * 用法: npx vite-node scripts/lafei-refpose.mts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSkeleton } from "../src/assets/loader.js";
import { computeSetupPoseDigest } from "../src/rig/controlProfile.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const rawJson = JSON.parse(readFileSync(resolve(root, "public/assets-local/lafei_8/lafei_8.json"), "utf-8"));
const atlasText = readFileSync(resolve(root, "public/assets-local/lafei_8/lafei_8.atlas.txt"), "utf-8");
const bundle = loadSkeleton({
  name: "lafei_8",
  skeletonJson: rawJson,
  atlasText,
  createTexture: () => ({ setFilters() {}, setWraps() {}, getImage: () => ({ width: 4, height: 4 }), getWidth: () => 4, getHeight: () => 4, dispose() {} }),
});

const data = bundle.skeletonData;
const digest = computeSetupPoseDigest(data.bones);
console.log("bones:", data.bones.length, "slots:", data.slots.length, "animations:", data.animations.length);
console.log("setupPoseDigest:", digest);

const KEY = ["root", "bone", "body", "face", "hand_L", "hand_L3", "hand_R", "hand_R3", "leg_L", "leg_L1", "leg_L3", "leg_R", "leg_R1", "leg_R3"];
const facts = data.bones
  .filter((b) => KEY.includes(b.name))
  .map((b) => ({ name: b.name, parent: b.parent?.name ?? null, x: b.x, y: b.y, rotation: b.rotation, length: b.length ?? null }));
for (const f of facts) console.log(JSON.stringify(f));

const out = { date: new Date().toISOString().slice(0, 10), setupPoseDigest: digest, runtimeVersion: bundle.exportVersion, keyBones: facts };
const outDir = resolve(root, "experiments/rig-calibration/lafei_8");
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, "reference-pose.json"), JSON.stringify(out, null, 2) + "\n");
console.log("记录 ->", relative(root, resolve(outDir, "reference-pose.json")));
