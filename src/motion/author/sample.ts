/**
 * 轨迹采样检查（指导书 Spec 9.1-6）：在隔离的官方 skeleton 实例上按播放步长评估
 * 编译后的真实曲线，检查最终合成值与速率。采样检查不是形式化证明——受限在线模式
 * 仍依靠已标定范围、保守组合和运行时守护（Spec 9.1 尾注）。
 *
 * 隔离实例复现基础动画（可选）+ 候选轨道；spine-core 无需 WebGL（node 可运行）。
 */
import { spine36 as spine } from "spine-webgl";
import type { ControlProfile, ControlDefinition } from "../../rig/controlProfile.js";
import { diag, type AuthorFinding } from "./diagnostics.js";

export interface SampleOptions {
  /** 采样步长（秒）；默认 1/30 */
  dt?: number;
  /** 混入时长（秒）：此前候选未满权重，从 mixIn 之后开始计满权值 */
  mixInSec?: number;
  /** 基础动画（隔离复现当前基础状态；V1 受限模式可省略=稳定 setup 基态） */
  baseAnim?: spine.Animation;
  basePhaseSec?: number;
}

export interface ControlSample {
  controlId: string;
  /** 全程最终合成值的极值（按轴） */
  min: number[];
  max: number[];
  /** 满权后的峰值变化速率（单位/秒，按主轴） */
  peakRatePerSec: number;
  /** 结束时的合成值（退出交权检查用） */
  endValue: number[];
}

export interface SampleReport {
  samples: ControlSample[];
  findings: AuthorFinding[];
  /** 采样点数与时长（诊断/评测记录用） */
  steps: number;
}

interface TrackTarget {
  controlId: string;
  boneIndex: number | null;
  slotIndex: number | null;
  property: ControlDefinition["binding"]["property"];
  axes: number;
}

function readValue(
  skeleton: spine.Skeleton,
  target: TrackTarget,
  setupRot: number | null,
  setupX: number | null,
  setupY: number | null,
): number[] {
  if (target.slotIndex != null && target.property === "attachment") {
    // 附件是离散值，数值采样退化为"该 Slot 当前附件索引"（占用/冲突由写集检查承担）
    const slot = skeleton.slots[target.slotIndex];
    const name = (slot as unknown as { getAttachment?: () => { name: string } | null }).getAttachment?.()?.name
      ?? (slot as unknown as { attachment?: { name: string } }).attachment?.name
      ?? "";
    return [Number.isFinite(Number(name)) ? Number(name) : hashName(name)];
  }
  const bone = skeleton.bones[target.boneIndex ?? -1];
  if (!bone) return [0];
  if (target.property === "rotate") return [bone.rotation - (setupRot ?? 0)];
  if (target.property === "translate") return [bone.x - (setupX ?? 0), bone.y - (setupY ?? 0)];
  if (target.property === "scale") return [bone.scaleX, bone.scaleY];
  return [0];
}

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return h;
}

/**
 * 采样编译后的候选动画。controls 用于确定采样目标与单位；不认识的控制跳过（由校验层负责拒绝）。
 * 返回每个控制的真实合成轨迹极值/速率；findings 携带 RATE_VIOLATION（域检查由规则层完成）。
 */
