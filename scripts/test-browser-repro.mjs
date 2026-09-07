const { spine } = await import("../vendor/spine-ts/3.6/spine-core-esm.js");
import { readFileSync } from "node:fs";
const raw = JSON.parse(readFileSync("assets/Model/lafei_8/lafei_8.json", "utf8"));
const atlasText = readFileSync("assets/Model/lafei_8/lafei_8.atlas.txt", "utf8");
const dummy = () => ({ setFilters() {}, setWraps() {}, getImage: () => ({ width: 4, height: 4 }), getWidth: () => 4, getHeight: () => 4, dispose() {} });
const data = new spine.SkeletonJson(new spine.AtlasAttachmentLoader(new spine.TextureAtlas(atlasText, dummy))).readSkeletonData(raw);
const walk = data.findAnimation("walk");
const stand = data.findAnimation("stand");
const r3Idx = data.findBoneIndex("hand_R3");

// 通道过滤：rightArm = hand_R + 后代
function descendants(rootName) {
  const byParent = new Map();
  for (const b of data.bones) { const p = b.parent?.name ?? ""; { if (!byParent.has(p)) byParent.set(p, []); byParent.get(p).push(b.name); } }
  const out = new Set();
  const walk2 = (name) => { const i = data.findBoneIndex(name); if (i >= 0) out.add(i); for (const c of byParent.get(name) ?? []) walk2(c); };
  walk2(rootName);
  return out;
}
const channel = { bones: descendants("hand_R"), slots: new Set([data.findSlotIndex("hand_R2")].filter((i) => i >= 0)) };
const timelines = stand.timelines.filter((tl) => {
  const c = tl.constructor.name;
  if (["RotateTimeline", "TranslateTimeline", "ScaleTimeline", "ShearTimeline"].includes(c)) return channel.bones.has(tl.boneIndex);
  if (["AttachmentTimeline", "ColorTimeline", "TwoColorTimeline", "DeformTimeline"].includes(c)) return channel.slots.has(tl.slotIndex);
  return false;
});
console.log("过滤后 timeline 数:", timelines.length, [...channel.bones].map((i) => data.bones[i].name).join(","));
const filtered = new spine.Animation("stand#rightArm", timelines, stand.duration);

const sk = new spine.Skeleton(data);
const stateData = new spine.AnimationStateData(data);
stateData.defaultMix = 0.15;   // 浏览器里 SpineView.attach 设的值
const state = new spine.AnimationState(stateData);

// 轨道 0：walk 循环（浏览器 base）
state.setAnimationWith(0, walk, true);
// 轨道 2：切片叠加（浏览器 playSlice 序列）
const entry = state.setAnimationWith(2, filtered, false);
entry.animationStart = 8.07;
entry.animationEnd = 13.6;
state.addEmptyAnimation(2, 0.25, Math.max(0.05, (13.6 - 8.07) - 0.25));
// freezeAt：一次 update(2.0)
state.update(2.0);
state.apply(sk); sk.updateWorldTransform();
console.log("浏览器复现 → hand_R3 =", sk.bones[r3Idx].rotation.toFixed(1), "（期望 ~103°）");
console.log("entry.trackTime =", entry.trackTime.toFixed(2), "alpha =", entry.alpha.toFixed(2), "mixTime =", entry.mixTime?.toFixed?.() ?? entry.mixTime);
