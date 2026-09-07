/**
 * P1 第 2 轮修订（用户反馈驱动，2026-09-07）：
 * 反馈：单部位动作僵直（wave 只有手臂动）、idle/lean 幅度过小不可分辨、开头混合抖动（Lab bug 已修）。
 * 应对：全部改为 composite 协调（头/躯干/起伏配合主部位），幅度放大到可读。
 * 诚实标注：wave 新增协调通道后为 Author 函数修订，不再计入 Tune-only 统计（Spec 2.2）。
 */
import type { MotionDraft, MotionKey } from "../src/motion/authoring/draft.js";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const expDir = resolve(here, "../experiments/p1-llm-motion");
const motionsDir = resolve(here, "../public/motions");
const RIG = "lafei_8.front.v1";
const PROV = { kind: "llm" as const, model: "GLM-5.3 (dev agent)", promptId: "p1-round3-coordination" };

const bezier: MotionKey["ease"] = "bezier";
const CP: [number, number, number, number] = [0.3, 0, 0.4, 1];

/** wave c3：整臂+指尖+头部偏向+躯干反倾+身体起伏（Author 函数修订，Spec 2.2） */
const waveC3: MotionDraft = {
  schemaVersion: 1,
  id: "wave_right_primitive_c3",
  rigProfile: RIG,
  durationSec: 1.4,
  channels: ["rightArm", "head", "torso"],
  phases: { prepareEnd: 0.3, strokeEnd: 1.2, recoverEnd: 1.4 },
  curves: [
    {
      role: "arm.upper.right", property: "rotate", mode: "relativeToReference",
      keys: [
        { t: 0, value: 0, ease: bezier, bezierCP: CP },
        { t: 0.3, value: 32, ease: "linear" },
        { t: 1.2, value: 32, ease: "stepped" },
        { t: 1.4, value: 0, ease: "bezier", bezierCP: [0.4, 0, 0.6, 1] },
      ],
    },
    {
      role: "arm.right", property: "rotate", mode: "relativeToReference",
      keys: [
        { t: 0, value: 0, ease: "linear" },
        { t: 0.3, value: 24, ease: "linear" },
        { t: 0.525, value: -24, ease: "linear" },
        { t: 0.75, value: 24, ease: "linear" },
        { t: 0.975, value: -24, ease: "linear" },
        { t: 1.2, value: 24, ease: "linear" },
        { t: 1.4, value: 0, ease: "linear" },
      ],
    },
    {
      role: "head.main", property: "rotate", mode: "relativeToReference",
      keys: [
        { t: 0, value: 0, ease: bezier, bezierCP: CP },
        { t: 0.35, value: 6, ease: "linear" },
        { t: 1.2, value: 6, ease: "stepped" },
        { t: 1.4, value: 0, ease: "linear" },
      ],
    },
    {
      role: "body.root", property: "rotate", mode: "relativeToReference",
      keys: [
        { t: 0, value: 0, ease: bezier, bezierCP: CP },
        { t: 0.4, value: -3, ease: "linear" },
        { t: 1.2, value: -3, ease: "stepped" },
        { t: 1.4, value: 0, ease: "linear" },
      ],
    },
    {
      role: "body.root", property: "translate", mode: "relativeToReference",
      keys: [
        { t: 0, value: [0, 0], ease: bezier, bezierCP: CP },
        { t: 0.4, value: [0, 0.008], ease: "linear" },
        { t: 1.2, value: [0, 0.008], ease: "stepped" },
        { t: 1.4, value: [0, 0], ease: "linear" },
      ],
    },
  ],
  requirements: { postures: ["standing", "seated"], views: ["front"], resources: ["channel:rightArm"] },
  provenance: { ...PROV, candidate: 3, note: "Author 函数修订：在上轮 Tune 参数基础上新增头(6°)/躯干(-3°)/起伏(0.008H)协调通道" },
  approval: "draft",
};

