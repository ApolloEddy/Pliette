/**
 * ControlProfile：有证据的角色控制档案（动作指导书 Spec 3.1 / 3.4 / 6.3）。
 *
 * 与 RigProfile 的关系：RigProfile 保持"语义角色 → 真实骨骼"的绑定层；
 * ControlProfile 是其上的档案层——档案身份、开放控制器、规则单一来源与证据记录。
 * 外部协议（MotionDraft V1.1）的 controlId 经 mapsTo 唯一映射回内部 role+property，
 * 不建立第二套播放器（Spec 8.2）。
 *
 * 本模块不依赖 spine 运行时，纯数据与确定性计算，便于 Node 环境单测。
 */

export type ControlKind = "localFk" | "ikTarget" | "slotState" | "composite";
export type ControlStatus = "unknown" | "candidate" | "verified" | "rejected";
export type RuleType =
  | "range"
  | "rateLimit"
  | "requiresVariant"
  | "exclusiveWrite"
  | "requiresCapability"
  | "contactDependency";
export type CurveProperty = "rotate" | "translate" | "scale" | "attachment";

export interface ControlInput {
  type: "scalar" | "vec2" | "enum";
  /** "deg"（setup 相对偏移角）| "H"（标定身高比例）| "ratio" | "-"（枚举） */
  unit: string;
  /** 参考值：归零语义的基准（Spec 4.2） */
  refValue: number | [number, number] | string;
  positiveLooksLike: string;
  negativeLooksLike: string;
  default: number | [number, number] | string;
  /** type=enum 时必填：允许的附件名（来自实际 Skin，不猜测） */
  enumValues?: string[];
}

export interface ControlBinding {
  /** localFk/ikTarget/composite 子项时为真实骨名 */
  bone?: string;
  /** slotState 时为 Slot 名 */
  slot?: string;
  property: CurveProperty;
  /** 语义"正方向"换算到骨骼局部正角的符号（标定产物，非镜像公式） */
  sign?: 1 | -1;
  /** vec2 位移空间；V1 只开放绑定骨的父局部空间（Spec 4.2） */
  space?: "parentLocal";
  /** composite：引用已登记的确定性子控制器 */
  compositeOf?: string[];
  /**
   * composite 枚举映射表（Spec 4.1：V1 composite 通过登记的固定映射暴露，不接受 LLM 拼装）。
   * key=语义枚举值，targets=各子控制器的固定目标值。必须覆盖 input.enumValues 全集。
   */
  compositeEntries?: Array<{ key: string; targets: Array<{ controlId: string; value: number | string }> }>;
}

export interface ControlDomain {
  /** 数值合法域（程序硬边界） */
  min?: number;
  max?: number;
  /** 已验证域（标定产物；超出执行但记诊断——是否允许由规则决定） */
  verifiedMin?: number;
  verifiedMax?: number;
}

export interface ControlRate {
  /** 每秒最大变化量（单位同 input；必须来自标定，不得从预算表推导，Spec 8.4） */
  maxPerSec?: number;
}

export interface ControlOwnership {
  /** 真实执行属性（同 Timeline 属性组按组仲裁，Spec 4.3），如 "bone:hand_R/rotate" */
  writes: string[];
  /** 祖先/约束/接触等间接影响，如 "ancestor:body"、"ik:leg_L" */
  dependsOn: string[];
  affectedAttachments?: string[];
  /** 资源与接触依赖，如 "contact:face"（无证据不得登记） */
  resources?: string[];
}

export interface ControlDefinition {
  controlId: string;
  semanticPart: string;
  kind: ControlKind;
  channel: string;
  input: ControlInput;
  binding: ControlBinding;
  /**
   * 到内部 MotionDraft role+property 的唯一映射（Spec 8.2）。
   * composite 控制展开为多条子曲线，没有单一 mapsTo（翻译时按 compositeOf 展开）。
   */
  mapsTo?: { role: string; property: CurveProperty };
  domain: ControlDomain;
  rate?: ControlRate;
  ownership: ControlOwnership;
  /** 一句话行为解释：调大/调小/归零分别看起来怎样（Spec 3.4） */
  behavior: string;
  /** 适用条件：视图/姿态/基础动画相位等（未验证的写 unknown） */
  conditions?: string[];
  evidenceIds: string[];
  status: ControlStatus;
}

