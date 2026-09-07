const { spine } = await import("../vendor/spine-ts/3.6/spine-core-esm.js");
import { readFileSync } from "node:fs";
const raw = JSON.parse(readFileSync("assets/Model/lafei_8/lafei_8.json", "utf8"));
const atlasText = readFileSync("assets/Model/lafei_8/lafei_8.atlas.txt", "utf8");
const dummy = () => ({ setFilters() {}, setWraps() {}, getImage: () => ({ width: 4, height: 4 }), getWidth: () => 4, getHeight: () => 4, dispose() {} });
const data = new spine.SkeletonJson(new spine.AtlasAttachmentLoader(new spine.TextureAtlas(atlasText, dummy))).readSkeletonData(raw);

// 在 timeline 中找连续高幅窗口
function findWindows(frames, threshold, minDur) {
  const wins = [];
  let start = null;
  for (let i = 0; i < frames.length; i += 2) {
    const t = frames[i], v = frames[i + 1];
    const high = Math.abs(v) >= threshold;
    if (high && start == null) start = t;
    if ((!high || i + 2 >= frames.length) && start != null) {
      const endT = high ? t : frames[i];
      if (endT - start >= minDur) wins.push([+start.toFixed(2), +endT.toFixed(2), +(endT - start).toFixed(2)]);
      start = null;
    }
  }
  return wins;
}
function faceWindows(anim, minAmp) {
  const tl = anim.timelines.find((t) => t.constructor.name === "RotateTimeline" && t.boneIndex === data.findBoneIndex("face"));
  if (!tl) return [];
  const wins = [];
  const step = 0.05;
  let start = null, dir = 0, extreme = 0;
  for (let t = 0; t < anim.duration; t += step) {
    const i = Math.max(0, Math.min(tl.frames.length - 2, Math.floor(t / anim.duration * (tl.frames.length / 2)) * 2));
    // 简化：直接线性扫描帧
  }
  // 用帧值直接分析（帧为 [time,value,...]）
  for (let i = 1; i < tl.frames.length; i += 2) {
    const v = tl.frames[i], t = tl.frames[i - 1];
    if (Math.abs(v) >= minAmp && start == null) start = t;
    if (Math.abs(v) < minAmp && start != null) { wins.push([+start.toFixed(2), +tl.frames[i - 1].toFixed(2)]); start = null; }
  }
  if (start != null) wins.push([+start.toFixed(2), +anim.duration.toFixed(2)]);
  return wins;
}

console.log("=== 右臂高举窗口（hand_R3 |v|≥90°，≥0.4s）——挥手/举手素材 ===");
for (const anim of data.animations) {
  for (const tl of anim.timelines) {
    if (tl.constructor.name === "RotateTimeline" && tl.boneIndex === data.findBoneIndex("hand_R3")) {
      const wins = findWindows(tl.frames, 90, 0.4);
      if (wins.length) console.log(`${anim.name}: ${JSON.stringify(wins)}`);
    }
  }
}
console.log("");
console.log("=== 左臂高举窗口（hand_L3 |v|≥90°，≥0.4s）===");
for (const anim of data.animations) {
  for (const tl of anim.timelines) {
    if (tl.constructor.name === "RotateTimeline" && tl.boneIndex === data.findBoneIndex("hand_L3")) {
      const wins = findWindows(tl.frames, 90, 0.4);
      if (wins.length) console.log(`${anim.name}: ${JSON.stringify(wins)}`);
    }
  }
}
console.log("");
console.log("=== 头部明显偏转窗口（face |v|≥10°，≥0.3s）——点头/歪头/低头素材 ===");
for (const anim of data.animations) {
  const wins = faceWindows(anim, 10).filter(([a, b]) => b - a >= 0.3);
  if (wins.length) console.log(`${anim.name}: ${JSON.stringify(wins)}`);
}
