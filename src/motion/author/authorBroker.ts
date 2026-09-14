/**
 * AuthorBroker（指导书 Spec 8.4 / 9.2 / 9.3 / 9.4）：
 * 受限在线生成的请求生命周期与提交播放——
 * - 单飞：每角色最多 1 个活跃请求；新请求使同通道旧请求过时；
 * - 截止：从请求提交计时（非首 token）；超期响应丢弃（DEADLINE_EXCEEDED）；
 * - 陈旧性：离散状态版本在请求期间变化 → 拒绝提交（STALE_CONTEXT）；连续状态不判过时；
 * - 幂等：重复/迟到/换角后的 requestId 不再执行；
 * - 原子提交：状态检查与控制权获取同一步完成；局部取消只清自己的通道。
 * 纯逻辑（播放通过回调注入），便于 Vitest 直接验证。
 */
import type { CompiledMotion } from "../compiler/compile.js";
import { diag, type AuthorFinding } from "./diagnostics.js";
import type { PreparedMotion } from "../runtime/prepared.js";
import type { AuthorResponse, GuideRequest, RuntimeStateSnapshot } from "./protocol.js";

export interface BeginResult {
  ok: boolean;
  /** 本次 begin 使之下线（过时）的先前请求 */
  superseded?: string;
  reason?: string;
}

interface ActiveRequest {
  profileId: string;
  requestId: string;
  contextId: string;
  /** 请求发出时观察到的离散状态版本 */
  stateVersion: number;
  submittedAtMs: number;
  deadlineMs: number;
  cancelled: boolean;
}

export interface CommitInput {
  request: GuideRequest;
  response: AuthorResponse;
  compiled?: CompiledMotion;
  /** 提交时刻的当前状态（程序读取，非 LLM 声明） */
  current: RuntimeStateSnapshot;
  /** 已被其他系统（手势/切片）占用的通道 */
  occupiedChannels: ReadonlySet<string>;
}

export interface CommitOutcome {
  accepted: boolean;
  /** 接受时的播放句柄输入（compiled + 通道 + durationSec） */
  playback?: { compiled: CompiledMotion; channels: string[]; durationSec: number; mixInSec: number; mixOutSec: number };
  findings: AuthorFinding[];
  /** 支持的回退标记：accepted=false 时调度策略决定回退动作 */
  fallback: "keep-current" | "none";
}

export interface PlaybackHooks {
  /** 开始播放（已通过全部检查）；返回实例 id */
  play: (playback: CommitOutcome["playback"], requestId: string) => string;
  /** 局部取消（只清该实例自己的通道，Spec 8.6） */
  cancel: (instanceId: string) => void;
}

export class AuthorBroker {
  private active = new Map<string, ActiveRequest>();
  /** 幂等备忘录（FIFO 有界）：近期请求去重窗口，超容量淘汰最旧记录（长时间运行不无界增长） */
  private seen: Set<string>;
  private playing = new Map<string, { instanceId: string; channels: string[] }>();
  /** 预生成生命周期（MotionLibrary Spec §6.3）：已产出未提交的 PreparedMotion 登记簿 */
  private ready = new Map<string, PreparedMotion>();
  private seq = 0;

  constructor(
    private hooks: PlaybackHooks,
    private clock: () => number = () => Date.now(),
    /** 幂等窗口容量（Spec 12.1 浸泡教训：无界 Set 在长时运行中必然溢出） */
    private maxMemo = 8192,
  ) {
    this.seen = new Set();
  }

  private memoize(requestId: string): void {
    this.seen.add(requestId);
    if (this.seen.size > this.maxMemo) {
      const oldest = this.seen.values().next().value;
      if (oldest != null) this.seen.delete(oldest);
    }
  }

  /** 开始一次受限在线请求（单飞）。F2：替换旧请求后必须完整登记新请求；重复/在途 ID 检查不影响在途请求。 */
  begin(profileId: string, requestId: string, contextId: string, stateVersion: number, deadlineMs: number): BeginResult {
    const cur = this.active.get(profileId);
    if (cur && cur.requestId === requestId && !cur.cancelled) {
      return { ok: false, reason: "requestId 已在途（不得重置其提交时钟）" };
    }
    if (this.seen.has(requestId)) {
      return { ok: false, reason: "duplicate requestId" };
    }
    const prev = this.active.get(profileId);
    let superseded: string | undefined;
    if (prev && !prev.cancelled) {
      prev.cancelled = true;
      // 相同通道的新请求使旧请求过时（Spec 8.4）；迟到的旧响应由 seen + cancelled 双重拦截
      superseded = prev.requestId;
    }
    this.active.set(profileId, {
      profileId,
      requestId,
      contextId,
      stateVersion,
      submittedAtMs: this.clock(),
      deadlineMs,
      cancelled: false,
    });
    return { ok: true, superseded };
  }