export function sampleTrajectory(
  skeletonData: spine.SkeletonData,
  animation: spine.Animation,
  controls: ControlDefinition[],
  opts: SampleOptions = {},
): SampleReport {
  const dt = opts.dt ?? 1 / 30;
  const mixIn = opts.mixInSec ?? 0.15;
  const skeleton = new spine.Skeleton(skeletonData);
  skeleton.setToSetupPose();

  const setupRot = new Map<number, number>();
  const setupPos = new Map<number, [number, number]>();
  skeleton.bones.forEach((b, i) => {
    setupRot.set(i, b.rotation);
    setupPos.set(i, [b.x, b.y]);
  });

  const targets: TrackTarget[] = [];
  for (const c of controls) {
    if (c.kind === "composite") {
      // composite：采样其子控制器（写集已派生到 ownership.writes）
      for (const w of c.ownership.writes) {
        const sub = controls.find((x) => x.controlId !== c.controlId && x.ownership.writes.includes(w));
        if (sub) pushTarget(targets, sub, skeletonData);
      }
      continue;
    }
    pushTarget(targets, c, skeletonData);
  }

  const fullFrom = Math.min(mixIn, animation.duration);
  const samples = new Map<string, { min: number[]; max: number[]; peakRate: number; prev: number[] | null; end: number[] }>();
  for (const t of targets) {
    samples.set(t.controlId, { min: [Infinity], max: [-Infinity], peakRate: 0, prev: null, end: [0] });
  }

  const applyAnim = (anim: spine.Animation, time: number, alpha: number, pose: number) => {
    // 3.6 签名：apply(skeleton, lastTime, time, loop, events, alpha, pose, direction)
    anim.apply(skeleton, time, time, false, [], alpha, pose, spine.MixDirection.in);
  };

  let steps = 0;
  let prevTime = -dt;
  const total = animation.duration;
  for (let i = 0; ; i++) {
    const t = Math.min(i * dt, total); // 按索引计算，保证末步精确落在 duration（浮点累加不回绕）
    steps++;
    skeleton.setToSetupPose();
    if (opts.baseAnim) applyAnim(opts.baseAnim, (opts.basePhaseSec ?? 0) + t, 1, spine.MixPose.setup);
    // 候选轨道满权重（隔离评估忽略混合细节；混入窗口内值不参与速率/域判定）
    applyAnim(animation, t, 1, spine.MixPose.current);
    skeleton.updateWorldTransform();
    const fullWeight = t >= fullFrom - 1e-9;
    for (const target of targets) {
      const s = samples.get(target.controlId)!;
      const v = readValue(skeleton, target, target.boneIndex != null ? setupRot.get(target.boneIndex) ?? null : null, target.boneIndex != null ? setupPos.get(target.boneIndex)?.[0] ?? null : null, target.boneIndex != null ? setupPos.get(target.boneIndex)?.[1] ?? null : null);
      if (s.min.length < v.length) {
        s.min = v.map(() => Infinity);
        s.max = v.map(() => -Infinity);
      }
      v.forEach((x, i) => {
        s.min[i] = Math.min(s.min[i], x);
        s.max[i] = Math.max(s.max[i], x);
      });
      if (fullWeight && s.prev && v.length > 0) {
        const rate = Math.abs(v[0] - s.prev[0]) / Math.max(1e-9, t - prevTime);
        s.peakRate = Math.max(s.peakRate, rate);
      }
      s.prev = fullWeight ? v : s.prev;
      s.end = v;
    }
    prevTime = t;
    if (t >= total) break;
  }

  const findings: AuthorFinding[] = [];
  const out: ControlSample[] = [];
  for (const c of controls) {
    const s = samples.get(c.controlId);
    if (!s) continue;
    out.push({ controlId: c.controlId, min: s.min, max: s.max, peakRatePerSec: s.peakRate, endValue: s.end });
    if (c.rate?.maxPerSec != null && s.peakRate > c.rate.maxPerSec + 1e-6) {
      findings.push(diag({
        code: "RATE_VIOLATION",
        stage: "sample",
        controlId: c.controlId,
        expected: `≤ ${c.rate.maxPerSec}/s`,
        actual: `${s.peakRate.toFixed(1)}/s`,
        recoverable: true,
        message: "满权重段真实轨迹速率超限（隔离实例采样）",
      }));
    }
  }
  return { samples: out, findings, steps };
}

function pushTarget(targets: TrackTarget[], c: ControlDefinition, data: spine.SkeletonData): void {
  if (c.binding.property === "attachment") {
    targets.push({ controlId: c.controlId, boneIndex: null, slotIndex: data.findSlotIndex(c.binding.slot ?? ""), property: "attachment", axes: 1 });
    return;
  }
  const idx = data.findBoneIndex(c.binding.bone ?? "");
  targets.push({
    controlId: c.controlId,
    boneIndex: idx >= 0 ? idx : null,
    slotIndex: null,
    property: c.binding.property,
    axes: c.binding.property === "translate" || c.binding.property === "scale" ? 2 : 1,
  });
}
