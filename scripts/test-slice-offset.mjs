const { spine } = await import("../vendor/spine-ts/3.6/spine-core-esm.js");
import { readFileSync } from "node:fs";
const raw = JSON.parse(readFileSync("assets/Model/lafei_8/lafei_8.json", "utf8"));
const atlasText = readFileSync("assets/Model/lafei_8/lafei_8.atlas.txt", "utf8");
const dummy = () => ({ setFilters() {}, setWraps() {}, getImage: () => ({ width: 4, height: 4 }), getWidth: () => 4, getHeight: () => 4, dispose() {} });
const data = new spine.SkeletonJson(new spine.AtlasAttachmentLoader(new spine.TextureAtlas(atlasText, dummy))).readSkeletonData(raw);
const stand = data.findAnimation("stand");
const r3Idx = data.findBoneIndex("hand_R3");
const r3tl = stand.timelines.find((t) => t.constructor.name === "RotateTimeline" && t.boneIndex === r3Idx);
// stand 原生在 t=10.0 时 hand_R3 的值
let v10 = 0;
for (let i = 0; i < r3tl.frames.length - 2; i += 2) {
  if (r3tl.frames[i] <= 10.0 && r3tl.frames[i + 2] >= 10.0) {
    const p = (10.0 - r3tl.frames[i]) / (r3tl.frames[i + 2] - r3tl.frames[i]);
    v10 = r3tl.frames[i + 1] + (r3tl.frames[i + 3] - r3tl.frames[i + 1]) * p;
    break;
  }
}
console.log("stand@10.0s hand_R3 原生值:", v10.toFixed(1));

const sk = new spine.Skeleton(data);
const stateData = new spine.AnimationStateData(data);
stateData.defaultMix = 0;
const state = new spine.AnimationState(stateData);
const entry = state.setAnimationWith(1, stand, false);
// 方案：直接把 entry.time 设为 9.5，然后 update(0.5) → 采样在 10.0
entry.animationStart = 8.07;
entry.animationEnd = 13.6;
entry.time = 9.5;   // d.ts 未声明但运行时存在
state.update(0.5);
state.apply(sk); sk.updateWorldTransform();
console.log("(entry.time=9.5 + update 0.5) → hand_R3 =", sk.bones[r3Idx].rotation.toFixed(1));

const entry2 = state.setAnimationWith(2, stand, false);
entry2.animationStart = 8.07;
entry2.animationEnd = 13.6;
state.update(0.5);
state.apply(sk); sk.updateWorldTransform();
console.log("(仅 animationStart=8.07, trackTime=0.5) → hand_R3 =", sk.bones[r3Idx].rotation.toFixed(1));
