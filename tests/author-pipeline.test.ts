/**
 * 作者通路 M2 测试：协议/校验管线/规则解释器/翻译/采样/上下文装配/AuthorBroker。
 * 骨架实例用官方示例 spineboy（Spec 5.3 允许：机制验证，非产品标定）。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadExample } from "./helpers.js";
import { parseControlProfile, type ControlProfile } from "../src/rig/controlProfile.js";
import { assembleRequest } from "../src/motion/author/context.js";
import { validateCandidate } from "../src/motion/author/validateV11.js";
import { translateDraft } from "../src/motion/author/translate.js";
import { sampleTrajectory } from "../src/motion/author/sample.js";
import { AuthorBroker } from "../src/motion/author/authorBroker.js";
import { registerProfileBinding } from "../src/motion/author/validateV11.js";
import { DRAFT_SCHEMA_VERSION, DEFAULT_BUDGET, type GuideRequest, type AuthorResponse, type RuntimeStateSnapshot } from "../src/motion/author/protocol.js";
import type { RigProfile } from "../src/rig/rigProfile.js";

/** 测试绑定层：mapsTo 角色 → spineboy 真实骨名（与合成档案一一对应）。 */
const testRig: RigProfile = {
  id: "synthetic-spineboy.test",
  characterId: "spineboy",
  view: "front",
  skeletonExportVersion: "3.6",
  heightUnits: 180,
  bones: {
    "head.main": { bone: "head", kind: "localFk", channel: "head", status: "verified" },
    "body.root": { bone: "torso2", kind: "localFk", channel: "torso", status: "verified" },
    "arm.upper.right": { bone: "front-upper-arm", kind: "localFk", channel: "rightArm", status: "verified" },
  },
  capabilities: [],
};
registerProfileBinding("synthetic-spineboy.test", testRig);

// ---------------------------------------------------------------------------
// 合成档案：绑定 spineboy（仅机制验证；产品标定档案见 characters/*.rig-profile.json）
// ---------------------------------------------------------------------------
function makeSpineboyTestProfile(): ControlProfile {
  return parseControlProfile({
    identity: {
      modelId: "spineboy",
      profileId: "synthetic-spineboy.test",
      profileRevision: 1,
      assetDigest: "sha256-test",
      runtimeRef: { exportVersion: "3.6", runtimeVersion: "3.6.53", runtimeSource: "vendor", adapterVersion: "1" },
      viewId: "front",
      skinId: "default",
      referencePose: { poseId: "setup", description: "setup", digest: "fnv1a64-00" },
      heightUnits: 180,
      coordinateConvention: { angle: "deg setup-relative", translation: "H parentLocal", leftRight: "front" },
    },
    controls: [
      {
        controlId: "head.tilt", semanticPart: "head", kind: "localFk", channel: "head",
        input: { type: "scalar", unit: "deg", refValue: 0, positiveLooksLike: "右倾", negativeLooksLike: "左倾", default: 0 },
        binding: { bone: "head", property: "rotate", sign: 1 },
        mapsTo: { role: "head.main", property: "rotate" },
        domain: { min: -40, max: 40, verifiedMin: -30, verifiedMax: 30 },
        rate: { maxPerSec: 120 },
        ownership: { writes: ["bone:head/rotate"], dependsOn: ["ancestor:neck", "ancestor:torso3（躯干带动头部——子级拓扑）"] },
        behavior: "倾斜头部", evidenceIds: ["ev-t"], status: "verified",
      },
      {
        controlId: "torso.sway", semanticPart: "torso2", kind: "localFk", channel: "torso",
        input: { type: "scalar", unit: "deg", refValue: 0, positiveLooksLike: "右摆", negativeLooksLike: "左摆", default: 0 },
        binding: { bone: "torso2", property: "rotate", sign: 1 },
        mapsTo: { role: "body.root", property: "rotate" },
        domain: { min: -20, max: 20, verifiedMin: -10, verifiedMax: 10 },
        rate: { maxPerSec: 80 },
        ownership: { writes: ["bone:torso2/rotate"], dependsOn: ["descendant:head（头随躯干——与拉菲相反）"] },
        behavior: "摆动躯干", evidenceIds: [], status: "candidate",
      },
      {
        controlId: "arm.right.raise", semanticPart: "front-upper-arm", kind: "localFk", channel: "rightArm",
        input: { type: "scalar", unit: "deg", refValue: 0, positiveLooksLike: "抬起", negativeLooksLike: "放下", default: 0 },
        binding: { bone: "front-upper-arm", property: "rotate", sign: 1 },
        mapsTo: { role: "arm.upper.right", property: "rotate" },
        domain: { min: -90, max: 90, verifiedMin: -40, verifiedMax: 40 },
        rate: { maxPerSec: 200 },
        ownership: { writes: ["bone:front-upper-arm/rotate"], dependsOn: ["ancestor:torso3"] },
        behavior: "抬臂", evidenceIds: ["ev-t"], status: "verified",
      },
    ],
    rules: [
      { ruleId: "t-view", type: "requiresVariant", target: "*", condition: { view: "front" }, params: { allowedViews: ["front"] }, severity: "error", explanation: "测试视图规则", evidenceRefs: [], version: 1 },
      { ruleId: "t-rate-head", type: "rateLimit", target: "head.tilt", condition: {}, params: { maxPerSec: 120 }, severity: "error", explanation: "测试速率", evidenceRefs: [], version: 1 },
      { ruleId: "t-cap-torso", type: "requiresCapability", target: "torso.sway", condition: { requiresCapability: "torso.sway" }, params: { capability: "torso.sway" }, severity: "error", explanation: "未开放的控制不得直接引用", evidenceRefs: [], version: 1 },
    ],
    evidence: [
      { evidenceId: "ev-t", kind: "static", input: "测试静态", refPose: "setup", skinView: "default/front", runtimeVersion: "3.6.53", observation: "机制验证", reviewer: "test", scope: "test", status: "verified", date: "2026-09-10" },
    ],
  });
}