/** idle c2：呼吸幅度 0.008H→0.022H（约 2.2% 身高，肉眼可读），头部缓摆保留 */
const idleC2: MotionDraft = {
  schemaVersion: 1,
  id: "idle_subtle_c2",
  rigProfile: RIG,
  durationSec: 2.4,
  channels: ["torso", "head"],
  phases: { prepareEnd: 0.2, strokeEnd: 1.2, recoverEnd: 2.4 },
  curves: [
    {
      role: "body.root", property: "translate", mode: "relativeToReference",
      keys: [
        { t: 0, value: [0, 0], ease: "bezier", bezierCP: [0.4, 0, 0.6, 1] },
        { t: 1.2, value: [0, 0.022], ease: "bezier", bezierCP: [0.4, 0, 0.6, 1] },
        { t: 2.4, value: [0, 0], ease: "linear" },
      ],
    },
    {
      role: "head.main", property: "rotate", mode: "relativeToReference",
      keys: [
        { t: 0, value: 0, ease: "bezier", bezierCP: [0.4, 0, 0.6, 1] },
        { t: 1.2, value: 3, ease: "bezier", bezierCP: [0.4, 0, 0.6, 1] },
        { t: 2.4, value: 0, ease: "linear" },
      ],
    },
  ],
  requirements: { postures: ["standing"], views: ["front"] },
  provenance: { ...PROV, candidate: 2, note: "修订2：呼吸起伏 0.008H→0.022H（反馈：与 lean 不可分辨/幅度不可读）" },
  approval: "draft",
};

/** lean c2：躯干倾角 7°→12° + 头部反代偿 -6° + 重心下沉 0.01H，与 idle（translate 主导）明确区分 */
const leanC2: MotionDraft = {
  schemaVersion: 1,
  id: "lean_listen_c2",
  rigProfile: RIG,
  durationSec: 1.6,
  channels: ["torso", "head"],
  phases: { prepareEnd: 0.45, strokeEnd: 1.2, recoverEnd: 1.6 },
  curves: [
    {
      role: "body.root", property: "rotate", mode: "relativeToReference",
      keys: [
        { t: 0, value: 0, ease: "bezier", bezierCP: [0.3, 0, 0.4, 1] },
        { t: 0.45, value: 12, ease: "linear" },
        { t: 1.2, value: 12, ease: "stepped" },
        { t: 1.6, value: 0, ease: "bezier", bezierCP: [0.5, 0, 0.7, 1] },
      ],
    },
    {
      role: "body.root", property: "translate", mode: "relativeToReference",
      keys: [
        { t: 0, value: [0, 0], ease: "bezier", bezierCP: [0.3, 0, 0.4, 1] },
        { t: 0.45, value: [0, -0.01], ease: "linear" },
        { t: 1.2, value: [0, -0.01], ease: "stepped" },
        { t: 1.6, value: [0, 0], ease: "linear" },
      ],
    },
    {
      role: "head.main", property: "rotate", mode: "relativeToReference",
      keys: [
        { t: 0, value: 0, ease: "bezier", bezierCP: [0.3, 0, 0.4, 1] },
        { t: 0.45, value: -6, ease: "linear" },
        { t: 1.2, value: -6, ease: "stepped" },
        { t: 1.6, value: 0, ease: "linear" },
      ],
    },
  ],
  requirements: { postures: ["standing", "seated"], views: ["front"] },
  provenance: { ...PROV, candidate: 2, note: "修订2：倾角 7→12°、头反代偿 -3→-6°、重心下沉 0.01H（反馈：与 idle 不可分辨）" },
  approval: "draft",
};

/** shrink c2：原 composite 基础上加重心下沉（蹲缩感） */
const shrinkC2: MotionDraft = {
  schemaVersion: 1,
  id: "shrink_shy_c2",
  rigProfile: RIG,
  durationSec: 1.8,
  channels: ["torso", "head", "leftArm", "rightArm"],
  phases: { prepareEnd: 0.5, strokeEnd: 1.3, recoverEnd: 1.8 },
  curves: [
    {
      role: "body.root", property: "rotate", mode: "relativeToReference",
      keys: [
        { t: 0, value: 0, ease: "bezier", bezierCP: [0.3, 0, 0.5, 1] },
        { t: 0.5, value: 5, ease: "linear" },
        { t: 1.3, value: 5, ease: "stepped" },
        { t: 1.8, value: 0, ease: "bezier", bezierCP: [0.4, 0, 0.6, 1] },
      ],
    },
    {
      role: "body.root", property: "translate", mode: "relativeToReference",
      keys: [
        { t: 0, value: [0, 0], ease: "bezier", bezierCP: [0.3, 0, 0.5, 1] },
        { t: 0.5, value: [0, -0.014], ease: "linear" },
        { t: 1.3, value: [0, -0.014], ease: "stepped" },
        { t: 1.8, value: [0, 0], ease: "linear" },
      ],
    },
    {
      role: "head.main", property: "rotate", mode: "relativeToReference",
      keys: [
        { t: 0, value: 0, ease: "bezier", bezierCP: [0.3, 0, 0.5, 1] },
        { t: 0.5, value: 10, ease: "linear" },
        { t: 1.3, value: 10, ease: "stepped" },
        { t: 1.8, value: 0, ease: "bezier", bezierCP: [0.4, 0, 0.6, 1] },
      ],
    },
    {
      role: "arm.upper.left", property: "rotate", mode: "relativeToReference",
      keys: [
        { t: 0, value: 0, ease: "bezier", bezierCP: [0.3, 0, 0.5, 1] },
        { t: 0.5, value: -14, ease: "linear" },
        { t: 1.3, value: -14, ease: "stepped" },
        { t: 1.8, value: 0, ease: "linear" },
      ],
    },
    {
      role: "arm.upper.right", property: "rotate", mode: "relativeToReference",
      keys: [
        { t: 0, value: 0, ease: "bezier", bezierCP: [0.3, 0, 0.5, 1] },
        { t: 0.5, value: -14, ease: "linear" },
        { t: 1.3, value: -14, ease: "stepped" },
        { t: 1.8, value: 0, ease: "linear" },
      ],
    },
  ],
  requirements: { postures: ["standing"], views: ["front"] },
  provenance: { ...PROV, candidate: 2, note: "修订2：新增重心下沉 -0.014H（蹲缩感），臂内收 -12→-14°" },
  approval: "draft",
};

