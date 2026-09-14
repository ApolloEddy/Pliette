/**
 * M0 回归（MotionLibrary Spec v1.0 §2 / 2026-09-10 审查报告 F1-F3）：
 * 断言的是修复后的正确行为——
 * - F1：指导片段只来自当前档案与当前控制子集（spineboy 请求不含拉菲结论，子集外控制不出现）；
 * - F2：Broker 请求身份——新请求替换后可提交；迟到旧响应不得删除新请求；
 * - F3：采样逐轴速率（纯 Y 超速必检）、H 单位换算、未标定身高拒绝、混出窗口纳入检查。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadExample } from "./helpers.js";
import { parseControlProfile, type ControlProfile, type ControlDefinition } from "../src/rig/controlProfile.js";
import { assembleRequest } from "../src/motion/author/context.js";
import { AuthorBroker, type CommitInput } from "../src/motion/author/authorBroker.js";
import { sampleTrajectory } from "../src/motion/author/sample.js";
import { spine36 as spine } from "spine-webgl";
import type { CompiledMotion } from "../src/motion/compiler/compile.js";

const lafeiProfile: ControlProfile = parseControlProfile(
  JSON.parse(readFileSync(resolve("characters/lafei_8.rig-profile.json"), "utf-8")),
);
const sbProfile: ControlProfile = parseControlProfile(
  JSON.parse(readFileSync(resolve("characters/spineboy.rig-profile.json"), "utf-8")),
);

const STATE = { monoClockMs: 0, viewId: "front", skinId: "default", stateVersion: 1, occupiedChannels: [] as string[], contacts: [] as string[] };

/* ---------------- F1：角色知识与子集装配 ---------------- */

/** 提取【可用控制器】小节列出的 controlId（到下一个【 小节为止） */
function listedControls(excerpts: string[]): string[] {
  const start = excerpts.findIndex((l) => l.startsWith("【可用控制器】"));
  const ids: string[] = [];
  for (let i = start + 1; i < excerpts.length; i++) {
    if (excerpts[i].startsWith("【")) break;
    const m = excerpts[i].match(/^- ([a-z][\w.]*)（/);
    if (m) ids.push(m[1]);
  }
  return ids;
}

describe("F1 · 指导片段来自当前档案与当前控制子集", () => {
  it("spineboy 请求不含拉菲专属结论（兄弟拓扑 / face.eyes.pair / torso.bob 反例）", () => {
    const req = assembleRequest(sbProfile, { requestId: "f1-sb", contextId: "c", goal: "测试", runtimeState: STATE });
    const text = req.guideExcerpts.join("\n");
    expect(text).not.toContain("face.eyes.pair");
    expect(text).not.toContain("torso.bob");
    // 旧实现硬编码的拉菲结论不得出现（spineboy 自身档案的拓扑描述合法）
    expect(text).not.toContain("头与躯干是兄弟节点");
    expect(text).not.toContain("眼睛之外的表情通道不存在");
  });

  it("controlSubset 过滤后：指导片段的可写列表与 availableControls 完全一致", () => {
    const open = sbProfile.controls.filter((c) => c.status === "verified" || c.status === "candidate").map((c) => c.controlId);
    expect(open.length).toBeGreaterThan(1);
    const subset = open.slice(0, 1);
    const req = assembleRequest(sbProfile, { requestId: "f1-sub", contextId: "c", goal: "测试", runtimeState: STATE, controlSubset: subset });
    expect(listedControls(req.guideExcerpts).sort()).toEqual([...req.availableControls.map((c) => c.controlId)].sort());
    // 子集外的开放控制也不得出现在片段中
    const outside = open.filter((id) => !subset.includes(id));
    const text = req.guideExcerpts.join("\n");
    for (const id of outside) expect(text).not.toContain(`- ${id}（`);
  });

  it("拉菲请求携带其档案规则解释（face.eyes.pair），spineboy 不携带", () => {
    const lafeiReq = assembleRequest(lafeiProfile, { requestId: "f1-lf", contextId: "c", goal: "测试", runtimeState: STATE });
    expect(lafeiReq.guideExcerpts.join("\n")).toContain("face.eyes.pair");
    const sbText = assembleRequest(sbProfile, { requestId: "f1-sb2", contextId: "c", goal: "测试", runtimeState: STATE }).guideExcerpts.join("\n");
    expect(sbText).not.toContain("face.eyes.pair");
  });
});

/* ---------------- F2：请求身份生命周期 ---------------- */

