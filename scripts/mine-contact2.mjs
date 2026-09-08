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

// 每动画：手前伸(|x|≥25)的时段内 y 波动最小 0.5s 窗口
for (const anim of data.animations) {
  const step = 0.05;
  const pts = [];
  for (let t = 0; t < anim.duration; t += step) pts.push({ t, ...sample(anim, t) });
  const ext = pts.filter((p) => Math.abs(p.x) >= 25);
  if (ext.length < 10) continue;
  // 滑动窗口找 y 波动最小的 0.5s
  const winDur = 0.5;
  let best = null;
  for (let i = 0; i < ext.length; i++) {
    const w = ext.filter((p) => p.t >= ext[i].t && p.t <= ext[i].t + winDur);
    if (w.length < 6) continue;
    const ys = w.map((p) => p.y);
    const varY = Math.max(...ys) - Math.min(...ys);
    if (!best || varY < best.varY) best = { start: ext[i].t, end: ext[i].t + winDur, varY, yAvg: (Math.max(...ys) + Math.min(...ys)) / 2, x: w[Math.floor(w.length / 2)].x };
  }
  if (best) console.log(`${anim.name}: 最稳 0.5s 窗口 [${best.start.toFixed(2)}~${best.end.toFixed(2)}] y=${best.yAvg.toFixed(0)} 波动=${best.varY.toFixed(1)} (0.02H=6.7) x=${best.x.toFixed(0)}`);
}
