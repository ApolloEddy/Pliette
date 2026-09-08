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

function sample(anim, t) {
  sk.setToSetupPose();
  state.setEmptyAnimation(0, 0);
  state.setAnimationWith(0, anim, false);
  const e = state.tracks[0];
  e.animationStart = 0; e.animationEnd = anim.duration; e.time = t; e.trackTime = t;
  state.update(0.0001);
  state.apply(sk); sk.updateWorldTransform();
  const hR = sk.findBone("hand_R3");
  return { x: hR.worldX, y: hR.worldY };
}

// 找窗口：时长≥0.5s，期间手 worldY 波动 ≤ 0.02H*335=6.7 单位（稳定接触段判定标准）
function stableWindows(anim, minDur = 0.5, maxVar = 6.7) {
  const step = 0.05;
  const wins = [];
  let start = null, minY = Infinity, maxY = -Infinity;
  let prev = null;
  for (let t = 0; t <= anim.duration + 0.001; t += step) {
    const tt = Math.min(t, anim.duration);
    const s = t <= anim.duration ? sample(anim, tt) : null;
    const inStable = s && Math.abs(s.x) > 30; // 手前伸（离身体中线 30+ 单位）
    if (inStable) {
      if (start == null) { start = tt; minY = s.y; maxY = s.y; }
      else { minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y); }
      prev = s;
    }
    if ((!inStable || t > anim.duration) && start != null) {
      const end = prev ? Math.min(t, anim.duration) : start;
      if (end - start >= minDur && maxY - minY <= maxVar) {
        wins.push({ start: +start.toFixed(2), end: +end.toFixed(2), dur: +(end - start).toFixed(2), yAvg: +((minY + maxY) / 2).toFixed(1), varY: +(maxY - minY).toFixed(1) });
      }
      start = null; minY = Infinity; maxY = -Infinity;
    }
  }
  return wins;
}

console.log("=== 手前伸且高度稳定窗口（≥0.5s，波动≤6.7=0.02H）——触碰/持物接触素材 ===");
for (const anim of data.animations) {
  const wins = stableWindows(anim);
  if (wins.length) {
    console.log(`${anim.name}:`);
    for (const w of wins) console.log(`  [${w.start}~${w.end}] dur=${w.dur} 高度=${w.yAvg}±${w.varY / 2}`);
  }
}
