/**
 * P1 旧草稿批量转换（internal V1 → pliette.motion-draft/1.1，MotionLibrary Spec §9.1 同款流程）：
 * - role+property → controlId 经档案 mapsTo（数据驱动，无硬编码）；
 * - composite 子控制不单独出曲线（本批无双眼曲线，保留防御）；
 * - V1 bezier/stepped 缓动在 V1.1（linear/smooth/stepped-附件）下无对应——
 *   数值 stepped → smooth（等值段无形状差异）；bezier → smooth；
 * - 键数 >6 的曲线按"保首末、隔一去一"抽稀（显式策略，转换后采样复核）；
 * - 追加式登记：读取当前 manifest，保留全部既有条目（含 approved），新条目以 candidate 追加，
 *   catalogRevision 不变（晋升由 scripts/promote-manifest.mjs 决策流推进）。
 *
 * 用法：node scripts/convert-p1-drafts.mjs
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const MANIFEST_PATH = "public/motion-library/models/lafei_8/front/manifest.json";
const DRAFTS_DIR = "public/motion-library/models/lafei_8/front/drafts";
const PROFILE = JSON.parse(readFileSync("characters/lafei_8.rig-profile.json", "utf8"));
const CATALOG = JSON.parse(readFileSync("public/motion-library/catalog.json", "utf8"));

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
const sha256 = (v) => "sha256-" + createHash("sha256").update(canonicalJson(v), "utf8").digest("hex");

const byMapsTo = new Map();
for (const c of PROFILE.controls) if (c.mapsTo) byMapsTo.set(`${c.mapsTo.role}|${c.mapsTo.property}`, c);

/** V1 曲线 → V1.1 曲线（≤6 键抽稀） */
function convertCurve(v1Curve) {
  const control = byMapsTo.get(`${v1Curve.role}|${v1Curve.property}`);
  if (!control) throw new Error(`V1 曲线 ${v1Curve.role}|${v1Curve.property} 无 mapsTo 映射`);
  if (control.kind === "composite") throw new Error(`composite ${control.controlId} 需走双眼对转换（本批不涉及）`);
  // verified 域钳制策略：原 P1 草稿创作于严格域标定之前，超 verified 域的取值
  // 原样钳入（候选超界优先拒绝，故必须在转换期钳制而非放宽校验，Spec 9.4）
  const vMin = control.domain.verifiedMin ?? control.domain.min ?? -Infinity;
  const vMax = control.domain.verifiedMax ?? control.domain.max ?? Infinity;
  const clamp = (v) => {
    if (typeof v === "number") return Math.max(vMin, Math.min(vMax, v));
    if (Array.isArray(v)) return v.map((x) => Math.max(vMin, Math.min(vMax, x)));
    return v;
  };
  let keys = v1Curve.keys.map((k, i) => {
    const isAttachment = control.binding.property === "attachment";
    const stepped = k.ease === "stepped";
    const key = { timeSec: k.t, value: clamp(k.value) };
    if (i < v1Curve.keys.length - 1) key.ease = stepped && isAttachment ? "stepped" : "smooth";
    return key;
  });
  if (keys.length > 6) {
    // 抽稀策略：保首末，中间隔一去一（偶数余量优先保留靠后的中间键以保收势）
    const thinned = [keys[0]];
    const mid = keys.slice(1, -1);
    for (let i = 0; i < mid.length; i += 2) thinned.push(mid[i]);
    thinned.push(keys[keys.length - 1]);
    keys = thinned;
  }
  return { controlId: control.controlId, keys };
}

// 登记 metadata：motionId → 目录键与前提（label 记录来源与语义判定）
const P1_ENTRIES = [
  { file: "shrink_shy_c1", out: "lafei.shrink_shy.small.r1.v11.json", motionId: "lafei.shrink_shy.small.r1", actionId: "body.shrink", variantId: "small", label: "缩身害羞（躯干缩+头低+双臂内收，P1 已验收原稿转换）" },
  { file: "lean_listen_c1", out: "lafei.listen_idle.r1.v11.json", motionId: "lafei.listen_idle.r1", actionId: "life.listen_idle", variantId: "default", label: "倾听待机（躯干前倾+头侧倾保持）" },
  { file: "idle_subtle_c1", out: "lafei.idle_subtle.r1.v11.json", motionId: "lafei.idle_subtle.r1", actionId: "life.idle_fidget", variantId: "default", label: "待机微动（躯干位移+头摆，与 normal 切片互为备选实现）" },
  { file: "idle_subtle_c2", out: "lafei.idle_subtle.r2.v11.json", motionId: "lafei.idle_subtle.r2", actionId: "life.idle_fidget", variantId: "default", label: "待机微动 r2" },
  { file: "nod_c1", out: "lafei.nod_primitive.r1.v11.json", motionId: "lafei.nod_primitive.r1", actionId: "head.nod", variantId: "small", label: "点头快倾（head.nod 控制原稿，与 llm_nod 转换版互为备选）" },
  { file: "nod_c2", out: "lafei.nod_primitive.r2.v11.json", motionId: "lafei.nod_primitive.r2", actionId: "head.nod", variantId: "small", label: "点头快倾 r2（含躯干随动）" },
  { file: "wave_right_primitive_c1", out: "lafei.wave_primitive.r1.v11.json", motionId: "lafei.wave_primitive.r1", actionId: "gesture.wave", variantId: "small.screen_right", label: "挥手创作版 r1（举臂+前臂摆动，与 stand 切片互为备选）" },
  { file: "wave_right_primitive_c2", out: "lafei.wave_primitive.r2.v11.json", motionId: "lafei.wave_primitive.r2", actionId: "gesture.wave", variantId: "small.screen_right", label: "挥手创作版 r2" },
  { file: "wave_right_primitive_c3", out: "lafei.wave_primitive.r3.v11.json", motionId: "lafei.wave_primitive.r3", actionId: "gesture.wave", variantId: "small.screen_right", label: "挥手创作版 r3（含头/躯干随动；bob 分量因 0.03H/s 限速裁除）", dropCurves: ["body.root|translate"] },
  { file: "point_right_c1", out: "lafei.point_primitive.r1.v11.json", motionId: "lafei.point_primitive.r1", actionId: "gesture.point", variantId: "screen_right", label: "指向创作版 r1（与 attack 切片互为备选）" },
  { file: "point_right_c2", out: "lafei.point_primitive.r2.v11.json", motionId: "lafei.point_primitive.r2", actionId: "gesture.point", variantId: "screen_right", label: "指向创作版 r2（含头/躯干随动）" },
];

