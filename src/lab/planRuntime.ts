/**
 * MotionLibrary 运行时接线（Lab / 桌面壳共用语义）：
 * PlanAdapter 产物 → Selector（routePlan）→ MotionLibrary materialization → PlanCoordinator（buffered）
 * → Scheduler/overlay/GestureLayer 播放。HIT/MISS/UNSUPPORTED 三路结果在此收口：
 *   - HIT_READY：preparedFromEntry 物化（native_slice / native_clip / draft / recipe 四载体统一），
 *     PlanCoordinator ready 后按序 commit（前一实例结束才提交下一个，无越序播放）；
 *   - MISS_* 且 generatable：经 onAuthorFallback 回调进入受限 Author（调用数由本层计数，验收口径
 *     "库命中 0 次 Author 调用"以此为准）；
 *   - 其余失败（UNSUPPORTED / 生成失败 / 提交冲突）：noteFailed 如实上报，不悄悄播出替代动作。
 * recipe 提交为一次组合实例（通道并集原子取权），内部步骤按 offsetMs 时间轴在本层 tick 驱动。
 */
import { spine36 as spine } from "spine-webgl";
import type { ChannelId, RigProfile } from "../rig/rigProfile.js";
import type { ControlProfile } from "../rig/controlProfile.js";
import { translateDraft } from "../motion/author/translate.js";
import type { DraftV11 } from "../motion/author/protocol.js";
import { compileDraft, type CompiledMotion } from "../motion/compiler/compile.js";
import { CatalogView, loadCatalog } from "../motion/library/catalog.js";
import { loadManifest, MotionIndex, rigIdentityFrom, type RigIdentity } from "../motion/library/index.js";
import type { MotionEntry, MotionManifest, MotionPlan } from "../motion/library/contracts.js";
import { routePlan, type PlanRoute, type SelectorDeps, type SliceRoute } from "../motion/library/selector.js";
import { buildChannels, filterAnimation, playSlice, type ChannelDef, type OverlayHandle } from "../motion/library/overlay.js";
import { CHANNEL_TRACK } from "../motion/runtime/gestureLayer.js";
import { PlanCoordinator, type CommitResult } from "../motion/runtime/planCoordinator.js";
import { expandRecipe, preparedFromEntry, type ExpandedRecipeStep } from "../motion/runtime/materialize.js";
import type { PreparedMotion } from "../motion/runtime/prepared.js";
import type { MotionScheduler } from "../motion/runtime/scheduler.js";

/** 宿主播放句柄：materialization 产出的可执行描述（本模块自己消费）。 */
export type RuntimeHandle =
  | {
      kind: "slice";
      animation: spine.Animation;
      handle: Omit<OverlayHandle, "track"> & { track: number };
      mixInSec: number;
      mixOutSec: number;
      durationSec: number;
    }
  | { kind: "clip"; animation: spine.Animation; loop: boolean }
  | { kind: "compiled"; animation: spine.Animation; channel: ChannelId; mixInSec: number; mixOutSec: number; durationSec: number }
  | { kind: "recipe"; steps: { step: ExpandedRecipeStep; handle: RuntimeHandle }[]; durationMs: number };

export interface PlanSummary {
  planId: string;
  codes: string[];
  hits: number;
  authorFallbacks: number;
  unsupported: number;
  failed: number;
  allHit: boolean;
  wholeRoutine: boolean;
  /** 全部单元终态（ready/failed）后为 true；Author 回退异步回填会延后置位 */
  settled: boolean;
}

export interface PlanRuntimeDeps {
  catalogUrl: string;
  manifestUrl: string;
  draftsBaseUrl: string;
  fetchImpl?: typeof fetch;
  controlProfile: ControlProfile;
  rigProfile: RigProfile;
  scheduler: MotionScheduler;
  skeletonData: () => spine.SkeletonData;
  /** 每个视图一个 AnimationState（flat / 3D）；播放同时作用于全部 */
  states: () => spine.AnimationState[];
  /** MISS_* 且 generatable 时进入受限 Author；经 ready/fail 回调回填计划单元 */
  onAuthorFallback: (
    sliceRoute: SliceRoute,
    unit: { planId: string; unitIndex: number },
    ready: (p: PreparedMotion) => void,
    fail: (reason: string) => void,
  ) => void;
  log: (message: string, cls?: "" | "good" | "bad" | "warn") => void;
}

