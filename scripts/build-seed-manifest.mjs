/**
 * 种子 manifest 生成（MotionLibrary Spec v1.0 §9.1）：
 * 把旧 9 条手势切片迁移为 MotionEntry（native_slice），写集从真实源动画 timeline 派生
 * （不是按通道名推定），contentDigest 用 SHA-256 对规范化 JSON 实算。
 *
 * 诚实边界：生成的条目 status=candidate（structural=passed，trajectory/visual=pending）——
 * 候选不进入默认可播放投影；视觉/轨迹验收后由人工或验收流程提升（§4.1）。
 * public/motions/llm_nod.json 与 llm_lean_blink.json 为内部 V1 草稿，
 * 不能伪称 pliette.motion-draft/1.1 登记：待转换+重验证后另行入册（§9.1）。
 *
 * 用法：node scripts/build-seed-manifest.mjs  （需要本地拉菲资产 public/assets-local/lafei_8/）
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { spine } from "../vendor/spine-ts/3.6/spine-core-esm.js";

const CATALOG_REVISION = "planning-2026-09-14.1";
const RUNTIME_VERSION = "3.6.53";
const ADAPTER_VERSION = "control-profile/1.0";
const PROFILE = JSON.parse(readFileSync("characters/lafei_8.rig-profile.json", "utf8"));

// ---------------------------------------------------------------------------
// 拉菲通道骨骼集合（与 src/motion/library/overlay.ts buildChannels 同一映射口径）
// ---------------------------------------------------------------------------

function descendants(data, rootName) {
  const byParent = new Map();
  for (const b of data.bones) {
    const p = b.parent?.name ?? "";
    (byParent.get(p) ?? byParent.set(p, []).get(p)).push(b.name);
  }
  const out = new Set();
  const walk = (name) => {
    out.add(name);
    for (const child of byParent.get(name) ?? []) walk(child);
  };
  walk(rootName);
  return out;
}

function channelBones(data) {
  const names = data.bones.map((b) => b.name);
  const find = (re) => names.find((n) => re.test(n));
  const head = descendants(data, find(/^face$/i));
  const rightArm = descendants(data, find(/^hand[_-]?r$/i));
  const leftArm = descendants(data, find(/^hand[_-]?l$/i));
  const torso = new Set([find(/^(body|hip|torso)$/i)].filter(Boolean));
  return { head, rightArm, leftArm, torso };
}

const FACE_SLOTS = new Set(["eye_L", "eye_R", "meimao1", "hongyun", "sleep2", "bushuang1", "bushuang2", "eye_L_blink", "eye_R_blink", "mouth", "hand_L2", "hand_R2"]);

/** 从真实源动画派生通道写集（Spec §4.4：不可只凭通道名推定不冲突） */
function deriveWrites(data, animName, bones, slots) {
  const anim = data.findAnimation(animName);
  if (!anim) throw new Error(`源动画不存在：${animName}`);
  const writes = new Set();
  for (const tl of anim.timelines) {
    const ctor = tl.constructor.name;
    if (ctor === "RotateTimeline" || ctor === "TranslateTimeline" || ctor === "ScaleTimeline" || ctor === "ShearTimeline") {
      const name = data.bones[tl.boneIndex]?.name;
      if (name && bones.has(name)) writes.add(`bone:${name}/${ctor.replace("Timeline", "").toLowerCase()}`);
    } else if (ctor === "AttachmentTimeline" || ctor === "ColorTimeline" || ctor === "TwoColorTimeline" || ctor === "DeformTimeline") {
      const slot = data.slots[tl.slotIndex]?.name;
      if (slot && slots.has(slot)) writes.add(`slot:${slot}/${ctor.replace("Timeline", "").toLowerCase()}`);
    }
  }
  if (writes.size === 0) throw new Error(`${animName} 在给定通道集合上没有可过滤 timeline`);
  return [...writes].sort();
}

// ---------------------------------------------------------------------------
// 种子迁移表（Spec §9.1）
// ---------------------------------------------------------------------------

