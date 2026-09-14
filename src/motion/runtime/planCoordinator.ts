/**
 * PlanCoordinator（MotionLibrary Spec v1.0 §6.3-§7）：
 * 计划准备、连续 ready 前缀缓冲、取消与时间策略——纯逻辑，不直接操作骨骼。
 * - buffered：一次请求的全部必要单元准备好后才开始（开始后不等待生成）；
 * - bufferedSequence：有限多单元序列共享 30s 总准备预算；
 * - rolling：连续 ready 秒数满足准入阈值后提前启播（RTF 证据门控，Spec §7.3）。
 * 提交执行通过注入回调（宿主把它接到 Scheduler/GestureLayer/Broker），本类只做策略。
 */
import type { PreparedMotion } from "./prepared.js";
import { BUFFERED_SEQUENCE_BUDGET } from "../author/protocol.js";

export type PlanMode = "buffered" | "bufferedSequence" | "rolling";
export type UnitStatus = "waiting" | "generating" | "ready" | "committed" | "failed" | "cancelled";

export interface PlannedUnit {
  sliceId: string;
  unitIndex: number;
  status: UnitStatus;
  prepared?: PreparedMotion;
  failReason?: string;
}

export interface PlanState {
  planId: string;
  mode: PlanMode;
  actorEpoch: number;
  units: PlannedUnit[];
  /** 计划接受时刻（单调 ms） */
  acceptedAtMonoMs: number;
  /** 整条计划的总准备 hard 截止 */
  hardDeadlineMonoMs: number;
  cancelled: boolean;
  /** 已提交单元计数（前缀推进） */
  committedCount: number;
}

export interface BeginPlanOptions {
  planId: string;
  mode: PlanMode;
  actorEpoch: number;
  /** 有序切片（sliceId 唯一） */
  sliceIds: string[];
  clockMs: number;
  hardDeadlineMs?: number;
}

export interface CommitResult {
  ok: boolean;
  reason?: string;
}

export interface CoordinatorDeps {
  clock: () => number;
  /** 宿主提交执行：Scheduler 原子取权 + 播放；失败时 prepared 保持待命 */
  commit: (prepared: PreparedMotion) => CommitResult;
}

export class PlanCoordinator {
  private plans = new Map<string, PlanState>();
  private deps: CoordinatorDeps;

  constructor(deps: CoordinatorDeps) {
    this.deps = deps;
  }

  beginPlan(opts: BeginPlanOptions): PlanState {
    const units: PlannedUnit[] = opts.sliceIds.map((sliceId, unitIndex) => ({ sliceId, unitIndex, status: "waiting" }));
    const hard = opts.hardDeadlineMs ?? BUFFERED_SEQUENCE_BUDGET.hardDeadlineMs;
    const state: PlanState = {
      planId: opts.planId,
      mode: opts.mode,
      actorEpoch: opts.actorEpoch,
      units,
      acceptedAtMonoMs: opts.clockMs,
      hardDeadlineMonoMs: opts.clockMs + hard,
      cancelled: false,
      committedCount: 0,
    };
    this.plans.set(opts.planId, state);
    return state;
  }

  plan(planId: string): PlanState | undefined {
    return this.plans.get(planId);
  }

  /** 生成请求出站前登记（一个单元同一时刻至多一个在途任务由宿主保证）。 */
  markGenerating(planId: string, unitIndex: number): boolean {
    const u = this.unit(planId, unitIndex);
    if (!u || (u.status !== "waiting" && u.status !== "failed")) return false;
    u.status = "generating";
    return true;
  }

  /** 命中库或生成+验收完成：登记 ready。迟到结果（计划已取消/已提交）被隔离丢弃（V09）。 */
  noteReady(planId: string, unitIndex: number, prepared: PreparedMotion): boolean {
    const state = this.plans.get(planId);
    if (!state || state.cancelled) return false;
    const u = state.units[unitIndex];
    if (!u || u.status === "committed" || u.status === "cancelled") return false;
    if (u.sliceId !== prepared.sliceId || u.unitIndex !== prepared.unitIndex) return false;
    u.status = "ready";
    u.prepared = prepared;
    return true;
  }

  noteFailed(planId: string, unitIndex: number, reason: string): boolean {
    const u = this.unit(planId, unitIndex);
    if (!u || u.status === "committed" || u.status === "cancelled") return false;
    u.status = "failed";
    u.failReason = reason;
    return true;
  }

  /**
   * 连续 ready 前缀秒数（V10）：只有当前连续前缀已准备好才计入；
   * 跳过一个缺失单元后的后续缓存不提前计入可播放秒数。
   */
  readyPrefixMs(planId: string): number {
    const state = this.plans.get(planId);
    if (!state) return 0;
    let total = 0;
    for (const u of state.units) {
      if (u.status !== "ready" || !u.prepared) break;
      total += u.prepared.newPlayableMs;
    }
    return total;
  }

  /** buffered/bufferedSequence：全部单元 ready 才可启播；rolling 由 rollingGate 判定。 */
  canStart(planId: string): boolean {
    const state = this.plans.get(planId);
    if (!state || state.cancelled) return false;
    return state.units.every((u) => u.status === "ready" || u.status === "committed");
  }

