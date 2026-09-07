const { spine } = await import("../vendor/spine-ts/3.6/spine-core-esm.js");
import { readFileSync } from "node:fs";
const raw = JSON.parse(readFileSync("assets/Model/lafei_8/lafei_8.json", "utf8"));
const atlasText = readFileSync("assets/Model/lafei_8/lafei_8.atlas.txt", "utf8");
const dummy = () => ({ setFilters() {}, setWraps() {}, getImage: () => ({ width: 4, height: 4 }), getWidth: () => 4, getHeight: () => 4, dispose() {} });
const data = new spine.SkeletonJson(new spine.AtlasAttachmentLoader(new spine.TextureAtlas(atlasText, dummy))).readSkeletonData(raw);
const sk = new spine.Skeleton(data);
const stateData = new spine.AnimationStateData(data);
stateData.defaultMix = 0.15;
const state = new spine.AnimationState(stateData);
state.setAnimationWith(0, data.findAnimation("stand"), true);

// 轨道 5：强制 eye_2_1
const timelines = [];
for (const [slotName, attName] of [["eye_L", "eye_2_1"], ["eye_R", "eye_2_2"]]) {
  const tl = new spine.AttachmentTimeline(1);
  tl.slotIndex = data.findSlotIndex(slotName);
  tl.setFrame(0, 0, attName);
  timelines.push(tl);
}
const eyesAnim = new spine.Animation("eyes", timelines, 1);
const e = state.setAnimationWith(5, eyesAnim, true);
e.animationEnd = 1e6;

state.update(1.0);
state.apply(sk); sk.updateWorldTransform();
for (const s of ["eye_L", "eye_R"]) {
  const slot = sk.findSlot(s);
  console.log(`${s}: 当前附件 = ${slot.getAttachment()?.name ?? "null"}`);
}
