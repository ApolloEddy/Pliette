const { spine } = await import("../vendor/spine-ts/3.6/spine-core-esm.js");
import { readFileSync } from "node:fs";
const raw = JSON.parse(readFileSync("assets/Model/lafei_8/lafei_8.json", "utf8"));
const atlasText = readFileSync("assets/Model/lafei_8/lafei_8.atlas.txt", "utf8");
const dummy = () => ({ setFilters() {}, setWraps() {}, getImage: () => ({ width: 4, height: 4 }), getWidth: () => 4, getHeight: () => 4, dispose() {} });
const data = new spine.SkeletonJson(new spine.AtlasAttachmentLoader(new spine.TextureAtlas(atlasText, dummy))).readSkeletonData(raw);
const setup = data.bones[data.findBoneIndex("face")].rotation;

// 手工造两条头部旋转动画：base 恒 10°，overlay 恒 40°（都是相对 setup 的偏移）
function constAnim(name, deg) {
  const tl = new spine.RotateTimeline(2);
  tl.boneIndex = data.findBoneIndex("face");
  tl.setFrame(0, 0, deg); tl.setFrame(1, 1, deg);
  return new spine.Animation(name, [tl], 1);
}
const sk = new spine.Skeleton(data);
const stateData = new spine.AnimationStateData(data);
stateData.defaultMix = 0;
const state = new spine.AnimationState(stateData);

function sample(label) {
  state.update(1 / 60); state.apply(sk); sk.updateWorldTransform();
  const b = sk.findBone("face");
  console.log(`${label}: face 局部旋转 = ${(b.rotation - setup).toFixed(2)}°（相对 setup）`);
}

sk.setToSetupPose();
state.setAnimationWith(0, constAnim("base", 10), true);
state.setEmptyAnimation(1, 0);
sample("仅 base=10°, 轨道1空");

state.setAnimationWith(1, constAnim("overlay", 40), false);
sample("叠加 overlay=40° 后");   // 若=40 → 绝对覆盖；若=50 → 相对叠加；若=其他 → 混合语义
sample("再推一帧");