function makeBrokerInput(ids: { requestId: string; contextId: string }, compiled: CompiledMotion | undefined, stateVersion: number): CommitInput {
  return {
    request: { requestId: ids.requestId, contextId: ids.contextId } as CommitInput["request"],
    response: compiled
      ? ({ status: "motion", requestId: ids.requestId, contextId: ids.contextId, profileDigest: "d", draft: { schemaVersion: "pliette.motion-draft/1.1", id: "dd", durationSec: 1, curves: [] } } as CommitInput["response"])
      : ({ status: "unsupported", requestId: ids.requestId, contextId: ids.contextId, profileDigest: "d", reasonCode: "x" } as CommitInput["response"]),
    compiled,
    current: { ...STATE, monoClockMs: 5, stateVersion },
    occupiedChannels: new Set<string>(),
  };
}

const fakeCompiled = (): CompiledMotion => ({
  id: "fake", viewId: "front", animation: {} as spine.Animation, writes: ["bone:x/rotate"], channels: ["head"], durationSec: 1, phases: undefined, warnings: [],
});

describe("F2 · Broker 请求身份隔离", () => {
  it("复现一：begin(r1) 后 begin(r2)——r2 可提交，r1 不可提交", () => {
    const broker = new AuthorBroker({ play: () => "i", cancel: () => {} }, () => 0, 64);
    expect(broker.begin("p", "r1", "c1", 1, 1000).ok).toBe(true);
    const b2 = broker.begin("p", "r2", "c2", 1, 1000);
    expect(b2.ok).toBe(true);
    expect(b2.superseded).toBe("r1");
    const cur = { ...STATE, monoClockMs: 1, stateVersion: 1 };
    // r2 未过时（此前缺陷：r2 未登记 → isStale 为真）
    expect(broker.isStale("p", "r2", cur).stale).toBe(false);
    // r1 已被替换
    expect(broker.isStale("p", "r1", cur).stale).toBe(true);
  });

  it("复现二：r1→r2→r3 后迟到的 r1 提交不删除 r3；r3 仍可提交", () => {
    const broker = new AuthorBroker({ play: () => "i", cancel: () => {} }, () => 0, 64);
    broker.begin("p", "r1", "c1", 1, 1000);
    broker.begin("p", "r2", "c2", 1, 1000);
    broker.begin("p", "r3", "c3", 1, 1000);
    // 迟到的 r1（unsupported 响应路径此前会无条件 active.delete）
    const late = broker.commit("p", makeBrokerInput({ requestId: "r1", contextId: "c1" }, undefined, 1));
    expect(late.accepted).toBe(false);
    expect(broker.isStale("p", "r3", { ...STATE, monoClockMs: 2, stateVersion: 1 }).stale).toBe(false);
    // r3 仍能正常提交播放
    const ok = broker.commit("p", makeBrokerInput({ requestId: "r3", contextId: "c3" }, fakeCompiled(), 1));
    expect(ok.accepted).toBe(true);
  });

  it("重复 requestId begin 被拒，且不取消在途请求", () => {
    const broker = new AuthorBroker({ play: () => "i", cancel: () => {} }, () => 0, 64);
    broker.begin("p", "r1", "c1", 1, 1000);
    const dup = broker.begin("p", "r1", "c1", 1, 1000);
    expect(dup.ok).toBe(false);
    expect(broker.isStale("p", "r1", { ...STATE, monoClockMs: 1, stateVersion: 1 }).stale).toBe(false);
  });
});

/* ---------------- F3：采样逐轴速率 / H 单位 / 混出 ---------------- */

function translateControl(maxPerSec: number, unit = "H"): ControlDefinition {
  return {
    controlId: "test.bob",
    semanticPart: "测试位移",
    kind: "localFk",
    channel: "torso",
    input: { type: "vec2", unit, refValue: [0, 0], positiveLooksLike: "上", negativeLooksLike: "下", default: [0, 0] },
    binding: { bone: "hip", property: "translate" },
    domain: { min: -0.05, max: 0.05, verifiedMin: -0.02, verifiedMax: 0.02 },
    rate: { maxPerSec },
    ownership: { writes: ["bone:hip/translate"], dependsOn: [] },
    behavior: "测试",
    evidenceIds: [],
    status: "verified",
  };
}