  /** 提交下一个就绪单元（按序；前一个未提交时不动后一个，无越序播放）。 */
  commitNext(planId: string, occupiedChannels: ReadonlySet<string>): CommitResult | { ok: false; reason: string } {
    const state = this.plans.get(planId);
    if (!state || state.cancelled) return { ok: false, reason: "nothing-ready" };
    const next = state.units[state.committedCount];
    if (!next || next.status !== "ready" || !next.prepared) return { ok: false, reason: "nothing-ready" };
    // 播放时效在提交时刻复核（生成截止不作用于播放资格，Spec §6.3）
    if (this.deps.clock() > next.prepared.playbackDeadlineMonoMs) {
      next.status = "failed";
      next.failReason = "playbackDeadlineExceeded";
      return { ok: false, reason: "playbackDeadlineExceeded" };
    }
    const conflicts = next.prepared.channels.filter((ch) => occupiedChannels.has(ch));
    if (conflicts.length > 0) return { ok: false, reason: "channelBusy" }; // 瞬时冲突：单元保持 ready 待重试
    const result = this.deps.commit(next.prepared);
    if (result.ok) {
      next.status = "committed";
      next.prepared = undefined; // 句柄交还宿主；plan 不再持有
      state.committedCount += 1;
    } else {
      next.status = "failed";
      next.failReason = result.reason;
    }
    return result;
  }

  /** 取消整条计划：未提交单元全部失效；已提交单元由宿主按句柄自然回收。 */
  cancelPlan(planId: string, reason: string): number {
    const state = this.plans.get(planId);
    if (!state) return 0;
    state.cancelled = true;
    let n = 0;
    for (const u of state.units) {
      if (u.status === "committed") continue;
      u.status = "cancelled";
      u.failReason = reason;
      u.prepared = undefined;
      n += 1;
    }
    return n;
  }

  /**
   * actorEpoch 变化（换模型/Skin/视图/外部干预）：第一版保守地使整条未播后缀失效（Spec §6.4）。
   * 返回失效单元数。自身计划推进（expectedPrefixHash 变化）不调用此方法。
   */
  invalidateOnEpochChange(reason: string): number {
    let n = 0;
    for (const state of this.plans.values()) {
      if (state.cancelled) continue;
      n += this.cancelPlan(state.planId, reason);
    }
    return n;
  }

  private unit(planId: string, unitIndex: number): PlannedUnit | undefined {
    return this.plans.get(planId)?.units[unitIndex];
  }
}

// ---------------------------------------------------------------------------
// Rolling 准入（MotionLibrary Spec v1.0 §7.3）：可持续速度的确定性门控。
// ---------------------------------------------------------------------------

export interface RtfSample {
  /** 产出该单元的生成+验证+编译用时（含失败尝试；失败且无产出另计失败，不入此样本） */
  produceMs: number;
  /** 该单元新增可播放时长（扣除重复 overlap），ms */
  newPlayableMs: number;
}

export interface RtfStats {
  samples: number;
  /** 单元 RTF 的 p95（L_i/D_i） */
  p95UnitRtf: number;
  /** ΣL/ΣD */
  rtfTotal: number;
  /** 下一完整单元准备时延估计（L95，ms） */
  l95Ms: number;
}

/** 初始准入目标：同一模型配置与相似复杂度，单元 RTF p95 ≤ 0.7 且 RTF_total < 1。 */
export const ROLLING_ADMISSION = {
  targetP95UnitRtf: 0.7,
  maxRtfTotal: 1.0,
  minSamples: 8,
  /** 抖动余量初值（ms） */
  jitterMs: 500,
} as const;

export class RtfTracker {
  private samples: RtfSample[] = [];
  private failures = 0;

  record(sample: RtfSample): void {
    if (sample.newPlayableMs <= 0) return;
    this.samples.push(sample);
  }

  /** 永久没有产出完整段的请求：另计失败，不从分母消失（Spec §7.3）。 */
  recordFailure(): void {
    this.failures += 1;
  }

  stats(): RtfStats {
    const rtfs = this.samples.map((s) => s.produceMs / s.newPlayableMs).sort((a, b) => a - b);
    const p = (q: number) => (rtfs.length ? rtfs[Math.min(rtfs.length - 1, Math.floor(rtfs.length * q))] : Number.POSITIVE_INFINITY);
    const sumL = this.samples.reduce((a, s) => a + s.produceMs, 0);
    const sumD = this.samples.reduce((a, s) => a + s.newPlayableMs, 0);
    const latencies = [...this.samples.map((s) => s.produceMs)].sort((a, b) => a - b);
    const l95 = latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))] : Number.POSITIVE_INFINITY;
    return {
      samples: this.samples.length,
      p95UnitRtf: p(0.95),
      rtfTotal: sumD > 0 ? sumL / sumD : Number.POSITIVE_INFINITY,
      l95Ms: l95,
    };
  }

  /** 当前证据是否允许 rolling 启用。 */
  admitsRolling(): boolean {
    const s = this.stats();
    return this.failures === 0 && s.samples >= ROLLING_ADMISSION.minSamples && s.p95UnitRtf <= ROLLING_ADMISSION.targetP95UnitRtf && s.rtfTotal < ROLLING_ADMISSION.maxRtfTotal;
  }

  /** 启播阈值：至少两段相容单元 ready，且连续 ready 秒数 ≥ max(首段时长, L95+J)。 */
  startThresholdMs(firstUnitMs: number): number {
    return Math.max(firstUnitMs, this.stats().l95Ms + ROLLING_ADMISSION.jitterMs);
  }
}
