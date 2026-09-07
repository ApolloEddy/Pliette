const { spine } = await import("../vendor/spine-ts/3.6/spine-core-esm.js");
import { readFileSync } from "node:fs";
const raw = JSON.parse(readFileSync("assets/Model/lafei_8/lafei_8.json", "utf8"));
const atlasText = readFileSync("assets/Model/lafei_8/lafei_8.atlas.txt", "utf8");
const dummy = () => ({ setFilters() {}, setWraps() {}, getImage: () => ({ width: 4, height: 4 }), getWidth: () => 4, getHeight: () => 4, dispose() {} });
const data = new spine.SkeletonJson(new spine.AtlasAttachmentLoader(new spine.TextureAtlas(atlasText, dummy))).readSkeletonData(raw);
const sk = new spine.Skeleton(data);

function bounds(tag) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const quad = new Float32Array(8);
  for (const slot of sk.slots) {
    const att = slot.getAttachment();
    if (!att) continue;
    if (att instanceof spine.RegionAttachment) {
      att.computeWorldVertices(slot.bone, quad, 0, 2);
      for (let i = 0; i < 4; i++) {
        minX = Math.min(minX, quad[i*2]); maxX = Math.max(maxX, quad[i*2]);
        minY = Math.min(minY, quad[i*2+1]); maxY = Math.max(maxY, quad[i*2+1]);
      }
    } else if (att instanceof spine.MeshAttachment) {
      const n = att.worldVerticesLength;
      const verts = new Float32Array(n);
      att.computeWorldVertices(slot, 0, n, verts, 0, 2);
      for (let i = 0; i < n / 2; i++) {
        minX = Math.min(minX, verts[i*2]); maxX = Math.max(maxX, verts[i*2]);
        minY = Math.min(minY, verts[i*2+1]); maxY = Math.max(maxY, verts[i*2+1]);
      }
    }
  }
  console.log(`${tag}: x=[${minX.toFixed(1)}, ${maxX.toFixed(1)}] y=[${minY.toFixed(1)}, ${maxY.toFixed(1)}] H=${(maxY-minY).toFixed(1)}`);
  return { minY, maxY, minX, maxX };
}
sk.setToSetupPose(); sk.updateWorldTransform();
const setupB = bounds("setup pose");
const stand = data.findAnimation("stand");
sk.setToSetupPose(); stand.apply(sk, 0, 0.01, false, [], 1, spine.MixPose.setup, spine.MixDirection.in); sk.updateWorldTransform();
const standB = bounds("stand@0.01s");
// 走路中段再测一次（站立素材在运动时的包围盒稳定性）
const walk = data.findAnimation("walk");
sk.setToSetupPose(); walk.apply(sk, 0, 0.58, false, [], 1, spine.MixPose.setup, spine.MixDirection.in); sk.updateWorldTransform();
const walkB = bounds("walk@0.58s");
console.log("root:", 0, 0, " bone@setup:", sk.findBone("bone").worldX.toFixed(1), sk.findBone("bone").worldY.toFixed(1));
console.log("建议 heightUnits ≈", ((standB.maxY - standB.minY) / 2 + (walkB.maxY - walkB.minY) / 2).toFixed(1), "脚底基准 y ≈", Math.min(setupB.minY, standB.minY).toFixed(1));
