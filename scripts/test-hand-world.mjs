const { spine } = await import("../vendor/spine-ts/3.6/spine-core-esm.js");
import { readFileSync } from "node:fs";
const raw = JSON.parse(readFileSync("assets/Model/lafei_8/lafei_8.json", "utf8"));
const atlasText = readFileSync("assets/Model/lafei_8/lafei_8.atlas.txt", "utf8");
const dummy = () => ({ setFilters() {}, setWraps() {}, getImage: () => ({ width: 4, height: 4 }), getWidth: () => 4, getHeight: () => 4, dispose() {} });
const data = new spine.SkeletonJson(new spine.AtlasAttachmentLoader(new spine.TextureAtlas(atlasText, dummy))).readSkeletonData(raw);
const sk = new spine.Skeleton(data);
const stateData = new spine.AnimationStateData(data);
const state = new spine.AnimationState(stateData);
state.setAnimationWith(0, data.findAnimation("stand"), true);

function report(t) {
  state.update(t); state.apply(sk); sk.updateWorldTransform();
  const shoulder = sk.findBone("hand_R");
  const hand = sk.findBone("hand_R3");
  const head = sk.findBone("face");
  console.log(`stand@${t.toFixed(2)}s: 肩(hand_R) y=${shoulder.worldY.toFixed(0)} 手尖(hand_R3) y=${hand.worldY.toFixed(0)} 头(face) y=${head.worldY.toFixed(0)} | 手R3 世界角度 ${(((Math.atan2(hand.c, hand.a) * 180) / Math.PI)).toFixed(0)}°`);
}
for (const t of [2, 8.5, 9.5, 10.07, 11, 12, 14, 16]) report(t);
