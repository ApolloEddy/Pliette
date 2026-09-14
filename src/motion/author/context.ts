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

/**
 * 精简指导片段（F1 修复）：全部内容来自当前档案——控制行、坐标/左右约定、必带规则解释。
 * 不硬编码任何角色专属结论；片段只覆盖本次请求的控制子集
 * （依赖只用于解释，不列为可写权限，Spec 7.1）。
 * 缓存键 = profileDigest + 排序后的子集 + 规则版本指纹；任一变化即失效。
 */
const excerptCache = new Map<string, string[]>();

function ruleFingerprint(profile: ControlProfile): string {
  return profile.rules.map((r) => `${r.ruleId}v${r.version}`).join(",");
}

export function buildGuideExcerpts(profile: ControlProfile, controlIds: readonly string[]): string[] {
  const key = `${profile.profileDigest}|${[...controlIds].sort().join(">")}|${ruleFingerprint(profile)}`;
  const cached = excerptCache.get(key);
  if (cached) return cached;

  const byId = new Map(profile.controls.map((c) => [c.controlId, c]));
  const selected = controlIds.map((id) => byId.get(id)).filter((c): c is ControlDefinition => c != null);
  const excerpts: string[] = [];

  excerpts.push("【可用控制器】（只允许引用以下 controlId；省略=不申请写入）：");
  for (const c of selected) excerpts.push(controlLine(c));

  const coord = profile.identity.coordinateConvention;
  if (coord) {
    excerpts.push("【坐标与方向约定】");
    if (coord.angle) excerpts.push(`- 角度：${coord.angle}`);
    if (coord.translation) excerpts.push(`- 位移：${coord.translation}`);
    if (coord.leftRight) excerpts.push(`- 左右：${coord.leftRight}`);
  }

  // 本次子集触发的必带规则——角色专属限制/反例由档案规则解释携带（依赖闭包，Spec 7.1）
  const rules = mandatoryRulesFor(profile, controlIds);
  if (rules.length > 0) {
    excerpts.push("【本次生效的规则】（违反即拒绝）：");
    for (const r of rules) excerpts.push(`- ${r.ruleId}（${r.target}）：${r.explanation}`);
  }

  // 只在子集确实包含组合控制时给出组合控制说明（从档案数据派生，不做角色假设）
  const composites = selected.filter((c) => c.kind === "composite");
  if (composites.length > 0) {
    excerpts.push("【组合控制】以下控制的枚举值经登记映射展开，不接受自由拼装子曲线：");
    for (const c of composites) excerpts.push(`- ${c.controlId}：${(c.binding.compositeOf ?? []).join("、") || "（无子控制登记）"}`);
  }

  excerptCache.set(key, excerpts);
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
    // F1：指导片段与 availableControls 同源同集合——子集之外的控制不出现，角色知识只来自档案
    guideExcerpts: [...buildGuideExcerpts(profile, ids), ...(opts.extraExcerpts ?? [])],
    generationBudget: budget,
    referencePoseId: profile.identity.referencePose.poseId,
    protocolVersion: "pliette.motion-draft/1.1",
  };
}
