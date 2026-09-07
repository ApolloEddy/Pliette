/**
 * P1 六项动作候选（Spec 2.3 对照实验）的首次输出。
 * provenance.kind="llm"：由开发 Agent（GLM-5.3）作为 Author 产出，见 experiments/p1-llm-motion/prompt-context.md。
 * 修订不修改本文件——修订版本保存在 experiments/ 目录，原始首次输出必须保留（Spec 2.3）。
 */
import type { MotionDraft } from "./draft.js";
import { wavePrimitive } from "./primitives.js";

const RIG = "lafei_8.front.v1";

/** 1. 轻微待机 idle_subtle：躯干小幅呼吸起伏 + 头部极缓摆动（对照原资源 stand 待机） */
export const IDLE_SUBTLE_C1: MotionDraft = {
  schemaVersion: 1,
  id: "idle_subtle_c1",
  rigProfile: RIG,
  durationSec: 2.4,
  channels: ["torso", "head"],
  phases: { prepareEnd: 0.2, strokeEnd: 1.2, recoverEnd: 2.4 },
  curves: [
    {
      role: "body.root",
      property: "translate",
      mode: "relativeToReference",
      keys: [
        { t: 0, value: [0, 0], ease: "bezier", bezierCP: [0.4, 0, 0.6, 1] },
        { t: 1.2, value: [0, 0.008], ease: "bezier", bezierCP: [0.4, 0, 0.6, 1] },
        { t: 2.4, value: [0, 0], ease: "linear" },
      ],
    },
    {
      role: "head.main",
      property: "rotate",
      mode: "relativeToReference",
      keys: [
        { t: 0, value: 0, ease: "bezier", bezierCP: [0.4, 0, 0.6, 1] },
        { t: 1.2, value: 2.5, ease: "bezier", bezierCP: [0.4, 0, 0.6, 1] },
        { t: 2.4, value: 0, ease: "linear" },
      ],
    },
  ],
  requirements: { postures: ["standing"], views: ["front"] },
  provenance: { kind: "llm", candidate: 1, model: "GLM-5.3 (dev agent)", promptId: "p1-six-actions-author-1" },
  approval: "draft",
};

/** 2. 点头 nod（复用模板结构，幅度/节奏为本次首输出） */
export const NOD_C1: MotionDraft = {
  schemaVersion: 1,
  id: "nod_c1",
  rigProfile: RIG,
  durationSec: 0.8,
  channels: ["head"],
  phases: { prepareEnd: 0.16, strokeEnd: 0.56, recoverEnd: 0.8 },
  curves: [
    {
      role: "head.main",
      property: "rotate",
      mode: "relativeToReference",
      keys: [
        { t: 0, value: 0, ease: "bezier", bezierCP: [0.3, 0, 0.7, 1] },
        { t: 0.28, value: 12, ease: "bezier", bezierCP: [0.3, 0, 0.7, 1] },
        { t: 0.56, value: 2, ease: "bezier", bezierCP: [0.3, 0, 0.7, 1] },
        { t: 0.8, value: 0, ease: "linear" },
      ],
    },
  ],
  requirements: { postures: ["standing", "seated"], views: ["front"] },
  provenance: { kind: "llm", candidate: 1, model: "GLM-5.3 (dev agent)", promptId: "p1-six-actions-author-1" },
  approval: "draft",
};

/** 3. 单手小幅挥手 wave（Tune 模式）：固定 primitive + 首次数值参数 */
export const WAVE_C1: MotionDraft = wavePrimitive(
  { hand: "right", liftDeg: 30, wagDeg: 18, cycles: 2, tempo: 1.0 },
  RIG,
  1,
);

/** 4. 指向 point：整臂抬至前伸位并保持，指尖稳定，回收 */
export const POINT_C1: MotionDraft = {
  schemaVersion: 1,
  id: "point_right_c1",
  rigProfile: RIG,
  durationSec: 1.4,
  channels: ["rightArm"],
  phases: { prepareEnd: 0.35, strokeEnd: 0.55, recoverEnd: 1.4 },
  curves: [
    {
      role: "arm.upper.right",
      property: "rotate",
      mode: "relativeToReference",
      keys: [
        { t: 0, value: 0, ease: "bezier", bezierCP: [0.25, 0.1, 0.25, 1] },
        { t: 0.35, value: 38, ease: "linear" },
        { t: 0.95, value: 38, ease: "stepped" },
        { t: 1.4, value: 0, ease: "bezier", bezierCP: [0.4, 0, 0.6, 1] },
      ],
    },
    {
      role: "arm.right",
      property: "rotate",
      mode: "relativeToReference",
      keys: [
        { t: 0, value: 0, ease: "linear" },
        { t: 0.35, value: -6, ease: "linear" },
        { t: 0.95, value: -6, ease: "stepped" },
        { t: 1.4, value: 0, ease: "linear" },
      ],
    },
  ],
  requirements: { postures: ["standing", "seated"], views: ["front"], resources: ["channel:rightArm"] },
  provenance: { kind: "llm", candidate: 1, model: "GLM-5.3 (dev agent)", promptId: "p1-six-actions-author-1" },
  approval: "draft",
};

