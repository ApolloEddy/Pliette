/**
 * Activation Pass 集成验收：
 *  A）新链路机制（与提升状态无关）：PlanAdapter → Selector → materialization → PlanCoordinator
 *     的节点级接线（fetch 注入本地文件，无浏览器依赖）；
 *  B）Activation 断言（promotion 后生效）：approved/registered 投影一致、你好 → routine.greet
 *     整条配方 HIT 且 Author 调用数为 0、contact 三条带 requiredContacts 转正。
 * B 组失败 = 提升未完成或被提升破坏；这是"模块级可用 → 产品级可用"的门。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { RulePlanAdapter } from "../src/dialogue/planAdapter.js";
import { MotionLibraryRuntime } from "../src/lab/planRuntime.js";
import { MotionScheduler } from "../src/motion/runtime/scheduler.js";
import { preparedFromEntry } from "../src/motion/runtime/materialize.js";
import { parseControlProfile } from "../src/rig/controlProfile.js";
import { LAFEI_8_FRONT_CANDIDATES } from "../src/rig/rigProfile.js";
import { DEFAULT_CATALOG } from "../src/motion/parameters/presets.js";
import { loadSkeleton } from "../src/assets/loader.js";
import type { MotionEntry } from "../src/motion/library/contracts.js";

const lafeiAssetsAvailable = existsSync(resolve("public/assets-local/lafei_8/lafei_8.json"));

function dummyTexture() {
  return { setFilters() {}, setWraps() {}, getImage: () => ({ width: 4, height: 4 }), getWidth: () => 4, getHeight: () => 4, dispose() {} };
}

/** 本地文件版 fetch：把 /motion-library/* 映射到 public/（浏览器 dev server 同语义）。 */
function fileFetch(input: URL | RequestInfo): Promise<Response> {
  const url = String(input);
  const path = resolve("public", url.replace(/^https?:\/\/[^/]+\//, "").replace(/^\//, ""));
  const body = readFileSync(path, "utf-8");
  return Promise.resolve(new Response(body, { status: 200 }));
}

async function makeRuntime(): Promise<MotionLibraryRuntime> {
  const profile = parseControlProfile(JSON.parse(readFileSync(resolve("characters/lafei_8.rig-profile.json"), "utf-8")));
  const bundle = loadSkeleton({
    name: "lafei_8",
    skeletonJson: JSON.parse(readFileSync(resolve("public/assets-local/lafei_8/lafei_8.json"), "utf-8")),
    atlasText: readFileSync(resolve("public/assets-local/lafei_8/lafei_8.atlas.txt"), "utf-8"),
    createTexture: dummyTexture,
  });
  const rt = new MotionLibraryRuntime({
    catalogUrl: "/motion-library/catalog.json",
    manifestUrl: "/motion-library/models/lafei_8/front/manifest.json",
    draftsBaseUrl: "/motion-library/models/lafei_8/front/drafts",
    fetchImpl: fileFetch,
    controlProfile: profile,
    rigProfile: LAFEI_8_FRONT_CANDIDATES,
    scheduler: new MotionScheduler(DEFAULT_CATALOG),
    skeletonData: () => bundle.skeletonData,
    states: () => [],
    onAuthorFallback: () => {},
    log: () => {},
  });
  await rt.load();
  return rt;
}

describe("新链路机制：PlanAdapter → Selector → materialize → Coordinator（A 组）", () => {
  it("RulePlanAdapter 你好 → routine.greet 切片；plan 信封由程序发放", async () => {
    const rt = await makeRuntime();
    const adapter = new RulePlanAdapter();
    const result = await adapter.respond({
      text: "你好",
      context: { posture: "standing", busyChannels: [] },
      catalog: rt.catalog,
      playableActions: rt.playableActions(),
      requestId: "t-hello",
    });
    expect(result.reply.length).toBeGreaterThan(0);
    expect(result.plan.slices.length).toBe(1);
    expect(result.plan.slices[0].lookup).toEqual({ actionId: "routine.greet", variantId: "default", segmentId: "full" });
    expect(result.plan.catalogRevision).toBe(rt.catalog.revision);
  });

  it("native 切片/整段物化：PreparedMotion 时间轴与权属字段从 entry 派生（不重算不猜）", async () => {
    if (!lafeiAssetsAvailable) return;
    const rt = await makeRuntime();
    const wave = rt.manifest.entries.find((e) => e.motionId === "lafei.wave.small_screen_right")!;
    const prepared = await rt.materializeDirect(wave, "t-mat");
    expect(prepared.channels).toEqual(wave.channels);
    expect(prepared.writes).toEqual(wave.writes);
    expect(prepared.resources).toEqual(wave.preconditions.requiredResources);
    expect(prepared.resolvedSchedule.contentMs).toBe(wave.durationMs);
    expect(prepared.resolvedSchedule.occupancyMs).toBe(wave.transition.mixInMs + wave.durationMs + wave.transition.mixOutMs);
    expect(prepared.sourceRef).toEqual({ motionId: wave.motionId, motionRevision: 1, contentDigest: wave.contentDigest });
    const handle = prepared.compiledHandle as { kind: string; handle: { startTime: number; windowSec: number } };
    expect(handle.kind).toBe("slice");
    expect(handle.handle.windowSec).toBeCloseTo(wave.durationMs / 1000, 6);
    if (wave.source.kind !== "native_slice") throw new Error("wave 应为 native_slice");
    expect(handle.handle.startTime).toBeCloseTo(wave.source.sourceStartMs / 1000, 6);
  });

  it("draft 条目物化：V1.1 翻译+编译成功，句柄为编译动画", async () => {
    if (!lafeiAssetsAvailable) return;
    const rt = await makeRuntime();
    const nod = rt.manifest.entries.find((e) => e.motionId === "lafei.head_nod.small")!;
    const prepared = await rt.materializeDirect(nod, "t-draft");
    const handle = prepared.compiledHandle as { kind: string; durationSec: number };
    expect(handle.kind).toBe("compiled");
    expect(handle.durationSec).toBeCloseTo(nod.durationMs / 1000, 6);
  });

  it("参数传递端到端：深呼吸 → repeats=2 → 物化时间轴×2（catalog 域 → plan 切片 → PreparedMotion）", async () => {
    const rt = await makeRuntime();
    const adapter = new RulePlanAdapter();
    const resp = await adapter.respond({
      text: "深呼吸",
      context: { posture: "standing", busyChannels: [] },
      catalog: rt.catalog,
      playableActions: rt.playableActions(),
      requestId: "t-params",
    });
    expect(resp.plan.slices[0].lookup.actionId).toBe("life.breathe");
    expect(resp.plan.slices[0].parameters).toEqual({ repeats: 2 });
    // 切片参数必须先过目录域校验（validateMotionPlan 已在 Selector 上游执行）
    const route = rt.route(resp.plan);
    expect(route.allHit).toBe(true);
    const entry = route.slices[0].match!.entry;
    const prepared = await rt.materialize(entry, { planId: "t-params", sliceId: "s1", unitIndex: 0 }, resp.plan.slices[0].parameters);
    expect(prepared.resolvedParameters).toEqual({ repeats: 2 });
    expect(prepared.resolvedSchedule.contentMs).toBe(entry.durationMs * 2);
    expect(prepared.resolvedSchedule.occupancyMs).toBe(entry.transition.mixInMs + entry.durationMs * 2 + entry.transition.mixOutMs);
    const handle = prepared.compiledHandle as { kind: string; durationSec: number; loop: boolean };
    expect(handle.loop).toBe(true);
    expect(handle.durationSec).toBeCloseTo((entry.durationMs * 2) / 1000, 6);
  });

  it("参数域钳制：越界 repeats 拒绝（PARAM_RANGE）、非循环动作不接受参数（PARAM_NOT_ALLOWED）、物化钳制兜底", async () => {
    const rt = await makeRuntime();
    const breathe = rt.catalog.variant("life.breathe", "subtle")!;
    const wave = rt.catalog.variant("gesture.wave", "small.screen_right")!;
    // 越界：99 > 8
    const plan = {
      schemaVersion: "pliette.motion-plan/1.0" as const,
      requestId: "t-range",
      catalogRevision: rt.catalog.revision,
      reply: "",
      description: "",
      slices: [{ sliceId: "s1", description: "", lookup: { actionId: "life.breathe", variantId: "subtle", segmentId: "full" }, parameters: { repeats: 99 } }],
    };
    const { validateMotionPlan } = await import("../src/motion/library/validate.js");
    const issues = validateMotionPlan(plan, { catalog: rt.catalog.catalog });
    expect(issues.some((i) => i.code === "PARAM_RANGE")).toBe(true);
    void breathe;
    // 非循环动作不接受任何额外参数（wave schema 为空）
    const plan2 = { ...plan, requestId: "t-notallowed", slices: [{ sliceId: "s1", description: "", lookup: { actionId: "gesture.wave", variantId: "small.screen_right", segmentId: "full" }, parameters: { repeats: 2 } }] };
    const issues2 = validateMotionPlan(plan2, { catalog: rt.catalog.catalog });
    expect(issues2.some((i) => i.code === "PARAM_NOT_ALLOWED")).toBe(true);
    void wave;
    // 物化兜底钳制：非循环动作传 repeats 也恒为 1
    const waveEntry = rt.manifest.entries.find((e) => e.motionId === "lafei.wave.small_screen_right")!;
    const prepared = await rt.materialize(waveEntry, { planId: "t-clamp", sliceId: "s1", unitIndex: 0 }, { repeats: 5 });
    expect(prepared.resolvedParameters.repeats).toBe(1);
    expect(prepared.resolvedSchedule.contentMs).toBe(waveEntry.durationMs);
  });

  it("Author 回退接线：generatable MISS 计数 + ready 回填后计划可启动", async () => {
    if (!lafeiAssetsAvailable) return;
    const rt = await makeRuntime();
    // 无论提升状态如何，用未登记变体强制 MISS（generatable → Author 回退路径）
    const plan = {
      schemaVersion: "pliette.motion-plan/1.0" as const,
      requestId: "t-fallback",
      catalogRevision: rt.catalog.revision,
      reply: "",
      description: "回退接线测试",
      slices: [{ sliceId: "s1", description: "测试回退", lookup: { actionId: "gesture.wave", variantId: "small.screen_left", segmentId: "full" }, parameters: {} }],
    };
    let fallbackCalled = 0;
    rt["deps"].onAuthorFallback = (_sr, unit, ready) => {
      fallbackCalled += 1;
      const anchor = rt.manifest.entries[0] as MotionEntry;
      const prepared = preparedFromEntry(
        { ...anchor, motionId: `author-${unit.planId}`, motionRevision: 0, contentDigest: "t", channels: ["rightArm"] },
        {
          planId: unit.planId,
          sliceId: "s1",
          unitIndex: unit.unitIndex,
          generationRequestId: "gen-t",
          actorEpoch: 1,
          expectedPrefixHash: "plan",
          clockMs: performance.now(),
          compiledHandle: { kind: "compiled", animation: null, channel: "rightArm", mixInSec: 0.15, mixOutSec: 0.2, durationSec: 1 },
        },
      );
      ready(prepared);
    };
    const route = rt.route(plan);
    expect(route.slices[0].code === "HIT_READY").toBe(false);
    const summary = rt.beginPlan(route, 1);
    await new Promise((r) => setTimeout(r, 30));
    expect(fallbackCalled).toBe(1);
    expect(rt.authorCalls).toBe(1);
    expect(summary.authorFallbacks).toBe(1);
    expect(rt.coordinator.plan("t-fallback")?.units[0].status).toBe("ready");
  });
});

describe("barge-in 打断与演示链路", () => {
  it("新计划开始前取消进行中的计划：旧实例调度取消+单元失效，新计划正常提交", async () => {
    const rt = await makeRuntime();
    const adapter = new RulePlanAdapter();
    const greet = await adapter.respond({
      text: "你好", context: { posture: "standing", busyChannels: [] },
      catalog: rt.catalog, playableActions: rt.playableActions(), requestId: "t-barge-a",
    });
    // 两切片计划（praise = pump + happy）：单元 1 提交后仍在播、单元 2 待提交——真正的打断场景
    const praise = await adapter.respond({
      text: "真棒", context: { posture: "standing", busyChannels: [] },
      catalog: rt.catalog, playableActions: rt.playableActions(), requestId: "t-barge-a",
    });
    expect(praise.plan.slices.length).toBe(2);
    const routeA = rt.route(praise.plan);
    rt.beginPlan(routeA, 1);
    await new Promise((r) => setTimeout(r, 40));
    rt.tick(0.016);
    const stA0 = rt.coordinator.plan("t-barge-a");
    expect(stA0?.committedCount).toBe(1); // 单元 1 已提交在播
    const instA = rt["deps"].scheduler.snapshot().active.find((i) => i.action.includes("pump"));
    expect(instA, "计划 A 单元 1 在播").toBeDefined();

    const cancelled = rt.cancelActivePlans("barge-in: 测试");
    expect(cancelled).toBe(2); // 1 条未完成计划 + 1 个在播实例
    expect(rt["deps"].scheduler.get(instA!.instanceId)?.status).toBe("cancelled");
    const stA = rt.coordinator.plan("t-barge-a");
    expect(stA?.cancelled).toBe(true);
    expect(stA?.units[1].status).toBe("cancelled"); // 未提交单元失效

    // 新计划不受旧实例残留影响
    const planB = {
      schemaVersion: "pliette.motion-plan/1.0" as const,
      requestId: "t-barge-b",
      catalogRevision: rt.catalog.revision,
      reply: "", description: "",
      slices: [{ sliceId: "s1", description: "", lookup: { actionId: "life.breathe", variantId: "subtle", segmentId: "full" }, parameters: {} }],
    };
    const routeB = rt.route(planB);
    expect(routeB.allHit).toBe(true);
    const summaryB = rt.beginPlan(routeB, 1);
    await new Promise((r) => setTimeout(r, 40));
    rt.tick(0.016);
    expect(summaryB.hits).toBe(1);
    expect(rt.coordinator.plan("t-barge-b")?.committedCount).toBe(1);
    // barge-in 不误伤非 plan 来源的实例（此处无，只要不抛错即可）
  });

});

describe("Activation 断言：approved 投影与整条配方 E2E（B 组，promotion 后生效）", () => {
  it("manifest approved 与 catalog registered 投影一致（无 approved 悬挂在 planned 族上）", async () => {
    const rt = await makeRuntime();
    expect(rt.snapshot().approved).toBe(34);
    for (const entry of rt.manifest.entries) {
      if (entry.status !== "approved") continue;
      const variant = rt.catalog.variant(entry.actionId, entry.variantId);
      expect(variant, `${entry.actionId}/${entry.variantId}`).toBeDefined();
      expect(rt.catalog.action(entry.actionId)!.status, entry.actionId).toBe("registered");
      expect(variant!.status, `${entry.actionId}/${entry.variantId}`).toBe("registered");
    }
  });

  it("你好 → routine.greet 整条配方 HIT；物化+提交零 Author 调用", async () => {
    const rt = await makeRuntime();
    const adapter = new RulePlanAdapter();
    const resp = await adapter.respond({
      text: "你好",
      context: { posture: "standing", busyChannels: [] },
      catalog: rt.catalog,
      playableActions: rt.playableActions(),
      requestId: "t-e2e-greet",
    });
    const route = rt.route(resp.plan);
    expect(route.allHit).toBe(true);
    expect(route.wholeRoutineMatch).toBeDefined();
    expect(route.wholeRoutineMatch!.entry.motionId).toBe("lafei.routine_greet.default");
    const summary = rt.beginPlan(route, 1);
    await new Promise((r) => setTimeout(r, 30));
    expect(summary.settled).toBe(true);
    expect(summary.hits).toBe(1);
    expect(summary.unsupported).toBe(0);
    expect(rt.authorCalls).toBe(0); // 库命中：0 次增量 Author
    // Coordinator：ready → tick 驱动提交为一次组合实例（配方时间轴）
    rt.tick(0.016);
    rt.tick(0.7);
    expect(rt.coordinator.plan("t-e2e-greet")?.committedCount).toBe(1);
    const active = rt["deps"].scheduler.snapshot().active;
    expect(active.some((i) => i.action.includes("routine_greet"))).toBe(true);
  });

  it("contact 三条已 approved 且 requiredContacts 与 contacts.json 一致", async () => {
    const rt = await makeRuntime();
    const contacts = JSON.parse(
      readFileSync(resolve("public/motion-library/models/lafei_8/front/contacts.json"), "utf-8"),
    ) as { motions: Record<string, { anchors: Record<string, string> }> };
    for (const [motionId, req] of Object.entries(contacts.motions)) {
      const entry = rt.manifest.entries.find((e) => e.motionId === motionId);
      expect(entry, motionId).toBeDefined();
      expect(entry!.status, motionId).toBe("approved");
      expect(entry!.preconditions.requiredContacts.sort(), motionId).toEqual(Object.values(req.anchors).sort());
    }
  });

  it("配方物化：expandRecipe 展开两步、通道不相交、时长覆盖、冻结修订一致", async () => {
    const rt = await makeRuntime();
    const greet = rt.manifest.entries.find((e) => e.motionId === "lafei.routine_greet.default")!;
    expect(greet.status).toBe("approved");
    const prepared = await rt.materializeDirect(greet, "t-recipe");
    const handle = prepared.compiledHandle as { kind: string; steps: { step: { stepId: string } }[] };
    expect(handle.kind).toBe("recipe");
    expect(handle.steps.map((s) => s.step.stepId).sort()).toEqual(["nod", "wave"]);
  });
});
