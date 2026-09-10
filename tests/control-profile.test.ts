/** ControlProfile：digest 确定性、严格解析、依赖闭包（指导书 Spec 3.1 / 3.4 / 6.3 / 7.2）。 */
import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  computeProfileDigest,
  computeSetupPoseDigest,
  digestOf,
  fnv1a64,
  mandatoryRulesFor,
  openControls,
  parseControlProfile,
  ControlProfileParseError,
  type ControlProfile,
} from "../src/rig/controlProfile.js";

/** 最小合成档案（两个控制、一条规则、一条证据），用于结构测试。 */
function makeProfileJson(): Record<string, unknown> {
  return {
    identity: {
      modelId: "synthetic",
      profileId: "synthetic.front.v1",
      profileRevision: 1,
      assetDigest: "sha256-aa",
      runtimeRef: { exportVersion: "3.6.53", runtimeVersion: "3.6.53", runtimeSource: "vendor", adapterVersion: "1" },
      viewId: "front",
      skinId: "default",
      referencePose: { poseId: "setup", description: "setup", digest: "fnv1a64-00" },
      heightUnits: 100,
      coordinateConvention: { angle: "deg, setup-relative", translation: "H in parent-local", leftRight: "front" },
    },
    controls: [
      {
        controlId: "arm.right.raise",
        semanticPart: "右整臂",
        kind: "localFk",
        channel: "rightArm",
        input: { type: "scalar", unit: "deg", refValue: 0, positiveLooksLike: "抬起", negativeLooksLike: "下落", default: 0 },
        binding: { bone: "armR", property: "rotate", sign: 1 },
        mapsTo: { role: "arm.upper.right", property: "rotate" },
        domain: { min: -90, max: 90, verifiedMin: -30, verifiedMax: 40 },
        rate: { maxPerSec: 200 },
        ownership: { writes: ["bone:armR/rotate"], dependsOn: ["ancestor:torso"] },
        behavior: "调大抬起",
        evidenceIds: ["ev-1"],
        status: "verified",
      },
      {
        controlId: "arm.right.forearm",
        semanticPart: "右前臂",
        kind: "localFk",
        channel: "rightArm",
        input: { type: "scalar", unit: "deg", refValue: 0, positiveLooksLike: "内弯", negativeLooksLike: "外展", default: 0 },
        binding: { bone: "armR3", property: "rotate", sign: 1 },
        mapsTo: { role: "arm.right", property: "rotate" },
        domain: { min: -45, max: 45 },
        ownership: { writes: ["bone:armR3/rotate"], dependsOn: ["ancestor:armR"] },
        behavior: "调大弯曲",
        evidenceIds: [],
        status: "candidate",
      },
    ],
    rules: [
      { ruleId: "r-front", type: "requiresVariant", target: "*", condition: { view: "front" }, params: { view: "front" }, severity: "error", explanation: "无背面素材", evidenceRefs: [], version: 1 },
      { ruleId: "r-rate-arm", type: "rateLimit", target: "arm.right.raise", condition: {}, params: { maxPerSec: 200 }, severity: "error", explanation: "标定速率", evidenceRefs: ["ev-1"], version: 1 },
      { ruleId: "r-surface", type: "range", target: "bone:armR3/rotate", condition: {}, params: { min: -45, max: 45 }, severity: "error", explanation: "前臂域", evidenceRefs: [], version: 1 },
      { ruleId: "r-unrelated", type: "range", target: "tail.wag", condition: {}, params: { min: 0, max: 10 }, severity: "warn", explanation: "无关", evidenceRefs: [], version: 1 },
    ],
    evidence: [
      {
        evidenceId: "ev-1", kind: "probe", input: "arm.right.raise ±5/±10", refPose: "setup", skinView: "default/front",
        runtimeVersion: "3.6.53", observation: "可见抬起", reviewer: "agent", scope: "front/setup", status: "verified", date: "2026-09-10",
      },
    ],
  };
}

describe("canonicalJson / digest", () => {
  it("键顺序无关、数组保序、-0 归一", () => {
    expect(canonicalJson({ b: 1, a: [1, 2], c: -0 })).toBe(canonicalJson({ a: [1, 2], c: 0, b: 1 }));
    expect(canonicalJson([3, 1])).not.toBe(canonicalJson([1, 3]));
  });

  it("FNV-1a64 稳定且对单字符变化敏感", () => {
    expect(fnv1a64("abc")).toBe(fnv1a64("abc"));
    expect(fnv1a64("abc")).not.toBe(fnv1a64("abd"));
    expect(fnv1a64("abc")).toMatch(/^[0-9a-f]{16}$/);
  });

  it("profileDigest：任一控制/规则变动必变，evidence 增补不变", () => {
    const p = makeProfileJson();
    const d1 = parseControlProfile(p).profileDigest;
    const d2 = parseControlProfile(p).profileDigest;
    expect(d1).toBe(d2);

    const bump = structuredClone(p);
    (bump.controls as Record<string, unknown>[])[0] = {
      ...(bump.controls as Record<string, unknown>[])[0],
      domain: { min: -80, max: 90 },
    };
    expect(parseControlProfile(bump).profileDigest).not.toBe(d1);

    const moreEvidence = structuredClone(p);
    (moreEvidence.evidence as unknown[]).push({
      evidenceId: "ev-2", kind: "review", input: "人工复核", refPose: "setup", skinView: "default/front",
      runtimeVersion: "3.6.53", observation: "OK", reviewer: "agent", scope: "front", status: "candidate", date: "2026-09-10",
    });
    expect(parseControlProfile(moreEvidence).profileDigest).toBe(d1);
  });

  it("档案摘要与直接调用 computeProfileDigest 一致", () => {
    const parsed = parseControlProfile(makeProfileJson());
    expect(parsed.profileDigest).toBe(computeProfileDigest(parsed));
  });
});

