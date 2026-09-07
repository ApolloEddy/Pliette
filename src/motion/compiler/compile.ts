/** Motion Compiler：把通过校验的 Draft 编译为与资源版本匹配的官方 Timeline 对象（Spec 6.2 / D.5）。 */
import { spine36 as spine } from "spine-webgl";
import type { MotionDraft, MotionKey } from "../authoring/draft.js";
import type { RigProfile } from "../../rig/rigProfile.js";
import { validateDraft, hasErrors, type Diagnostic } from "./validate.js";

export interface CompiledMotion {
  id: string;
  viewId: string;
  /** 官方运行时 Animation 对象，可在对应版本 AnimationState 上播放 */
  animation: spine.Animation;
  /** 实际属性写集，如 bone:hand_R/rotate（Spec 8.1） */
  writes: string[];
  channels: string[];
  durationSec: number;
  phases: MotionDraft["phases"];
  warnings: Diagnostic[];
}

function applyEase(tl: spine.CurveTimeline, keys: MotionKey[], warnings: Diagnostic[], label: string): void {
  for (let i = 0; i < keys.length - 1; i++) {
    const ease = keys[i].ease ?? "linear";
    if (ease === "stepped") {
      tl.setStepped(i);
    } else if (ease === "bezier") {
      const cp = keys[i].bezierCP!;
      if (cp[0] > cp[2]) {
        warnings.push({ level: "warn", code: "bezierTimeNotMonotonic", message: `${label} 第 ${i} 段 Bézier 时间控制点非单调，已按原样传入官方 setCurve` });
      }
      // 3.6 CurveTimeline.setCurve(帧索引, 归一化控制点)（Spec D.5），与 Draft 的 [0,1] 约定一致
      tl.setCurve(i, cp[0], cp[1], cp[2], cp[3]);
    }
  }
}

export function compileDraft(
  draft: MotionDraft,
  rig: RigProfile,
  skeletonData: spine.SkeletonData,
): { motion?: CompiledMotion; diagnostics: Diagnostic[] } {
  const diagnostics = validateDraft(draft, rig);
  if (hasErrors(diagnostics)) return { diagnostics };

  const warnings: Diagnostic[] = [];
  let heightUnits = rig.heightUnits;
  if (heightUnits == null) {
    heightUnits = skeletonData.height > 0 ? skeletonData.height : 100;
    warnings.push({
      level: "warn",
      code: "uncalibratedHeight",
      message: `RigProfile 未标定 heightUnits，暂时使用 skeletonData.height=${heightUnits} 作为 H 换算（需正式标定）`,
    });
  }
  const units: number = heightUnits;

  const timelines: spine.Timeline[] = [];
  const writes: string[] = [];

  for (const c of draft.curves) {
    const binding = rig.bones[c.role]!;
    const label = `${c.role}.${c.property}`;
    const keys = c.keys;

    if (c.property === "attachment") {
      const slotIndex = skeletonData.findSlotIndex(binding.bone);
      if (slotIndex < 0) {
        diagnostics.push({ level: "error", code: "slotMissing", message: `Slot ${binding.bone} 不存在`, path: label });
        continue;
      }
      const tl = new spine.AttachmentTimeline(keys.length);
      tl.slotIndex = slotIndex;
      keys.forEach((k, i) => tl.setFrame(i, k.t as number, k.value as string));
      timelines.push(tl);
      writes.push(`slot:${binding.bone}/attachment`);
      continue;
    }

    const boneIndex = skeletonData.findBoneIndex(binding.bone);
    if (boneIndex < 0) {
      diagnostics.push({ level: "error", code: "boneMissing", message: `骨骼 ${binding.bone} 不存在`, path: label });
      continue;
    }
    const boneData = skeletonData.bones[boneIndex];

    if (c.property === "rotate") {
      const sign = binding.rotationSign ?? 1;
      const tl = new spine.RotateTimeline(keys.length);
      tl.boneIndex = boneIndex;
      // 3.6 运行时对 RotateTimeline 的值按"相对 setup 姿态的偏移"应用（实测采样确认：
      // bone.rotation += amount），因此直接写入 Draft 的偏移角，不叠加 setup。
      keys.forEach((k, i) => tl.setFrame(i, k.t as number, sign * (k.value as number)));
      applyEase(tl, keys, warnings, label);
      timelines.push(tl);
      writes.push(`bone:${binding.bone}/rotate`);
    } else if (c.property === "translate") {
      const tl = new spine.TranslateTimeline(keys.length);
      tl.boneIndex = boneIndex;
      keys.forEach((k, i) => {
        const [xH, yH] = k.value as [number, number];
        tl.setFrame(i, k.t as number, xH * units, yH * units);
      });
      applyEase(tl, keys, warnings, label);
      timelines.push(tl);
      writes.push(`bone:${binding.bone}/translate`);
    } else if (c.property === "scale") {
      const tl = new spine.ScaleTimeline(keys.length);
      tl.boneIndex = boneIndex;
      keys.forEach((k, i) => {
        const [sx, sy] = k.value as [number, number];
        tl.setFrame(i, k.t as number, sx, sy);
      });
      applyEase(tl, keys, warnings, label);
      timelines.push(tl);
      writes.push(`bone:${binding.bone}/scale`);
    }
  }

  if (hasErrors(diagnostics)) return { diagnostics };

  const animation = new spine.Animation(draft.id, timelines, draft.durationSec);
  return {
    motion: {
      id: draft.id,
      viewId: rig.view,
      animation,
      writes,
      channels: [...draft.channels],
      durationSec: draft.durationSec,
      phases: draft.phases,
      warnings,
    },
    diagnostics,
  };
}
