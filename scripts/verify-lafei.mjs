const { spine } = await import("../vendor/spine-ts/3.6/spine-core-esm.js");
import { readFileSync } from "node:fs";
const raw = JSON.parse(readFileSync("assets/Model/lafei_8/lafei_8.json", "utf8"));
console.log("导出版本字段:", raw.skeleton?.spine);
console.log("skeleton 尺寸:", raw.skeleton?.width, "x", raw.skeleton?.height, "hash:", raw.skeleton?.hash);
const atlasText = readFileSync("assets/Model/lafei_8/lafei_8.atlas.txt", "utf8");
const dummy = () => ({ setFilters() {}, setWraps() {}, getImage: () => ({ width: 4, height: 4 }), getWidth: () => 4, getHeight: () => 4, dispose() {} });
const atlas = new spine.TextureAtlas(atlasText, dummy);
console.log("atlas 页:", atlas.pages.map(p => `${p.name}(${p.width}x${p.height})`));
const data = new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(raw);
console.log("骨骼:", data.bones.length, "Slot:", data.slots.length, "皮肤:", data.skins.map(s=>s.name), "动画:", data.animations.length);
console.log("动画列表:", data.animations.map(a => `${a.name}(${a.duration.toFixed(2)}s)`).join(", "));
const iks = data.ikConstraints?.map(ik => `${ik.name}: ${ik.bones.map(b=>b.name).join("->")} target=${ik.target?.name} mix=${ik.mix}`);
console.log("IK:", iks);
// 验证 D.3 候选绑定存在性
for (const [role, name] of [["body.root","bone"],["head.main","face"],["arm.left","hand_L3"],["arm.right","hand_R3"],["leg.ik.left","leg_L"],["leg.ik.right","leg_R"],["eye.L","eye_L"],["eye.R","eye_R"]]) {
  const b = data.findBone(name);
  console.log(`绑定 ${role} → ${name}:`, b ? `存在(parent=${b.parent?.name}, rot=${b.rotation})` : "不存在");
}
// bone 骨骼的子节点（找 body/face 关系）
const bone = data.findBone("bone");
console.log("bone 的子骨骼:", data.bones.filter(b => b.parent?.name === "bone").map(b=>b.name));
const body = data.findBone("body");
console.log("body setup rotation:", body?.rotation);
// 动画采样验证转换保真：任取一段动画在 t=0.5 采样无异常
const anim = data.animations[0];
const sk = new spine.Skeleton(data);
sk.setToSetupPose();
anim.apply(sk, 0, 0.5, false, [], 1, spine.MixPose.setup, spine.MixDirection.in);
sk.updateWorldTransform();
console.log(`采样 ${anim.name}@0.5s OK, bone(world)=${sk.findBone("bone").worldX.toFixed(1)},${sk.findBone("bone").worldY.toFixed(1)}`);