/** sourceRef 标签（库命中=冻结修订引用；Author 候选=临时身份）。 */
function sourceLabel(prepared: PreparedMotion): string {
  return "motionId" in prepared.sourceRef
    ? `${prepared.sourceRef.motionId}@r${prepared.sourceRef.motionRevision}`
    : prepared.sourceRef.candidateRef;
}

interface ActiveRecipe {
  steps: { step: ExpandedRecipeStep; handle: RuntimeHandle }[];
  nextIndex: number;
  elapsedMs: number;
}

export class MotionLibraryRuntime {
  catalog!: CatalogView;
  manifest!: MotionManifest;
  index = new MotionIndex();
  rig!: RigIdentity;
  coordinator: PlanCoordinator;
  authorCalls = 0;
  lastPlan?: PlanSummary;
  private channelDefs: Record<string, ChannelDef> | null = null;
  private drafts = new Map<string, Promise<CompiledMotion>>();
  private activePlans = new Map<string, { epoch: number; unitSeq: number }>();
  private recipes = new Map<string, ActiveRecipe>();
  private seq = 0;
  private deps: PlanRuntimeDeps;

  constructor(deps: PlanRuntimeDeps) {
    this.deps = deps;
    this.coordinator = new PlanCoordinator({
      clock: () => performance.now(),
      commit: (prepared) => this.commitPrepared(prepared),
    });
  }

  /** 启动加载：catalog/manifest 原子装配；损坏清单拒绝启动（不静默空库）。 */
  async load(): Promise<void> {
    const doFetch = this.deps.fetchImpl ?? fetch.bind(globalThis);
    const [catalogRaw, manifestRaw] = await Promise.all([
      doFetch(this.deps.catalogUrl).then((r) => r.json()),
      doFetch(this.deps.manifestUrl).then((r) => r.json()),
    ]);
    this.catalog = new CatalogView(loadCatalog(catalogRaw));
    this.manifest = loadManifest(manifestRaw, this.catalog.revision);
    this.index.rebuild(this.manifest);
    const anchor = this.manifest.entries[0];
    if (!anchor) throw new Error("manifest 为空：无法建立角色身份");
    this.rig = rigIdentityFrom(anchor.rigRef);
    this.channelDefs = buildChannels(this.deps.skeletonData());
  }

  selectorDeps(planId: string): SelectorDeps {
    return { catalog: this.catalog, index: this.index, rig: this.rig, planId };
  }

  /** 当前角色可播放动作族（能力投影；语义规划只把这些当"可播放"）。 */
  playableActions(): ReadonlySet<string> {
    return new Set(this.index.approvedCountByAction().keys());
  }

  route(plan: MotionPlan): PlanRoute {
    return routePlan(this.selectorDeps(plan.requestId), plan);
  }

  // -------------------------------------------------------------------------
  // 计划执行：beginPlan → 逐切片物化/回退 → buffered → tick 顺序提交
  // -------------------------------------------------------------------------