export interface RuleDefinition {
  ruleId: string;
  type: RuleType;
  /** 目标：controlId / 通道 / 属性组 / "*" */
  target: string;
  /** 结构化条件：只能被确定性解释器计算，绝不执行表达式代码（Spec 6.3） */
  condition: Record<string, unknown>;
  params: Record<string, number | string | boolean | number[]>;
  severity: "error" | "warn";
  explanation: string;
  evidenceRefs: string[];
  version: number;
}

export interface EvidenceRecord {
  evidenceId: string;
  kind: "static" | "probe" | "combo" | "video" | "review";
  /** 探针输入（控制 + 值序列）或静态检查描述 */
  input: string;
  refPose: string;
  skinView: string;
  /** 基础动画及采样时刻 */
  baseAnim?: string;
  runtimeVersion: string;
  /** 最终属性采样的紧凑记录 */
  samples?: string;
  /** 本地媒体路径（截图/录像不入库时路径仍如实记录） */
  mediaPath?: string;
  observation: string;
  reviewer: string;
  /** 适用范围：verified 仅表示记录条件通过当前验收（Spec 5.2） */
  scope: string;
  status: ControlStatus;
  /** 绝对日期 YYYY-MM-DD */
  date: string;
}

export interface CoordinateConvention {
  /** 旋转语义：度、相对档案参考姿态的偏移 */
  angle: string;
  /** 位移语义：H 比例与空间 */
  translation: string;
  /** 角色自身左右与屏幕左右的关系 */
  leftRight: string;
}

export interface ControlProfileIdentity {
  modelId: string;
  profileId: string;
  profileRevision: number;
  /** "sha256-<hex>"，由 scripts/compute-asset-digest.mjs 对实际服务文件计算（Spec 3.1） */
  assetDigest: string;
  runtimeRef: {
    exportVersion: string;
    runtimeVersion: string;
    /** 锁定提交/标签或 vendored 路径 */
    runtimeSource: string;
    adapterVersion: string;
  };
  viewId: string;
  skinId: string;
  orientationVariant?: string;
  referencePose: {
    poseId: string;
    description: string;
    /** 对参考姿态参数内容的确定性摘要（如全部骨骼 setup 变换） */
    digest: string;
  };
  heightUnits: number | null;
  coordinateConvention: CoordinateConvention;
}

export interface ControlProfile {
  identity: ControlProfileIdentity;
  controls: ControlDefinition[];
  rules: RuleDefinition[];
  evidence: EvidenceRecord[];
  /** 由 identity+controls+rules 计算的确定性摘要；evidence 增补不改变它 */
  profileDigest: string;
}

// ---------------------------------------------------------------------------
// 确定性摘要：canonical JSON + FNV-1a 64（变更检测用途，非安全摘要）
// ---------------------------------------------------------------------------

/** 键排序、数组保序、-0 归一为 0、仅允许 JSON 类型的规范化序列化。 */
export function canonicalJson(value: unknown): string {
  const seen = new Set<object>();
  const walk = (v: unknown): string => {
    if (v === null || typeof v === "string" || typeof v === "boolean") return JSON.stringify(v);
    if (typeof v === "number") {
      if (!Number.isFinite(v)) throw new Error("canonicalJson：数值必须有限（档案中不允许 NaN/Infinity）");
      if (Object.is(v, -0)) v = 0;
      return JSON.stringify(v);
    }
    if (Array.isArray(v)) return `[${v.map(walk).join(",")}]`;
    if (typeof v === "object") {
      if (seen.has(v as object)) throw new Error("canonicalJson：不支持循环引用");
      seen.add(v as object);
      const entries = Object.entries(v as Record<string, unknown>)
        .filter(([, val]) => val !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      const out = `{${entries.map(([k, val]) => `${JSON.stringify(k)}:${walk(val)}`).join(",")}}`;
      seen.delete(v as object);
      return out;
    }
    throw new Error(`canonicalJson：不支持的类型 ${typeof v}`);
  };
  return walk(value);
}

/** FNV-1a 64 位十六进制（16 字符）。变更检测用途：输入变一位则摘要变。 */
export function fnv1a64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (const b of bytes) {
    h ^= BigInt(b);
    h = (h * prime) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, "0");
}

