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
  const face = new Set(["eye_L", "eye_R"].filter((n) => names.includes(n)));
  return { head, rightArm, leftArm, torso, face };
}

const FACE_SLOTS = new Set(["eye_L", "eye_R", "meimao1", "hongyun", "sleep2", "bushuang1", "bushuang2", "eye_L_blink", "eye_R_blink", "mouth", "hand_L2", "hand_R2"]);

/** 从真实源动画派生通道写集（Spec §4.4：不可只凭通道名推定不冲突） */
function deriveWrites(data, animName, bones, slots) {
  const anim = data.findAnimation(animName);
  if (!anim) throw new Error(`源动画不存在：${animName}`);
  const writes = new Set();
  const allNames = new Set(data.bones.map((b) => b.name));
  for (const tl of anim.timelines) {
    const ctor = tl.constructor.name;
    if (ctor === "RotateTimeline" || ctor === "TranslateTimeline" || ctor === "ScaleTimeline" || ctor === "ShearTimeline") {
      const name = data.bones[tl.boneIndex]?.name;
      // base 通道（整段基础动画）接受全部骨骼
      const hit = bones === "ALL" || (bones && bones.has(name));
      if (name && hit) writes.add(`bone:${name}/${ctor.replace("Timeline", "").toLowerCase()}`);
    } else if (ctor === "AttachmentTimeline" || ctor === "ColorTimeline" || ctor === "TwoColorTimeline" || ctor === "DeformTimeline") {
      const slot = data.slots[tl.slotIndex]?.name;
      const hit = slots === "ALL" || (slots && slots.has(slot));
      if (slot && hit) writes.add(`slot:${slot}/${ctor.replace("Timeline", "").toLowerCase()}`);
    }
  }
  if (writes.size === 0) throw new Error(`${animName} 在给定通道集合上没有可过滤 timeline`);
  return [...writes].sort();
}

// ---------------------------------------------------------------------------
// 种子迁移表（Spec §9.1）
// ---------------------------------------------------------------------------

