/**
 * 上下文装配（指导书 Spec 7）：程序先给出可用控制集合，再按依赖闭包装配必带规则，
 * 案例只在剩余预算内选取（V1：主角色全量少量控制器直接给出，不引入向量库）。
 * 静态内容可按 profileDigest + 控制集合 + 规则版本 缓存；动态状态每次快照。
 */
import {
  mandatoryRulesFor,
  openControls,
  type ControlProfile,
  type ControlDefinition,
} from "../../rig/controlProfile.js";
import {
  DEFAULT_BUDGET,
  type ControlSummary,
  type GenerationBudget,
  type GuideRequest,
  type RuleSummary,
  type RuntimeStateSnapshot,
} from "./protocol.js";

export function toControlSummary(c: ControlDefinition): ControlSummary {
  return {
    controlId: c.controlId,
    semanticPart: c.semanticPart,
    kind: c.kind,
    inputType: c.input.type,
    unit: c.input.unit,
    refValue: c.input.refValue,
    allowed: { min: c.domain.min, max: c.domain.max },
    verified: { min: c.domain.verifiedMin, max: c.domain.verifiedMax },
    maxPerSec: c.rate?.maxPerSec,
    positiveLooksLike: c.input.positiveLooksLike,
    negativeLooksLike: c.input.negativeLooksLike,
    behavior: c.behavior,
    enumValues: c.input.enumValues,
    conditions: c.conditions,
  };
}

function toRuleSummary(r: ControlProfile["rules"][number]): RuleSummary {
  return { ruleId: r.ruleId, type: r.type, target: r.target, severity: r.severity, explanation: r.explanation, params: r.params };
}

/** 控制器的紧凑行（LLM 片段；同一来源渲染，人类可读版由 Guide Builder 生成） */
function controlLine(c: ControlDefinition): string {
  const dom =
    c.input.type === "enum"
      ? `枚举 ${(c.input.enumValues ?? []).join("/")}`
      : `allowed [${c.domain.min ?? "-∞"}, ${c.domain.max ?? "+∞"}]，verified [${c.domain.verifiedMin ?? "-∞"}, ${c.domain.verifiedMax ?? "+∞"}]${c.rate?.maxPerSec != null ? `，速率 ≤${c.rate.maxPerSec}/s` : ""}`;
  return `- ${c.controlId}（${c.semanticPart}；${c.input.type === "vec2" ? "二元向量[H]" : c.input.type === "enum" ? "枚举" : "标量[deg]"}，参考值 ${JSON.stringify(c.input.refValue)}）：${dom}。正=${c.input.positiveLooksLike}；负=${c.input.negativeLooksLike}。${c.behavior}`;
}

/** 精简片段缓存：profileDigest 变化时失效（Spec 7.1 静态缓存） */
const excerptCache = new Map<string, string[]>();

export function buildGuideExcerpts(profile: ControlProfile): string[] {
  const cached = excerptCache.get(profile.profileDigest);
  if (cached) return cached;
  const open = openControls(profile);
  const excerpts = [
    "【可用控制器】（只允许引用以下 controlId；省略=不申请写入）：",
    ...open.map(controlLine),
    "【注意】头与躯干是兄弟节点：躯干动头部不动；需要组合时显式同时给两条曲线。眼睛只能成对经 face.eyes.pair 切换。",
    "【反例】torso.bob 超出 ±0.02H 会头身分离（已发生并保留反例）；连续参数禁用 stepped；眼睛之外的表情通道不存在（无嘴部附件）。",
  ];
  excerptCache.set(profile.profileDigest, excerpts);
  return excerpts;
}

export interface AssembleOptions {
  requestId: string;
  contextId: string;
  goal: string;
  runtimeState: RuntimeStateSnapshot;
  budget?: Partial<GenerationBudget>;
  /** 限定本次开放的控制集合（缺省=全部开放控制；首角色数量少直接全量） */
  controlSubset?: string[];
  extraExcerpts?: string[];
}

export function assembleRequest(profile: ControlProfile, opts: AssembleOptions): GuideRequest {
  const open = openControls(profile);
  const selected = opts.controlSubset ? open.filter((c) => opts.controlSubset!.includes(c.controlId)) : open;
  if (selected.length === 0) {
    throw new Error(`档案 ${profile.identity.profileId} 没有开放控制器（INSUFFICIENT_CONTEXT）`);
  }
  const ids = selected.map((c) => c.controlId);
  const budget: GenerationBudget = { ...DEFAULT_BUDGET, ...opts.budget };
  return {
    requestId: opts.requestId,
    contextId: opts.contextId,
    profileRef: {
      modelId: profile.identity.modelId,
      profileId: profile.identity.profileId,
      profileRevision: profile.identity.profileRevision,
      profileDigest: profile.profileDigest,
      viewId: profile.identity.viewId,
      skinId: profile.identity.skinId,
    },
    goal: opts.goal,
    runtimeState: opts.runtimeState,
    availableControls: selected.map(toControlSummary),
    // 依赖闭包必带规则——不允许语义检索漏选（Spec 7.1 mandatoryRules）
    mandatoryRules: mandatoryRulesFor(profile, ids).map(toRuleSummary),
    guideExcerpts: [...buildGuideExcerpts(profile), ...(opts.extraExcerpts ?? [])],
    generationBudget: budget,
    referencePoseId: profile.identity.referencePose.poseId,
    protocolVersion: "pliette.motion-draft/1.1",
  };
}