  /** 客户端取消（请求方主动）。 */
  cancel(profileId: string, requestId: string): boolean {
    const rec = this.active.get(profileId);
    if (!rec || rec.requestId !== requestId) return false;
    rec.cancelled = true;
    return true;
  }

  /** 请求是否已过时（离散版本变化 / 被取消 / 超截止）。连续状态变化不判过时（Spec 9.3）。 */
  isStale(profileId: string, requestId: string, current: RuntimeStateSnapshot, nowMs = this.clock()): { stale: boolean; reason?: string; code?: string } {
    const rec = this.active.get(profileId);
    if (!rec || rec.requestId !== requestId) return { stale: true, reason: "无此活跃请求（已单飞替换或角色已切换）", code: "STALE_CONTEXT" };
    if (rec.cancelled) return { stale: true, reason: "请求已取消", code: "STALE_CONTEXT" };
    if (nowMs - rec.submittedAtMs > rec.deadlineMs) return { stale: true, reason: `超过截止 ${rec.deadlineMs}ms`, code: "DEADLINE_EXCEEDED" };
    if (current.stateVersion !== rec.stateVersion) {
      return { stale: true, reason: `离散状态版本变化 ${rec.stateVersion}→${current.stateVersion}`, code: "STALE_CONTEXT" };
    }
    return { stale: false };
  }

  /** F2：按请求身份结束生命周期——仅当当前记录仍是该请求时才删除，迟到响应不得波及新请求。 */
  private finishActive(profileId: string, requestId: string): void {
    const rec = this.active.get(profileId);
    if (rec && rec.requestId === requestId) this.active.delete(profileId);
  }

  /**
   * 提交候选（Spec 9.1-7）：过时/幂等检查与播放启动在同一次调用内完成，
   * 杜绝"检查时空闲、执行时已占用"。
   */
  commit(profileId: string, input: CommitInput): CommitOutcome {
    const { request, response, compiled, current, occupiedChannels } = input;
    const requestId = response.requestId;
    const base: CommitOutcome = { accepted: false, findings: [], fallback: "keep-current" };

    const stale = this.isStale(profileId, requestId, current);
    if (stale.stale) {
      base.findings.push(diag({
        code: stale.code === "DEADLINE_EXCEEDED" ? "DEADLINE_EXCEEDED" : "STALE_CONTEXT",
        stage: "schedule",
        requestId,
        draftId: response.status === "motion" ? response.draft.id : undefined,
        expected: `stateVersion=${this.active.get(profileId)?.stateVersion ?? "?"}`,
        actual: `stateVersion=${current.stateVersion}${stale.reason ? `（${stale.reason}）` : ""}`,
        recoverable: false,
        message: stale.reason ?? "请求已过时，不再执行",
      }));
      this.memoize(requestId);
      // 只结束该请求自己的生命周期；新请求的记录保持不动（F2 复现二）
      this.finishActive(profileId, requestId);
      return base;
    }

    // unsupported / needs_context：不执行曲线；结束该次请求并记录（Spec 8.1）
    if (response.status !== "motion") {
      this.memoize(requestId);
      this.finishActive(profileId, requestId);
      base.accepted = false;
      base.fallback = "keep-current";
      return base;
    }

    // 通道占用：author 通道与其他系统互斥（同一次提交内完成检查+取权）
    const channels = [...new Set(compiled?.channels ?? [])];
    const conflicts = channels.filter((ch) => occupiedChannels.has(ch));
    if (conflicts.length > 0) {
      base.findings.push(diag({
        code: "PROPERTY_CONFLICT",
        stage: "schedule",
        requestId,
        draftId: response.draft.id,
        expected: "通道空闲",
        actual: `被占用：${conflicts.join("、")}`,
        recoverable: true,
        message: "目标通道被其他实例占用，当前请求不可取权",
      }));
      this.memoize(requestId);
      this.finishActive(profileId, requestId);
      return base;
    }

    if (!compiled) {
      // 未提供编译产物（校验层未执行编译）——视为内部错误，拒绝
      base.findings.push(diag({
        code: "INVALID_TIMELINE",
        stage: "schedule",
        requestId,
        draftId: response.draft.id,
        expected: "已编译动画",
        actual: "无",
        recoverable: false,
        message: "缺少编译产物，无法提交播放",
      }));
      this.memoize(requestId);
      this.finishActive(profileId, requestId);
      return base;
    }

    // 原子取权 + 播放（播放记录同样有界：超容量淘汰最旧——取消接口对极老条目失效是可接受权衡）
    const instanceId = this.hooks.play(
      { compiled, channels, durationSec: response.draft.durationSec, mixInSec: 0.15, mixOutSec: 0.2 },
      requestId,
    );
    this.playing.set(requestId, { instanceId, channels });
    if (this.playing.size > this.maxMemo) {
      const oldest = this.playing.keys().next().value;
      if (oldest != null) this.playing.delete(oldest);
    }
    this.memoize(requestId);
    this.finishActive(profileId, requestId);
    base.accepted = true;
    base.playback = { compiled, channels, durationSec: response.draft.durationSec, mixInSec: 0.15, mixOutSec: 0.2 };
    return base;
  }

