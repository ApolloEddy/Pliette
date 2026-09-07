/**
 * Motion Scheduler（P2 种子实现，Spec 8 / 11 / A.3）：
 * 通道占用、幂等提交、auto 换手、抢占与取消、tick 驱动。
 * 纯逻辑，不依赖 DOM / WebGL，便于 Vitest 直接验证。
 */
import type { ChannelId } from "../../rig/rigProfile.js";
import type { CatalogEntry } from "../parameters/presets.js";

export interface MotionIntent {
  schemaVersion: 1;
  requestId: string;
  action: string;
  params?: Record<string, unknown>;
  source?: "user" | "dialogue" | "ambient";
  /** 提交后存活时间；到消费时刻过期返回 expired（Spec 8.6） */
  expiresInMs?: number;
}

export type SubmitStatus = "accepted" | "queued" | "rejected" | "expired";

export interface SubmitResult {
  status: SubmitStatus;
  instanceId?: string;
  channel?: ChannelId;
  reason?: string;
  detail?: string;
  alternatives?: string[];
}

export type InstanceStatus = "active" | "completed" | "cancelled" | "expired";

export interface MotionInstance {
  instanceId: string;
  requestId: string;
  action: string;
  channel: ChannelId;
  params: Record<string, unknown>;
  durationSec: number;
  elapsedSec: number;
  status: InstanceStatus;
  startedAtMs: number;
}

export class MotionScheduler {
  private catalog: Map<string, CatalogEntry>;
  private ownership = new Map<ChannelId, MotionInstance>();
  private instances = new Map<string, MotionInstance>();
  private seenRequests = new Map<string, SubmitResult>();
  private clock: () => number;
  private seq = 0;

  constructor(catalog: CatalogEntry[], clock: () => number = () => Date.now()) {
    this.catalog = new Map(catalog.map((c) => [c.action, c]));
    this.clock = clock;
  }

  /** 相同 requestId 重复提交幂等（Spec 11.2） */
  submit(intent: MotionIntent): SubmitResult {
    const prior = this.seenRequests.get(intent.requestId);
    if (prior) return { ...prior };
    const result = this.evaluate(intent);
    this.seenRequests.set(intent.requestId, result);
    return { ...result };
  }

  private evaluate(intent: MotionIntent): SubmitResult {
    const entry = this.catalog.get(intent.action);
    if (!entry) {
      return { status: "rejected", reason: "unknownAction", detail: `未注册动作 ${intent.action}`, alternatives: [...this.catalog.keys()] };
    }
    const now = this.clock();
    if (intent.expiresInMs != null && intent.expiresInMs < 0) {
      return { status: "expired", reason: "ttl", detail: "意图已过期，不补播（Spec 8.6）" };
    }

    const params = { ...(intent.params ?? {}) };
    for (const key of Object.keys(params)) {
      if (!entry.allowedParams.includes(key)) {
        return { status: "rejected", reason: "unknownParam", detail: `动作 ${intent.action} 不接受参数 ${key}` };
      }
      if (typeof params[key] === "number" && !Number.isFinite(params[key])) {
        return { status: "rejected", reason: "invalidParam", detail: `参数 ${key}=${params[key]} 非有限数值` };
      }
    }

    // 显式 hand 直接路由通道；auto/缺省在占用时换空闲手（Spec 7.6 / 8.5）
    let channel = entry.channel;
    if (entry.alternativeChannel && params.hand === "left") {
      channel = entry.alternativeChannel;
    }
    const holder = this.ownership.get(channel);
    if (holder && holder.status === "active") {
      const canSwap =
        entry.alternativeChannel != null &&
        channel === entry.channel &&
        !this.ownership.has(entry.alternativeChannel) &&
        (params.hand === "auto" || params.hand == null);
      if (canSwap) {
        channel = entry.alternativeChannel!;
      } else if (entry.interruptible && (intent.source === "user" || intent.source === "dialogue")) {
        // 较新的明确请求可在允许的退出点抢占（Spec 8.6）
        this.cancel(holder.instanceId, "preempted");
      } else {
        return {
          status: "rejected",
          reason: "resourceConflict",
          detail: `${channel} 被实例 ${holder.instanceId}（${holder.action}）占用`,
          alternatives: entry.alternativeChannel ? [entry.alternativeChannel] : [],
        };
      }
    }

    const instanceId = `mi-${++this.seq}`;
    const inst: MotionInstance = {
      instanceId,
      requestId: intent.requestId,
      action: intent.action,
      channel,
      params,
      durationSec:
        typeof params.durationSec === "number" && Number.isFinite(params.durationSec) && params.durationSec > 0
          ? params.durationSec
          : entry.defaultDurationSec,
      elapsedSec: 0,
      status: "active",
      startedAtMs: now,
    };
    this.instances.set(instanceId, inst);
    this.ownership.set(channel, inst);
    return { status: "accepted", instanceId, channel };
  }

  /** 取消指定实例；只释放它自己的通道，不动其他轨道（Spec 8.6 局部取消） */
  cancel(instanceId: string, _reason: string): boolean {
    const inst = this.instances.get(instanceId);
    if (!inst || inst.status !== "active") return false;
    inst.status = "cancelled";
    if (this.ownership.get(inst.channel)?.instanceId === instanceId) {
      this.ownership.delete(inst.channel);
    }
    return true;
  }

  cancelByRequest(requestId: string, reason: string): boolean {
    for (const inst of this.instances.values()) {
      if (inst.requestId === requestId && inst.status === "active") return this.cancel(inst.instanceId, reason);
    }
    return false;
  }

  /** 推进一次逻辑时钟（每帧只推一次，Spec 8.8）；返回本帧完成的实例 */
  tick(dtSec: number): MotionInstance[] {
    const completed: MotionInstance[] = [];
    for (const inst of [...this.ownership.values()]) {
      inst.elapsedSec += dtSec;
      if (inst.elapsedSec >= inst.durationSec) {
        inst.status = "completed";
        this.ownership.delete(inst.channel);
        completed.push(inst);
      }
    }
    return completed;
  }

  holderOf(channel: ChannelId): MotionInstance | undefined {
    return this.ownership.get(channel);
  }

  get(instanceId: string): MotionInstance | undefined {
    return this.instances.get(instanceId);
  }

  snapshot(): { ownership: Record<string, string>; active: MotionInstance[] } {
    const ownership: Record<string, string> = {};
    for (const [ch, inst] of this.ownership) ownership[ch] = `${inst.action}(${inst.instanceId})`;
    return { ownership, active: [...this.instances.values()].filter((i) => i.status === "active") };
  }
}