function stateOf(profile: ControlProfile, over: Partial<RuntimeStateSnapshot> = {}): RuntimeStateSnapshot {
  return {
    monoClockMs: 1_000_000,
    viewId: profile.identity.viewId,
    skinId: profile.identity.skinId,
    stateVersion: 7,
    occupiedChannels: [],
    contacts: [],
    ...over,
  };
}

function makeRequest(profile: ControlProfile, over: Partial<GuideRequest> = {}): GuideRequest {
  return assembleRequest(profile, {
    requestId: over.requestId ?? "req-1",
    contextId: over.contextId ?? "ctx-1",
    goal: "测试动作",
    runtimeState: over.runtimeState ?? stateOf(profile),
  });
}

function motionResponse(request: GuideRequest, draft: object): { raw: unknown; response: AuthorResponse } {
  const response = {
    status: "motion",
    requestId: request.requestId,
    contextId: request.contextId,
    profileDigest: request.profileRef.profileDigest,
    draft: { schemaVersion: DRAFT_SCHEMA_VERSION, ...draft } as object,
  } as AuthorResponse;
  return { raw: response, response };
}

const scal = (controlId: string, pairs: [number, number][], _durationSec?: number, ease: "linear" | "smooth" | "stepped" = "smooth") => ({
  controlId,
  keys: pairs.map(([t, v], i) => ({ timeSec: t, value: v, ...(i < pairs.length - 1 ? { ease } : {}) })),
});

// ---------------------------------------------------------------------------

describe("响应封套（Spec 8.1 / 9.1-1）", () => {
  const profile = makeSpineboyTestProfile();
  const request = makeRequest(profile);

  it("身份回显不一致 → PROFILE_MISMATCH", () => {
    const { raw } = motionResponse(request, { id: "d1", durationSec: 1, curves: [{ controlId: "head.tilt", keys: scal("head.tilt", [[0, 0], [1, 5]]).keys }] });
    (raw as Record<string, unknown>).profileDigest = "wrong";
    const r = validateCandidate(raw, request, profile);
    expect(r.ok).toBe(false);
    expect(r.findings[0].code).toBe("PROFILE_MISMATCH");
  });

  it("未知字段/未知 status 拒绝", () => {
    const bad = { status: "motion", requestId: request.requestId, contextId: request.contextId, profileDigest: request.profileRef.profileDigest, draft: { schemaVersion: DRAFT_SCHEMA_VERSION, id: "x", durationSec: 1, curves: [] }, extra: 1 };
    const r = validateCandidate(bad, request, profile);
    expect(r.ok).toBe(false);
    expect(r.findings[0].code).toBe("INVALID_TIMELINE");
    const bad2 = { status: "dance", requestId: "x", contextId: "y", profileDigest: "z" };
    expect(validateCandidate(bad2, request, profile).findings[0].code).toBe("INVALID_TIMELINE");
  });

  it("unsupported/needs_context 合法且不携带曲线", () => {
    const un = { status: "unsupported", requestId: request.requestId, contextId: request.contextId, profileDigest: request.profileRef.profileDigest, reasonCode: "no_back_view" };
    const r = validateCandidate(un, request, profile);
    expect(r.ok).toBe(true);
    const nc = { status: "needs_context", requestId: request.requestId, contextId: request.contextId, profileDigest: request.profileRef.profileDigest, requestedCapabilities: ["mouth"] };
    expect(validateCandidate(nc, request, profile).ok).toBe(true);
  });
});