  // -------------------------------------------------------------------------
  // 预生成生命周期（MotionLibrary Spec v1.0 §6.3）：生成完成 ≠ 播放开始。
  // beginGeneration → acceptGenerated（产出 PreparedMotion，不申请通道）
  // → enqueuePrepared（进入计划 ready 集合）→ commitPrepared（播放时复核+原子取权）
  // → releasePlayback。生成截止限制"何时产出"，播放截止限制"何时开始仍有效"。
  // -------------------------------------------------------------------------

  /** beginGeneration：与 begin 同义（语义命名，供新链路使用）。 */
  beginGeneration(profileId: string, requestId: string, contextId: string, stateVersion: number, deadlineMs: number): BeginResult {
    return this.begin(profileId, requestId, contextId, stateVersion, deadlineMs);
  }

  /**
   * acceptGenerated：校验/编译完成后关闭生成生命周期。
   * 检查身份/取消/离散状态版本，但不检查生成截止——准备好的合法动作
   * 不得因超过生成请求截止被误删（播放时效由 playbackDeadlineMonoMs 单独管，Spec §6.3）。
   * 不申请播放通道、不自动播。
   */
  acceptGenerated(profileId: string, prepared: PreparedMotion): { accepted: boolean; findings: AuthorFinding[] } {
    const findings: AuthorFinding[] = [];
    const requestId = prepared.generationRequestId;
    const rec = requestId != null ? this.active.get(profileId) : undefined;
    if (requestId == null || !rec || rec.requestId !== requestId) {
      findings.push(diag({ code: "STALE_CONTEXT", stage: "schedule", requestId: requestId ?? "?", recoverable: false, message: "无此活跃生成请求（已被替换或已结束），候选仅隔离登记" }));
      if (requestId != null) this.memoize(requestId);
      return { accepted: false, findings };
    }
    if (rec.cancelled) {
      findings.push(diag({ code: "STALE_CONTEXT", stage: "schedule", requestId: rec.requestId, recoverable: false, message: "请求已取消，候选不进入准备" }));
      this.finishActive(profileId, rec.requestId);
      this.memoize(rec.requestId);
      return { accepted: false, findings };
    }
    // 离散状态版本变化在产出时刻即失效；连续状态不判过时（Spec §9.3）
    if (prepared.actorEpoch !== rec.stateVersion) {
      findings.push(diag({ code: "STALE_CONTEXT", stage: "schedule", requestId: rec.requestId, expected: `epoch=${rec.stateVersion}`, actual: `epoch=${prepared.actorEpoch}`, recoverable: false, message: "产出时角色语境已变化，候选不进入准备" }));
      this.finishActive(profileId, rec.requestId);
      this.memoize(rec.requestId);
      return { accepted: false, findings };
    }
    this.ready.set(prepared.preparedId, prepared);
    this.memoize(rec.requestId);
    this.finishActive(profileId, rec.requestId);
    return { accepted: true, findings };
  }

  /** enqueuePrepared：放入当前计划的 ready 集合（连续前缀/播放时机由 PlanCoordinator 决定）。 */
  enqueuePrepared(prepared: PreparedMotion): void {
    this.ready.set(prepared.preparedId, prepared);
  }

