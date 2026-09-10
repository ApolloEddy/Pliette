/**
 * 静态提取：每段原动画的写集覆盖图（指导书 Spec 3.2 / 3.3-5「作用链」的数据源）。
 * 输出 bone→属性、slot→附件/形变 的逐动画覆盖，及关键控制骨的后代清单。
 * 用法: npx vite-node scripts/mine-write-coverage.mts <assetName> <jsonPath> <atlasPath>
 * 结果: experiments/rig-calibration/<assetName>/write-coverage.json
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, relative, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSkeleton } from "../src/assets/loader.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const [assetName, jsonPath, atlasPath] = process.argv.slice(2);
if (!assetName || !jsonPath || !atlasPath) {
  console.error("用法: npx vite-node scripts/mine-write-coverage.mts <assetName> <skeleton.json> <atlas>");
  process.exit(1);
}

const dummyTexture = () => ({
  setFilters() {}, setWraps() {}, getImage: () => ({ width: 4, height: 4 }), getWidth: () => 4, getHeight: () => 4, dispose() {},
});
const bundle = loadSkeleton({
  name: assetName,
  skeletonJson: JSON.parse(readFileSync(resolve(root, jsonPath), "utf-8")),
  atlasText: readFileSync(resolve(root, atlasPath), "utf-8"),
  createTexture: dummyTexture,
});
const data = bundle.skeletonData;

const nameOfBone = (i: number) => data.bones[i]?.name ?? `#${i}`;
const nameOfSlot = (i: number) => data.slots[i]?.name ?? `#${i}`;

interface AnimCoverage {
  animation: string;
  duration: number;
  bones: Record<string, string[]>;
  slots: Record<string, string[]>;
  global: string[];
}

const coverage: AnimCoverage[] = [];
for (const anim of data.animations) {
  const bones: Record<string, string[]> = {};
  const slots: Record<string, string[]> = {};
  const global: string[] = [];
  for (const tl of anim.timelines) {
    const ctor = tl.constructor.name;
    const anyTl = tl as unknown as { boneIndex?: number; slotIndex?: number };
    if (anyTl.boneIndex != null && /Timeline$/.test(ctor) && /Rotate|Translate|Scale|Shear|IK|Path|Transform/.test(ctor) === false) {
      // 不会走到这里（分类见下）
    }
    switch (ctor) {
      case "RotateTimeline":
      case "TranslateTimeline":
      case "ScaleTimeline":
      case "ShearTimeline": {
        const n = nameOfBone(anyTl.boneIndex ?? -1);
        (bones[n] ??= []).push(ctor.replace("Timeline", "").toLowerCase());
        break;
      }
      case "AttachmentTimeline":
      case "DeformTimeline":
      case "ColorTimeline":
      case "TwoColorTimeline": {
        const n = nameOfSlot(anyTl.slotIndex ?? -1);
        (slots[n] ??= []).push(ctor.replace("Timeline", "").toLowerCase());
        break;
      }
      case "IkConstraintTimeline":
      case "TransformConstraintTimeline":
      case "PathConstraintPositionTimeline":
      case "PathConstraintSpacingTimeline":
      case "PathConstraintMixTimeline":
        global.push(ctor.replace("Timeline", ""));
        break;
      case "DrawOrderTimeline":
        global.push("drawOrder");
        break;
      case "EventTimeline":
        global.push("event");
        break;
      default:
        global.push(ctor);
    }
  }
  // 去重排序，保证输出确定
  for (const m of [bones, slots]) for (const k of Object.keys(m)) m[k] = [...new Set(m[k])].sort();
  coverage.push({ animation: anim.name, duration: anim.duration, bones, slots, global: [...new Set(global)].sort() });
}

// 关键控制骨的后代清单（作用链/联动说明的数据源）
const childrenOf = new Map<string, string[]>();
for (const b of data.bones) {
  const p = b.parent?.name;
  if (p) (childrenOf.get(p) ?? childrenOf.set(p, []).get(p)!).push(b.name);
}
function descendants(rootName: string): string[] {
  const out: string[] = [];
  const walk = (n: string) => {
    for (const c of childrenOf.get(n) ?? []) {
      out.push(c);
      walk(c);
    }
  };
  walk(rootName);
  return out.sort();
}
const subtrees: Record<string, string[]> = {};
for (const key of ["body", "face", "hand_L", "hand_R", "leg_L1", "leg_R1"]) {
  if (data.findBoneIndex(key) >= 0) subtrees[key] = descendants(key);
}

const result = {
  asset: assetName,
  exportVersion: bundle.exportVersion,
  generated: new Date().toISOString().slice(0, 10),
  animations: coverage,
  subtrees,
};
const outDir = resolve(root, "experiments/rig-calibration", assetName);
mkdirSync(outDir, { recursive: true });
const outFile = resolve(outDir, `write-coverage${basename(jsonPath, ".json") !== assetName ? "-" + basename(jsonPath, ".json") : ""}.json`);
writeFileSync(outFile, JSON.stringify(result, null, 2) + "\n");

// 控制台摘要：与开放控制相关的骨/槽是否被每段动画写入
const KEY = ["hand_L", "hand_L3", "hand_R", "hand_R3", "face", "body"];
const KEY_SLOTS = ["eye_L", "eye_R"];
for (const c of coverage) {
  const hits: string[] = [];
  for (const k of KEY) if (c.bones[k]) hits.push(`${k}:${c.bones[k].join("+")}`);
  for (const k of KEY_SLOTS) if (c.slots[k]) hits.push(`${k}:att`);
  console.log(`${c.animation.padEnd(14)} ${hits.join("  ")}`);
}
console.log("\n记录 ->", relative(root, outFile));