  /** 物化整条路由并登记 ready/failed；Author 回退异步回填。 */
  beginPlan(route: PlanRoute, actorEpoch: number): PlanSummary {
    const planId = route.planId;
    this.activePlans.set(planId, { epoch: actorEpoch, unitSeq: 0 });
    this.coordinator.beginPlan({
      planId,
      mode: "buffered",
      actorEpoch,
      sliceIds: route.slices.map((s) => s.slice.sliceId),
      clockMs: performance.now(),
    });
    const summary: PlanSummary = {
      planId,
      codes: [],
      hits: 0,
      authorFallbacks: 0,
      unsupported: 0,
      failed: 0,
      allHit: route.allHit,
      wholeRoutine: route.wholeRoutineMatch != null,
      settled: route.slices.length === 0,
    };
    route.slices.forEach((sliceRoute, unitIndex) => {
      summary.codes.push(`${sliceRoute.slice.sliceId}:${sliceRoute.code}`);
      const settle = () => {
        summary.settled =
          summary.hits + summary.failed + summary.unsupported >= route.slices.length;
      };
      if (sliceRoute.code === "HIT_READY" && sliceRoute.match) {
        this.materialize(sliceRoute.match.entry, { planId, sliceId: sliceRoute.slice.sliceId, unitIndex })
          .then((prepared) => {
            if (this.coordinator.noteReady(planId, unitIndex, prepared)) summary.hits += 1;
            else summary.failed += 1;
            settle();
          })
          .catch((e: Error) => {
            this.coordinator.noteFailed(planId, unitIndex, `materialize: ${e.message}`);
            summary.failed += 1;
            settle();
          });
      } else if (sliceRoute.generatable) {
        summary.authorFallbacks += 1;
        this.authorCalls += 1;
        this.deps.onAuthorFallback(sliceRoute, { planId, unitIndex }, (p) => {
          if (this.coordinator.noteReady(planId, unitIndex, p)) summary.hits += 1;
          else summary.failed += 1;
          settle();
        }, (reason) => {
          this.coordinator.noteFailed(planId, unitIndex, reason);
          summary.failed += 1;
          settle();
        });
      } else {
        summary.unsupported += 1;
        this.coordinator.noteFailed(planId, unitIndex, sliceRoute.reason ?? "unsupported");
        settle();
      }
    });
    this.lastPlan = summary;
    return summary;
  }

  /** 每帧推进：配方步骤时间轴 + buffered 计划的按序提交。 */
  tick(dtSec: number): void {
    for (const [id, recipe] of [...this.recipes]) {
      recipe.elapsedMs += dtSec * 1000;
      while (recipe.nextIndex < recipe.steps.length) {
        const next = recipe.steps[recipe.nextIndex];
        if (next.step.offsetMs > recipe.elapsedMs) break;
        this.playHandle(next.handle);
        recipe.nextIndex += 1;
      }
      if (recipe.nextIndex >= recipe.steps.length) this.recipes.delete(id);
    }
    for (const planId of [...this.activePlans.keys()]) {
      const state = this.coordinator.plan(planId);
      if (!state || state.cancelled) {
        this.activePlans.delete(planId);
        continue;
      }
      if (!this.coordinator.canStart(planId)) continue;
      // 本计划仍有活跃实例 → 等它结束（按序播放，不叠加）
      const busy = this.deps.scheduler
        .snapshot()
        .active.some((inst) => inst.requestId.startsWith(`plan/${planId}/`));
      if (busy) continue;
      const occupied = new Set(Object.keys(this.deps.scheduler.snapshot().ownership));
      const result = this.coordinator.commitNext(planId, occupied);
      if (state.committedCount >= state.units.length) {
        this.activePlans.delete(planId);
      } else if (
        !result.ok &&
        state.units.every((u) => u.status === "failed" || u.status === "cancelled" || u.status === "committed")
      ) {
        this.activePlans.delete(planId);
      }
    }
  }

  // -------------------------------------------------------------------------
  // 物化：MotionEntry → PreparedMotion（宿主句柄解析）
  // -------------------------------------------------------------------------

  async materialize(entry: MotionEntry, ref: { planId: string; sliceId: string; unitIndex: number }): Promise<PreparedMotion> {
    const handle = await this.materializeHandle(entry);
    return preparedFromEntry(entry, {
      planId: ref.planId,
      sliceId: ref.sliceId,
      unitIndex: ref.unitIndex,
      generationRequestId: null,
      actorEpoch: this.activePlans.get(ref.planId)?.epoch ?? 1,
      expectedPrefixHash: "plan",
      clockMs: performance.now(),
      compiledHandle: handle,
    });
  }

  /** 独立物化入口（配方视觉验收 / 检查器）：不经 Selector，直接 entry → PreparedMotion。 */
  async materializeDirect(entry: MotionEntry, planId: string): Promise<PreparedMotion> {
    this.activePlans.set(planId, { epoch: 1, unitSeq: 0 });
    try {
      return await this.materialize(entry, { planId, sliceId: entry.actionId, unitIndex: 0 });
    } finally {
      this.activePlans.delete(planId);
    }
  }

