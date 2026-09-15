/**
 * MotionEntry → PreparedMotion 统一 materialization（MotionLibrary Spec v1.0 §5→§6→§8）：
 * Selector HIT_READY 之后、PlanCoordinator 提交之前的准备层——把 native slice / native clip /
 * draft / recipe 四种载体统一折叠为 PreparedMotion（调度/缓冲/录像读取同一份时间轴）。
 *
 * 本模块是纯逻辑：不 import spine、不做 IO；宿主把"编译产物句柄"（过滤切片/整段动画/编译草稿/
 * 配方子步骤）经 opts.compiledHandle 注入，播放端按句柄 kind 分发。
 * 配方展开（expandRecipe）核对冻结修订（motionRevision+contentDigest）、通道不相交与时长覆盖，
 * 与 validate.ts 的静态规则互补：引用在装配期核对（Spec §4.5-5）。
 */
import type {
  MotionChannel,
  MotionEntry,
  MotionManifest,
  RecipeSource,
} from "../library/contracts.js";
import { resolveSchedule, newPlayableMs, type PreparedMotion, type ResolvedSchedule } from "./prepared.js";

export interface MaterializeOptions {
  planId: string;
  sliceId: string;
  unitIndex: number;
  /** 命中预置时为 null；Author 生成时为生成请求 id */
  generationRequestId: string | null;
  actorEpoch: number;
  expectedPrefixHash: string;
  /** 准备完成时刻（单调 ms） */
  clockMs: number;
  /** 播放时效截止（单调 ms）；缺省 = clock + 30s（库命中无生成延迟，长余量） */
  playbackDeadlineMs?: number;
  /** 宿主解析的播放句柄（Lab planRuntime / 桌面壳实现；commitPrepared 原样交回播放钩子） */
  compiledHandle: unknown;
  validationReportRef?: string | null;
}

/** 由 entry 派生 PreparedMotion 的全部调度与权属字段（Spec §8.2）。 */
export function preparedFromEntry(entry: MotionEntry, opts: MaterializeOptions): PreparedMotion {
  const segment = entry.segments.full;
  const schedule: ResolvedSchedule = resolveSchedule({
    mixInMs: entry.transition.mixInMs,
    contentMs: entry.durationMs,
    mixOutMs: entry.transition.mixOutMs,
  });
  const prepared: PreparedMotion = {
    preparedId: `prep-${entry.motionId}@r${entry.motionRevision}-${opts.planId}-${opts.unitIndex}`,
    planId: opts.planId,
    sliceId: opts.sliceId,
    unitIndex: opts.unitIndex,
    generationRequestId: opts.generationRequestId,
    actorEpoch: opts.actorEpoch,
    profileDigest: entry.rigRef.profileDigest,
    expectedPrefixHash: opts.expectedPrefixHash,
    sourceRef: { motionId: entry.motionId, motionRevision: entry.motionRevision, contentDigest: entry.contentDigest },
    resolvedParameters: {},
    compiledHandle: opts.compiledHandle,
    writes: [...entry.writes],
    channels: [...entry.channels] as MotionChannel[],
    resources: [...entry.preconditions.requiredResources],
    entryBoundary: segment?.entryBoundaryId ?? "enter",
    exitBoundary: segment?.exitBoundaryId ?? "exit",
    expectedState: entry.boundaries[segment?.exitBoundaryId ?? "exit"]?.poseClass ?? "standing",
    resolvedSchedule: schedule,
    newPlayableMs: newPlayableMs(schedule),
    readyAtMonoMs: opts.clockMs,
    playbackDeadlineMonoMs: opts.playbackDeadlineMs ?? opts.clockMs + 30_000,
    validationReportRef: opts.validationReportRef ?? null,
    disposalToken: `dispose-${entry.motionId}-${opts.planId}-${opts.unitIndex}`,
  };
  return prepared;
}

// ---------------------------------------------------------------------------
// 配方展开（Spec §4.5-5 / §9.2-2：深度 ≤2、子动作冻结修订、通道不相交、总时长覆盖）
// ---------------------------------------------------------------------------

export interface ExpandedRecipeStep {
  stepId: string;
  offsetMs: number;
  entry: MotionEntry;
  parameters: Record<string, unknown>;
}

export interface RecipeExpansion {
  steps: ExpandedRecipeStep[];
  /** 各步骤时间轴并集的最右端（配方内容时长下限） */
  contentMs: number;
  channels: MotionChannel[];
  writes: string[];
  resources: string[];
}

export class RecipeExpansionError extends Error {}

/** 展开配方并核对全部冻结引用；任何不一致抛错（不静默降级）。深度首期 ≤2。 */
export function expandRecipe(source: RecipeSource, manifest: MotionManifest, _depth = 0): RecipeExpansion {
  if (_depth > 2) throw new RecipeExpansionError("配方深度超过 2");
  const steps: ExpandedRecipeStep[] = [];
  const channels = new Set<MotionChannel>();
  const writes = new Set<string>();
  const resources = new Set<string>();
  let contentMs = 0;
  // 通道不相交按"时间轴重叠区间"核对（同通道不同时段允许，首期配方步骤全部并行窗，直接取不相交）
  const channelWindows = new Map<MotionChannel, [number, number]>();
  for (const step of source.steps) {
    const sub = manifest.entries.find((e) => e.motionId === step.motionId && e.motionRevision === step.motionRevision);
    if (!sub) throw new RecipeExpansionError(`配方步骤 ${step.stepId} 引用 ${step.motionId}@r${step.motionRevision} 不存在`);
    if (sub.contentDigest !== step.contentDigest) throw new RecipeExpansionError(`配方步骤 ${step.stepId} 引用 ${step.motionId} 摘要与冻结不一致（V18）`);
    if (sub.status !== "approved") throw new RecipeExpansionError(`配方步骤 ${step.stepId} 引用 ${step.motionId} 未 approved`);
    if (sub.source.kind === "recipe") {
      // 嵌套配方：递归展开（深度 +1），子步骤偏移叠加
      const nested = expandRecipe(sub.source, manifest, _depth + 1);
      for (const ns of nested.steps) {
        steps.push({ stepId: `${step.stepId}.${ns.stepId}`, offsetMs: step.offsetMs + ns.offsetMs, entry: ns.entry, parameters: ns.parameters });
      }
      for (const ch of nested.channels) channels.add(ch);
      for (const w of nested.writes) writes.add(w);
      for (const r of nested.resources) resources.add(r);
      contentMs = Math.max(contentMs, step.offsetMs + nested.contentMs);
      continue;
    }
    const start = step.offsetMs;
    const end = step.offsetMs + sub.durationMs;
    for (const ch of sub.channels as MotionChannel[]) {
      const win = channelWindows.get(ch);
      if (win && start < win[1] && win[0] < end) {
        throw new RecipeExpansionError(`配方步骤 ${step.stepId} 通道 ${ch} 与前一步骤时间重叠（首期配方要求不相交）`);
      }
      channelWindows.set(ch, [win ? Math.min(win[0], start) : start, end]);
      channels.add(ch);
    }
    for (const w of sub.writes) writes.add(w);
    for (const r of sub.preconditions.requiredResources) resources.add(r);
    contentMs = Math.max(contentMs, end);
    steps.push({ stepId: step.stepId, offsetMs: step.offsetMs, entry: sub, parameters: { ...step.parameters } });
  }
  return { steps, contentMs, channels: [...channels], writes: [...writes], resources: [...resources] };
}