describe("控制与数值校验（Spec 9.1-2/3）", () => {
  const profile = makeSpineboyTestProfile();
  const request = makeRequest(profile);

  it("UNKNOWN_CONTROL：档案外的控制", () => {
    const { raw } = motionResponse(request, { id: "d", durationSec: 1, curves: [scal("tail.wag", [[0, 0], [1, 3]])] });
    expect(validateCandidate(raw, request, profile).findings.some((f) => f.code === "UNKNOWN_CONTROL")).toBe(true);
  });

  it("UNVERIFIED_CONTROL：candidate 控制与不在 availableControls", () => {
    const { raw } = motionResponse(request, { id: "d", durationSec: 1, curves: [scal("torso.sway", [[0, 0], [1, 3]])] });
    expect(validateCandidate(raw, request, profile).findings.some((f) => f.code === "UNVERIFIED_CONTROL")).toBe(true);
  });

  it("RANGE_VIOLATION：超 allowed 与超 verified 都拒绝", () => {
    const { raw } = motionResponse(request, { id: "d", durationSec: 1, curves: [scal("head.tilt", [[0, 0], [1, 35]])] });
    const findings = validateCandidate(raw, request, profile).findings.filter((f) => f.code === "RANGE_VIOLATION");
    expect(findings.length).toBeGreaterThanOrEqual(1);
    const { raw: raw2 } = motionResponse(request, { id: "d2", durationSec: 1, curves: [scal("head.tilt", [[0, 0], [1, 50]])] });
    expect(validateCandidate(raw2, request, profile).findings.some((f) => f.code === "RANGE_VIOLATION")).toBe(true);
  });

  it("INVALID_TIMELINE：连续曲线 stepped / 首键非 0 / 末键越界 / 末键带 ease", () => {
    const base = { id: "d", durationSec: 1 };
    const stepped = motionResponse(request, { ...base, curves: [scal("head.tilt", [[0, 0], [1, 5]], 1, "stepped")] });
    expect(validateCandidate(stepped.raw, request, profile).findings.some((f) => f.code === "INVALID_TIMELINE" && f.message.includes("stepped"))).toBe(true);
    const firstKey = motionResponse(request, { ...base, curves: [{ controlId: "head.tilt", keys: [{ timeSec: 0.2, value: 0, ease: "smooth" }, { timeSec: 1, value: 5 }] }] });
    expect(validateCandidate(firstKey.raw, request, profile).findings.some((f) => f.message.includes("首键"))).toBe(true);
    const lastKey = motionResponse(request, { ...base, curves: [{ controlId: "head.tilt", keys: [{ timeSec: 0, value: 0, ease: "smooth" }, { timeSec: 0.9, value: 5 }] }] });
    expect(validateCandidate(lastKey.raw, request, profile).findings.some((f) => f.message.includes("末键"))).toBe(true);
    const easeTail = motionResponse(request, { ...base, curves: [{ controlId: "head.tilt", keys: [{ timeSec: 0, value: 0, ease: "smooth" }, { timeSec: 1, value: 5, ease: "smooth" }] }] });
    expect(validateCandidate(easeTail.raw, request, profile).findings.some((f) => f.message.includes("末键携带"))).toBe(true);
  });

  it("预算：时长/控制器数/关键帧总数", () => {
    const long = motionResponse(request, { id: "d", durationSec: 5, curves: [scal("head.tilt", [[0, 0], [1, 5]])] });
    expect(validateCandidate(long.raw, request, profile).findings.some((f) => f.message.includes("时长"))).toBe(true);
    const many = motionResponse(request, {
      id: "d", durationSec: 1,
      curves: Array.from({ length: 7 }, (_, i) => scal("head.tilt", [[0, 0], [1, i]])),
    });
    const findings = validateCandidate(many.raw, request, profile).findings;
    expect(findings.some((f) => f.message.includes("重复"))).toBe(true);
    expect(findings.some((f) => f.message.includes("控制器数量"))).toBe(true);
    const tooManyKeys = motionResponse(request, { id: "d", durationSec: 1, curves: [scal("head.tilt", Array.from({ length: 8 }, (_, i) => [i / 7, i] as [number, number]))] });
    expect(validateCandidate(tooManyKeys.raw, request, profile).findings.some((f) => f.message.includes("关键帧数"))).toBe(true);
  });

  it("OUTPUT_TRUNCATED：超过字节上限", () => {
    const { raw } = motionResponse(request, { id: "d", durationSec: 1, curves: [scal("head.tilt", [[0, 0], [1, 5]])] });
    const r = validateCandidate(raw, request, profile, { rawBytes: DEFAULT_BUDGET.maxOutputBytes + 1 });
    expect(r.findings[0].code).toBe("OUTPUT_TRUNCATED");
  });

  it("视图规则：requiresVariant（负面：运行时状态视图不匹配）", () => {
    const req = makeRequest(profile, { runtimeState: stateOf(profile, { viewId: "back" }) });
    const { raw } = motionResponse(req, { id: "d", durationSec: 1, curves: [scal("head.tilt", [[0, 0], [1, 5]])] });
    expect(validateCandidate(raw, req, profile).findings.some((f) => f.code === "UNSUPPORTED_VIEW")).toBe(true);
  });
});

