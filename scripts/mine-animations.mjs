const { spine } = await import("../vendor/spine-ts/3.6/spine-core-esm.js");
import { readFileSync } from "node:fs";
const raw = JSON.parse(readFileSync("assets/Model/lafei_8/lafei_8.json", "utf8"));
const atlasText = readFileSync("assets/Model/lafei_8/lafei_8.atlas.txt", "utf8");
const dummy = () => ({ setFilters() {}, setWraps() {}, getImage: () => ({ width: 4, height: 4 }), getWidth: () => 4, getHeight: () => 4, dispose() {} });
const data = new spine.SkeletonJson(new spine.AtlasAttachmentLoader(new spine.TextureAtlas(atlasText, dummy))).readSkeletonData(raw);

// 每段动画：关键骨骼的运动幅度（timeline 帧值的 max-min）、附件切换次数
const KEY_BONES = ["face", "body", "hand_L", "hand_R", "hand_L3", "hand_R3", "eye_L", "eye_R"];
const KEY_SLOTS = ["eye_L", "eye_R", "meimao1"];
const boneIdx = Object.fromEntries(KEY_BONES.map((n) => [n, data.findBoneIndex(n)]));
const slotIdx = Object.fromEntries(KEY_SLOTS.map((n) => [n, data.findSlotIndex(n)]));

for (const anim of data.animations) {
  const stats = {};
  for (const tl of anim.timelines) {
    const ctor = tl.constructor.name;
    if (ctor === "RotateTimeline" && boneIdx[Object.keys(boneIdx).find((k) => boneIdx[k] === tl.boneIndex)] != null) {
      const name = Object.keys(boneIdx).find((k) => boneIdx[k] === tl.boneIndex);
      let min = Infinity, max = -Infinity;
      for (let i = 1; i < tl.frames.length; i += 2) { min = Math.min(min, tl.frames[i]); max = Math.max(max, tl.frames[i]); }
      if (max - min > 0.5) stats[name] = { rot: +(max - min).toFixed(1), lo: +min.toFixed(1), hi: +max.toFixed(1) };
    } else if (ctor === "TranslateTimeline") {
      const name = Object.keys(boneIdx).find((k) => boneIdx[k] === tl.boneIndex);
      if (!name) continue;
      let min = Infinity, max = -Infinity;
      for (let i = 1; i < tl.frames.length; i += 3) { min = Math.min(min, tl.frames[i]); max = Math.max(max, tl.frames[i]); }
      for (let i = 2; i < tl.frames.length; i += 3) { min = Math.min(min, tl.frames[i]); max = Math.max(max, tl.frames[i]); }
      if (max - min > 1) stats[name + ":xy"] = { xy: +(max - min).toFixed(1) };
    } else if (ctor === "AttachmentTimeline") {
      const slot = data.slots[tl.slotIndex]?.name;
      if (KEY_SLOTS.includes(slot)) {
        const names = new Set(tl.attachmentNames.filter(Boolean));
        if (!stats[slot]) stats[slot] = { atts: [...names].join("|") };
      }
    }
  }
  const parts = Object.entries(stats).map(([k, v]) => {
    if (v.atts) return `${k}:[${v.atts}]`;
    if (v.xy != null) return `${k}:±${v.xy}`;
    return `${k}:${v.rot}°[${v.lo}~${v.hi}]`;
  });
  console.log(`${anim.name} (${anim.duration.toFixed(2)}s): ${parts.join("  ") || "(无关键部位运动)"}`);
}