export function digestOf(value: unknown): string {
  return `fnv1a64-${fnv1a64(canonicalJson(value))}`;
}

/** 计算档案摘要：identity + controls + rules（evidence 增补不影响，Spec 3.1）。 */
export function computeProfileDigest(p: Omit<ControlProfile, "profileDigest">): string {
  return digestOf({ identity: p.identity, controls: p.controls, rules: p.rules });
}

// ---------------------------------------------------------------------------
// 参考姿态摘要：全部骨骼 setup 变换的确定性摘要（对任何有 name/x/y/rotation/scale 的骨架可用）
// ---------------------------------------------------------------------------

export interface PoseBoneLike {
  name: string;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

export function computeSetupPoseDigest(bones: readonly PoseBoneLike[]): string {
  return digestOf({
    pose: "setup",
    bones: bones.map((b) => ({ n: b.name, x: b.x, y: b.y, r: b.rotation, sx: b.scaleX, sy: b.scaleY })),
  });
}

// ---------------------------------------------------------------------------
// 严格解析：未知字段拒绝（Spec 8.1 精神同样适用于档案源，防漂移）
// ---------------------------------------------------------------------------

export interface ParseIssue {
  path: string;
  message: string;
}

export class ControlProfileParseError extends Error {
  constructor(public issues: ParseIssue[]) {
    super(`ControlProfile 解析失败：${issues.map((i) => `${i.path} ${i.message}`).join("; ")}`);
  }
}

function checkKeys(obj: Record<string, unknown>, allowed: string[], path: string, issues: ParseIssue[]): void {
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) issues.push({ path: `${path}.${k}`, message: "未知字段（拒绝）" });
  }
}

function expectString(v: unknown, path: string, issues: ParseIssue[]): string {
  if (typeof v !== "string" || v.length === 0) issues.push({ path, message: "必须为非空字符串" });
  return v as string;
}

function expectNumber(v: unknown, path: string, issues: ParseIssue[]): number {
  if (typeof v !== "number" || !Number.isFinite(v)) issues.push({ path, message: "必须为有限数值" });
  return v as number;
}

const CONTROL_KEYS = [
  "controlId", "semanticPart", "kind", "channel", "input", "binding", "mapsTo",
  "domain", "rate", "ownership", "behavior", "conditions", "evidenceIds", "status",
];
const INPUT_KEYS = ["type", "unit", "refValue", "positiveLooksLike", "negativeLooksLike", "default", "enumValues"];
const BINDING_KEYS = ["bone", "slot", "property", "sign", "space", "compositeOf", "compositeEntries"];
const OWNERSHIP_KEYS = ["writes", "dependsOn", "affectedAttachments", "resources"];
const RULE_KEYS = ["ruleId", "type", "target", "condition", "params", "severity", "explanation", "evidenceRefs", "version"];
const EVIDENCE_KEYS = [
  "evidenceId", "kind", "input", "refPose", "skinView", "baseAnim", "runtimeVersion",
  "samples", "mediaPath", "observation", "reviewer", "scope", "status", "date",
];

/**
 * 解析并校验档案源 JSON（结构 + 引用完整性）。
 * 抛 ControlProfileParseError（含全部问题）；成功返回带 profileDigest 的完整档案。
 */