describe("编译与隔离采样（Spec 9.1-5/6，真实 spineboy 骨架）", () => {
  const profile = makeSpineboyTestProfile();
  const request = makeRequest(profile);
  const bundle = loadExample("spineboy");

  it("合法候选通过全部检查并产出编译动画", () => {
    const { raw } = motionResponse(request, { id: "d-ok", durationSec: 1, curves: [scal("head.tilt", [[0, 0], [0.5, 20], [1, 0]])] });
    const r = validateCandidate(raw, request, profile, { skeletonData: bundle.skeletonData });
    expect(r.findings).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.compiled).toBeDefined();
    expect(r.compiled!.writes).toEqual(["bone:head/rotate"]);
  });

  it("采样检查发现轨迹速率超限（控制 rate=120°/s；曲线 0.1s 内摆 25°）", () => {
    const { raw } = motionResponse(request, { id: "d-fast", durationSec: 1, curves: [scal("head.tilt", [[0, 0], [0.1, 25], [1, 25]])] });
    const r = validateCandidate(raw, request, profile, { skeletonData: bundle.skeletonData });
    expect(r.findings.some((f) => f.code === "RATE_VIOLATION")).toBe(true);
  });

  it("参数影响（Spec 12.1）：中点时刻真实骨骼角=参考+值", () => {
    const { raw } = motionResponse(request, { id: "d-s", durationSec: 1, curves: [scal("head.tilt", [[0, 0], [1, 20]], 1, "linear")] });
    const r = validateCandidate(raw, request, profile, { skeletonData: bundle.skeletonData });
    expect(r.ok).toBe(true);
    const report = sampleTrajectory(bundle.skeletonData, r.compiled!.animation, [profile.controls[0]], {});
    const end = report.samples[0];
    expect(end.endValue[0]).toBeCloseTo(20, 5);
    expect(end.max[0]).toBeCloseTo(20, 5);
  });
});

describe("翻译与组合展开（Spec 8.2）", () => {
  it("sign=-1 时标量取反；mapsTo 唯一映射", () => {
    const profile = makeSpineboyTestProfile();
    const v11 = { id: "d", durationSec: 1, curves: [scal("head.tilt", [[0, 0], [1, 10]])] };
    const { draft, expansion } = translateDraft(v11 as never, profile, "synthetic-spineboy.test");
    expect(draft!.curves[0].role).toBe("head.main");
    expect(draft!.curves[0].keys[1].value).toBe(10); // sign=+1
    expect(expansion.get("head.tilt")).toBe(1);
  });
});