/** 构造 spineboy hip 上 Y: 0→peakY→0、1 秒的位移动画（原生单位） */
function yMoveAnimation(data: spine.SkeletonData, peakY: number, duration: number): spine.Animation {
  const hipIndex = data.findBoneIndex("hip");
  const tl = new spine.TranslateTimeline(3);
  tl.boneIndex = hipIndex;
  tl.setFrame(0, 0, 0, 0);
  tl.setFrame(1, duration / 2, 0, peakY);
  tl.setFrame(2, duration, 0, 0);
  return new spine.Animation("f3-test", [tl], duration);
}

describe("F3 · 轨迹采样漏检修复", () => {
  const sb = loadExample("spineboy");

  it("纯 Y 轴超速被检出（此前 peakRate 只比第 0 维 = 恒 0）", () => {
    const anim = yMoveAnimation(sb.skeletonData, 10, 1);
    // 原生单位检查：10 单位 / 0.5s = 20 原生/s，限 10 → 必须违规
    const ctl = translateControl(10, "native");
    const report = sampleTrajectory(sb.skeletonData, anim, [ctl], { mixInSec: 0, heightUnits: null });
    expect(report.findings.some((f) => f.code === "RATE_VIOLATION")).toBe(true);
    expect(report.samples[0]!.peakRatePerSec).toBeGreaterThan(10);
  });

  it("H 单位换算：同一轨迹按 heightUnits 折算后速率缩小；未标定时返回 HEIGHT_UNCALIBRATED", () => {
    const anim = yMoveAnimation(sb.skeletonData, 10, 1);
    const ctlH = translateControl(1, "H");
    // 未标定身高：拒绝 H 速率检查（不得以原生单位蒙混）
    const uncalibrated = sampleTrajectory(sb.skeletonData, anim, [ctlH], { mixInSec: 0, heightUnits: null });
    expect(uncalibrated.findings.some((f) => f.code === "HEIGHT_UNCALIBRATED")).toBe(true);
    // 标定 H=100：峰值速率 ≈ (10/100)/0.5 = 0.2 H/s < 1 → 不违规
    const calibrated = sampleTrajectory(sb.skeletonData, anim, [ctlH], { mixInSec: 0, heightUnits: 100 });
    expect(calibrated.findings.some((f) => f.code === "RATE_VIOLATION")).toBe(false);
    expect(calibrated.samples[0]!.peakRatePerSec).toBeCloseTo(0.2, 1);
    expect(calibrated.samples[0]!.max[1]).toBeCloseTo(0.1, 3);
  });

  it("X 轴分量仍被独立检查（第 0 轴静止、第 1 轴超速→检出）", () => {
    const data = sb.skeletonData;
    const hipIndex = data.findBoneIndex("hip");
    const tl = new spine.TranslateTimeline(3);
    tl.boneIndex = hipIndex;
    tl.setFrame(0, 0, 0, 0);
    tl.setFrame(1, 0.5, 0, 50);
    tl.setFrame(2, 1, 0, 0);
    const anim = new spine.Animation("f3-x", [tl], 1);
    const ctl = translateControl(40, "native");
    const report = sampleTrajectory(data, anim, [ctl], { mixInSec: 0, heightUnits: null });
    expect(report.findings.some((f) => f.code === "RATE_VIOLATION")).toBe(true);
  });

  it("混出窗口纳入速率检查：主体静止、混出段回落速率超限→检出（默认不采样混出则不检出）", () => {
    const data = sb.skeletonData;
    const hipIndex = data.findBoneIndex("hip");
    // duration 0.6s：0~0.3 冲到 10（33/s < 限值 40），0.3~0.6 保持；混出 0.2s 内从 10 交还 setup（速率 50/s > 40）
    const tl = new spine.TranslateTimeline(3);
    tl.boneIndex = hipIndex;
    tl.setFrame(0, 0, 0, 0);
    tl.setFrame(1, 0.3, 0, 10);
    tl.setFrame(2, 0.6, 0, 10);
    const anim = new spine.Animation("f3-mixout", [tl], 0.6);
    const ctl = translateControl(40, "native");
    const noMixOut = sampleTrajectory(data, anim, [ctl], { mixInSec: 0, heightUnits: null });
    expect(noMixOut.findings.some((f) => f.code === "RATE_VIOLATION")).toBe(false);
    const withMixOut = sampleTrajectory(data, anim, [ctl], { mixInSec: 0, mixOutSec: 0.2, heightUnits: null });
    expect(withMixOut.findings.some((f) => f.code === "RATE_VIOLATION")).toBe(true);
  });
});