export function parseControlProfile(raw: unknown): ControlProfile {
  const issues: ParseIssue[] = [];
  if (typeof raw !== "object" || raw === null) throw new ControlProfileParseError([{ path: "$", message: "必须为对象" }]);
  const o = raw as Record<string, unknown>;
  checkKeys(o, ["identity", "controls", "rules", "evidence"], "$", issues);

  // --- identity ---
  const id = (o.identity ?? {}) as Record<string, unknown>;
  checkKeys(
    id,
    ["modelId", "profileId", "profileRevision", "assetDigest", "runtimeRef", "viewId", "skinId",
      "orientationVariant", "referencePose", "heightUnits", "coordinateConvention"],
    "$.identity", issues,
  );
  const rt = (id.runtimeRef ?? {}) as Record<string, unknown>;
  checkKeys(rt, ["exportVersion", "runtimeVersion", "runtimeSource", "adapterVersion"], "$.identity.runtimeRef", issues);
  const rp = (id.referencePose ?? {}) as Record<string, unknown>;
  checkKeys(rp, ["poseId", "description", "digest"], "$.identity.referencePose", issues);
  const cc = (id.coordinateConvention ?? {}) as Record<string, unknown>;
  checkKeys(cc, ["angle", "translation", "leftRight"], "$.identity.coordinateConvention", issues);

  // --- controls ---
  const controlsRaw = Array.isArray(o.controls) ? o.controls : [];
  if (!Array.isArray(o.controls)) issues.push({ path: "$.controls", message: "必须为数组" });
  const controls: ControlDefinition[] = [];
  const byId = new Map<string, ControlDefinition>();
  const byWrites = new Map<string, string>();
  for (let i = 0; i < controlsRaw.length; i++) {
    const c = controlsRaw[i] as Record<string, unknown>;
    const path = `$.controls[${i}]`;
    checkKeys(c, CONTROL_KEYS, path, issues);
    const controlId = expectString(c.controlId, `${path}.controlId`, issues);
    if (byId.has(controlId)) issues.push({ path, message: `controlId 重复：${controlId}` });
    const input = (c.input ?? {}) as Record<string, unknown>;
    checkKeys(input, INPUT_KEYS, `${path}.input`, issues);
    if (input.type === "enum" && !Array.isArray(input.enumValues)) {
      issues.push({ path: `${path}.input.enumValues`, message: "enum 输入必须给出允许附件集合" });
    }
    const binding = (c.binding ?? {}) as Record<string, unknown>;
    checkKeys(binding, BINDING_KEYS, `${path}.binding`, issues);
    const isComposite = c.kind === "composite";
    if (isComposite) {
      const sub = Array.isArray(binding.compositeOf) ? (binding.compositeOf as string[]) : [];
      if (sub.length === 0) issues.push({ path: `${path}.binding.compositeOf`, message: "composite 必须引用子控制器" });
      if (typeof binding.bone === "string") issues.push({ path: `${path}.binding.bone`, message: "composite 不直接绑定骨骼" });
      // 枚举 composite：映射表必须覆盖枚举全集（双射），目标必须在 compositeOf 内
      if (input.type === "enum") {
        const entries = Array.isArray(binding.compositeEntries) ? (binding.compositeEntries as { key: string }[]) : [];
        const enumVals = (input.enumValues as string[]) ?? [];
        const keys = new Set(entries.map((e) => e.key));
        for (const ev of enumVals) {
          if (!keys.has(ev)) issues.push({ path: `${path}.binding.compositeEntries`, message: `缺少枚举值 ${ev} 的映射` });
        }
        for (const ev of keys) {
          if (!enumVals.includes(ev)) issues.push({ path: `${path}.binding.compositeEntries`, message: `映射键 ${ev} 不在枚举集合内` });
        }
        for (const e of entries) {
          for (const t of ((e as { targets?: { controlId?: string }[] }).targets ?? [])) {
            if (typeof t.controlId === "string" && !sub.includes(t.controlId)) {
              issues.push({ path: `${path}.binding.compositeEntries`, message: `映射目标 ${t.controlId} 不在 compositeOf 中` });
            }
          }
        }
      }
    } else {
      if (binding.property !== "attachment" && typeof binding.bone !== "string") {
        issues.push({ path: `${path}.binding.bone`, message: "非 attachment 控制必须绑定骨名" });
      }
      if (binding.property === "attachment" && typeof binding.slot !== "string") {
        issues.push({ path: `${path}.binding.slot`, message: "attachment 控制必须绑定 Slot 名" });
      }
    }
    let mapsTo: { role: string; property: CurveProperty } | undefined;
    if (isComposite) {
      if (c.mapsTo != null) issues.push({ path: `${path}.mapsTo`, message: "composite 不携带单一 mapsTo（展开见 compositeOf）" });
    } else {
      const mt = (c.mapsTo ?? {}) as Record<string, unknown>;
      checkKeys(mt, ["role", "property"], `${path}.mapsTo`, issues);
      const role = expectString(mt.role, `${path}.mapsTo.role`, issues);
      const property = expectString(mt.property, `${path}.mapsTo.property`, issues);
      if (property !== binding.property) {
        issues.push({ path: `${path}.mapsTo.property`, message: "mapsTo.property 必须与 binding.property 一致（唯一映射，Spec 8.2）" });
      }
      mapsTo = { role, property: property as CurveProperty };
    }
    // composite：必须引用已存在的确定性子控制器（Spec 4.1），自身不直接写属性
    if (c.kind === "composite") {
      const sub = Array.isArray(binding.compositeOf) ? (binding.compositeOf as string[]) : [];
      if (sub.length === 0) issues.push({ path: `${path}.binding.compositeOf`, message: "composite 必须引用子控制器" });
      if (typeof binding.bone === "string") issues.push({ path: `${path}.binding.bone`, message: "composite 不直接绑定骨骼" });
    }
    const ownership = (c.ownership ?? {}) as Record<string, unknown>;
    checkKeys(ownership, OWNERSHIP_KEYS, `${path}.ownership`, issues);
    const writes = Array.isArray(ownership.writes) ? (ownership.writes as string[]) : [];
    if (writes.length === 0 && !isComposite) {
      issues.push({ path: `${path}.ownership.writes`, message: "必须声明真实执行属性" });
    }
    for (const w of writes) {
      // 同一执行属性不允许出现在两个控制器（写集隔离的前提，Spec 6.2）
      const owner = byWrites.get(w);
      if (owner && owner !== controlId) {
        issues.push({ path: `${path}.ownership.writes`, message: `执行属性 ${w} 已由控制器 ${owner} 声明（写集冲突）` });
      }
      byWrites.set(w, controlId);
    }
    const def: ControlDefinition = {
      controlId,
      semanticPart: expectString(c.semanticPart, `${path}.semanticPart`, issues),
      kind: c.kind as ControlKind,
      channel: expectString(c.channel, `${path}.channel`, issues),
      input: input as unknown as ControlInput,
      binding: binding as unknown as ControlBinding,
      mapsTo,
      domain: (c.domain ?? {}) as ControlDomain,
      rate: c.rate as ControlRate | undefined,
      ownership: ownership as unknown as ControlOwnership,
      behavior: expectString(c.behavior, `${path}.behavior`, issues),
      conditions: c.conditions as string[] | undefined,
      evidenceIds: Array.isArray(c.evidenceIds) ? (c.evidenceIds as string[]) : [],
      status: (c.status ?? "unknown") as ControlStatus,
    };
    if (def.status === "verified" && def.evidenceIds.length === 0) {
      issues.push({ path: `${path}.status`, message: "verified 控制必须引用证据（Spec 3.4）" });
    }
    byId.set(controlId, def);
    controls.push(def);
  }
  // composite 引用完整性（第二轮：全部控制已登记）；派生写集/依赖 = 子控制器并集
  // （子控制器声明写集的冲突已在第一轮检查；此处只做引用完整性与派生）
  for (const c of controls) {
    for (const sub of c.binding.compositeOf ?? []) {
      const subDef = byId.get(sub);
      if (!subDef) {
        issues.push({ path: `$.controls[${c.controlId}]`, message: `composite 引用不存在的子控制器 ${sub}` });
        continue;
      }
      if (subDef.kind === "composite") {
        issues.push({ path: `$.controls[${c.controlId}]`, message: "composite 不允许嵌套 composite" });
      }
      c.ownership.writes = [...new Set([...c.ownership.writes, ...subDef.ownership.writes])];
      c.ownership.dependsOn = [...new Set([...c.ownership.dependsOn, ...subDef.ownership.dependsOn])];
    }
  }

  // --- rules ---
  const rulesRaw = Array.isArray(o.rules) ? o.rules : [];
  if (!Array.isArray(o.rules)) issues.push({ path: "$.rules", message: "必须为数组" });
  const RULE_TYPES: RuleType[] = ["range", "rateLimit", "requiresVariant", "exclusiveWrite", "requiresCapability", "contactDependency"];
  const rules: RuleDefinition[] = [];
  for (let i = 0; i < rulesRaw.length; i++) {
    const r = rulesRaw[i] as Record<string, unknown>;
    const path = `$.rules[${i}]`;
    checkKeys(r, RULE_KEYS, path, issues);
    const type = r.type as RuleType;
    if (!RULE_TYPES.includes(type)) issues.push({ path: `${path}.type`, message: `未知规则类型 ${String(r.type)}` });
    rules.push({
      ruleId: expectString(r.ruleId, `${path}.ruleId`, issues),
      type,
      target: expectString(r.target, `${path}.target`, issues),
      condition: (r.condition ?? {}) as Record<string, unknown>,
      params: (r.params ?? {}) as RuleDefinition["params"],
      severity: (r.severity ?? "error") as "error" | "warn",
      explanation: expectString(r.explanation, `${path}.explanation`, issues),
      evidenceRefs: Array.isArray(r.evidenceRefs) ? (r.evidenceRefs as string[]) : [],
      version: expectNumber(r.version, `${path}.version`, issues),
    });
  }

  // --- evidence ---
  const evidenceRaw = Array.isArray(o.evidence) ? o.evidence : [];
  if (!Array.isArray(o.evidence)) issues.push({ path: "$.evidence", message: "必须为数组" });
  const evidence: EvidenceRecord[] = [];
  const evidenceIds = new Set<string>();
  for (let i = 0; i < evidenceRaw.length; i++) {
    const e = evidenceRaw[i] as Record<string, unknown>;
    const path = `$.evidence[${i}]`;
    checkKeys(e, EVIDENCE_KEYS, path, issues);
    const evidenceId = expectString(e.evidenceId, `${path}.evidenceId`, issues);
    if (evidenceIds.has(evidenceId)) issues.push({ path, message: `evidenceId 重复：${evidenceId}` });
    evidenceIds.add(evidenceId);
    evidence.push({
      evidenceId,
      kind: e.kind as EvidenceRecord["kind"],
      input: expectString(e.input, `${path}.input`, issues),
      refPose: expectString(e.refPose, `${path}.refPose`, issues),
      skinView: expectString(e.skinView, `${path}.skinView`, issues),
      baseAnim: e.baseAnim as string | undefined,
      runtimeVersion: expectString(e.runtimeVersion, `${path}.runtimeVersion`, issues),
      samples: e.samples as string | undefined,
      mediaPath: e.mediaPath as string | undefined,
      observation: expectString(e.observation, `${path}.observation`, issues),
      reviewer: expectString(e.reviewer, `${path}.reviewer`, issues),
      scope: expectString(e.scope, `${path}.scope`, issues),
      status: (e.status ?? "candidate") as ControlStatus,
      date: expectString(e.date, `${path}.date`, issues),
    });
  }

  // 证据引用完整性
  for (const c of controls) {
    for (const eid of c.evidenceIds) {
      if (!evidenceIds.has(eid)) issues.push({ path: `$.controls[${c.controlId}]`, message: `引用不存在的证据 ${eid}` });
    }
  }

  if (issues.length > 0) throw new ControlProfileParseError(issues);

  const withoutDigest = {
    identity: {
      modelId: expectString(id.modelId, "$.identity.modelId", issues),
      profileId: expectString(id.profileId, "$.identity.profileId", issues),
      profileRevision: expectNumber(id.profileRevision, "$.identity.profileRevision", issues),
      assetDigest: expectString(id.assetDigest, "$.identity.assetDigest", issues),
      runtimeRef: {
        exportVersion: expectString(rt.exportVersion, "$.identity.runtimeRef.exportVersion", issues),
        runtimeVersion: expectString(rt.runtimeVersion, "$.identity.runtimeRef.runtimeVersion", issues),
        runtimeSource: expectString(rt.runtimeSource, "$.identity.runtimeRef.runtimeSource", issues),
        adapterVersion: expectString(rt.adapterVersion, "$.identity.runtimeRef.adapterVersion", issues),
      },
      viewId: expectString(id.viewId, "$.identity.viewId", issues),
      skinId: expectString(id.skinId, "$.identity.skinId", issues),
      orientationVariant: id.orientationVariant as string | undefined,
      referencePose: {
        poseId: expectString(rp.poseId, "$.identity.referencePose.poseId", issues),
        description: expectString(rp.description, "$.identity.referencePose.description", issues),
        digest: expectString(rp.digest, "$.identity.referencePose.digest", issues),
      },
      heightUnits: id.heightUnits == null ? null : expectNumber(id.heightUnits, "$.identity.heightUnits", issues),
      coordinateConvention: {
        angle: expectString(cc.angle, "$.identity.coordinateConvention.angle", issues),
        translation: expectString(cc.translation, "$.identity.coordinateConvention.translation", issues),
        leftRight: expectString(cc.leftRight, "$.identity.coordinateConvention.leftRight", issues),
      },
    },
    controls,
    rules,
    evidence,
  } satisfies Omit<ControlProfile, "profileDigest">;
  if (issues.length > 0) throw new ControlProfileParseError(issues);

  return { ...withoutDigest, profileDigest: computeProfileDigest(withoutDigest) };
}

