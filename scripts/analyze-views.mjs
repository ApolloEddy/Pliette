const { spine } = await import("../vendor/spine-ts/3.6/spine-core-esm.js");
import { readFileSync } from "node:fs";
const raw = JSON.parse(readFileSync("assets/Model/lafei_8/lafei_8.json", "utf8"));
const atlasText = readFileSync("assets/Model/lafei_8/lafei_8.atlas.txt", "utf8");
const dummy = () => ({ setFilters() {}, setWraps() {}, getImage: () => ({ width: 4, height: 4 }), getWidth: () => 4, getHeight: () => 4, dispose() {} });
const data = new spine.SkeletonJson(new spine.AtlasAttachmentLoader(new spine.TextureAtlas(atlasText, dummy))).readSkeletonData(raw);

const atts = [];
const skin = data.skins[0];
skin.attachments.forEach((slotAtts, slotIndex) => {
  for (const key in slotAtts) {
    atts.push(`${key}:${slotAtts[key].constructor.name}(slot=${data.slots[slotIndex]?.name})`);
  }
});
console.log("附件总数:", atts.length);
const backish = atts.filter((a) => /back|hou|背/i.test(a));
console.log("含 back/背 的附件:", backish.length ? backish : "无");
console.log("全部附件:", atts.join(", "));

function timelineProfile(anim) {
  const prof = {};
  for (const tl of anim.timelines) {
    const n = tl.constructor.name;
    prof[n] = (prof[n] ?? 0) + 1;
  }
  return prof;
}
for (const name of ["move", "move_left", "attack", "attack_left", "stand", "walk", "sit"]) {
  const a = data.findAnimation(name);
  console.log(`${name}: ${a.duration.toFixed(2)}s`, JSON.stringify(timelineProfile(a)));
}

function attTimelines(anim) {
  const out = [];
  for (const tl of anim.timelines) {
    if (tl.constructor.name === "AttachmentTimeline") {
      const slot = data.slots[tl.slotIndex]?.name;
      const names = tl.attachmentNames.filter(Boolean);
      out.push(`${slot}: ${[...new Set(names)].join("|")}`);
    }
  }
  return out;
}
for (const name of ["move", "move_left", "attack", "attack_left"]) {
  console.log(`--- ${name} attachment 切换 ---`);
  for (const line of attTimelines(data.findAnimation(name))) console.log(" ", line);
}

function writtenBones(anim) {
  const names = new Set();
  for (const tl of anim.timelines) {
    if (tl.boneIndex != null) names.add(data.bones[tl.boneIndex]?.name ?? `#${tl.boneIndex}`);
  }
  return [...names];
}
for (const name of ["move", "move_left"]) {
  console.log(`${name} 写的骨骼:`, writtenBones(data.findAnimation(name)).join(", "));
}