  getPrepared(preparedId: string): PreparedMotion | undefined {
    return this.ready.get(preparedId);
  }

  /**
   * commitPrepared：到播放时再次核对播放时效与权属，然后原子取权并播放。
   * 与 commit 的区别：不检查生成截止（检查的是 prepared 自己的 playbackDeadline）。
   * 编译产物取自 prepared.compiledHandle（冻结时已验证）。
   */
  commitPrepared(profileId: string, preparedId: string, current: RuntimeStateSnapshot, occupiedChannels: ReadonlySet<string>): CommitOutcome {
    void current;
    const base: CommitOutcome = { accepted: false, findings: [], fallback: "keep-current" };
    const prepared = this.ready.get(preparedId);
    if (!prepared) {
      base.findings.push(diag({ code: "STALE_CONTEXT", stage: "schedule", recoverable: false, message: "PreparedMotion 不存在、已提交或已被处置" }));
      return base;
    }
    const rec = this.active.get(profileId);
    if (rec && prepared.generationRequestId != null && rec.requestId === prepared.generationRequestId && rec.cancelled) {
      base.findings.push(diag({ code: "STALE_CONTEXT", stage: "schedule", requestId: prepared.generationRequestId, recoverable: false, message: "生成请求已取消，不再提交" }));
      this.disposePrepared(preparedId, prepared.disposalToken);
      return base;
    }
    if (this.clock() > prepared.playbackDeadlineMonoMs) {
      base.findings.push(diag({ code: "DEADLINE_EXCEEDED", stage: "schedule", requestId: prepared.generationRequestId ?? "?", expected: `≤ ${prepared.playbackDeadlineMonoMs}ms`, actual: `${this.clock()}ms`, recoverable: false, message: "超过播放时效，本次交互不再开始" }));
      this.disposePrepared(preparedId, prepared.disposalToken);
      return base;
    }
    const conflicts = [...prepared.channels, ...prepared.resources].filter((c) => occupiedChannels.has(c));
    if (conflicts.length > 0) {
      base.findings.push(diag({ code: "PROPERTY_CONFLICT", stage: "schedule", requestId: prepared.generationRequestId ?? "?", expected: "通道/资源空闲", actual: `被占用：${conflicts.join("、")}`, recoverable: true, message: "目标通道/资源被其他实例占用，prepared 保持待命" }));
      return base; // 保持 prepared 不销毁——排队/退出策略决定重试
    }
    const playback = {
      compiled: prepared.compiledHandle as CompiledMotion,
      channels: [...prepared.channels],
      durationSec: prepared.resolvedSchedule.contentMs / 1000,
      mixInSec: prepared.resolvedSchedule.mixInMs / 1000,
      mixOutSec: prepared.resolvedSchedule.mixOutMs / 1000,
    };
    const instanceId = this.hooks.play(playback, prepared.preparedId);
    this.playing.set(preparedId, { instanceId, channels: [...prepared.channels] });
    if (this.playing.size > this.maxMemo) {
      const oldest = this.playing.keys().next().value;
      if (oldest != null && this.ready.get(oldest) == null) this.playing.delete(oldest);
    }
    this.ready.delete(preparedId);
    base.accepted = true;
    base.playback = playback;
    return base;
  }

  /** 处置 prepared：token 不匹配时拒绝（旧回调不得销毁新实例，V09）。 */
  disposePrepared(preparedId: string, token: string): boolean {
    const prepared = this.ready.get(preparedId);
    if (!prepared || prepared.disposalToken !== token) return false;
    this.ready.delete(preparedId);
    return true;
  }

  /** 播放自然结束/异常结束都走此释放（preparedId 与 requestId 双口径）。 */
  releasePlayback(key: string): void {
    this.playing.delete(key);
  }

  /** 局部取消播放（兼容旧 requestId 口径与新 preparedId 口径）。 */
  cancelPlayback(key: string): boolean {
    const rec = this.playing.get(key);
    if (!rec) return false;
    this.hooks.cancel(rec.instanceId);
    this.playing.delete(key);
    return true;
  }

  snapshot(): { activeRequests: ActiveRequest[]; playing: string[]; memoSize: number; ready: string[] } {
    return {
      activeRequests: [...this.active.values()],
      playing: [...this.playing.keys()],
      memoSize: this.seen.size,
      ready: [...this.ready.keys()],
    };
  }
}