const SEEDS = [
  // 窗口与混合参数经 2026-09-14 夜间视觉精调定稿（证据：experiments/motion-library/tuning/，台账 TUNING-LOG.md）
  { motionId: "lafei.wave.small_screen_right", actionId: "gesture.wave", variantId: "small.screen_right", anim: "stand", startMs: 5850, endMs: 6900, channel: "rightArm", posture: "standing", base: "stand", mixInMs: 150, mixOutMs: 200, label: "挥手（右手举臂摇晃；5.85 起抬、6.9 回落，避开 6.8 后基础层弯倾段）" },
  { motionId: "lafei.raise_hand.screen_left", actionId: "gesture.raise_hand", variantId: "screen_left", anim: "stand", startMs: 12900, endMs: 14500, channel: "leftArm", posture: "standing", base: "stand", mixInMs: 150, mixOutMs: 200, label: "短促举手（旧 wave/leftArm 标签语义纠正；含完整抬-保持-落弧线）" },
  { motionId: "lafei.reaction.dizzy.small", actionId: "reaction.dizzy", variantId: "small", anim: "yun", startMs: 400, endMs: 1750, channel: "head", posture: "standing", base: "stand", mixInMs: 120, mixOutMs: 200, label: "晕乎乎（带头部摇摆与螺旋眼；1.55 头近中位时混出回神）" },
  { motionId: "lafei.reaction.happy.small", actionId: "reaction.happy", variantId: "small", anim: "touch", startMs: 0, endMs: 670, channel: "head", posture: "standing", base: "stand", mixInMs: 120, mixOutMs: 150, label: "被摸头开心（眯眼+眉毛；附件经混出恢复键归位）" },
  { motionId: "lafei.reaction.shy.small", actionId: "reaction.shy", variantId: "small", anim: "sit", startMs: 0, endMs: 1330, channel: "head", posture: "standing", base: "stand", mixInMs: 150, mixOutMs: 200, label: "低头害羞（眼睑下垂+腮红；源为 sit，head 通道动作站姿合成已验证，坐姿复验见制作计划）" },
  { motionId: "lafei.pump.screen_right", actionId: "gesture.pump", variantId: "screen_right", anim: "victory", startMs: 3000, endMs: 4400, channel: "rightArm", posture: "standing", base: "stand", mixInMs: 150, mixOutMs: 200, label: "庆祝挥拳（含抬拳 3.0-3.3、挥击 3.6-4.0、收落至 4.4）" },
  { motionId: "lafei.idle_fidget.default", actionId: "life.idle_fidget", variantId: "default", anim: "normal", startMs: 500, endMs: 2500, channel: "head", posture: "standing", base: "stand", mixInMs: 150, mixOutMs: 200, label: "待机小动作（头部轻微摇摆；原窗口即合理）" },
  { motionId: "lafei.point.screen_right", actionId: "gesture.point", variantId: "screen_right", anim: "attack", startMs: 100, endMs: 800, channel: "rightArm", posture: "standing", base: "stand", mixInMs: 120, mixOutMs: 150, label: "右臂前伸指向（含抬臂 0.1-0.25、前伸保持 0.25-0.7）" },
  { motionId: "lafei.touch_table.screen_right", actionId: "contact.touch_table", variantId: "screen_right", anim: "victory", startMs: 700, endMs: 1200, channel: "rightArm", posture: "standing", base: "stand", mixInMs: 150, mixOutMs: 250, label: "触碰矮桌（窗口即已标定稳定接触段 0.27H，不推广任意桌；混合参数与已验收触碰场景一致）", resources: ["scene:table.calibrated_0.27H"] },

  // P0 扩展族（2026-09-15 凌晨批次，勘探+视觉精调；台账 TUNING-LOG.md §扩展族）
  { motionId: "lafei.head_shake.normal", actionId: "head.shake", variantId: "normal", anim: "dance", startMs: 0, endMs: 1170, channel: "head", posture: "standing", base: "stand", mixInMs: 100, mixOutMs: 150, label: "摇头（dance 单眼眨+左右大幅摆头，闭眼笑附件随行）" },
  { motionId: "lafei.reaction_sleepy.small", actionId: "reaction.sleepy", variantId: "small", anim: "stand", startMs: 7550, endMs: 12100, channel: "head", posture: "standing", base: "stand", mixInMs: 120, mixOutMs: 150, label: "打瞌睡反应（低头闭眼-走神-回正，源内自带完整过渡，避开 7.4 前眨眼键）" },
  { motionId: "lafei.head_lower.small", actionId: "head.lower", variantId: "small", anim: "stand", startMs: 7550, endMs: 8300, channel: "head", posture: "standing", base: "stand", mixInMs: 120, mixOutMs: 300, label: "低头（源内垂下 7.55-8.0，混出托底抬头；裁短自 sleepy 全弧）" },
  { motionId: "lafei.life_blink.paired", actionId: "life.blink", variantId: "paired", anim: "normal", startMs: 3750, endMs: 4250, channel: "face", posture: "standing", base: "stand", mixInMs: 50, mixOutMs: 80, label: "眨眼（normal 双眨键 3.83/3.93/4.03/4.13，纯 face 通道）" },
  { motionId: "lafei.eyes_squeeze.paired", actionId: "face.eyes_squeeze", variantId: "paired", anim: "touch", startMs: 170, endMs: 670, channel: "face", posture: "standing", base: "stand", mixInMs: 50, mixOutMs: 100, label: "眯眼（touch 的 > < 眯眼+眉毛，纯 face 通道无头部动作）" },
  { motionId: "lafei.life_idle.default", actionId: "life.idle", variantId: "default", anim: "stand", startMs: 0, endMs: 20330, channel: "base", kind: "native_clip", posture: "standing", base: "stand", mixInMs: 150, mixOutMs: 200, label: "自然待机（原生 stand 全段封装；首尾同相位可循环）", loop: { allowed: true, segmentId: "full", maxRepeats: 16 } },
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
  const bones = seed.channel === "base" ? "ALL" : bonesByChannel[seed.channel];
  const slots = seed.channel === "head" || seed.channel === "face" ? FACE_SLOTS : seed.channel === "base" ? "ALL" : new Set();
  const writes = deriveWrites(data, seed.anim, bones, slots);
  const durationMs = seed.endMs - seed.startMs;
  const loop = seed.loop ?? { allowed: false, segmentId: null, maxRepeats: 1 };
  const entry = {
    schemaVersion: "pliette.motion-entry/1.0",
    motionId: seed.motionId,
    motionRevision: 1,
    actionId: seed.actionId,
    variantId: seed.variantId,
    status: "candidate",
    rigRef: rigRefBase,
    source: { kind: seed.kind ?? "native_slice", animationName: seed.anim, sourceStartMs: seed.startMs, sourceEndMs: seed.endMs },
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
    loop,
    transition: { mixInMs: seed.mixInMs ?? 150, mixOutMs: seed.mixOutMs ?? 200, maxBlendMs: Math.max(seed.mixInMs ?? 150, seed.mixOutMs ?? 200) + 50, continuousEligible: false },
    events: [],
    provenance: {
      origin: "legacy_slice",
      sourceRef: `src/motion/library/gestures.ts#${seed.anim}[${seed.startMs}-${seed.endMs}] ${seed.label}`,
      generatorModel: null,
      promptDigest: null,
    },
    validation: {
      structural: "passed",
      trajectory: "pending",
      visual: "pending",
      // 视觉相位截图见 experiments/motion-library/tuning/（本地保留），台账 TUNING-LOG.md
      evidenceRefs: [`build-seed-manifest@${now}`, `tuning-log#视觉精调`],
      reviewedAt: null,
    },
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

// ---------------------------------------------------------------------------
// 内部 V1 草稿 → pliette.motion-draft/1.1 转换（llm_nod：点头=头部快倾，rig 语义）
// 映射全部数据驱动：role+property → controlId 经 mapsTo；双眼附件对 → face.eyes.pair
// 枚举键经 compositeEntries 反查。转换产物由 tests/m5-seed-manifest.test.ts 做
// 七步管线重验证（编译+隔离采样），通过才视为有效登记。
// ---------------------------------------------------------------------------

function convertLlmNodToV11() {
  const v1 = JSON.parse(readFileSync("public/motions/llm_nod.json", "utf8"));
  if (v1.rigProfile !== "lafei_8.front.v1") throw new Error("rigProfile 不是 lafei_8.front.v1，映射表不适用");

  // mapsTo：(role, property) → controlId
  const byMapsTo = new Map();
  for (const c of PROFILE.controls) {
    if (c.mapsTo) byMapsTo.set(`${c.mapsTo.role}|${c.mapsTo.property}`, c);
  }
  // composite 子控制集合：它们经组合控制表达，不单独出曲线
  const subControls = new Set();
  for (const c of PROFILE.controls) {
    if (c.kind === "composite") for (const sub of c.binding.compositeOf ?? []) subControls.add(sub);
  }
  const pairControl = PROFILE.controls.find((c) => c.controlId === "face.eyes.pair");
  const subLeft = pairControl.binding.compositeOf[0]; // face.eyeL.state
  const subRight = pairControl.binding.compositeOf[1]; // face.eyeR.state
  const pairLookup = new Map();
  for (const entry of pairControl.binding.compositeEntries) {
    const l = entry.targets.find((t) => t.controlId === subLeft)?.value;
    const r = entry.targets.find((t) => t.controlId === subRight)?.value;
    if (l != null && r != null) pairLookup.set(`${l}|${r}`, entry.key);
  }

  const curves = [];
  for (const curve of v1.curves) {
    const control = byMapsTo.get(`${curve.role}|${curve.property}`);
    if (!control) throw new Error(`V1 曲线 ${curve.role}|${curve.property} 没有可映射的 controlId`);
    // composite 子控制：由组合枚举曲线统一表达（下方双眼对处理）
    if (subControls.has(control.controlId)) continue;
    if (control.kind === "composite") {
      if (curve.property !== "attachment") throw new Error("composite 映射只支持附件曲线");
      continue; // 双眼对在下方统一处理
    }
    curves.push({
      controlId: control.controlId,
      keys: curve.keys.map((k, i) => {
        const key = { timeSec: k.t, value: k.value };
        if (i < curve.keys.length - 1) key.ease = k.ease === "stepped" ? "stepped" : "smooth";
        return key;
      }),
    });
  }
  // 双眼对 → face.eyes.pair
  const leftCurve = v1.curves.find((c) => c.role === "face.eyes");
  const rightCurve = v1.curves.find((c) => c.role === "face.eyeR");
  if (leftCurve && rightCurve && pairControl) {
    const times = [...new Set([...leftCurve.keys.map((k) => k.t), ...rightCurve.keys.map((k) => k.t)])].sort((a, b) => a - b);
    const valueAt = (curve, t) => {
      let v = curve.keys[0].value;
      for (const k of curve.keys) if (k.t <= t + 1e-9) v = k.value;
      return v;
    };
    const keys = times.map((t, i) => {
      const pair = `${valueAt(leftCurve, t)}|${valueAt(rightCurve, t)}`;
      const enumKey = pairLookup.get(pair);
      if (enumKey == null) throw new Error(`双眼附件对 ${pair} 在 compositeEntries 中无对应枚举键`);
      const key = { timeSec: t, value: enumKey };
      if (i < times.length - 1) key.ease = "stepped";
      return key;
    });
    curves.push({ controlId: "face.eyes.pair", keys });
  }
  // 协议形态：首键 t=0、末键=durationSec、附件/枚举段 stepped（validateV11 会全量重验）
  // Retime 策略（转换器显式规则，非校验放宽）：V1 的 bezier 缓动在 V1.1（linear/smooth）下
  // 峰值速率实测 209.6°/s > head.nod 限速 200°/s —— 统一放慢 1.25 倍（0.8s→1.0s，168°/s），
  // 由测试采样复核。
  const RATE_SCALE = 1.25;
  const durationSec = Math.round(v1.durationSec * RATE_SCALE * 100) / 100;
  for (const curve of curves) {
    for (const key of curve.keys) key.timeSec = Math.round(key.timeSec * RATE_SCALE * 100) / 100;
  }
  return {
    schemaVersion: "pliette.motion-draft/1.1",
    id: "lafei.nod.v11",
    durationSec,
    curves,
  };
}

const draftDirs = resolve("public/motion-library/models/lafei_8/front/drafts");
mkdirSync(draftDirs, { recursive: true });
const nodDraft = convertLlmNodToV11();
writeFileSync(resolve(draftDirs, "lafei.nod.v11.json"), JSON.stringify(nodDraft, null, 2) + "\n");
console.log(`已写入 drafts/lafei.nod.v11.json（V1→V1.1 转换，待管线重验证）`);

// 草稿来源条目：登记转换后的 nod（candidate；管线重验证见测试）
{
  const draftPath = "drafts/lafei.nod.v11.json";
  const entry = {
    schemaVersion: "pliette.motion-entry/1.0",
    motionId: "lafei.head_nod.small",
    motionRevision: 1,
    actionId: "head.nod",
    variantId: "small",
    status: "candidate",
    rigRef: rigRefBase,
    source: { kind: "draft", path: draftPath, contentDigest: "", draftSchemaVersion: "pliette.motion-draft/1.1" },
    durationMs: Math.round(nodDraft.durationSec * 1000),
    channels: ["head", "face"],
    writes: ["bone:face/rotate", "slot:eye_L/attachment", "slot:eye_R/attachment"],
    dependsOn: [],
    requiredCapabilities: [],
    preconditions: { postures: ["standing"], baseAnimations: ["stand"], requiredResources: [], requiredContacts: [] },
    segments: {
      full: { startMs: 0, endMs: Math.round(nodDraft.durationSec * 1000), entryBoundaryId: "enter", exitBoundaryId: "exit", interruptibleAtEnd: true },
    },
    boundaries: {
      enter: { poseClass: "standing", snapshotRef: "stand@0", contacts: [], resources: [] },
      exit: { poseClass: "standing", snapshotRef: "stand@0", contacts: [], resources: [] },
    },
    parameterSchema: { type: "object", properties: {}, additionalProperties: false },
    retime: { minRate: 1, maxRate: 1 },
    loop: { allowed: false, segmentId: null, maxRepeats: 1 },
    transition: { mixInMs: 120, mixOutMs: 150, maxBlendMs: 200, continuousEligible: false },
    events: [],
    provenance: {
      origin: "agent_offline",
      sourceRef: "public/motions/llm_nod.json（MiMo V1.1 协议产物；V1 内部格式转换，七步管线重验证见测试）",
      generatorModel: "mimo-v2.5",
      promptDigest: "experiments/motion-guide/run-llm-mimo-8s",
    },
    validation: {
      structural: "passed",
      trajectory: "pending",
      visual: "pending",
      evidenceRefs: [`convert-llm-nod@${now}`, "tests/m5-seed-manifest.test.ts#head.nod 管线重验证"],
      reviewedAt: null,
    },
  };
  // 草稿文件摘要（canonical JSON 语义与运行时 sha256Json 一致）
  entry.source.contentDigest = sha256(nodDraft);
  // 条目级摘要（排除自身 contentDigest 字段，与其它种子同口径）
  const { contentDigest: _omitEntryDigest, ...entryWithoutDigest } = entry;
  entry.contentDigest = sha256(entryWithoutDigest);
  entries.push(entry);
}

const outPath = "public/motion-library/models/lafei_8/front/manifest.json";
mkdirSync(resolve(outPath, ".."), { recursive: true });
writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`已写入 ${outPath}：${entries.length} 个种子条目（全部 candidate，待轨迹/视觉验收）`);
for (const e of entries) {
  console.log(`  - ${e.motionId}  ${e.durationMs}ms  writes=${e.writes.length}  ${e.provenance.sourceRef}`);
}
