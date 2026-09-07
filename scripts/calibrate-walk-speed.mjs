/** A08 走路速度标定：测量脚世界坐标在一个步态周期内的移动距离（支撑脚前移 ≈ 身体前进量）。 */
const { spine } = await import("../vendor/spine-ts/3.6/spine-core-esm.js");
import { readFileSync } from "node:fs";
const raw = JSON.parse(readFileSync("assets/Model/lafei_8/lafei_8.json", "utf8"));
const atlasText = readFileSync("assets/Model/lafei_8/lafei_8.atlas.txt", "utf8");
const dummy = () => ({ setFilters() {}, setWraps() {}, getImage: () => ({ width: 4, height: 4 }), getWidth: () => 4, getHeight: () => 4, dispose() {} });
const data = new spine.SkeletonJson(new spine.AtlasAttachmentLoader(new spine.TextureAtlas(atlasText, dummy))).readSkeletonData(raw);
const sk = new spine.Skeleton(data);
const stateData = new spine.AnimationStateData(data);
stateData.defaultMix = 0;
const state = new spine.AnimationState(stateData);
const walk = data.findAnimation("walk");

// lafei 的腿部骨骼：leg_R2/leg_L2 为小腿/足段（D.3: leg_L1→leg_L3 IK 链）
const footR = sk.findBone("leg_R2") ?? sk.findBone("leg_R3") ?? sk.findBone("leg_R");
const footL = sk.findBone("leg_L2") ?? sk.findBone("leg_L3") ?? sk.findBone("leg_L");

const step = 0.02;
let minX = Infinity, maxX = -Infinity;
for (let t = 0; t < walk.duration; t += step) {
  sk.setToSetupPose();
  state.setEmptyAnimation(0, 0);
  state.setAnimationWith(0, walk, false);
  const e = state.tracks[0];
  e.animationStart = 0; e.animationEnd = walk.duration; e.time = t; e.trackTime = t;
  state.update(0.0001);
  state.apply(sk); sk.updateWorldTransform();
  minX = Math.min(minX, footR.worldX, footL.worldX);
  maxX = Math.max(maxX, footR.worldX, footL.worldX);
}
const stride = maxX - minX;
const speed = stride / walk.duration;
console.log(`足部世界 X 范围: [${minX.toFixed(1)}, ${maxX.toFixed(1)}] → 步幅=${stride.toFixed(1)} 单位`);
console.log(`周期 ${walk.duration.toFixed(2)}s → 标定前进速度 = ${speed.toFixed(3)} 单位/s`);
console.log(`换算 H（heightUnits=335）: ${(speed / 335).toFixed(3)} H/s → A08.walkSpeed 建议值`);
