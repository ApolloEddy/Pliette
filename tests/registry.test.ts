/** 参数注册表测试（Spec 7.3 / 7.4 / 7.8 / A.2）。 */
import { describe, expect, it } from "vitest";
import { resolveParams, applyStyle, STYLE_HAPPY, getParameterDefinition, PARAMETER_DEFINITIONS } from "../src/motion/parameters/registry.js";

describe("参数解析顺序：动作默认 → 角色默认 → 预置 → 覆盖", () => {
  it("高层覆盖低层", () => {
    const r = resolveParams({
      actionId: "wave",
      actionDefaults: { amplitude: 0.5, tempo: 1.0 },
      characterDefaults: { amplitude: 0.6 },
      preset: { amplitude: 0.75 },
      overrides: { amplitude: 0.9 },
    });
    expect(r.values.amplitude).toBe(0.9);
    expect(r.sources.amplitude).toBe("overrides");
    expect(r.values.tempo).toBe(1.0);
    expect(r.sources.tempo).toBe("actionDefaults");
    expect(hasNoErrors(r.diagnostics)).toBe(true);
  });

  it("未知键拒绝", () => {
    const r = resolveParams({ actionId: "wave", overrides: { notAParam: 1 } });
    expect(r.diagnostics.some((d) => d.code === "paramNotAllowed")).toBe(true);
  });

  it("动作不接受的不相关参数拒绝：sit 不接受 stride（Spec 7.3）", () => {
    const r = resolveParams({ actionId: "sit", overrides: { strideH: 0.4 } });
    expect(r.diagnostics.some((d) => d.code === "paramNotAllowed")).toBe(true);
  });

  it("范围外拒绝并报告", () => {
    const r = resolveParams({ actionId: "wave", overrides: { amplitude: 99 } });
    expect(r.diagnostics.some((d) => d.code === "domainMax")).toBe(true);
    expect(r.values.amplitude).toBeUndefined();
  });

  it("cycles 必须是整数，不把浮点截断当次数（Spec 7.8）", () => {
    const r = resolveParams({ actionId: "wave", overrides: { cycles: 2.5 } });
    expect(r.diagnostics.some((d) => d.code === "domainInteger")).toBe(true);
  });

  it("hand 枚举限制", () => {
    const r = resolveParams({ actionId: "wave", overrides: { hand: "middle" } });
    expect(r.diagnostics.some((d) => d.code === "domainEnum")).toBe(true);
  });
});

describe("StyleProfile（Spec 7.5）", () => {
  it("happy + wave 有界放大幅度与节奏", () => {
    const r = resolveParams({ actionId: "wave", overrides: { amplitude: 0.75, tempo: 1.0 } });
    const s = applyStyle(r.values, "wave", STYLE_HAPPY);
    expect(s.values.amplitude).toBeCloseTo(0.8625, 6);
    expect(s.values.tempo).toBeCloseTo(1.1, 6);
  });

  it("风格映射不越过有效域上限", () => {
    const r = resolveParams({ actionId: "wave", overrides: { amplitude: 1.9 } });
    const s = applyStyle(r.values, "wave", STYLE_HAPPY);
    const def = getParameterDefinition("amplitude")!;
    expect(s.values.amplitude as number).toBeLessThanOrEqual(def.domain.max!);
  });
});

describe("ParameterDefinition 契约（Spec 7.8 / A.2）", () => {
  it("每个定义都声明影响属性、观察角色、生效阶段与 updatePolicy", () => {
    for (const def of PARAMETER_DEFINITIONS) {
      expect(def.unit.length).toBeGreaterThan(0);
      expect(Array.isArray(def.affectedProperties)).toBe(true);
      expect(Array.isArray(def.observableRoles)).toBe(true);
      expect(def.activePhases.length).toBeGreaterThan(0);
      expect(["nextAction", "phaseBoundary", "smoothLive"]).toContain(def.updatePolicy);
    }
  });

  it("已验证范围外的数值触发警告诊断", () => {
    const r = resolveParams({
      actionId: "wave",
      overrides: { amplitude: 0.8 },
    });
    expect(hasNoErrors(r.diagnostics)).toBe(true);
  });
});

function hasNoErrors(diags: { level: string }[]): boolean {
  return !diags.some((d) => d.level === "error");
}
