/** MotionPreset 与动作目录（Spec 7.6 / 11.1）。数值域是待实测的起始范围。 */
import type { ChannelId } from "../../rig/rigProfile.js";

export interface PresetImplementation {
  curvePreset: string;
  requiredChannels: string[];
}

export interface MotionPreset {
  id: string;
  action: string;
  implementations: Record<string, PresetImplementation>;
  defaults: Record<string, unknown>;
  overrides: Record<string, unknown>;
  style?: string;
  transition?: string;
  optionalChannels?: string[];
}

export const WAVE_SMALL_HAPPY_V1: MotionPreset = {
  id: "wave.small.happy.v1",
  action: "wave",
  implementations: {
    right: { curvePreset: "wave_small_right_approved_v1", requiredChannels: ["rightArm"] },
    left: { curvePreset: "wave_small_left_approved_v1", requiredChannels: ["leftArm"] },
  },
  defaults: { hand: "right", amplitude: 0.75, tempo: 1.0, cycles: 2 },
  overrides: {
    hand: { enum: ["left", "right", "auto"] },
    amplitude: { min: 0.6, max: 1.0 },
    tempo: { min: 0.85, max: 1.2 },
    cycles: { min: 1, max: 3, integer: true },
  },
  style: "happy.gesture.v1",
  transition: "gesture.soft.v1",
  optionalChannels: ["torso", "head"],
};

export const PRESETS: Record<string, MotionPreset> = {
  [WAVE_SMALL_HAPPY_V1.id]: WAVE_SMALL_HAPPY_V1,
};

/** 动作目录：调度器用它判定通道、时长与允许参数（Spec 11.1：运行时只接受已注册动作）。 */
export interface CatalogEntry {
  action: string;
  channel: ChannelId;
  /** hand=auto 时允许的换手通道 */
  alternativeChannel?: ChannelId;
  defaultDurationSec: number;
  interruptible: boolean;
  allowedParams: string[];
}

export const DEFAULT_CATALOG: CatalogEntry[] = [
  { action: "wave", channel: "rightArm", alternativeChannel: "leftArm", defaultDurationSec: 1.6, interruptible: true, allowedParams: ["hand", "amplitude", "tempo", "cycles", "preset", "durationSec"] },
  { action: "point", channel: "rightArm", alternativeChannel: "leftArm", defaultDurationSec: 1.2, interruptible: true, allowedParams: ["hand", "amplitude", "durationSec"] },
  { action: "nod", channel: "head", defaultDurationSec: 0.8, interruptible: true, allowedParams: ["amplitude", "tempo", "cycles", "durationSec"] },
  { action: "look_at", channel: "head", defaultDurationSec: 1.5, interruptible: true, allowedParams: ["target", "holdSec"] },
  { action: "lean", channel: "torso", defaultDurationSec: 1.0, interruptible: true, allowedParams: ["amplitude", "durationSec"] },
  { action: "shrink", channel: "torso", defaultDurationSec: 1.2, interruptible: true, allowedParams: ["amplitude", "durationSec"] },
  { action: "idle", channel: "base", defaultDurationSec: 3, interruptible: true, allowedParams: [] },
  { action: "walk", channel: "base", defaultDurationSec: 2, interruptible: false, allowedParams: ["target", "strideH"] },
  { action: "sit", channel: "base", defaultDurationSec: 1.2, interruptible: false, allowedParams: ["target"] },
];