  /** 直接物化并提交播放（配方/条目的 materialization 视觉验收；与生产提交共用 commitPrepared 路径）。 */
  async playDirect(motionId: string): Promise<void> {
    const entry = this.byMotionId(motionId);
    if (!entry) throw new Error(`manifest 无此动作：${motionId}`);
    const planId = `direct/${motionId}`;
    const prepared = await this.materializeDirect(entry, planId);
    this.commitPrepared(prepared);
  }

  byMotionId(motionId: string): MotionEntry | undefined {
    return this.manifest.entries.find((e) => e.motionId === motionId);
  }

  async materializeHandle(entry: MotionEntry): Promise<RuntimeHandle> {
    const src = entry.source;
    if (src.kind === "native_slice") {
      const data = this.deps.skeletonData();
      const source = data.findAnimation(src.animationName);
      if (!source) throw new Error(`源动画缺失：${src.animationName}`);
      const channelName = entry.channels[0];
      const def = this.channelDefs?.[channelName];
      if (!def) throw new Error(`通道定义缺失：${channelName}`);
      const filtered = filterAnimation(data, source, def, `${entry.motionId}#${channelName}`);
      if (!filtered) throw new Error(`${src.animationName} 在通道 ${channelName} 无可过滤 timeline`);
      const track = CHANNEL_TRACK[channelName as ChannelId];
      if (track == null) throw new Error(`通道无轨道映射：${channelName}`);
      return {
        kind: "slice",
        animation: filtered,
        handle: {
          track,
          channel: channelName,
          source: src.animationName,
          startTime: src.sourceStartMs / 1000,
          windowSec: entry.durationMs / 1000,
        },
        mixInSec: entry.transition.mixInMs / 1000,
        mixOutSec: entry.transition.mixOutMs / 1000,
        durationSec: entry.durationMs / 1000,
      };
    }
    if (src.kind === "native_clip") {
      const data = this.deps.skeletonData();
      const animation = data.findAnimation(src.animationName);
      if (!animation) throw new Error(`源动画缺失：${src.animationName}`);
      return { kind: "clip", animation, loop: entry.loop.allowed };
    }
    if (src.kind === "draft") {
      const compiled = await this.compiledDraft(entry);
      const channel = (entry.channels[0] ?? "torso") as ChannelId;
      return {
        kind: "compiled",
        animation: compiled.animation,
        channel,
        mixInSec: entry.transition.mixInMs / 1000,
        mixOutSec: entry.transition.mixOutMs / 1000,
        durationSec: compiled.durationSec,
      };
    }
    // recipe：递归物化子步骤（冻结引用由 expandRecipe 核对）
    if (src.kind !== "recipe") throw new Error(`未知载体：${JSON.stringify(src)}`);
    const expansion = expandRecipe(src, this.manifest);
    const steps: { step: ExpandedRecipeStep; handle: RuntimeHandle }[] = [];
    for (const step of expansion.steps) {
      steps.push({ step, handle: await this.materializeHandle(step.entry) });
    }
    return { kind: "recipe", steps, durationMs: entry.durationMs };
  }

  /** 草稿编译（V1.1 → MotionDraft → CompiledMotion），按 contentDigest 缓存。 */
  private compiledDraft(entry: MotionEntry): Promise<CompiledMotion> {
    const src = entry.source;
    if (src.kind !== "draft") throw new Error("非 draft 载体");
    const cached = this.drafts.get(src.contentDigest);
    if (cached) return cached;
    const doFetch = this.deps.fetchImpl ?? fetch.bind(globalThis);
    const task = doFetch(`${this.deps.draftsBaseUrl}/${src.path.replace(/^drafts\//, "")}`)
      .then((r) => {
        if (!r.ok) throw new Error(`草稿加载 HTTP ${r.status}：${src.path}`);
        return r.json() as Promise<DraftV11>;
      })
      .then((v11) => {
        const tr = translateDraft(v11, this.deps.controlProfile, this.deps.rigProfile.id);
        if (!tr.draft) throw new Error(`V1.1 翻译失败：${entry.motionId}`);
        const { motion, diagnostics } = compileDraft(tr.draft, this.deps.rigProfile, this.deps.skeletonData());
        const errors = diagnostics.filter((d) => d.level === "error");
        if (!motion || errors.length > 0) {
          throw new Error(`草稿编译失败：${entry.motionId} ${errors.map((d) => d.code).join(",")}`);
        }
        return motion;
      });
    this.drafts.set(src.contentDigest, task);
    return task;
  }