describe("AuthorBroker（Spec 8.4 / 9.3 / 9.2）", () => {
  const profile = makeSpineboyTestProfile();
  let now = 10_000;
  const clock = () => now;
  const played: string[] = [];
  const cancelled: string[] = [];
  const hooks = {
    play: (p: unknown) => {
      played.push(String((p as { compiled: { id: string } }).compiled?.id ?? "m"));
      return `inst-${played.length}`;
    },
    cancel: (id: string) => cancelled.push(id),
  };
  const stubCompiled = { id: "dm", writes: [], channels: ["head"], animation: {}, durationSec: 1 } as never;

  function freshBroker() {
    now = 10_000;
    played.length = 0;
    cancelled.length = 0;
    return new AuthorBroker(hooks, clock);
  }

  function motionResp(request: GuideRequest): AuthorResponse {
    return {
      status: "motion",
      requestId: request.requestId,
      contextId: request.contextId,
      profileDigest: request.profileRef.profileDigest,
      draft: { schemaVersion: DRAFT_SCHEMA_VERSION, id: "dm", durationSec: 1, curves: [scal("head.tilt", [[0, 0], [1, 5]])] },
    };
  }

  it("单飞：新请求使旧请求过时", () => {
    const broker = freshBroker();
    const r1 = broker.begin("p1", "req-a", "ctx-a", 7, 2500);
    expect(r1.ok).toBe(true);
    const r2 = broker.begin("p1", "req-b", "ctx-b", 7, 2500);
    expect(r2.ok).toBe(true);
    expect(r2.superseded).toBe("req-a");
  });

  it("截止：超期响应 DEADLINE_EXCEEDED 且不播放", () => {
    const broker = freshBroker();
    const request = makeRequest(profile, { requestId: "req-t" });
    broker.begin("p1", "req-t", request.contextId, 7, 100);
    now += 200;
    const out = broker.commit("p1", { request, response: motionResp(request), compiled: stubCompiled, current: stateOf(profile), occupiedChannels: new Set() });
    expect(out.accepted).toBe(false);
    expect(out.findings[0].code).toBe("DEADLINE_EXCEEDED");
    expect(played).toEqual([]);
  });

  it("陈旧性：状态版本变化拒绝；连续变化不判过时", () => {
    const broker = freshBroker();
    const request = makeRequest(profile, { requestId: "req-s" });
    broker.begin("p1", "req-s", request.contextId, 7, 2500);
    const out = broker.commit("p1", { request, response: motionResp(request), compiled: stubCompiled, current: stateOf(profile, { stateVersion: 9 }), occupiedChannels: new Set() });
    expect(out.findings[0].code).toBe("STALE_CONTEXT");
    expect(played).toEqual([]);

    const broker2 = freshBroker();
    broker2.begin("p1", "req-s2", "ctx", 7, 2500);
    const ok = broker2.commit("p1", { request: { ...makeRequest(profile, { requestId: "req-s2" }) }, response: motionResp(makeRequest(profile, { requestId: "req-s2" })), compiled: stubCompiled, current: stateOf(profile, { stateVersion: 7, monoClockMs: 999_999 }), occupiedChannels: new Set() });
    expect(ok.accepted).toBe(true);
  });

  it("通道冲突：占用时拒绝且不取权", () => {
    const broker = freshBroker();
    const request = makeRequest(profile, { requestId: "req-c" });
    broker.begin("p1", "req-c", request.contextId, 7, 2500);
    const out = broker.commit("p1", { request, response: motionResp(request), compiled: stubCompiled, current: stateOf(profile), occupiedChannels: new Set(["head"]) });
    expect(out.accepted).toBe(false);
    expect(out.findings[0].code).toBe("PROPERTY_CONFLICT");
  });

  it("接受后播放句柄被调用；取消只清自己的实例", () => {
    const broker = freshBroker();
    const request = makeRequest(profile, { requestId: "req-p" });
    broker.begin("p1", "req-p", request.contextId, 7, 2500);
    const out = broker.commit("p1", { request, response: motionResp(request), compiled: stubCompiled, current: stateOf(profile), occupiedChannels: new Set() });
    expect(out.accepted).toBe(true);
    expect(played.length).toBe(1);
    expect(broker.cancelPlayback("req-p")).toBe(true);
    expect(cancelled).toEqual(["inst-1"]);
    expect(broker.cancelPlayback("req-p")).toBe(false);
  });
});

describe("上下文装配（Spec 7.1/7.2）", () => {
  it("拉菲档案：8 开放控制全量装配；闭包必带规则；digest 一致", () => {
    const lafei = parseControlProfile(JSON.parse(readFileSync(resolve("characters/lafei_8.rig-profile.json"), "utf-8")));
    const request = makeRequest(lafei);
    expect(request.availableControls.length).toBe(8);
    expect(request.profileRef.profileDigest).toBe(lafei.profileDigest);
    const ruleIds = request.mandatoryRules.map((r) => r.ruleId);
    expect(ruleIds).toContain("lafei8-view-front-only"); // "*" 必带
    expect(request.guideExcerpts.length).toBeGreaterThan(3);
    expect(request.generationBudget).toEqual(DEFAULT_BUDGET);
  });
});
