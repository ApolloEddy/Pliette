/**
 * GestureLayer：把调度器接受的实例落到官方 AnimationState 固定轨道（Spec 8.2 轨道布局）。
 * 手势结束后用空动画混合交还基础层，不做每帧 setToSetupPose（Spec 8.3 / 9.3）。
 */
import { spine36 as spine } from "spine-webgl";
import type { ChannelId } from "../../rig/rigProfile.js";
import type { MotionInstance, MotionScheduler } from "./scheduler.js";

/** 固定轨道布局：0=base，1=leftArm，2=rightArm，3=torso，4=head，5=face，6=mouth */
export const CHANNEL_TRACK: Partial<Record<ChannelId, number>> = {
  leftArm: 1,
  rightArm: 2,
  torso: 3,
  head: 4,
  face: 5,
  mouth: 6,
};

export class GestureLayer {
  private active = new Map<string, { track: number; mixOutSec: number }>();

  constructor(
    private state: spine.AnimationState,
    private scheduler: MotionScheduler,
  ) {}

  /** 在实例对应轨道上播放编译动画；结束前混出（交还基础层） */
  play(instance: MotionInstance, animation: spine.Animation, mixInSec = 0.15, mixOutSec = 0.15): boolean {
    const track = CHANNEL_TRACK[instance.channel];
    if (track == null) return false;
    const entry = this.state.setAnimationWith(track, animation, false);
    // 结束后混出到空动画：局部所有权交还基础层（Spec 9.3）
    this.state.addEmptyAnimation(track, mixOutSec, Math.max(0, animation.duration - mixOutSec));
    this.active.set(instance.instanceId, { track, mixOutSec });
    entry.listener = {
      complete: () => {},
      end: () => {},
      start: () => {},
      interrupt: () => {},
      dispose: () => {},
      event: () => {},
    };
    return true;
  }

  /** 局部取消：只清对应轨道，其他通道继续（Spec 8.6） */
  cancel(instanceId: string): boolean {
    const info = this.active.get(instanceId);
    if (!info) return false;
    this.state.setEmptyAnimation(info.track, info.mixOutSec);
    this.active.delete(instanceId);
    return true;
  }

  /** 每帧同步：调度器中已结束/取消的实例不再占用动画轨道 */
  sync(): void {
    for (const [instanceId, info] of [...this.active]) {
      const inst = this.scheduler.get(instanceId);
      if (!inst || inst.status !== "active") {
        // 状态由 addEmptyAnimation 的自然混出接管
        this.active.delete(instanceId);
      } else if (inst.status === "active" && inst.elapsedSec >= inst.durationSec - 0.001 && !this.state.tracks[info.track]) {
        this.active.delete(instanceId);
      }
    }
  }

  hasActiveOnChannel(channel: ChannelId): boolean {
    const track = CHANNEL_TRACK[channel];
    if (track == null) return false;
    return [...this.active.values()].some((a) => a.track === track);
  }
}
