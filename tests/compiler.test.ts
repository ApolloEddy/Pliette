/** 编译与官方运行时采样测试（Spec 15.5 / D.5：真实局部旋转与曲线生效，不只是加载无报错）。 */
import { describe, expect, it } from "vitest";
import { spine36 as spine } from "spine-webgl";
import { loadExample, findBoneName, makeAdHocRig } from "./helpers.js";
import { compileDraft } from "../src/motion/compiler/compile.js";
import { sampleBone } from "../src/motion/compiler/sample.js";
import { validateDraft, hasErrors } from "../src/motion/compiler/validate.js";
import type { MotionDraft } from "../src/motion/authoring/draft.js";

describe("Motion Compiler → 官方 spine 3.6 Timeline", () => {
  const bundle = loadExample("spineboy");
  const data = bundle.skeletonData;

  it("15.5 线性示例：0° → −72° → 0° 在关键时刻的真实局部旋转", () => {
    const headBone = findBoneName(data, /head/i);
    const rig = makeAdHocRig(data, {
      characterId: "spineboy",
      exportVersion: bundle.exportVersion,
      picks: { "head.main": headBone, "body.root": null, "arm.left": null, "arm.right": null },
    });
    const draft: MotionDraft = {
      schemaVersion: 1,
      id: "nod_linear_test",
      rigProfile: rig.id,
      durationSec: 1.0,
      channels: ["head"],
      curves: [
        {
          role: "head.main",
          property: "rotate",
          mode: "relativeToReference",
          keys: [
            { t: 0.0, value: 0, ease: "linear" },
            { t: 0.5, value: -72, ease: "linear" },
            { t: 1.0, value: 0, ease: "linear" },
          ],
        },
      ],
      approval: "draft",
    };
    expect(hasErrors(validateDraft(draft, rig))).toBe(false);
    const { motion, diagnostics } = compileDraft(draft, rig, data);
    expect(motion, JSON.stringify(diagnostics)).toBeDefined();
    expect(motion!.writes).toContain(`bone:${headBone}/rotate`);

    const samples = sampleBone(data, motion!.animation, headBone, [0, 0.25, 0.5, 0.75, 1.0]);
    const rel = samples.map((s) => s.rotation - s.setupRotation);
    expect(rel[0]).toBeCloseTo(0, 6);
    expect(rel[2]).toBeCloseTo(-72, 4); // 线性插值中点 = 目标角
    expect(rel[4]).toBeCloseTo(0, 6);
    expect(rel[1]).toBeCloseTo(-36, 4); // 线性四分之一点
    expect(rel[3]).toBeCloseTo(-36, 4);
  });

  it("stepped 与 bezier 在 3.6 CurveTimeline 上真实生效", () => {
    const headBone = findBoneName(data, /head/i);
    const rig = makeAdHocRig(data, {
      characterId: "spineboy",
      exportVersion: bundle.exportVersion,
      picks: { "head.main": headBone, "body.root": null, "arm.left": null, "arm.right": null },
    });
    const draft: MotionDraft = {
      schemaVersion: 1,
      id: "ease_test",
      rigProfile: rig.id,
      durationSec: 2.0,
      channels: ["head"],
      curves: [
        {
          role: "head.main",
          property: "rotate",
          mode: "relativeToReference",
          keys: [
            { t: 0.0, value: 0, ease: "stepped" },
            { t: 1.0, value: 30, ease: "bezier", bezierCP: [0.25, 0.1, 0.25, 1] },
            { t: 2.0, value: 0, ease: "linear" },
          ],
        },
      ],
      approval: "draft",
    };
    const { motion } = compileDraft(draft, rig, data);
    expect(motion).toBeDefined();
    const tl = motion!.animation.timelines[0] as unknown as { curves: number[] };
    // 3.6 CurveTimeline 内部布局：每段 BEZIER_SIZE 个槽位，段首为标签（0 线性 / 1 阶跃 / 2 Bézier）
    expect(tl.curves[0]).toBe(spine.CurveTimeline.STEPPED);
    expect(tl.curves[spine.CurveTimeline.BEZIER_SIZE]).toBe(spine.CurveTimeline.BEZIER);
    // Bézier 段按归一化控制点展开为曲线查找表，首采样值必须落在 (0, cx1] 区间
    const lut0 = tl.curves[spine.CurveTimeline.BEZIER_SIZE + 1];
    expect(lut0).toBeGreaterThan(0);
    expect(lut0).toBeLessThan(0.25);

    // stepped 段在区间内保持首帧值
    const samples = sampleBone(data, motion!.animation, headBone, [0.5]);
    expect(samples[0].rotation - samples[0].setupRotation).toBeCloseTo(0, 6);
  });

  it("translate 按 H 比例换算为 Spine 原生单位并真实生效", () => {
    const hipBone = findBoneName(data, /hip|body|root/i);
    const rig = makeAdHocRig(data, {
      characterId: "spineboy",
      exportVersion: bundle.exportVersion,
      picks: { "body.root": hipBone, "head.main": null, "arm.left": null, "arm.right": null },
    });
    rig.heightUnits = data.height; // 模拟标定：H = skeletonData.height
    const draft: MotionDraft = {
      schemaVersion: 1,
      id: "bob_test",
      rigProfile: rig.id,
      durationSec: 1.0,
      channels: ["torso"],
      curves: [
        {
          role: "body.root",
          property: "translate",
          mode: "relativeToReference",
          keys: [
            { t: 0.0, value: [0, 0], ease: "linear" },
            { t: 0.5, value: [0, 0.05], ease: "linear" },
            { t: 1.0, value: [0, 0], ease: "linear" },
          ],
        },
      ],
      approval: "draft",
    };
    const { motion } = compileDraft(draft, rig, data);
    expect(motion).toBeDefined();
    expect(motion!.writes).toContain(`bone:${hipBone}/translate`);
    const samples = sampleBone(data, motion!.animation, hipBone, [0, 0.5]);
    const delta = samples[1].worldY - samples[0].worldY;
    expect(delta).toBeGreaterThan(0); // Y 向上
    expect(delta).toBeCloseTo(0.05 * data.height, 1);
  });

  it("未知骨骼在编译期报错而非静默丢弃", () => {
    const rig = makeAdHocRig(data, {
      characterId: "spineboy",
      exportVersion: bundle.exportVersion,
      picks: { "head.main": "head", "body.root": null, "arm.left": null, "arm.right": null },
    });
    rig.bones["head.main"] = { ...rig.bones["head.main"], bone: "definitely_not_a_bone" };
    const draft: MotionDraft = {
      schemaVersion: 1,
      id: "bad_bone",
      rigProfile: rig.id,
      durationSec: 1,
      channels: ["head"],
      curves: [
        { role: "head.main", property: "rotate", mode: "relativeToReference", keys: [{ t: 0, value: 0 }, { t: 1, value: 10 }] },
      ],
      approval: "draft",
    };
    const { motion } = compileDraft(draft, rig, data);
    expect(motion).toBeUndefined();
  });

  it("循环挥手模板在官方运行时中可采样且首尾归零", () => {
    const armBone = findBoneName(data, /arm.*front|front.*arm|arm[_]?l/i);
    const rig = makeAdHocRig(data, {
      characterId: "spineboy",
      exportVersion: bundle.exportVersion,
      picks: { "arm.left": armBone, "head.main": null, "body.root": null, "arm.right": null },
    });
    const draft: MotionDraft = {
      schemaVersion: 1,
      id: "wave_left_sample",
      rigProfile: rig.id,
      durationSec: 1.6,
      channels: ["leftArm"],
      phases: { prepareEnd: 0.3, strokeEnd: 1.2, recoverEnd: 1.6 },
      curves: [
        {
          role: "arm.left",
          property: "rotate",
          mode: "relativeToReference",
          keys: [
            { t: 0.0, value: 0, ease: "linear" },
            { t: 0.3, value: 22, ease: "linear" },
            { t: 0.6, value: 14, ease: "linear" },
            { t: 0.9, value: 26, ease: "linear" },
            { t: 1.2, value: 18, ease: "linear" },
            { t: 1.6, value: 0, ease: "linear" },
          ],
        },
      ],
      approval: "draft",
    };
    const { motion } = compileDraft(draft, rig, data);
    expect(motion).toBeDefined();
    expect(motion!.durationSec).toBeCloseTo(1.6, 6);
    const samples = sampleBone(data, motion!.animation, armBone, [0, 0.8, 1.6]);
    expect(samples[0].rotation - samples[0].setupRotation).toBeCloseTo(0, 5);
    expect(samples[2].rotation - samples[2].setupRotation).toBeCloseTo(0, 5);
    expect(samples[1].rotation - samples[1].setupRotation).toBeGreaterThan(10);
  });
});

describe("Inspector", () => {
  it("spineboy 报告：版本、动画与图集页", () => {
    const bundle = loadExample("spineboy");
    expect(bundle.exportVersion).toMatch(/^3\.6\./);
    const animNames = bundle.skeletonData.animations.map((a) => a.name);
    expect(animNames).toContain("walk");
    expect(bundle.skeletonData.bones.length).toBeGreaterThan(10);
  });

  it("goblins 双皮肤（Skin 检查）", () => {
    const bundle = loadExample("goblins");
    expect(bundle.skeletonData.skins.length).toBeGreaterThanOrEqual(2);
  });

  it("stretchyman 含 IK 约束（骨骼链与目标）", () => {
    const bundle = loadExample("stretchyman");
    const iks = (bundle.skeletonData as unknown as { ikConstraints: { name: string; bones: unknown[]; target: unknown }[] }).ikConstraints;
    expect(iks.length).toBeGreaterThanOrEqual(1);
    expect(iks[0].bones.length).toBeGreaterThan(0);
    expect(iks[0].target).toBeTruthy();
  });
});