const SEEDS = [
  { motionId: "lafei.wave.small_screen_right", actionId: "gesture.wave", variantId: "small.screen_right", anim: "stand", startMs: 4900, endMs: 7300, channel: "rightArm", posture: "standing", base: "stand", label: "挥手（右手举臂摇晃）" },
  { motionId: "lafei.raise_hand.screen_left", actionId: "gesture.raise_hand", variantId: "screen_left", anim: "stand", startMs: 13000, endMs: 13900, channel: "leftArm", posture: "standing", base: "stand", label: "短促举手（旧 wave/leftArm 标签语义纠正）" },
  { motionId: "lafei.reaction.dizzy.small", actionId: "reaction.dizzy", variantId: "small", anim: "yun", startMs: 400, endMs: 2000, channel: "head", posture: "standing", base: "stand", label: "晕乎乎（带头部完整反应）" },
  { motionId: "lafei.reaction.happy.small", actionId: "reaction.happy", variantId: "small", anim: "touch", startMs: 0, endMs: 670, channel: "head", posture: "standing", base: "stand", label: "被摸头开心（实际写集待附件核实）" },
  { motionId: "lafei.reaction.shy.small", actionId: "reaction.shy", variantId: "small", anim: "sit", startMs: 0, endMs: 1330, channel: "head", posture: "seated", base: "sit", label: "低头害羞（源为坐姿；使用前提如实声明）" },
  { motionId: "lafei.pump.screen_right", actionId: "gesture.pump", variantId: "screen_right", anim: "victory", startMs: 3300, endMs: 4100, channel: "rightArm", posture: "standing", base: "stand", label: "庆祝挥拳" },
  { motionId: "lafei.idle_fidget.default", actionId: "life.idle_fidget", variantId: "default", anim: "normal", startMs: 500, endMs: 2500, channel: "head", posture: "standing", base: "stand", label: "待机小动作（候选语义，需视觉核实）" },
  { motionId: "lafei.point.screen_right", actionId: "gesture.point", variantId: "screen_right", anim: "attack", startMs: 150, endMs: 700, channel: "rightArm", posture: "standing", base: "stand", label: "右臂前伸指向（指向一致性待核）" },
  { motionId: "lafei.touch_table.screen_right", actionId: "contact.touch_table", variantId: "screen_right", anim: "victory", startMs: 700, endMs: 1200, channel: "rightArm", posture: "standing", base: "stand", label: "触碰矮桌（绑定已测桌高 0.27H，不推广任意桌）", resources: ["scene:table.calibrated_0.27H"] },
];

