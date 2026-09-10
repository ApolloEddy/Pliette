/**
 * MotionDraft V1.1 外部协议（指导书 Spec 7 / 8）：
 * 请求包（程序→LLM）与响应判别联合（LLM→程序）。严格类型 + 未知字段拒绝。
 * draft 只携带被允许的创作数据；引用姿态、混入混出、优先级、接触权都来自档案与调度器（Spec 8.2）。
 */
import type { RuleDefinition, ControlDefinition } from "../../rig/controlProfile.js";

export const DRAFT_SCHEMA_VERSION = "pliette.motion-draft/1.1";

// ---------------------------------------------------------------------------
// 请求包（Spec 7.1 最低要求）
// ---------------------------------------------------------------------------

export interface ControlSummary {
  controlId: string;
  semanticPart: string;
  kind: ControlDefinition["kind"];
  inputType: "scalar" | "vec2" | "enum";
  unit: string;
  refValue: number | [number, number] | string;
  /** 允许输出域（allowed）；verified 域与速率上限单独给出 */
  allowed: { min?: number; max?: number };
  verified: { min?: number; max?: number };
  maxPerSec?: number;
  positiveLooksLike: string;
  negativeLooksLike: string;
  behavior: string;
  /** 枚举映射（组合控制）：语义值 → 固定目标 */
  enumValues?: string[];
  conditions?: string[];
}

export interface RuleSummary {
  ruleId: string;
  type: RuleDefinition["type"];
  target: string;
  severity: "error" | "warn";
  explanation: string;
  params: RuleDefinition["params"];
}

export interface RuntimeStateSnapshot {
  /** 单调时钟（程序提供） */
  monoClockMs: number;
  viewId: string;
  skinId: string;
  /** 离散状态版本（模型/档案/Skin/视图/姿态类/控制权/接触变化时递增，Spec 9.3） */
  stateVersion: number;
  /** 基础动画与相位（连续状态仅作参考值，不要求 LLM 心算补偿） */
  baseAnim?: string;
  basePhaseSec?: number;
  /** 通道占用（Spec 7.3：LLM 不能声明 free=true 改写） */
  occupiedChannels: string[];
  /** 已承诺接触/资源（Spec 9.2 退出按现有策略） */
  contacts: string[];
  /** 当前姿态类（程序推导，如 standing/seated；来源为场景状态） */
  posture?: string;
}

export interface GenerationBudget {
  minDurationSec: number;
  maxDurationSec: number;
  maxControls: number;
  maxKeysPerCurve: number;
  maxTotalKeys: number;
  maxOutputTokens: number;
  maxOutputBytes: number;
  deadlineMs: number;
}

export interface GuideRequest {
  requestId: string;
  contextId: string;
  profileRef: {
    modelId: string;
    profileId: string;
    profileRevision: number;
    profileDigest: string;
    viewId: string;
    skinId: string;
  };
  goal: string;
  runtimeState: RuntimeStateSnapshot;
  availableControls: ControlSummary[];
  mandatoryRules: RuleSummary[];
  /** 精简指导片段（按预算装配；静态部分可按 profileDigest+控制集+规则版本缓存） */
  guideExcerpts: string[];
  generationBudget: GenerationBudget;
  /** 参考姿态 id 与值语义提示（Spec 8.3：参考值在请求档案中固定） */
  referencePoseId: string;
  protocolVersion: typeof DRAFT_SCHEMA_VERSION;
}

/** 默认在线预算（Spec 8.4，可配置初值；调整必须进入配置与评测记录） */
export const DEFAULT_BUDGET: GenerationBudget = {
  minDurationSec: 0.4,
  maxDurationSec: 2.0,
  maxControls: 6,
  maxKeysPerCurve: 6,
  maxTotalKeys: 24,
  maxOutputTokens: 1536,
  maxOutputBytes: 32 * 1024,
  deadlineMs: 2500,
};

// ---------------------------------------------------------------------------
// 响应（严格判别联合；未知字段拒绝）
// ---------------------------------------------------------------------------

export type DraftEase = "linear" | "smooth" | "stepped";

export interface DraftKeyV11 {
  timeSec: number;
  value: number | [number, number] | string;
  ease?: DraftEase;
}

export interface DraftCurveV11 {
  controlId: string;
  keys: DraftKeyV11[];
}

export interface DraftPhaseV11 {
  name: "prepare" | "stroke" | "hold" | "recover";
  startSec: number;
  endSec: number;
}

export interface DraftV11 {
  schemaVersion: string;
  id: string;
  durationSec: number;
  phases?: DraftPhaseV11[];
  curves: DraftCurveV11[];
}

export interface MotionResponse {
  status: "motion";
  requestId: string;
  contextId: string;
  profileDigest: string;
  draft: DraftV11;
}

export interface UnsupportedResponse {
  status: "unsupported";
  requestId: string;
  contextId: string;
  profileDigest: string;
  reasonCode: string;
  details?: string;
}

export interface NeedsContextResponse {
  status: "needs_context";
  requestId: string;
  contextId: string;
  profileDigest: string;
  requestedCapabilities: string[];
  details?: string;
}

export type AuthorResponse = MotionResponse | UnsupportedResponse | NeedsContextResponse;

/** 判别联合守卫：未知 status / 未知字段拒绝（不执行内容，仅结构）。 */
export function parseAuthorResponse(raw: unknown): { response?: AuthorResponse; error?: string } {
  if (typeof raw !== "object" || raw === null) return { error: "响应必须是对象" };
  const o = raw as Record<string, unknown>;
  const status = o.status;
  if (status !== "motion" && status !== "unsupported" && status !== "needs_context") {
    return { error: `未知 status ${String(status)}` };
  }
  for (const k of Object.keys(o)) {
    const allowed =
      status === "motion"
        ? ["status", "requestId", "contextId", "profileDigest", "draft"]
        : status === "unsupported"
          ? ["status", "requestId", "contextId", "profileDigest", "reasonCode", "details"]
          : ["status", "requestId", "contextId", "profileDigest", "requestedCapabilities", "details"];
    if (!allowed.includes(k)) return { error: `未知字段 ${k}（${status} 响应不允许）` };
  }
  for (const k of ["requestId", "contextId", "profileDigest"] as const) {
    if (typeof o[k] !== "string" || (o[k] as string).length === 0) return { error: `${k} 必须为非空字符串` };
  }
  if (status === "motion") {
    const d = o.draft;
    if (typeof d !== "object" || d === null) return { error: "motion 响应必须携带 draft 对象" };
    const dd = d as Record<string, unknown>;
    for (const k of Object.keys(dd)) {
      if (!["schemaVersion", "id", "durationSec", "phases", "curves"].includes(k)) return { error: `draft.未知字段 ${k}` };
    }
    if (dd.schemaVersion !== DRAFT_SCHEMA_VERSION) return { error: `draft.schemaVersion 必须为 ${DRAFT_SCHEMA_VERSION}` };
  } else if (status === "unsupported") {
    if (typeof o.reasonCode !== "string") return { error: "unsupported 必须携带 reasonCode" };
  } else {
    if (!Array.isArray(o.requestedCapabilities)) return { error: "needs_context 必须携带 requestedCapabilities 数组" };
  }
  return { response: raw as AuthorResponse };
}
