/**
 * 手势库：从原动画世界坐标勘探中提炼的专业动作切片（2026-09-08 勘探，scripts/mine-world-segments.mjs）。
 * 每个手势 = 源动画 × 通道 × 时间窗。全部是官方美术数据，零生成关键帧。
 * 勘探要点：局部旋转≥90° 不等于举手——世界坐标（手高于头顶）才是判定标准。
 */
import type { ChannelId } from "../../rig/rigProfile.js";

export interface GestureDef {
  action: string;
  channel: ChannelId;
  source: string;
  start: number;
  end: number;
  /** 中文说明（视频标注/日志用） */
  label: string;
}

export const GESTURE_LIBRARY: GestureDef[] = [
  { action: "wave", channel: "rightArm", source: "stand", start: 4.9, end: 7.3, label: "挥手（右手举臂摇晃）" },
  { action: "wave", channel: "leftArm", source: "stand", start: 13.0, end: 13.9, label: "举手（左手短促）" },
  { action: "dizzy", channel: "head", source: "yun", start: 0.4, end: 2.0, label: "晕乎乎（螺旋眼）" },
  { action: "happy", channel: "head", source: "touch", start: 0, end: 0.67, label: "被摸头开心（眯眼）" },
  { action: "shy", channel: "head", source: "sit", start: 0, end: 1.33, label: "低头害羞" },
  { action: "pump", channel: "rightArm", source: "victory", start: 3.3, end: 4.1, label: "庆祝挥拳" },
  { action: "fresh", channel: "head", source: "normal", start: 0.5, end: 2.5, label: "轻柔头部细节" },
  { action: "point", channel: "rightArm", source: "attack", start: 0.15, end: 0.7, label: "右臂前伸指向" },
];

export function findGesture(action: string, channel: string): GestureDef | undefined {
  return GESTURE_LIBRARY.find((g) => g.action === action && g.channel === channel);
}

export function gestureWindowSec(g: GestureDef): number {
  return g.end - g.start;
}