/** point c2：加头部看向指向侧 + 躯干微反倾 */
const pointC2: MotionDraft = {
  schemaVersion: 1,
  id: "point_right_c2",
  rigProfile: RIG,
  durationSec: 1.4,
  channels: ["rightArm", "head", "torso"],
  phases: { prepareEnd: 0.35, strokeEnd: 0.95, recoverEnd: 1.4 },
  curves: [
    {
      role: "arm.upper.right", property: "rotate", mode: "relativeToReference",
      keys: [
        { t: 0, value: 0, ease: "bezier", bezierCP: [0.25, 0.1, 0.25, 1] },
        { t: 0.35, value: 40, ease: "linear" },
        { t: 0.95, value: 40, ease: "stepped" },
        { t: 1.4, value: 0, ease: "bezier", bezierCP: [0.4, 0, 0.6, 1] },
      ],
    },
    {
      role: "arm.right", property: "rotate", mode: "relativeToReference",
      keys: [
        { t: 0, value: 0, ease: "linear" },
        { t: 0.35, value: -6, ease: "linear" },
        { t: 0.95, value: -6, ease: "stepped" },
        { t: 1.4, value: 0, ease: "linear" },
      ],
    },
    {
      role: "head.main", property: "rotate", mode: "relativeToReference",
      keys: [
        { t: 0, value: 0, ease: "bezier", bezierCP: [0.25, 0.1, 0.25, 1] },
        { t: 0.35, value: 5, ease: "linear" },
        { t: 0.95, value: 5, ease: "stepped" },
        { t: 1.4, value: 0, ease: "linear" },
      ],
    },
    {
      role: "body.root", property: "rotate", mode: "relativeToReference",
      keys: [
        { t: 0, value: 0, ease: "bezier", bezierCP: [0.25, 0.1, 0.25, 1] },
        { t: 0.35, value: -2, ease: "linear" },
        { t: 0.95, value: -2, ease: "stepped" },
        { t: 1.4, value: 0, ease: "linear" },
      ],
    },
  ],
  requirements: { postures: ["standing", "seated"], views: ["front"], resources: ["channel:rightArm"] },
  provenance: { ...PROV, candidate: 2, note: "修订2：新增头部看向(+5°)与躯干反倾(-2°)协调" },
  approval: "draft",
};

const REVISIONS: Record<string, MotionDraft> = {
  wave: waveC3,
  idle_subtle: idleC2,
  lean: leanC2,
  shrink: shrinkC2,
  point: pointC2,
};

mkdirSync(motionsDir, { recursive: true });
const indexPath = resolve(motionsDir, "index.json");
const index: string[] = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, "utf8")) : [];
for (const [key, draft] of Object.entries(REVISIONS)) {
  const dir = resolve(expDir, key);
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `candidate-${draft.provenance?.candidate}.json`);
  if (!existsSync(file)) writeFileSync(file, JSON.stringify(draft, null, 2));
  writeFileSync(resolve(motionsDir, `${draft.id}.json`), JSON.stringify(draft, null, 2));
  if (!index.includes(draft.id)) index.push(draft.id);
  console.log(`修订候选: ${key}/candidate-${draft.provenance?.candidate}.json → motions/${draft.id}.json`);
}
writeFileSync(indexPath, JSON.stringify(index, null, 2));
console.log("index:", index.join(", "));
