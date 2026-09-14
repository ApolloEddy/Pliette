/**
 * 旧入口兼容层（MotionLibrary Spec v1.0 §4.2 legacyAdapter）：
 * 旧 GestureDef（src/motion/library/gestures.ts）/ 行为配方 events / 预设 → 新契约逻辑键。
 * 迁移对照以 Spec §9.1 为准——旧标签与语义并非一一对应（如旧 leftArm "wave" 实为短促举手）。
 * 兼容期旧调用方继续可用；兼容结束后随旧来源一起移除。
 */
import type { ChannelId } from "../../rig/rigProfile.js";
import type { GestureDef } from "./gestures.js";
import type { LookupKey } from "./index.js";

/** 旧 action + 通道 → 新逻辑键（Spec §9.1 种子迁移表）。 */
const LEGACY_MAP: Record<string, Record<string, LookupKey>> = {
  wave: {
    rightArm: { actionId: "gesture.wave", variantId: "small.screen_right", segmentId: "full" },
    // 旧标签实际是短促举手，不能继续充当挥手精确命中（Spec §9.1）
    leftArm: { actionId: "gesture.raise_hand", variantId: "screen_left", segmentId: "full" },
  },
  dizzy: { head: { actionId: "reaction.dizzy", variantId: "small", segmentId: "full" } },
  happy: { head: { actionId: "reaction.happy", variantId: "small", segmentId: "full" } },
  shy: { head: { actionId: "reaction.shy", variantId: "small", segmentId: "full" } },
  pump: { rightArm: { actionId: "gesture.pump", variantId: "screen_right", segmentId: "full" } },
  fresh: { head: { actionId: "life.idle_fidget", variantId: "default", segmentId: "full" } },
  point: { rightArm: { actionId: "gesture.point", variantId: "screen_right", segmentId: "full" } },
  touch_table: { rightArm: { actionId: "contact.touch_table", variantId: "screen_right", segmentId: "full" } },
};

export function legacyKeyFor(action: string, channel: ChannelId | string): LookupKey | undefined {
  return LEGACY_MAP[action]?.[channel];
}

export function legacyKeyForGesture(g: GestureDef): LookupKey | undefined {
  return legacyKeyFor(g.action, g.channel);
}

/** 旧行为配方 events（P4 对话层映射）→ 逻辑键序列；供规则版 Select 适配器与 Lab 复用。 */
export const LEGACY_EVENT_KEYS: Record<string, LookupKey[]> = {
  greet: [{ actionId: "routine.greet", variantId: "default", segmentId: "full" }],
  praise: [{ actionId: "gesture.pump", variantId: "screen_right", segmentId: "full" }, { actionId: "reaction.happy", variantId: "small", segmentId: "full" }],
  pet: [{ actionId: "reaction.happy", variantId: "small", segmentId: "full" }],
  scare: [{ actionId: "reaction.dizzy", variantId: "small", segmentId: "full" }],
  tease: [{ actionId: "reaction.shy", variantId: "small", segmentId: "full" }],
  question: [{ actionId: "head.tilt", variantId: "gentle.screen_right", segmentId: "full" }],
  ambient: [{ actionId: "life.idle_fidget", variantId: "default", segmentId: "full" }],
  drink: [{ actionId: "gesture.wave", variantId: "small.screen_right", segmentId: "full" }],
};