// 规范化 JSON（与 src/rig/controlProfile.ts canonicalJson 同语义：键排序、数组保序、-0 归零）
function canonicalJson(value) {
  const seen = new Set();
  const walk = (v) => {
    if (v === null || typeof v === "string" || typeof v === "boolean") return JSON.stringify(v);
    if (typeof v === "number") {
      if (!Number.isFinite(v)) throw new Error("canonicalJson：数值必须有限");
      if (Object.is(v, -0)) v = 0;
      return JSON.stringify(v);
    }
    if (seen.has(v)) throw new Error("循环引用");
    seen.add(v);
    try {
      if (Array.isArray(v)) return `[${v.map(walk).join(",")}]`;
      const entries = Object.entries(v).filter(([, val]) => val !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      return `{${entries.map(([k, val]) => `${JSON.stringify(k)}:${walk(val)}`).join(",")}}`;
    } finally {
      seen.delete(v);
    }
  };
  return walk(value);
}

/** FNV-1a 64（与 controlProfile.ts 同语义）——档案摘要不在 JSON 里，需按 identity+controls+rules 复算 */
function fnv1a64(input) {
  const bytes = new TextEncoder().encode(input);
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (const b of bytes) {
    h ^= BigInt(b);
    h = (h * prime) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, "0");
}

function sha256(value) {
  return "sha256-" + createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

const PROFILE_DIGEST = "fnv1a64-" + fnv1a64(canonicalJson({ identity: PROFILE.identity, controls: PROFILE.controls, rules: PROFILE.rules }));

// ---------------------------------------------------------------------------
// 构建
// ---------------------------------------------------------------------------

const dummy = () => ({ setFilters() {}, setWraps() {}, getImage: () => ({ width: 4, height: 4 }), getWidth: () => 4, getHeight: () => 4, dispose() {} });
const skeletonJson = JSON.parse(readFileSync("public/assets-local/lafei_8/lafei_8.json", "utf8"));
const atlasText = readFileSync("public/assets-local/lafei_8/lafei_8.atlas.txt", "utf8");
const data = new spine.SkeletonJson(new spine.AtlasAttachmentLoader(new spine.TextureAtlas(atlasText, dummy))).readSkeletonData(skeletonJson);
const bonesByChannel = channelBones(data);

const refPose = PROFILE.identity.referencePose;
const rigRefBase = {
  modelId: PROFILE.identity.modelId,
  profileId: PROFILE.identity.profileId,
  profileDigest: PROFILE_DIGEST,
  assetDigest: PROFILE.identity.assetDigest,
  referencePoseDigest: refPose.digest,
  viewId: PROFILE.identity.viewId,
  skinId: PROFILE.identity.skinId,
  runtimeVersion: RUNTIME_VERSION,
  adapterVersion: ADAPTER_VERSION,
};

const now = new Date().toISOString();
const entries = SEEDS.map((seed) => {
  const bones = bonesByChannel[seed.channel];
  const slots = seed.channel === "head" || seed.channel === "face" ? FACE_SLOTS : new Set();
  const writes = deriveWrites(data, seed.anim, bones, slots);
  const durationMs = seed.endMs - seed.startMs;
  const entry = {
    schemaVersion: "pliette.motion-entry/1.0",
    motionId: seed.motionId,
    motionRevision: 1,
    actionId: seed.actionId,
    variantId: seed.variantId,
    status: "candidate",
    rigRef: rigRefBase,
    source: { kind: "native_slice", animationName: seed.anim, sourceStartMs: seed.startMs, sourceEndMs: seed.endMs },
    durationMs,
    channels: [seed.channel],
    writes,
    dependsOn: seed.channel === "rightArm" || seed.channel === "leftArm" ? ["ancestor:body"] : [],
    requiredCapabilities: [],
    preconditions: {
      postures: [seed.posture],
      baseAnimations: [seed.base],
      requiredResources: seed.resources ?? [],
      requiredContacts: [],
    },
    segments: {
      full: { startMs: 0, endMs: durationMs, entryBoundaryId: "enter", exitBoundaryId: "exit", interruptibleAtEnd: true },
    },
    boundaries: {
      enter: { poseClass: seed.posture, snapshotRef: `${seed.anim}@${seed.startMs}`, contacts: [], resources: [] },
      exit: { poseClass: seed.posture, snapshotRef: `${seed.anim}@${seed.endMs}`, contacts: [], resources: [] },
    },
    parameterSchema: { type: "object", properties: {}, additionalProperties: false },
    retime: { minRate: 1, maxRate: 1 },
    loop: { allowed: false, segmentId: null, maxRepeats: 1 },
    transition: { mixInMs: 150, mixOutMs: 200, maxBlendMs: 250, continuousEligible: false },
    events: [],
    provenance: {
      origin: "legacy_slice",
      sourceRef: `src/motion/library/gestures.ts#${seed.anim}[${seed.startMs}-${seed.endMs}] ${seed.label}`,
      generatorModel: null,
      promptDigest: null,
    },
    validation: { structural: "passed", trajectory: "pending", visual: "pending", evidenceRefs: [`build-seed-manifest@${now}`], reviewedAt: null },
  };
  // 摘要排除自身字段（Spec §4.4）：与运行时复算口径一致（sha256Json 去掉 contentDigest 后哈希）
  const { contentDigest: _omit, ...withoutDigest } = entry;
  entry.contentDigest = sha256(withoutDigest);
  return entry;
});

const manifest = {
  schemaVersion: "pliette.motion-manifest/1.0",
  catalogRevision: CATALOG_REVISION,
  entries,
};

const outPath = "public/motion-library/models/lafei_8/front/manifest.json";
mkdirSync(resolve(outPath, ".."), { recursive: true });
writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`已写入 ${outPath}：${entries.length} 个种子条目（全部 candidate，待轨迹/视觉验收）`);
for (const e of entries) {
  console.log(`  - ${e.motionId}  ${e.durationMs}ms  writes=${e.writes.length}  ${e.provenance.sourceRef}`);
}
