/** 调度器测试：幂等、冲突、auto 换手、局部取消、tick 完成、过期（Spec 8.5 / 8.6 / 11.2 / A03-A06 逻辑层）。 */
import { describe, expect, it } from "vitest";
import { MotionScheduler, type MotionIntent } from "../src/motion/runtime/scheduler.js";
import { DEFAULT_CATALOG } from "../src/motion/parameters/presets.js";

function makeScheduler(clock = () => 0): MotionScheduler {
  return new MotionScheduler(DEFAULT_CATALOG, clock);
}

function intent(partial: Partial<MotionIntent> & { requestId: string; action: string }): MotionIntent {
  return { schemaVersion: 1, params: {}, ...partial };
}

describe("MotionScheduler", () => {
  it("接受合法请求并占用通道", () => {
    const s = makeScheduler();
    const r = s.submit(intent({ requestId: "r1", action: "wave", params: { hand: "right" } }));
    expect(r.status).toBe("accepted");
    expect(r.channel).toBe("rightArm");
    expect(s.holderOf("rightArm")?.action).toBe("wave");
  });

  it("相同 requestId 幂等，不重复挥手（Spec 11.2 / A06）", () => {
    const s = makeScheduler();
    const r1 = s.submit(intent({ requestId: "same", action: "wave", params: { hand: "right" } }));
    const r2 = s.submit(intent({ requestId: "same", action: "wave", params: { hand: "right" } }));
    expect(r1.instanceId).toBe(r2.instanceId);
  });

  it("未知动作拒绝并给出替代列表", () => {
    const s = makeScheduler();
    const r = s.submit(intent({ requestId: "r2", action: "fly" }));
    expect(r.status).toBe("rejected");
    expect(r.reason).toBe("unknownAction");
    expect(r.alternatives!.length).toBeGreaterThan(0);
  });

  it("右手占用时明确 right 再次请求 → 冲突拒绝（Spec 8.5 第 4 行）", () => {
    const s = makeScheduler();
    s.submit(intent({ requestId: "hold", action: "wave", params: { hand: "right", durationSec: 10 } }));
    const r = s.submit(intent({ requestId: "wave2", action: "wave", params: { hand: "right" } }));
    expect(r.status).toBe("rejected");
    expect(r.reason).toBe("resourceConflict");
  });

  it("auto 在占用时换到空闲左手（Spec 7.6 / 8.5 第 3-4 行）", () => {
    const s = makeScheduler();
    const r1 = s.submit(intent({ requestId: "hold-r", action: "wave", params: { hand: "right", durationSec: 10 } }));
    const r2 = s.submit(intent({ requestId: "auto-l", action: "wave", params: { hand: "auto" } }));
    expect(r1.channel).toBe("rightArm");
    expect(r2.status).toBe("accepted");
    expect(r2.channel).toBe("leftArm");
  });

  it("用户明确请求可抢占可中断通道（Spec 8.6）", () => {
    const s = makeScheduler();
    const first = s.submit(intent({ requestId: "old", action: "wave", params: { hand: "right", durationSec: 60 }, source: "ambient" }));
    const second = s.submit(intent({ requestId: "new", action: "wave", params: { hand: "right" }, source: "user" }));
    expect(first.status).toBe("accepted");
    expect(second.status).toBe("accepted");
    expect(s.get(first.instanceId!)!.status).toBe("cancelled");
  });

  it("取消右手挥手不影响左手持物（局部取消，Spec 8.6 / A04）", () => {
    const s = makeScheduler();
    const right = s.submit(intent({ requestId: "wr", action: "wave", params: { hand: "right", durationSec: 30 } }));
    const left = s.submit(intent({ requestId: "wl", action: "wave", params: { hand: "left", durationSec: 30 } }));
    expect(s.cancel(right.instanceId!, "test")).toBe(true);
    expect(s.get(right.instanceId!)!.status).toBe("cancelled");
    expect(s.get(left.instanceId!)!.status).toBe("active");
    expect(s.holderOf("leftArm")?.instanceId).toBe(left.instanceId);
    expect(s.holderOf("rightArm")).toBeUndefined();
  });

  it("tick 完成后释放通道", () => {
    const s = makeScheduler();
    const r = s.submit(intent({ requestId: "r3", action: "nod", params: { durationSec: 1 } }));
    s.tick(0.5);
    expect(s.holderOf("head")).toBeDefined();
    const done = s.tick(0.6);
    expect(done.map((i) => i.instanceId)).toContain(r.instanceId);
    expect(s.holderOf("head")).toBeUndefined();
    expect(s.get(r.instanceId!)!.status).toBe("completed");
  });

  it("过期意图返回 expired，不补播（Spec 8.6）", () => {
    const s = makeScheduler();
    const r = s.submit(intent({ requestId: "late", action: "wave", params: { hand: "right" }, expiresInMs: -1 }));
    expect(r.status).toBe("expired");
  });

  it("未知参数拒绝（Spec 11.1 运行时只接受已注册参数）", () => {
    const s = makeScheduler();
    const r = s.submit(intent({ requestId: "r4", action: "wave", params: { hand: "right", stride: 5 } }));
    expect(r.status).toBe("rejected");
    expect(r.reason).toBe("unknownParam");
  });

  it("walk（base 通道，不可中断）占用手势仍可在手臂通道进行", () => {
    const s = makeScheduler();
    const walk = s.submit(intent({ requestId: "w", action: "walk", params: {} }));
    const wave = s.submit(intent({ requestId: "v", action: "wave", params: { hand: "right" } }));
    expect(walk.status).toBe("accepted");
    expect(wave.status).toBe("accepted");
    expect(wave.channel).toBe("rightArm");
  });
});
