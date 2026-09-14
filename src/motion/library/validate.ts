/**
 * MotionLibrary 确定性语义校验（MotionLibrary Spec v1.0 §4.5 / §3.3）：
 * JSON Schema 已负责形状；这里承担跨记录引用、时间区间、参数交集、配方结构等语义规则。
 * 全部确定性；固定输入 + 固定库版本必须产生固定结论。
 */
import type {
  MotionCatalog,
  MotionEntry,
  MotionManifest,
  MotionPlan,
  RecipeSource,
} from "./contracts.js";

export interface SemanticIssue {
  code: string;
  message: string;
  /** 定位：entry.motionId / slice.sliceId / 顶层 */
  at?: string;
}

const KEY_RE = /^[a-z][a-z0-9_]*(?:[.][a-z0-9_]+)*$/;
export const CUSTOM_ACTION = "custom";

// ---------------------------------------------------------------------------
// 目录级校验（唯一性 / 引用存在 / 别名唯一）
// ---------------------------------------------------------------------------

export function validateCatalog(catalog: MotionCatalog): SemanticIssue[] {
  const issues: SemanticIssue[] = [];
  const categoryIds = new Set(catalog.categories.map((c) => c.id));
  const actionIds = new Set<string>();
  const aliasOwners = new Map<string, string>();
  for (const action of catalog.actions) {
    if (actionIds.has(action.actionId)) {
      issues.push({ code: "DUPLICATE_ACTION", message: `actionId 重复：${action.actionId}`, at: action.actionId });
    }
    actionIds.add(action.actionId);
    if (!categoryIds.has(action.category)) {
      issues.push({ code: "UNKNOWN_CATEGORY", message: `分类 ${action.category} 未在 categories 登记`, at: action.actionId });
    }
    for (const alias of action.aliasesZh) {
      const owner = aliasOwners.get(alias);
      if (owner && owner !== action.actionId) {
        // 别名必须唯一指向登记语义；相近动作不是同义词（Spec 4.3）
        issues.push({ code: "AMBIGUOUS_ALIAS", message: `别名「${alias}」同时属于 ${owner} 与 ${action.actionId}`, at: action.actionId });
      } else {
        aliasOwners.set(alias, action.actionId);
      }
    }
    const variantIds = new Set<string>();
    for (const variant of action.variants) {
      if (variantIds.has(variant.variantId)) {
        issues.push({ code: "DUPLICATE_VARIANT", message: `变体重复：${action.actionId}/${variant.variantId}`, at: `${action.actionId}/${variant.variantId}` });
      }
      variantIds.add(variant.variantId);
      if (!variant.segmentIds.includes("full")) {
        issues.push({ code: "MISSING_FULL_SEGMENT", message: `变体必须提供 full 片段`, at: `${action.actionId}/${variant.variantId}` });
      }
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Entry 级校验（§4.5-1/2/3/4/5/7 的静态部分）
// ---------------------------------------------------------------------------

export function validateEntry(entry: MotionEntry, catalog: MotionCatalog): SemanticIssue[] {
  const issues: SemanticIssue[] = [];
  const at = entry.motionId;

  // 引用必须存在（§4.5-1）
  const action = catalog.actions.find((a) => a.actionId === entry.actionId);
  if (!action) {
    issues.push({ code: "UNKNOWN_ACTION", message: `actionId ${entry.actionId} 未在目录登记`, at });
    return issues;
  }
  const variant = action.variants.find((v) => v.variantId === entry.variantId);
  if (!variant) {
    issues.push({ code: "UNKNOWN_VARIANT", message: `变体 ${entry.variantId} 未在 ${entry.actionId} 登记`, at });
    return issues;
  }

  // full = [0, durationMs]；片段 0 ≤ start < end ≤ duration（§4.5-2）
  const full = entry.segments.full;
  if (!full) {
    issues.push({ code: "MISSING_FULL_SEGMENT", message: "实现必须提供 full 片段", at });
  } else {
    if (full.startMs !== 0 || full.endMs !== entry.durationMs) {
      issues.push({ code: "SEGMENT_BOUNDS", message: `full 必须为 [0, ${entry.durationMs}]，实际 [${full.startMs}, ${full.endMs}]`, at });
    }
  }
  for (const [segId, seg] of Object.entries(entry.segments)) {
    if (!(0 <= seg.startMs && seg.startMs < seg.endMs && seg.endMs <= entry.durationMs)) {
      issues.push({ code: "SEGMENT_BOUNDS", message: `片段 ${segId} 越界：[${seg.startMs}, ${seg.endMs}] ∉ [0, ${entry.durationMs}]`, at });
    }
    for (const bId of [seg.entryBoundaryId, seg.exitBoundaryId]) {
      if (!entry.boundaries[bId]) {
        issues.push({ code: "UNKNOWN_BOUNDARY", message: `片段 ${segId} 引用的边界 ${bId} 不存在`, at });
      }
    }
  }
  // 变体只允许引用登记片段（§4.5-1）；full 必在其中
  if (!variant.segmentIds.includes("full")) {
    issues.push({ code: "SEGMENT_NOT_REGISTERED", message: "变体未登记 full 片段", at });
  }

  // 源窗口（§4.5-3）：native 源时间窗不越界且方向正确；native_clip 必须覆盖完整源动画由宿主核对
  if (entry.source.kind === "native_clip" || entry.source.kind === "native_slice") {
    const { sourceStartMs, sourceEndMs } = entry.source;
    if (!(0 <= sourceStartMs && sourceStartMs < sourceEndMs)) {
      issues.push({ code: "SOURCE_WINDOW", message: `源时间窗非法：[${sourceStartMs}, ${sourceEndMs}]`, at });
    }
    if (entry.source.kind === "native_slice" && sourceEndMs - sourceStartMs !== entry.durationMs) {
      issues.push({ code: "DURATION_MISMATCH", message: `native_slice 时长必须等于源窗口长度（${sourceEndMs - sourceStartMs} ≠ ${entry.durationMs}）`, at });
    }
  }

  // 参数域交集与 retime（§4.5-4）
  if (entry.retime.minRate > entry.retime.maxRate || entry.retime.minRate <= 0) {
    issues.push({ code: "INVALID_RETIME", message: `retime 非法：[${entry.retime.minRate}, ${entry.retime.maxRate}]`, at });
  } else if (entry.retime.minRate !== 1 || entry.retime.maxRate !== 1) {
    // 首期只允许 1.0，验证后再扩展（Spec 4.4）
    issues.push({ code: "RETIME_UNVERIFIED", message: "首期 retime 只允许 1.0（未验证变速）", at });
  }
  if (entry.loop.allowed && (entry.loop.segmentId == null || !entry.segments[entry.loop.segmentId])) {
    issues.push({ code: "INVALID_LOOP", message: "允许循环必须指明已登记的循环片段", at });
  }
  if (!KEY_RE.test(entry.variantId)) {
    issues.push({ code: "INVALID_KEY", message: `variantId 形状非法：${entry.variantId}`, at });
  }

  // 事件时刻必须落在内容时间轴内且 eventId 唯一（§4.4）
  const eventIds = new Set<string>();
  for (const ev of entry.events) {
    if (eventIds.has(ev.eventId)) {
      issues.push({ code: "DUPLICATE_EVENT", message: `eventId 重复：${ev.eventId}`, at });
    }
    eventIds.add(ev.eventId);
    if (ev.atMs < 0 || ev.atMs > entry.durationMs) {
      issues.push({ code: "EVENT_OUT_OF_RANGE", message: `事件 ${ev.eventId} 时刻 ${ev.atMs}ms 超出 [0, ${entry.durationMs}]`, at });
    }
  }

  // 配方静态校验（§4.5-5 的结构部分；引用存在性由 index 在装配时核对）
  if (entry.source.kind === "recipe") {
    issues.push(...validateRecipeShape(entry.source, entry.durationMs, at));
  }

  // 实现参数必须是语义目录许可子集（§4.4）——首期变体多为空 schema（拒绝一切额外参数）
  issues.push(...validateParamSchemaSubset(variant.parameterSchema, entry.parameterSchema, at));

  return issues;
}

/** 实现的 parameterSchema 必须是变体 parameterSchema 的子集（键级）。 */
function validateParamSchemaSubset(variantSchema: Record<string, unknown>, entrySchema: Record<string, unknown>, at: string): SemanticIssue[] {
  const allowed = new Set(Object.keys((variantSchema.properties ?? {}) as Record<string, unknown>));
  const issues: SemanticIssue[] = [];
  for (const key of Object.keys((entrySchema.properties ?? {}) as Record<string, unknown>)) {
    if (!allowed.has(key)) {
      issues.push({ code: "PARAM_NOT_ALLOWED", message: `实现参数 ${key} 不在语义目录许可域内`, at });
    }
  }
  return issues;
}

/** 配方：无环、深度首期 ≤2、展开后 ≤32 步、总时长覆盖（环检测在展开时结合被引用 entry 完成） */
export function validateRecipeShape(source: RecipeSource, durationMs: number, at: string): SemanticIssue[] {
  const issues: SemanticIssue[] = [];
  if (source.steps.length > 32) {
    issues.push({ code: "RECIPE_TOO_LONG", message: `展开后 ${source.steps.length} 步 > 32`, at });
  }
  const stepIds = new Set(source.steps.map((s) => s.stepId));
  if (stepIds.size !== source.steps.length) {
    issues.push({ code: "RECIPE_DUPLICATE_STEP", message: "stepId 重复", at });
  }
  const lastEnd = source.steps.reduce((acc, s) => Math.max(acc, s.offsetMs), 0);
  if (lastEnd > durationMs) {
    issues.push({ code: "RECIPE_DURATION", message: `step offsetMs ${lastEnd} 超出配方 durationMs ${durationMs}`, at });
  }
  // 同名子动作不允许在同一配方中以相同 stepId 重复占用重叠时间（保序即可；深挖在展开期）
  return issues;
}

// ---------------------------------------------------------------------------
// Manifest 级校验（§4.5-1 的唯一性部分）
// ---------------------------------------------------------------------------

export function validateManifest(manifest: MotionManifest, catalog: MotionCatalog): SemanticIssue[] {
  const issues: SemanticIssue[] = [];
  const seenMotion = new Map<string, MotionEntry>();
  const seenRevision = new Set<string>();
  for (const entry of manifest.entries) {
    const motionKey = entry.motionId;
    const prior = seenMotion.get(motionKey);
    if (prior && prior.motionRevision === entry.motionRevision) {
      issues.push({ code: "DUPLICATE_REVISION", message: `${entry.motionId}@r${entry.motionRevision} 重复登记`, at: entry.motionId });
    }
    seenMotion.set(motionKey, entry);
    seenRevision.add(`${entry.motionId}@${entry.motionRevision}`);
    issues.push(...validateEntry(entry, catalog));
  }
  return issues;
}

// ---------------------------------------------------------------------------
// MotionPlan 校验（§3.3 输入字段与规则）
// ---------------------------------------------------------------------------

export interface PlanCheckContext {
  catalog: MotionCatalog;
}

export function validateMotionPlan(plan: MotionPlan, ctx: PlanCheckContext): SemanticIssue[] {
  const issues: SemanticIssue[] = [];
  if (plan.schemaVersion !== "pliette.motion-plan/1.0") {
    issues.push({ code: "SCHEMA_VERSION", message: `schemaVersion 必须为 pliette.motion-plan/1.0` });
  }
  if (plan.requestId.length === 0) issues.push({ code: "REQUEST_ID", message: "requestId 必须由程序发放" });
  if (plan.catalogRevision !== ctx.catalog.catalogRevision) {
    issues.push({ code: "STALE_CATALOG_REVISION", message: `catalogRevision 回显 ${plan.catalogRevision} ≠ 当前 ${ctx.catalog.catalogRevision}` });
  }
  if (plan.slices.length > 16) {
    issues.push({ code: "TOO_MANY_SLICES", message: `slices ${plan.slices.length} > 16` });
  }
  const sliceIds = new Set<string>();
  for (const slice of plan.slices) {
    if (sliceIds.has(slice.sliceId)) {
      issues.push({ code: "DUPLICATE_SLICE_ID", message: `sliceId 重复：${slice.sliceId}`, at: slice.sliceId });
    }
    sliceIds.add(slice.sliceId);
    const { actionId, variantId, segmentId } = slice.lookup;
    // custom 只能搭配 custom 变体与 full（Spec 3.3）
    if (actionId === CUSTOM_ACTION) {
      if (variantId !== CUSTOM_ACTION || segmentId !== "full") {
        issues.push({ code: "INVALID_CUSTOM_LOOKUP", message: "custom 动作只能搭配 custom 变体与 full 片段", at: slice.sliceId });
      }
      continue;
    }
    const action = ctx.catalog.actions.find((a) => a.actionId === actionId);
    if (!action) {
      issues.push({ code: "UNKNOWN_ACTION", message: `actionId ${actionId} 不在能力卡中`, at: slice.sliceId });
      continue;
    }
    const variant = action.variants.find((v) => v.variantId === variantId);
    if (!variant) {
      issues.push({ code: "UNKNOWN_VARIANT", message: `变体 ${variantId} 不在 ${actionId} 中`, at: slice.sliceId });
      continue;
    }
    if (!variant.segmentIds.includes(segmentId)) {
      issues.push({ code: "UNKNOWN_SEGMENT", message: `片段 ${segmentId} 未登记（可用：${variant.segmentIds.join("/")}）`, at: slice.sliceId });
    }
    // 参数必须落在目录允许域内（未登记参数一律拒绝）
    issues.push(...validateSliceParameters(slice.parameters, variant.parameterSchema, slice.sliceId));
  }
  return issues;
}

function validateSliceParameters(params: Record<string, unknown>, schema: Record<string, unknown>, at: string): SemanticIssue[] {
  const issues: SemanticIssue[] = [];
  const allowed = (schema.properties ?? {}) as Record<string, unknown>;
  for (const key of Object.keys(params)) {
    if (!(key in allowed)) {
      issues.push({ code: "PARAM_NOT_ALLOWED", message: `参数 ${key} 未在变体 parameterSchema 登记`, at });
      continue;
    }
    const spec = allowed[key] as { type?: string; enum?: unknown[]; minimum?: number; maximum?: number };
    const value = params[key];
    if (spec.type === "number" || spec.type === "integer") {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        issues.push({ code: "PARAM_TYPE", message: `参数 ${key} 需要数值`, at });
        continue;
      }
      if (spec.type === "integer" && !Number.isInteger(value)) issues.push({ code: "PARAM_TYPE", message: `参数 ${key} 需要整数`, at });
      if (spec.minimum != null && value < spec.minimum) issues.push({ code: "PARAM_RANGE", message: `参数 ${key}=${value} < ${spec.minimum}`, at });
      if (spec.maximum != null && value > spec.maximum) issues.push({ code: "PARAM_RANGE", message: `参数 ${key}=${value} > ${spec.maximum}`, at });
    } else if (spec.type === "string") {
      if (typeof value !== "string") issues.push({ code: "PARAM_TYPE", message: `参数 ${key} 需要字符串`, at });
      else if (spec.enum && !spec.enum.includes(value)) issues.push({ code: "PARAM_ENUM", message: `参数 ${key}=${value} 不在枚举 [${spec.enum.join("/")}]`, at });
    } else if (spec.type === "boolean") {
      if (typeof value !== "boolean") issues.push({ code: "PARAM_TYPE", message: `参数 ${key} 需要布尔`, at });
    }
  }
  return issues;
}

/** 首期强制可明确提取的方向/左右冲突检查（Spec 3.3：自然语言与结构化键冲突时不自动播出）。 */
export function detectDirectionConflict(plan: MotionPlan): SemanticIssue[] {
  const issues: SemanticIssue[] = [];
  for (const slice of plan.slices) {
    const side = slice.lookup.variantId.match(/screen_(left|right)/)?.[1];
    if (!side) continue;
    const text = `${slice.description} ${plan.description}`;
    const mentionsLeft = /画面左|屏幕左|角色左手|左手/.test(text);
    const mentionsRight = /画面右|屏幕右|角色右手|右手/.test(text);
    // 只在文本只提及单一方向且与键冲突时判冲突（双方向描述交由纠错请求处理）
    if (side === "left" && mentionsRight && !mentionsLeft) {
      issues.push({ code: "SEMANTIC_CONFLICT", message: `描述提到右但键为 screen_left`, at: slice.sliceId });
    }
    if (side === "right" && mentionsLeft && !mentionsRight) {
      issues.push({ code: "SEMANTIC_CONFLICT", message: `描述提到左但键为 screen_right`, at: slice.sliceId });
    }
  }
  return issues;
}