// ---------------------------------------------------------------------------
// 查询与依赖闭包（上下文装配，Spec 7.2）
// ---------------------------------------------------------------------------

export function getControl(profile: ControlProfile, controlId: string): ControlDefinition | undefined {
  return profile.controls.find((c) => c.controlId === controlId);
}

/** 在线开放集合：verified 且未被拒绝（Spec 7.1 availableControls 的数据来源）。 */
export function openControls(profile: ControlProfile): ControlDefinition[] {
  return profile.controls.filter((c) => c.status === "verified");
}

/**
 * 依赖闭包：给定控制集合，返回必带规则（不允许语义检索漏选，Spec 7.1 mandatoryRules）。
 * 规则命中条件：target 为 "*"、命中所选控制 id、或命中其 writes/dependsOn 中的任一项。
 */
export function mandatoryRulesFor(profile: ControlProfile, controlIds: readonly string[]): RuleDefinition[] {
  const selected = new Set(controlIds);
  const surfaces = new Set<string>(controlIds);
  for (const cid of controlIds) {
    const c = getControl(profile, cid);
    if (!c) continue;
    for (const w of c.ownership.writes) surfaces.add(w);
    for (const d of c.ownership.dependsOn) surfaces.add(d);
  }
  return profile.rules.filter(
    (r) => r.target === "*" || selected.has(r.target) || surfaces.has(r.target),
  );
}

/** controlId → 内部 role+property 的唯一映射表（Spec 8.2）；composite 无单一映射，不进入。 */
export function buildControlMapping(profile: ControlProfile): Map<string, { role: string; property: CurveProperty }> {
  const out = new Map<string, { role: string; property: CurveProperty }>();
  for (const c of profile.controls) {
    if (c.mapsTo) out.set(c.controlId, c.mapsTo);
  }
  return out;
}
