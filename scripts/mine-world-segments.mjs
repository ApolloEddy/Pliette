const { spine } = await import("../vendor/spine-ts/3.6/spine-core-esm.js");
import { readFileSync } from "node:fs";
const raw = JSON.parse(readFileSync("assets/Model/lafei_8/lafei_8.json", "utf8"));
const atlasText = readFileSync("assets/Model/lafei_8/lafei_8.atlas.txt", "utf8");
const dummy = () => ({ setFilters() {}, setWraps() {}, getImage: () => ({ width: 4, height: 4 }), getWidth: () => 4, getHeight: () => 4, dispose() {} });
const data = new spine.SkeletonJson(new spine.AtlasAttachmentLoader(new spine.TextureAtlas(atlasText, dummy))).readSkeletonData(raw);
const sk = new spine.Skeleton(data);
const stateData = new spine.AnimationStateData(data);
const state = new spine.AnimationState(stateData);
stateData.defaultMix = 0;

function sample(anim, t) {
  sk.setToSetupPose();
  state.setEmptyAnimation(0, 0);
  state.setAnimationWith(0, anim, false);
  const e = state.tracks[0];
  e.animationStart = 0; e.animationEnd = anim.duration; e.time = t; e.trackTime = t;
  state.update(0.0001);
  state.apply(sk);
  sk.updateWorldTransform();
  return {
    handR: sk.findBone("hand_R3").worldY,
    handL: sk.findBone("hand_L3").worldY,
    head: sk.findBone("face").worldY,
    headAngle: sk.findBone("face").rotation,
  };
}

function windowsFor(anim, pred, minDur = 0.35) {
  const step = 0.1;
  const wins = [];
  let start = null;
  for (let t = 0; t < anim.duration; t += step) {
    const s = sample(anim, t);
    const ok = pred(s);
    if (ok && start == null) start = t;
    if (!ok && start != null) {
      if (t - start >= minDur) wins.push([+start.toFixed(2), +t.toFixed(2), +(t - start).toFixed(2)]);
      start = null;
    }
  }
  if (start != null) wins.push([+start.toFixed(2), +anim.duration.toFixed(2), +(anim.duration - start).toFixed(2)]);
  return wins;
}

const raised = (s) => s.handR > s.head - 8 || s.handL > s.head - 8;  // 手接近或高于头顶
console.log("=== 手举过头顶窗口（世界坐标）===");
for (const anim of data.animations) {
  const wins = windowsFor(anim, raised);
  if (wins.length) console.log(`${anim.name}: ${JSON.stringify(wins)}`);
}
console.log("");
console.log("=== 头部低垂窗口（face 世界 y < 100，低头/趴）===");
for (const anim of data.animations) {
  const wins = windowsFor(anim, (s) => s.head < 100);
  if (wins.length) console.log(`${anim.name}: ${JSON.stringify(wins)}`);
}