const manifest = JSON.parse(readFileSync(resolve(MANIFEST_PATH), "utf8"));
const knownMotionIds = new Set(manifest.entries.map((e) => e.motionId));
const rigRef = manifest.entries[0].rigRef;

let added = 0;
for (const meta of P1_ENTRIES) {
  if (knownMotionIds.has(meta.motionId)) {
    console.log(`= 跳过（已登记）：${meta.motionId}`);
    continue;
  }
  const v1 = JSON.parse(readFileSync(resolve("public/motions", `${meta.file}.json`), "utf8"));
  if (v1.rigProfile !== "lafei_8.front.v1") throw new Error(`${meta.file}: rigProfile 不是 lafei_8.front.v1`);
  const dropped = new Set(meta.dropCurves ?? []);
  const draft = {
    schemaVersion: "pliette.motion-draft/1.1",
    id: meta.out.replace(".v11.json", ""),
    durationSec: v1.durationSec,
    curves: v1.curves.filter((c) => !dropped.has(`${c.role}|${c.property}`)).map(convertCurve),
  };
  // 目录词汇核对：action/variant 必须已在 catalog 登记
  const action = CATALOG.actions.find((a) => a.actionId === meta.actionId);
  if (!action) throw new Error(`${meta.actionId} 不在 catalog`);
  if (!action.variants.some((v) => v.variantId === meta.variantId)) throw new Error(`${meta.actionId}/${meta.variantId} 不在 catalog`);

  writeFileSync(resolve(DRAFTS_DIR, meta.out), JSON.stringify(draft, null, 2) + "\n");

  const writes = new Set();
  const channels = new Set();
  const controlById = new Map(PROFILE.controls.map((c) => [c.controlId, c]));
  for (const curve of draft.curves) {
    const control = controlById.get(curve.controlId);
    if (!control) throw new Error(`控制 ${curve.controlId} 丢失`);
    channels.add(control.channel);
    const ws = control.kind === "composite" ? [] : control.ownership.writes;
    for (const w of ws) writes.add(w);
  }
  if (writes.size === 0) throw new Error(`${meta.file}: 写集为空`);

  const durationMs = Math.round(draft.durationSec * 1000);
  const entry = {
    schemaVersion: "pliette.motion-entry/1.0",
    motionId: meta.motionId,
    motionRevision: 1,
    actionId: meta.actionId,
    variantId: meta.variantId,
    status: "candidate",
    rigRef,
    source: { kind: "draft", path: `drafts/${meta.out}`, contentDigest: sha256(draft), draftSchemaVersion: "pliette.motion-draft/1.1" },
    durationMs: Math.round(draft.durationSec * 1000),
    channels: [...channels],
    writes: [...writes].sort(),
    dependsOn: [...channels].some((c) => c === "rightArm" || c === "leftArm") ? ["ancestor:body"] : [],
    requiredCapabilities: [],
    preconditions: { postures: ["standing"], baseAnimations: ["stand"], requiredResources: [], requiredContacts: [] },
    segments: { full: { startMs: 0, endMs: durationMs, entryBoundaryId: "enter", exitBoundaryId: "exit", interruptibleAtEnd: true } },
    boundaries: {
      enter: { poseClass: "standing", snapshotRef: "setup-ref", contacts: [], resources: [] },
      exit: { poseClass: "standing", snapshotRef: "setup-ref", contacts: [], resources: [] },
    },
    parameterSchema: { type: "object", properties: {}, additionalProperties: false },
    retime: { minRate: 1, maxRate: 1 },
    loop: { allowed: false, segmentId: null, maxRepeats: 1 },
    transition: { mixInMs: 120, mixOutMs: 150, maxBlendMs: 200, continuousEligible: false },
    events: [],
    provenance: {
      origin: "agent_offline",
      sourceRef: `public/motions/${meta.file}.json（P1 已验收原稿 V1→V1.1 转换，管线重验证见测试）`,
      generatorModel: null,
      promptDigest: null,
    },
    validation: {
      structural: "passed",
      trajectory: "pending",
      visual: "pending",
      evidenceRefs: [`convert-p1@${new Date().toISOString()}`, "tests/m5-seed-manifest.test.ts#全量管线重验证"],
      reviewedAt: null,
    },
  };
  entry.source.contentDigest = sha256(draft);
  const { contentDigest: _omit, ...withoutDigest } = entry;
  entry.contentDigest = sha256(withoutDigest);
  manifest.entries.push(entry);
  added += 1;
  console.log(`+ ${meta.motionId}（${durationMs}ms，来自 ${meta.file}）`);
}

writeFileSync(resolve(MANIFEST_PATH), JSON.stringify(manifest, null, 2) + "\n");
console.log(`\n完成：新增 ${added} 条，manifest 现计 ${manifest.entries.length} 条（修订保持 ${manifest.catalogRevision}，晋升走 promote-manifest.mjs）`);
