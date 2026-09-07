/** MotionDraft 数据契约（Spec 6.2 / 6.4 / 附录 A.1）。 */

export type Ease = "linear" | "stepped" | "bezier";
export type CurveProperty = "rotate" | "translate" | "scale" | "attachment";

export interface MotionKey {
  /** 秒 */
  t: number;
  /** rotate: 角度（相对参考姿态）；translate: [xH, yH]；scale: [sx, sy]；attachment: 附件名 */
  value: number | [number, number] | string;
  ease?: Ease;
  /** 归一化 Bézier 控制点 [x1,y1,x2,y2]，全部 ∈ [0,1] 且时间控制点单调 */
  bezierCP?: [number, number, number, number];
}

export interface MotionCurve {
  /** 语义部位角色，经 RigProfile 绑定到真实骨骼 */
  role: string;
  property: CurveProperty;
  mode: "relativeToReference";
  keys: MotionKey[];
}

export interface MotionPhases {
  prepareEnd?: number;
  strokeEnd?: number;
  recoverEnd?: number;
  [marker: string]: number | undefined;
}

export interface MotionRequirements {
  postures?: string[];
  views?: ("front" | "back")[];
  resources?: string[];
}

export interface MotionProvenance {
  kind: "llm" | "manual" | "builtin";
  candidate?: number;
  model?: string;
  promptId?: string;
  note?: string;
}

export interface MotionDraft {
  schemaVersion: 1;
  id: string;
  rigProfile: string;
  /** 秒 */
  durationSec: number;
  channels: string[];
  phases?: MotionPhases;
  curves: MotionCurve[];
  requirements?: MotionRequirements;
  provenance?: MotionProvenance;
  approval: "draft" | "approved";
}

/** 角色自身的左右：值相对参考姿态的偏移角（度）。左手镜像由 rig 的 rotationSign 处理。 */
export function nodHeadDraft(rigProfileId: string, amplitudeDeg = 10, durationSec = 0.8): MotionDraft {
  return {
    schemaVersion: 1,
    id: `nod_head_candidate_${Date.now().toString(36)}`,
    rigProfile: rigProfileId,
    durationSec,
    channels: ["head"],
    phases: { prepareEnd: durationSec * 0.2, strokeEnd: durationSec * 0.7, recoverEnd: durationSec },
    curves: [
      {
        role: "head.main",
        property: "rotate",
        mode: "relativeToReference",
        keys: [
          { t: 0, value: 0, ease: "linear" },
          { t: durationSec * 0.35, value: amplitudeDeg, ease: "linear" },
          { t: durationSec, value: 0, ease: "linear" },
        ],
      },
    ],
    requirements: { postures: ["standing", "seated"], views: ["front"] },
    provenance: { kind: "builtin", note: "Lab 内置模板，非 LLM 生成" },
    approval: "draft",
  };
}

export function waveSmallDraft(rigProfileId: string, hand: "left" | "right" = "right", amplitudeDeg = 22, durationSec = 1.6): MotionDraft {
  return {
    schemaVersion: 1,
    id: `wave_small_${hand}_candidate_${Date.now().toString(36)}`,
    rigProfile: rigProfileId,
    durationSec,
    channels: [hand === "left" ? "leftArm" : "rightArm"],
    phases: { prepareEnd: 0.3, strokeEnd: 1.2, recoverEnd: durationSec },
    curves: [
      {
        role: hand === "left" ? "arm.left" : "arm.right",
        property: "rotate",
        mode: "relativeToReference",
        keys: [
          { t: 0.0, value: 0, ease: "linear" },
          { t: 0.3, value: amplitudeDeg, ease: "linear" },
          { t: 0.6, value: amplitudeDeg * 0.64, ease: "linear" },
          { t: 0.9, value: amplitudeDeg * 1.18, ease: "linear" },
          { t: 1.2, value: amplitudeDeg * 0.82, ease: "linear" },
          { t: 1.6, value: 0, ease: "linear" },
        ],
      },
    ],
    requirements: { postures: ["standing", "seated"], views: ["front"] },
    provenance: { kind: "builtin", note: "Lab 内置模板（Spec 6.4 数据契约示例），非 LLM 生成" },
    approval: "draft",
  };
}
