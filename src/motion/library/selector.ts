/**
 * Selector：确定性路由（MotionLibrary Spec v1.0 §5）。
 * 上游 LLM 做语义规划；命中库后不再调用第二个 LLM 决定取哪条动画。
 * 判定 hit / miss / unsupported / conflict；保留切片原文与失败原因，供指导书 Author 接续。
 * 默认命中库的增量 Author 调用数必须为 0。
 */
import type { MotionPlan, MotionSlice } from "./contracts.js";
import { detectDirectionConflict, validateMotionPlan, type SemanticIssue } from "./validate.js";
import type { CatalogView } from "./catalog.js";
import type { IndexEntryMatch, MotionIndex, RigIdentity } from "./index.js";

export type RouteCode =
  | "HIT_READY"
  | "MISS_ASSET"
  | "MISS_SEGMENT"
  | "MISS_CUSTOM"
  | "UNSUPPORTED_CAPABILITY"
  | "RIG_MISMATCH"
  | "ASSET_MISSING"
  | "RESOURCE_CONFLICT"
  | "INVALID_REFERENCE"
  | "SEMANTIC_CONFLICT"
  | "STALE_CATALOG";

export interface SliceRoute {
  slice: MotionSlice;
  code: RouteCode;
  /** HIT_READY 时的固定实现引用（提交前仍核对实际状态） */
  match?: IndexEntryMatch;
  /** MISS/失败时的原因与可用替代 */
  reason?: string;
  issues?: SemanticIssue[];
  /** 当前角色具备生成能力（可交指导书 Author） */
  generatable?: boolean;
}

export interface PlanRoute {
  planId: string;
  plan: MotionPlan;
  /** 整条请求是一条已登记完整配方时直接解析（§5.2 尾注） */
  wholeRoutineMatch?: IndexEntryMatch;
  slices: SliceRoute[];
  /** true=全部切片 HIT（或整体 routine 命中），本轮 Author 增量调用数为 0 */
  allHit: boolean;
}

export interface SelectorDeps {
  catalog: CatalogView;
  index: MotionIndex;
  rig: RigIdentity;
  /** 每次提交前再次核对的实际占用检查交给调度器；此处不做资源判定 */
  planId: string;
}

/** 校验整个计划并逐切片路由。固定输入 + 固定库版本 → 固定结果。 */
export function routePlan(deps: SelectorDeps, plan: MotionPlan): PlanRoute {
  const { catalog, index, rig } = deps;

  // 1) 计划形状/回显/目录版本/参数校验（§5.1-1）
  const planIssues = validateMotionPlan(plan, { catalog: catalog.catalog });
  const conflictIssues = detectDirectionConflict(plan);
  if (planIssues.length > 0 || conflictIssues.length > 0) {
    const code: RouteCode = conflictIssues.length > 0 ? "SEMANTIC_CONFLICT" : planIssues.some((i) => i.code === "STALE_CATALOG_REVISION") ? "STALE_CATALOG" : "INVALID_REFERENCE";
    return {
      planId: deps.planId,
      plan,
      slices: plan.slices.map((slice) => ({ slice, code, issues: [...planIssues, ...conflictIssues] })),
      allHit: false,
    };
  }

  // 2) 整条请求是一条已登记完整配方（routine.*）时直接解析
  if (plan.slices.length === 1 && plan.slices[0].lookup.segmentId === "full") {
    const only = plan.slices[0];
    const action = catalog.action(only.lookup.actionId);
    if (action && only.lookup.actionId.startsWith("routine.")) {
      const { matches } = index.lookup(only.lookup, rig);
      if (matches.length > 0) {
        return { planId: deps.planId, plan, wholeRoutineMatch: matches[0], slices: [{ slice: only, code: "HIT_READY", match: matches[0] }], allHit: true };
      }
    }
  }

  // 3) 逐切片确定性路由
  const slices = plan.slices.map((slice) => routeSlice(catalog, index, rig, slice));
  return { planId: deps.planId, plan, slices, allHit: slices.every((s) => s.code === "HIT_READY") };
}

function routeSlice(catalog: CatalogView, index: MotionIndex, rig: RigIdentity, slice: MotionSlice): SliceRoute {
  const { actionId, variantId, segmentId } = slice.lookup;

  if (actionId === "custom") {
    // custom/custom/full：按完整自然语言交 Author；成功后仍不自动造新公共 ID（§5.2）
    return { slice, code: "MISS_CUSTOM", reason: "未登记语义，进入受限生成", generatable: true };
  }

  const action = catalog.action(actionId);
  if (!action) {
    return { slice, code: "INVALID_REFERENCE", reason: `actionId ${actionId} 不在当前目录` };
  }
  const variant = catalog.variant(actionId, variantId);
  if (!variant) {
    return { slice, code: "INVALID_REFERENCE", reason: `变体 ${variantId} 不在 ${actionId}（拼写错误不当作新动作扩库）` };
  }
  if (!variant.segmentIds.includes(segmentId)) {
    return { slice, code: "MISS_SEGMENT", reason: `片段 ${segmentId} 未登记（可用：${variant.segmentIds.join("/")}）`, generatable: variant.authorable === "capability_check" };
  }

  // planned/deprecated 条目不算可播放命中，不显示"已有此动作"（V04）
  if (action.status !== "registered" || variant.status !== "registered") {
    return {
      slice,
      code: "MISS_ASSET",
      reason: `${actionId}/${variantId} 状态 ${action.status}/${variant.status}（未 registered）`,
      generatable: variant.authorable === "capability_check",
    };
  }

  const { matches } = index.lookup(slice.lookup, rig);
  if (matches.length > 0) {
    return { slice, code: "HIT_READY", match: matches[0] };
  }

  // 已知语义但当前角色没有已验收实现：rig 不兼容的实现存在 → 如实报告；否则缺素材
  const hasIncompatible = index
    .all()
    .some((e) => e.actionId === actionId && e.variantId === variantId && e.status === "approved");
  if (hasIncompatible) {
    return { slice, code: "RIG_MISMATCH", reason: "存在 approved 实现但与本角色档案/资产/视图版本不兼容", generatable: variant.authorable === "capability_check" };
  }
  return {
    slice,
    code: "MISS_ASSET",
    reason: `${actionId}/${variantId} 当前模型没有已验收实现`,
    generatable: variant.authorable === "capability_check" && variant.status === "registered",
  };
}