/** 5. 倾身倾听 lean_listen：躯干前倾 + 头部微抬反代偿 */
export const LEAN_C1: MotionDraft = {
  schemaVersion: 1,
  id: "lean_listen_c1",
  rigProfile: RIG,
  durationSec: 1.6,
  channels: ["torso", "head"],
  phases: { prepareEnd: 0.45, strokeEnd: 1.2, recoverEnd: 1.6 },
  curves: [
    {
      role: "body.root",
      property: "rotate",
      mode: "relativeToReference",
      keys: [
        { t: 0, value: 0, ease: "bezier", bezierCP: [0.3, 0, 0.4, 1] },
        { t: 0.45, value: 7, ease: "linear" },
        { t: 1.2, value: 7, ease: "stepped" },
        { t: 1.6, value: 0, ease: "bezier", bezierCP: [0.5, 0, 0.7, 1] },
      ],
    },
    {
      role: "head.main",
      property: "rotate",
      mode: "relativeToReference",
      keys: [
        { t: 0, value: 0, ease: "bezier", bezierCP: [0.3, 0, 0.4, 1] },
        { t: 0.45, value: -3, ease: "linear" },
        { t: 1.2, value: -3, ease: "stepped" },
        { t: 1.6, value: 0, ease: "linear" },
      ],
    },
  ],
  requirements: { postures: ["standing", "seated"], views: ["front"] },
  provenance: { kind: "llm", candidate: 1, model: "GLM-5.3 (dev agent)", promptId: "p1-six-actions-author-1" },
  approval: "draft",
};

/** 6. 害羞收缩 shrink_shy：躯干收缩侧倾 + 头下低 + 双臂内收（composite，Spec 7.9） */
export const SHRINK_C1: MotionDraft = {
  schemaVersion: 1,
  id: "shrink_shy_c1",
  rigProfile: RIG,
  durationSec: 1.8,
  channels: ["torso", "head", "leftArm", "rightArm"],
  phases: { prepareEnd: 0.5, strokeEnd: 1.3, recoverEnd: 1.8 },
  curves: [
    {
      role: "body.root",
      property: "rotate",
      mode: "relativeToReference",
      keys: [
        { t: 0, value: 0, ease: "bezier", bezierCP: [0.3, 0, 0.5, 1] },
        { t: 0.5, value: 5, ease: "linear" },
        { t: 1.3, value: 5, ease: "stepped" },
        { t: 1.8, value: 0, ease: "bezier", bezierCP: [0.4, 0, 0.6, 1] },
      ],
    },
    {
      role: "head.main",
      property: "rotate",
      mode: "relativeToReference",
      keys: [
        { t: 0, value: 0, ease: "bezier", bezierCP: [0.3, 0, 0.5, 1] },
        { t: 0.5, value: 10, ease: "linear" },
        { t: 1.3, value: 10, ease: "stepped" },
        { t: 1.8, value: 0, ease: "bezier", bezierCP: [0.4, 0, 0.6, 1] },
      ],
    },
    {
      role: "arm.upper.left",
      property: "rotate",
      mode: "relativeToReference",
      keys: [
        { t: 0, value: 0, ease: "bezier", bezierCP: [0.3, 0, 0.5, 1] },
        { t: 0.5, value: -12, ease: "linear" },
        { t: 1.3, value: -12, ease: "stepped" },
        { t: 1.8, value: 0, ease: "linear" },
      ],
    },
    {
      role: "arm.upper.right",
      property: "rotate",
      mode: "relativeToReference",
      keys: [
        { t: 0, value: 0, ease: "bezier", bezierCP: [0.3, 0, 0.5, 1] },
        { t: 0.5, value: -12, ease: "linear" },
        { t: 1.3, value: -12, ease: "stepped" },
        { t: 1.8, value: 0, ease: "linear" },
      ],
    },
  ],
  requirements: { postures: ["standing"], views: ["front"] },
  provenance: { kind: "llm", candidate: 1, model: "GLM-5.3 (dev agent)", promptId: "p1-six-actions-author-1", note: "composite 控制器场景：躯干+头+双臂" },
  approval: "draft",
};

export const P1_FIRST_OUTPUT: Record<string, MotionDraft> = {
  idle_subtle: IDLE_SUBTLE_C1,
  nod: NOD_C1,
  wave: WAVE_C1,
  point: POINT_C1,
  lean: LEAN_C1,
  shrink: SHRINK_C1,
};
