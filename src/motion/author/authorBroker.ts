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

  /** 开始一次受限在线请求（单飞）。 */
  begin(profileId: string, requestId: string, contextId: string, stateVersion: number, deadlineMs: number): BeginResult {
    const prev = this.active.get(profileId);
    if (prev && !prev.cancelled) {
      prev.cancelled = true;
      // 相同通道的新请求使旧请求过时（Spec 8.4）；迟到的旧响应由 seen + cancelled 双重拦截
      return { ok: true, superseded: prev.requestId };
    }
    if (this.seen.has(requestId)) {
      return { ok: false, reason: "duplicate requestId" };
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
    return { ok: true, superseded: prev?.requestId };
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
      this.active.delete(profileId);
      return base;
    }

    // unsupported / needs_context：不执行曲线；结束该次请求并记录（Spec 8.1）
    if (response.status !== "motion") {
      this.memoize(requestId);
      this.active.delete(profileId);
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
      this.active.delete(profileId);
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
      this.active.delete(profileId);
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
    this.active.delete(profileId);
    base.accepted = true;
    base.playback = { compiled, channels, durationSec: response.draft.durationSec, mixInSec: 0.15, mixOutSec: 0.2 };
    return base;
  }

  /** 局部取消：只取消该请求的播放实例，不清其他通道（Spec 8.6 / 9.2）。 */
  cancelPlayback(requestId: string): boolean {
    const rec = this.playing.get(requestId);
    if (!rec) return false;
    this.hooks.cancel(rec.instanceId);
    this.playing.delete(requestId);
    return true;
  }

  /** 播放自然结束（混出完成）时由播放端调用，释放记录（长时运行防泄漏，Spec 12.1）。 */
  releasePlayback(requestId: string): void {
    this.playing.delete(requestId);
  }

  snapshot(): { activeRequests: ActiveRequest[]; playing: string[]; memoSize: number } {
    return {
      activeRequests: [...this.active.values()],
      playing: [...this.playing.keys()],
      memoSize: this.seen.size,
    };
  }
}
