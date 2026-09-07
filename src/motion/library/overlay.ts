/**
 * 原动画切片叠加库（Spec P2 通道过滤架构 + "专业数据复用"路线）：
 * 从拉菲自带的专业动画中，按身体通道（头/左臂/右臂/躯干）过滤 timeline，
 * 以时间窗切片形式叠加到基础动画上。不做任何新关键帧创作。
 *
 * 实测语义（3.6.53）：高层轨道旋转在满权重时绝对接管该属性，混合期平滑过渡，
 * 混出后交还基础层——即"手势接管"手感。
 */
import { spine36 as spine } from "spine-webgl";
import type { ChannelId } from "../../rig/rigProfile.js";

export interface ChannelDef {
  channel: ChannelId;
  track: number;
  bones: Set<number>;
  slots: Set<number>;
}

/**  bone 及其全部后代 */
function descendants(data: spine.SkeletonData, rootName: string): Set<number> {
  const byParent = new Map<string, string[]>();
  for (const b of data.bones) {
    const p = b.parent?.name ?? "";
    (byParent.get(p) ?? byParent.set(p, []).get(p)!).push(b.name);
  }
  const out = new Set<number>();
  const walk = (name: string) => {
    const idx = data.findBoneIndex(name);
    if (idx >= 0) out.add(idx);
    for (const child of byParent.get(name) ?? []) walk(child);
  };
  walk(rootName);
  return out;
}

/** 面部表情相关 Slot（眼睛/眉毛/腮红/困意/不爽贴片）；按名称存在性解析，其他骨架自动忽略 */
const FACE_SLOTS = ["eye_L", "eye_R", "meimao1", "hongyun", "sleep2", "bushuang1", "bushuang2", "eye_L_blink", "eye_R_blink", "mouth"];

/** 骨骼名按候选模式解析（lafei: face/hand_L；spineboy: head/armL 等） */
function resolveBone(data: spine.SkeletonData, patterns: RegExp[]): number {
  const names = data.bones.map((b) => b.name);
  for (const re of patterns) {
    const hit = names.find((n) => re.test(n));
    if (hit) return data.findBoneIndex(hit);
  }
  return -1;
}

export function buildChannels(data: spine.SkeletonData): Record<string, ChannelDef> {
  const slotSet = (names: string[]) => new Set(names.map((n) => data.findSlotIndex(n)).filter((i) => i >= 0));
  const add = (set: Set<number>, idx: number) => { if (idx >= 0) set.add(idx); };

  const headRoot = resolveBone(data, [/^head$/i, /^face$/i, /head/i]);
  const headBones = new Set<number>();
  if (headRoot >= 0) for (const i of descendants(data, data.bones[headRoot].name)) headBones.add(i);
  add(headBones, resolveBone(data, [/^eye_L$/i, /eye[_-]?l$/i]));
  add(headBones, resolveBone(data, [/^eye_R$/i, /eye[_-]?r$/i]));

  const leftArmRoot = resolveBone(data, [/^hand[_-]?l$/i, /^arm[_-]?l$/i, /arm.*l$/i]);
  const leftArmBones = new Set<number>();
  if (leftArmRoot >= 0) for (const i of descendants(data, data.bones[leftArmRoot].name)) leftArmBones.add(i);

  const rightArmRoot = resolveBone(data, [/^hand[_-]?r$/i, /^arm[_-]?r$/i, /arm.*r$/i]);
  const rightArmBones = new Set<number>();
  if (rightArmRoot >= 0) for (const i of descendants(data, data.bones[rightArmRoot].name)) rightArmBones.add(i);

  const bodyRoot = resolveBone(data, [/^(body|hip|torso)$/i]);
  const torsoBones = new Set<number>();
  if (bodyRoot >= 0) torsoBones.add(bodyRoot);

  const eyeL = resolveBone(data, [/^eye_L$/i, /eye[_-]?l$/i]);
  const eyeR = resolveBone(data, [/^eye_R$/i, /eye[_-]?r$/i]);
  const faceBones = new Set<number>();
  add(faceBones, eyeL);
  add(faceBones, eyeR);

  return {
    head: { channel: "head", track: 4, bones: headBones, slots: slotSet(FACE_SLOTS) },
    face: { channel: "face", track: 5, bones: faceBones, slots: slotSet(["eye_L", "eye_R", "meimao1", "hongyun", "sleep2"]) },
    leftArm: { channel: "leftArm", track: 1, bones: leftArmBones, slots: slotSet(["hand_L2"]) },
    rightArm: { channel: "rightArm", track: 2, bones: rightArmBones, slots: slotSet(["hand_R2"]) },
    torso: { channel: "torso", track: 3, bones: torsoBones, slots: new Set() },
  };
}

export interface OverlayHandle {
  track: number;
  source: string;
  channel: string;
  startTime: number;
  windowSec: number;
}

/**
 * 过滤源动画：仅保留属于通道骨骼/Slot 的 timeline（旋转/位移/缩放/附件/颜色/网格变形），
 * 排除 IK/路径/绘制顺序/事件（上部通道不应动腿部 IK 或全局绘制顺序）。
 * 返回的 Animation 复用原 timeline 对象（数据只读），时长=源时长，切片由播放端控制。
 */
export function filterAnimation(
  data: spine.SkeletonData,
  source: spine.Animation,
  channel: ChannelDef,
  name: string,
): spine.Animation | null {
  const timelines: spine.Timeline[] = [];
  for (const tl of source.timelines) {
    const ctor = tl.constructor.name;
    if (ctor === "RotateTimeline" || ctor === "TranslateTimeline" || ctor === "ScaleTimeline" || ctor === "ShearTimeline") {
      if (channel.bones.has((tl as unknown as { boneIndex: number }).boneIndex)) timelines.push(tl);
    } else if (ctor === "AttachmentTimeline" || ctor === "ColorTimeline" || ctor === "TwoColorTimeline" || ctor === "DeformTimeline") {
      if (channel.slots.has((tl as unknown as { slotIndex: number }).slotIndex)) timelines.push(tl);
    }
    // IkConstraintTimeline / PathConstraint* / DrawOrderTimeline / EventTimeline 不进入叠加层
  }
  if (timelines.length === 0) return null;
  return new spine.Animation(name, timelines, source.duration);
}

/**
 * 在轨道上播放切片：使用原生 animationStart/animationEnd 定义时间窗，
 * 窗口结束前 mixOutSec 开始混出空动画，交还基础层。
 * mixInSec/mixOutSec 可调（Spec 9.3：微表情 0.05-0.12，普通 0.12-0.25）。
 */
export function playSlice(
  state: spine.AnimationState,
  filtered: spine.Animation,
  handle: Omit<OverlayHandle, "track"> & { track: number },
  mixInSec = 0.15,
  mixOutSec = 0.2,
): void {
  const { track, startTime, windowSec } = handle;
  const entry = state.setAnimationWith(track, filtered, false);
  entry.animationStart = startTime;
  entry.animationEnd = Math.min(startTime + windowSec, filtered.duration);
  const delay = Math.max(0.05, windowSec - mixOutSec);
  state.addEmptyAnimation(track, mixOutSec, delay);
}
