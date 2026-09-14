/**
 * M2：多写集原子调度（MotionLibrary Spec v1.0 §8 / V08 / V09）与异步语义规划适配器（§1.1 / §3）。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MotionScheduler, type CompositeIntent } from "../src/motion/runtime/scheduler.js";
import { loadCatalog, CatalogView } from "../src/motion/library/catalog.js";
import { validateMotionPlan } from "../src/motion/library/validate.js";
import { RulePlanAdapter, LlmPlanAdapter, PlanGenerationError } from "../src/dialogue/planAdapter.js";

function makeScheduler(clock = () => 0): MotionScheduler {
  return new MotionScheduler([], clock);
}

function composite(partial: Partial<CompositeIntent> & { requestId: string }): CompositeIntent {
  return {
    schemaVersion: 1,
    action: "combo",
    channels: ["rightArm"],
    durationSec: 1,
    ...partial,
  };
}

const catalogView = new CatalogView(loadCatalog(JSON.parse(readFileSync(resolve("public/motion-library/catalog.json"), "utf-8"))));

describe("多写集原子调度（V08）", () => {
  it("双通道空闲 → 一次取权全部成功，两个通道都登记占用", () => {
    const s = makeScheduler();
    const r = s.submitComposite(composite({ requestId: "c1", channels: ["rightArm", "head"] }));
    expect(r.status).toBe("accepted");
    expect(r.channels).toEqual(["rightArm", "head"]);
    expect(s.holderOf("rightArm")?.instanceId).toBe(r.instanceId);
    expect(s.holderOf("head")?.instanceId).toBe(r.instanceId);
  });

  it("任一通道被占 → 整体拒绝，成功通道不产生部分占用（要么全拿要么不拿）", () => {
    const s = makeScheduler();
    s.submitComposite(composite({ requestId: "hold-head", channels: ["head"], durationSec: 10 }));
    const r = s.submitComposite(composite({ requestId: "combo", channels: ["rightArm", "head"] }));
    expect(r.status).toBe("rejected");
    expect(r.reason).toBe("resourceConflict");
    expect(s.holderOf("rightArm")).toBeUndefined(); // 右手未被部分占用
  });

  it("资源占用原子检查：contact:table 被占时带同一资源的组合整体拒绝", () => {
    const s = makeScheduler();
    s.submitComposite(composite({ requestId: "touch", channels: ["rightArm"], resources: ["contact:table"], durationSec: 10 }));
    const r = s.submitComposite(composite({ requestId: "other", channels: ["leftArm"], resources: ["contact:table"] }));
    expect(r.status).toBe("rejected");
    expect(s.holderOf("leftArm")).toBeUndefined();
    expect(s.resourceHolderOf("contact:table")?.action).toBe("combo");
  });

  it("局部取消释放全部通道与资源；不影响其他实例（V09）", () => {
    const s = makeScheduler();
    const a = s.submitComposite(composite({ requestId: "a", channels: ["rightArm", "head"], resources: ["contact:table"], durationSec: 10 }));
    const b = s.submitComposite(composite({ requestId: "b", channels: ["leftArm"], durationSec: 10 }));
    expect(s.cancel(a.instanceId!, "user")).toBe(true);
    expect(s.holderOf("rightArm")).toBeUndefined();
    expect(s.holderOf("head")).toBeUndefined();
    expect(s.resourceHolderOf("contact:table")).toBeUndefined();
    expect(s.holderOf("leftArm")?.instanceId).toBe(b.instanceId);
    // 重复取消返回 false 且不再释放任何账本
    expect(s.cancel(a.instanceId!, "again")).toBe(false);
  });

  it("多通道实例每帧只计一次时间，完成时一次释放全部通道", () => {
    let now = 0;
    const s = makeScheduler(() => now);
    const r = s.submitComposite(composite({ requestId: "t", channels: ["rightArm", "torso", "head"], durationSec: 1 }));
    s.tick(0.5);
    s.tick(0.5);
    const inst = s.get(r.instanceId!)!;
    expect(inst.status).toBe("completed");
    expect(inst.elapsedSec).toBeCloseTo(1, 5); // 若按 ownership 重复计时会到 3
    expect(s.holderOf("rightArm")).toBeUndefined();
    expect(s.holderOf("torso")).toBeUndefined();
    expect(s.holderOf("head")).toBeUndefined();
  });

  it("相同 requestId 幂等；旧实例取消后新 requestId 可取同一通道（V09 无越权清理）", () => {
    const s = makeScheduler();
    const r1 = s.submitComposite(composite({ requestId: "x", channels: ["head"], durationSec: 10 }));
    const dup = s.submitComposite(composite({ requestId: "x", channels: ["head"], durationSec: 10 }));
    expect(dup.instanceId).toBe(r1.instanceId);
    s.cancel(r1.instanceId!, "user");
    const r2 = s.submitComposite(composite({ requestId: "y", channels: ["head"], durationSec: 10 }));
    expect(r2.status).toBe("accepted");
  });
});

describe("规则版语义规划适配器", () => {
  const adapter = new RulePlanAdapter();

  it("产出信封完整的 MotionPlan（程序发放 requestId、回显目录版本、切片引用登记键）", async () => {
    const result = await adapter.respond({
      text: "你好呀",
      context: { posture: "standing", busyChannels: [] },
      catalog: catalogView,
      playableActions: new Set(),
      requestId: "req-rule-1",
    });
    expect(result.reply).toContain("你好");
    expect(result.plan.requestId).toBe("req-rule-1");
    expect(result.plan.catalogRevision).toBe(catalogView.revision);
    expect(result.plan.slices[0].lookup.actionId).toBe("routine.greet");
    const issues = validateMotionPlan(result.plan, { catalog: catalogView.catalog });
    expect(issues).toEqual([]);
  });

  it("坐姿不输出站姿表达（沿用旧规则语义）；无命中时 slices 为空", async () => {
    const seated = await adapter.respond({
      text: "可乐真好看",
      context: { posture: "seated", busyChannels: [] },
      catalog: catalogView,
      playableActions: new Set(),
      requestId: "req-rule-2",
    });
    expect(seated.plan.slices.length).toBe(0);
    const miss = await adapter.respond({
      text: "今天天气不错",
      context: { posture: "standing", busyChannels: [] },
      catalog: catalogView,
      playableActions: new Set(),
      requestId: "req-rule-3",
    });
    expect(miss.plan.slices.length).toBe(0);
    expect(miss.plan.reply.length).toBeGreaterThan(0);
  });
});

describe("真实 LLM 语义规划适配器（注入 fetch）", () => {
  const cfg = { endpoint: "https://mock/v1/chat/completions", apiKey: "test", model: "mock", deadlineMs: 2000 };

  const chatResponse = (obj: unknown) => ({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: JSON.stringify(obj) } }] }),
  });

  it("合法输出被采纳：程序信封 + 校验通过，rounds=1", async () => {
    const adapter = new LlmPlanAdapter(cfg, {
      fetchImpl: (async () =>
        chatResponse({
          reply: "好呀",
          description: "挥手",
          slices: [{ sliceId: "s1", description: "小幅挥手", lookup: { actionId: "gesture.wave", variantId: "small.screen_right", segmentId: "full" }, parameters: {} }],
        })) as unknown as typeof fetch,
    });
    const result = await adapter.respond({
      text: "挥挥手",
      context: { posture: "standing", busyChannels: [] },
      catalog: catalogView,
      playableActions: new Set(["gesture.wave"]),
      requestId: "req-llm-1",
    });
    expect(result.meta.rounds).toBe(1);
    expect(result.plan.requestId).toBe("req-llm-1");
    expect(result.plan.schemaVersion).toBe("pliette.motion-plan/1.0");
    expect(result.plan.slices[0].lookup.actionId).toBe("gesture.wave");
  });

  it("方向冲突触发一次纠错轮：第二轮修正后成功（rounds=2）", async () => {
    const bad = {
      reply: "好",
      description: "左手挥手",
      slices: [{ sliceId: "s1", description: "用画面左侧的手挥手", lookup: { actionId: "gesture.wave", variantId: "small.screen_right", segmentId: "full" }, parameters: {} }],
    };
    const good = structuredClone(bad);
    good.slices[0].lookup.variantId = "small.screen_left";
    good.slices[0].description = "用画面左侧的手挥手";
    let calls = 0;
    const adapter = new LlmPlanAdapter(cfg, {
      fetchImpl: (async () => {
        calls += 1;
        return chatResponse(calls === 1 ? bad : good);
      }) as unknown as typeof fetch,
    });
    const result = await adapter.respond({
      text: "左手挥挥手",
      context: { posture: "standing", busyChannels: [] },
      catalog: catalogView,
      playableActions: new Set(["gesture.wave"]),
      requestId: "req-llm-2",
    });
    expect(calls).toBe(2);
    expect(result.meta.rounds).toBe(2);
    expect(result.plan.slices[0].lookup.variantId).toBe("small.screen_left");
  });

  it("两次都非法 → 明确报错（不悄悄播出、不静默回退）", async () => {
    const adapter = new LlmPlanAdapter(cfg, {
      fetchImpl: (async () => chatResponse({ reply: 1, slices: "no" })) as unknown as typeof fetch,
    });
    await expect(
      adapter.respond({
        text: "挥手",
        context: { posture: "standing", busyChannels: [] },
        catalog: catalogView,
        playableActions: new Set(),
        requestId: "req-llm-3",
      }),
    ).rejects.toThrowError(/SEMANTIC_CONFLICT|两次/);
  });

  it("外部取消（AbortSignal）→ GENERATION_TIMEOUT 明确失败", async () => {
    const adapter = new LlmPlanAdapter({ ...cfg, deadlineMs: 10000 }, {
      fetchImpl: ((_url: string, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const e = new Error("aborted");
            e.name = "AbortError";
            reject(e);
          });
        })) as unknown as typeof fetch,
    });
    const controller = new AbortController();
    const pending = adapter.respond(
      {
        text: "挥手",
        context: { posture: "standing", busyChannels: [] },
        catalog: catalogView,
        playableActions: new Set(),
        requestId: "req-llm-4",
      },
      controller.signal,
    );
    controller.abort();
    await expect(pending).rejects.toThrowError(PlanGenerationError);
  });
});