describe("parseControlProfile 严格解析", () => {
  it("合法档案通过并回填派生字段", () => {
    const p = parseControlProfile(makeProfileJson());
    expect(p.controls).toHaveLength(2);
    expect(p.profileDigest).toMatch(/^fnv1a64-[0-9a-f]{16}$/);
    expect(p.controls[0].mapsTo).toEqual({ role: "arm.upper.right", property: "rotate" });
  });

  it("未知字段拒绝（顶层/控制/规则）", () => {
    const bad = makeProfileJson();
    (bad as Record<string, unknown>)["extra"] = 1;
    expect(() => parseControlProfile(bad)).toThrow(ControlProfileParseError);
    const badCtrl = makeProfileJson();
    (badCtrl.controls as Record<string, unknown>[])[0]["autoGenerated"] = true;
    expect(() => parseControlProfile(badCtrl)).toThrow(/未知字段/);
  });

  it("verified 控制必须引用证据；重复 controlId 拒绝", () => {
    const bad = makeProfileJson();
    (bad.controls as Record<string, unknown>[])[0].evidenceIds = [];
    expect(() => parseControlProfile(bad)).toThrow(/证据/);
    const dup = makeProfileJson();
    (dup.controls as Record<string, unknown>[])[1].controlId = "arm.right.raise";
    expect(() => parseControlProfile(dup)).toThrow(/重复/);
  });

  it("同执行属性写集冲突拒绝；mapsTo.property 与 binding 不一致拒绝", () => {
    const conflict = makeProfileJson();
    (conflict.controls as Record<string, unknown>[])[1].mapsTo = { role: "arm.right", property: "rotate" };
    (conflict.controls as Record<string, unknown>[])[1].binding = {
      bone: "armR", property: "rotate",
    };
    // armR3 控制改为写 armR/rotate —— 与 arm.right.raise 冲突
    ((conflict.controls as Record<string, unknown>[])[1].ownership as Record<string, unknown>).writes = ["bone:armR/rotate"];
    expect(() => parseControlProfile(conflict)).toThrow(/写集冲突/);

    const mismatch = makeProfileJson();
    (mismatch.controls as Record<string, unknown>[])[0].mapsTo = { role: "arm.upper.right", property: "translate" };
    expect(() => parseControlProfile(mismatch)).toThrow(/一致/);
  });

  it("enum 输入缺少允许集合拒绝；composite 引用不存在的子控制器拒绝", () => {
    const badEnum = makeProfileJson();
    ((badEnum.controls as Record<string, unknown>[])[1].input as Record<string, unknown>).type = "enum";
    delete ((badEnum.controls as Record<string, unknown>[])[1].input as Record<string, unknown>).enumValues;
    expect(() => parseControlProfile(badEnum)).toThrow(/enum/);

    const badComp = makeProfileJson();
    (badComp.controls as Record<string, unknown>[])[1].kind = "composite";
    (badComp.controls as Record<string, unknown>[])[1].binding = { property: "rotate", compositeOf: ["nope"] };
    delete ((badComp.controls as Record<string, unknown>[])[1].ownership as Record<string, unknown>).writes;
    expect(() => parseControlProfile(badComp)).toThrow(/composite/);
  });
});

describe("查询与依赖闭包", () => {
  const profile: ControlProfile = parseControlProfile(makeProfileJson());

  it("openControls 只返回 verified", () => {
    expect(openControls(profile).map((c) => c.controlId)).toEqual(["arm.right.raise"]);
  });

  it("mandatoryRulesFor：* 必带、所选控制必带、写集面必带、无关不带走", () => {
    const ids = mandatoryRulesFor(profile, ["arm.right.raise", "arm.right.forearm"]).map((r) => r.ruleId).sort();
    expect(ids).toEqual(["r-front", "r-rate-arm", "r-surface"]);
    const onlyRaise = mandatoryRulesFor(profile, ["arm.right.raise"]).map((r) => r.ruleId).sort();
    expect(onlyRaise).toEqual(["r-front", "r-rate-arm"]);
  });
});

describe("computeSetupPoseDigest", () => {
  it("同一骨架确定性；骨骼变动必变", () => {
    const bones = [
      { name: "root", x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
      { name: "face", x: 1.5, y: -2, rotation: -90, scaleX: 1, scaleY: 1 },
    ];
    expect(computeSetupPoseDigest(bones)).toBe(computeSetupPoseDigest([...bones]));
    expect(computeSetupPoseDigest(bones)).not.toBe(
      computeSetupPoseDigest(bones.map((b) => (b.name === "face" ? { ...b, rotation: -89 } : b))),
    );
  });

  it("digestOf 输出格式稳定", () => {
    expect(digestOf({ a: 1 })).toMatch(/^fnv1a64-[0-9a-f]{16}$/);
  });
});
