/**
 * 固定 Primitive：参数化动作函数（Spec 6.1 第三行能力 / D.5 第 3 步）。
 * 函数本身固定，LLM 只生成有界数值参数（Tune 模式）；
 * 曲线关键帧完全由函数展开，参数不改变函数结构。
 */
import type { MotionDraft, MotionKey } from "./draft.js";

export interface WaveParams {
  hand: "left" | "right";
  /** 整臂抬起角（度），相对参考姿态。域 [15, 45] */
  liftDeg: number;
  /** 指尖挥动幅度（度）。域 [8, 30] */
  wagDeg: number;
  /** 主要段挥动次数（整数）。域 [1, 3] */
  cycles: number;
  /** 节奏（1=原速）。域 [0.8, 1.25] */
  tempo: number;
}

/** 挥手 Primitive 的参数域（Tune 模式的合法空间） */
export const WAVE_PARAM_DOMAIN = {
  liftDeg: { min: 15, max: 45 },
  wagDeg: { min: 8, max: 30 },
  cycles: { min: 1, max: 3, integer: true },
  tempo: { min: 0.8, max: 1.25 },
} as const;

export function wavePrimitive(params: WaveParams, rigProfileId: string, candidate = 1): MotionDraft {
  const { hand, liftDeg, wagDeg, cycles, tempo } = params;
  const side = hand === "left" ? "left" : "right";
  const upperRole = `arm.upper.${side}`;
  const tipRole = `arm.${side}`;
  const channel = hand === "left" ? "leftArm" : "rightArm";

  // 固定阶段结构（秒，受 tempo 缩放的主要/恢复段）；保留精确值：durationSec 与末帧 t 必须一致
  const prepare = 0.3 / Math.max(0.8, Math.min(1.25, tempo));
  const stroke = (0.6 + 0.3 * (cycles - 1)) / tempo;
  const recover = 0.4 / Math.max(0.8, Math.min(1.25, tempo));
  const duration = prepare + stroke + recover;

  // 整臂：抬起 → 保持 → 落回（线性）
  const upperKeys: MotionKey[] = [
    { t: 0, value: 0, ease: "linear" },
    { t: prepare, value: liftDeg, ease: "linear" },
    { t: prepare + stroke, value: liftDeg, ease: "linear" },
    { t: duration, value: 0, ease: "linear" },
  ];

  // 指尖：抬到位后在 [−wag, +wag] 间往返 cycles 次（stroke 段）
  const tipKeys: MotionKey[] = [
    { t: 0, value: 0, ease: "linear" },
    { t: prepare, value: wagDeg, ease: "linear" },
  ];
  const period = stroke / cycles;
  for (let i = 0; i < cycles; i++) {
    const t0 = prepare + i * period;
    tipKeys.push({ t: t0 + period * 0.5, value: -wagDeg, ease: "linear" });
    tipKeys.push({ t: t0 + period, value: wagDeg, ease: "linear" });
  }
  tipKeys.push({ t: duration, value: 0, ease: "linear" });

  return {
    schemaVersion: 1,
    id: `wave_${hand}_primitive_c${candidate}`,
    rigProfile: rigProfileId,
    durationSec: duration,
    channels: [channel],
    phases: { prepareEnd: prepare, strokeEnd: prepare + stroke, recoverEnd: duration },
    curves: [
      { role: upperRole, property: "rotate", mode: "relativeToReference", keys: upperKeys },
      { role: tipRole, property: "rotate", mode: "relativeToReference", keys: tipKeys },
    ],
    requirements: { postures: ["standing", "seated"], views: ["front"], resources: [`channel:${channel}`] },
    provenance: {
      kind: "llm",
      candidate,
      model: "GLM-5.3 (dev agent)",
      promptId: "p1-wave-primitive-tune-1",
      note: "Tune 模式：固定 wavePrimitive 函数，LLM 仅生成 liftDeg/wagDeg/cycles/tempo 数值参数",
    },
    approval: "draft",
  };
}

/** 参数域校验（Tune 模式的第一道关，超出域拒绝进入预览） */
export function checkWaveParams(p: WaveParams): string[] {
  const errors: string[] = [];
  const d = WAVE_PARAM_DOMAIN;
  if (p.liftDeg < d.liftDeg.min || p.liftDeg > d.liftDeg.max) errors.push(`liftDeg=${p.liftDeg} 超出 [${d.liftDeg.min}, ${d.liftDeg.max}]`);
  if (p.wagDeg < d.wagDeg.min || p.wagDeg > d.wagDeg.max) errors.push(`wagDeg=${p.wagDeg} 超出 [${d.wagDeg.min}, ${d.wagDeg.max}]`);
  if (!Number.isInteger(p.cycles) || p.cycles < d.cycles.min || p.cycles > d.cycles.max) errors.push(`cycles=${p.cycles} 非法（整数 [${d.cycles.min}, ${d.cycles.max}]）`);
  if (p.tempo < d.tempo.min || p.tempo > d.tempo.max) errors.push(`tempo=${p.tempo} 超出 [${d.tempo.min}, ${d.tempo.max}]`);
  if (p.hand !== "left" && p.hand !== "right") errors.push(`hand=${p.hand} 非法`);
  return errors;
}