  // -------------------------------------------------------------------------
  // 提交与播放
  // -------------------------------------------------------------------------

  private commitPrepared(prepared: PreparedMotion): CommitResult {
    const scheduler = this.deps.scheduler;
    const requestId = `plan/${prepared.planId}/${prepared.sliceId}/${++this.seq}`;
    const submit = scheduler.submitComposite({
      schemaVersion: 1,
      requestId,
      action: `plan:${sourceLabel(prepared)}`,
      channels: prepared.channels as ChannelId[],
      durationSec: prepared.resolvedSchedule.occupancyMs / 1000,
      writes: prepared.writes,
      resources: prepared.resources,
      source: "plan",
    });
    if (submit.status !== "accepted") {
      this.deps.log(`plan 提交被调度器拒绝：${submit.reason}${submit.detail ? `（${submit.detail}）` : ""}`, "warn");
      return { ok: false, reason: submit.reason ?? "rejected" };
    }
    const handle = prepared.compiledHandle as RuntimeHandle;
    if (handle.kind === "recipe") {
      this.recipes.set(submit.instanceId!, { steps: handle.steps, nextIndex: 0, elapsedMs: 0 });
      this.deps.log(
        `recipe 提交 ${sourceLabel(prepared)}（${submit.instanceId}，通道 ${prepared.channels.join("+")}，${handle.steps.length} 步，${prepared.resolvedSchedule.contentMs}ms）`,
        "good",
      );
    } else {
      this.playHandle(handle);
      this.deps.log(`plan 播放 ${sourceLabel(prepared)}（${submit.instanceId}，通道 ${prepared.channels.join("+")}）`, "good");
    }
    return { ok: true };
  }

  /** 按句柄类型落到官方 AnimationState（全部视图同步）。调用方已持有调度权。 */
  playHandle(handle: RuntimeHandle): void {
    const states = this.deps.states();
    if (handle.kind === "slice") {
      for (const state of states) playSlice(state, handle.animation, handle.handle, handle.mixInSec, handle.mixOutSec);
      return;
    }
    if (handle.kind === "clip") {
      for (const state of states) {
        const entry = state.setAnimationWith(0, handle.animation, handle.loop);
        entry.mixDuration = 0.15;
        if (!handle.loop) state.addEmptyAnimation(0, 0.2, Math.max(0, handle.animation.duration - 0.2));
      }
      return;
    }
    if (handle.kind === "compiled") {
      const track = CHANNEL_TRACK[handle.channel];
      if (track == null) return;
      for (const state of states) {
        const entry = state.setAnimationWith(track, handle.animation, false);
        entry.mixDuration = Math.max(0, handle.mixInSec);
        state.addEmptyAnimation(track, handle.mixOutSec, Math.max(0, handle.durationSec - handle.mixOutSec));
      }
      return;
    }
    // recipe 顶层（直接物化验收用）：注册时间轴，无调度权（视觉验收模式）
    const id = `recipe-direct/${++this.seq}`;
    this.recipes.set(id, { steps: handle.steps, nextIndex: 0, elapsedMs: 0 });
  }

  /** 调试投影：Lab __labDebug / E2E 断言用。 */
  snapshot(): { catalogRevision: string; approved: number; authorCalls: number; lastPlan?: PlanSummary } {
    return {
      catalogRevision: this.catalog?.revision ?? "-",
      approved: this.manifest?.entries.filter((e) => e.status === "approved").length ?? 0,
      authorCalls: this.authorCalls,
      lastPlan: this.lastPlan,
    };
  }
}
