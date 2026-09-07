/** MotionDraft 校验规则测试（Spec 附录 A.1 / 15.5）。 */
import { describe, expect, it } from "vitest";
import { validateDraft, hasErrors } from "../src/motion/compiler/validate.js";
import { nodHeadDraft, waveSmallDraft, type MotionDraft } from "../src/motion/authoring/draft.js";
import { LAFEI_8_FRONT_CANDIDATES } from "../src/rig/rigProfile.js";

const rig = LAFEI_8_FRONT_CANDIDATES;

describe("MotionDraft Schema（Ajv）", () => {
  it("Spec 6.4 示例结构（挥手）通过全部校验", () => {
    const draft = waveSmallDraft(rig.id, "right");
    const diags = validateDraft(draft, rig);
    expect(hasErrors(diags), JSON.stringify(diags)).toBe(false);
  });

  it("未知键被拒绝（additionalProperties: false）", () => {
    const draft = nodHeadDraft(rig.id) as unknown as Record<string, unknown>;
    draft.rogueField = 1;
    const diags = validateDraft(draft, rig);
    expect(hasErrors(diags)).toBe(true);
    expect(diags.some((d) => d.code === "schema")).toBe(true);
  });

  it("未知通道被拒绝", () => {
    const draft = { ...nodHeadDraft(rig.id), channels: ["leftArm"] };
    const diags = validateDraft(draft, rig);
    expect(diags.some((d) => d.code === "channelMissing")).toBe(true);
  });

  it("rotate 值必须是数字", () => {
    const draft = nodHeadDraft(rig.id);
    (draft.curves[0].keys[1].value as unknown) = "big";
    const diags = validateDraft(draft, rig);
    expect(hasErrors(diags)).toBe(true);
  });

  it("Bézier 控制点越界被拒绝，合法有界 Bézier 通过", () => {
    const draft = nodHeadDraft(rig.id);
    draft.curves[0].keys[1].ease = "bezier";
    (draft.curves[0].keys[1].bezierCP as unknown) = [0.1, 1.5, 0.3, 1];
    expect(hasErrors(validateDraft(draft, rig))).toBe(true);

    const draft2 = nodHeadDraft(rig.id);
    draft2.curves[0].keys[1].ease = "bezier";
    draft2.curves[0].keys[1].bezierCP = [0.25, 0.1, 0.5, 0.9];
    expect(hasErrors(validateDraft(draft2, rig))).toBe(false);
  });

  it("Bézier 时间控制点必须单调", () => {
    const draft = nodHeadDraft(rig.id);
    draft.curves[0].keys[1].ease = "bezier";
    draft.curves[0].keys[1].bezierCP = [0.8, 0.2, 0.2, 0.8];
    const diags = validateDraft(draft, rig);
    expect(diags.some((d) => d.code === "bezierTimeNotMonotonic")).toBe(true);
  });

  it("Attachment 曲线只允许 stepped 切换且值为字符串", () => {
    const base: MotionDraft = {
      schemaVersion: 1,
      id: "attachment_test",
      rigProfile: rig.id,
      durationSec: 1,
      channels: ["face"],
      curves: [
        {
          role: "face.eyes",
          property: "attachment",
          mode: "relativeToReference",
          keys: [
            { t: 0, value: "eye_open", ease: "stepped" },
            { t: 1, value: "eye_closed", ease: "stepped" },
          ],
        },
      ],
      approval: "draft",
    };
    expect(hasErrors(validateDraft(base, rig))).toBe(false);

    const bad = structuredClone(base);
    bad.curves[0].keys[1].ease = "linear";
    expect(validateDraft(bad, rig).some((d) => d.code === "attachmentNotStepped")).toBe(true);
  });

  it("关键帧时间必须严格递增且在时长内", () => {
    const draft = nodHeadDraft(rig.id, 10, 0.8);
    draft.curves[0].keys[1].t = 0;
    expect(validateDraft(draft, rig).some((d) => d.code === "keyTimeNotIncreasing")).toBe(true);

    const draft2 = nodHeadDraft(rig.id, 10, 0.8);
    draft2.curves[0].keys[2].t = 2.0;
    expect(validateDraft(draft2, rig).some((d) => d.code === "keyOutOfRange")).toBe(true);
  });

  it("阶段必须非递减且位于时长内", () => {
    const draft = nodHeadDraft(rig.id, 10, 0.8);
    draft.phases = { prepareEnd: 0.5, strokeEnd: 0.3, recoverEnd: 0.8 };
    expect(validateDraft(draft, rig).some((d) => d.code === "phaseOrder")).toBe(true);
  });

  it("同一属性不能被两条曲线重复写", () => {
    const draft = nodHeadDraft(rig.id);
    draft.curves.push(structuredClone(draft.curves[0]));
    expect(validateDraft(draft, rig).some((d) => d.code === "duplicateProperty")).toBe(true);
  });

  it("rigProfile 不一致被拒绝", () => {
    const draft = nodHeadDraft("some.other.rig");
    const diags = validateDraft(draft, rig);
    expect(diags.some((d) => d.code === "rigProfileMismatch")).toBe(true);
  });
});
