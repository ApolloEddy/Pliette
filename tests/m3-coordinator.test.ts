/**
 * M3/M4：预算档案单一来源（§6.2）、AuthorTask 装配（§6.1）、Broker 预生成生命周期（§6.3）、
 * PlanCoordinator 连续前缀缓冲与取消（§7 / V10 / V11）、rolling RTF 准入（§7.3 / V14）。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BUDGET_PROFILES, budgetFor } from "../src/motion/author/protocol.js";
import { parseControlProfile, type ControlProfile } from "../src/rig/controlProfile.js";
import { assembleAuthorTask } from "../src/motion/author/task.js";
import { AuthorBroker } from "../src/motion/author/authorBroker.js";
import { PlanCoordinator, RtfTracker, type CommitResult } from "../src/motion/runtime/planCoordinator.js";
import { resolveSchedule, newPlayableMs, type PreparedMotion } from "../src/motion/runtime/prepared.js";
import type { MotionChannel } from "../src/motion/library/contracts.js";

const lafeiProfile: ControlProfile = parseControlProfile(
  JSON.parse(readFileSync(resolve("characters/lafei_8.rig-profile.json"), "utf-8")),
);

let preparedSeq = 0;
function makePrepared(overrides: Partial<PreparedMotion> = {}, scheduleInput?: Parameters<typeof resolveSchedule>[0]): PreparedMotion {
  preparedSeq += 1;
  const schedule = resolveSchedule(scheduleInput ?? { contentMs: 2000, mixInMs: 150, mixOutMs: 200 });
  return {
    preparedId: `prep-${preparedSeq}`,
    planId: "plan-1",
    sliceId: "s1",
    unitIndex: 0,
    generationRequestId: "gen-1",
    actorEpoch: 1,
    profileDigest: "fnv1a64-profile",
    expectedPrefixHash: "hash-0",
    sourceRef: { motionId: "seed.wave", motionRevision: 1, contentDigest: "sha256-x" },
    resolvedParameters: {},
    compiledHandle: { id: "fake-compiled" },
    writes: ["bone:hand_R/rotate"],
    channels: ["rightArm"] as MotionChannel[],
    resources: [],
    entryBoundary: "enter",
    exitBoundary: "exit",
    expectedState: "idle",
    resolvedSchedule: schedule,
    newPlayableMs: newPlayableMs(schedule),
    readyAtMonoMs: 100,
    playbackDeadlineMonoMs: 100000,
    validationReportRef: null,
    disposalToken: `tok-${preparedSeq}`,
    ...overrides,
  };
}

describe("命名预算档案（§6.2 单一来源）", () => {
  it("interaction：0.4–5.0s、soft 2000 / hard 8000；continuation：3–5s", () => {
    expect(BUDGET_PROFILES.interaction.budget.maxDurationSec).toBe(5.0);
    expect(BUDGET_PROFILES.interaction.budget.softDeadlineMs).toBe(2000);
    expect(BUDGET_PROFILES.interaction.budget.deadlineMs).toBe(8000);
    expect(BUDGET_PROFILES.continuation.budget.minDurationSec).toBe(3.0);
    expect(BUDGET_PROFILES.continuation.budget.maxDurationSec).toBe(5.0);
    expect(BUDGET_PROFILES.legacy.budget.deadlineMs).toBe(2500); // 旧实验复现口径不变
  });

  it("budgetFor 返回副本——调用方改动不污染档案来源", () => {
    const b = budgetFor("interaction");
    b.deadlineMs = 1;
    expect(BUDGET_PROFILES.interaction.budget.deadlineMs).toBe(8000);
  });
});

describe("AuthorTask 装配（§6.1）", () => {
  it("控制子集由通道派生；goal 携带切片描述与精确动作键", () => {
    const task = assembleAuthorTask(lafeiProfile, {
      planId: "p1",
      unitIndex: 0,
      channels: ["rightArm"],
      slice: {
        sliceId: "s1",
        description: "画面右侧手臂小幅挥手，完整收回",
        lookup: { actionId: "gesture.wave", variantId: "small.screen_right", segmentId: "full" },
        parameters: {},
      },
    });
    expect(task.controlSubset.length).toBeGreaterThan(0);
    for (const id of task.controlSubset) {
      const ctl = lafeiProfile.controls.find((c) => c.controlId === id);
      expect(ctl?.channel).toBe("rightArm");
    }
    expect(task.goal).toContain("小幅挥手");
    expect(task.goal).toContain("gesture.wave");
    expect(task.budget.deadlineMs).toBe(8000);
  });

  it("continuation 档案传递 continuation 预算；token 唯一", () => {
    const t1 = assembleAuthorTask(lafeiProfile, {
      planId: "p1", unitIndex: 0, budgetProfile: "continuation",
      slice: { sliceId: "s1", description: "d", lookup: { actionId: "custom", variantId: "custom", segmentId: "full" }, parameters: {} },
    });
    const t2 = assembleAuthorTask(lafeiProfile, {
      planId: "p1", unitIndex: 1, budgetProfile: "continuation",
      slice: { sliceId: "s2", description: "d", lookup: { actionId: "custom", variantId: "custom", segmentId: "full" }, parameters: {} },
    });
    expect(t1.budget.minDurationSec).toBe(3.0);
    expect(t1.taskToken).not.toBe(t2.taskToken);
  });
});

describe("Broker 预生成生命周期（§6.3）", () => {
  function makeBroker(clock = () => 1000) {
    const played: string[] = [];
    const broker = new AuthorBroker(
      { play: (pb, key) => { played.push(key); return `inst-${played.length}`; }, cancel: () => {} },
      clock,
      64,
    );
    return { broker, played };
  }

  it("beginGeneration → acceptGenerated 登记 ready；不触发播放", () => {
    const { broker, played } = makeBroker();
    broker.beginGeneration("p", "gen-1", "c1", 1, 8000);
    const prepared = makePrepared({ actorEpoch: 1, generationRequestId: "gen-1" });
    const result = broker.acceptGenerated("p", prepared);
    expect(result.accepted).toBe(true);
    expect(broker.getPrepared(prepared.preparedId)).toBeDefined();
    expect(played.length).toBe(0); // 不自动播
  });

  it("身份不符 / 已取消 / epoch 变化 → 拒绝进入准备", () => {
    const { broker } = makeBroker();
    broker.beginGeneration("p", "gen-1", "c1", 1, 8000);
    expect(broker.acceptGenerated("p", makePrepared({ generationRequestId: "gen-other" })).accepted).toBe(false);
    broker.beginGeneration("p", "gen-2", "c2", 1, 8000);
    broker.cancel("p", "gen-2");
    expect(broker.acceptGenerated("p", makePrepared({ generationRequestId: "gen-2" })).accepted).toBe(false);
    broker.beginGeneration("p", "gen-3", "c3", 5, 8000);
    expect(broker.acceptGenerated("p", makePrepared({ generationRequestId: "gen-3", actorEpoch: 4 })).accepted).toBe(false);
  });

  it("生成截止过期但播放时效未到 → acceptGenerated 仍接受、commitPrepared 可播（Spec §6.3 明确要求）", () => {
    let now = 0;
    const { broker, played } = makeBroker(() => now);
    broker.beginGeneration("p", "gen-1", "c1", 1, 8000);
    now = 9000; // 超过生成截止 8000
    const prepared = makePrepared({ generationRequestId: "gen-1", readyAtMonoMs: 9000, playbackDeadlineMonoMs: 20000 });
    expect(broker.acceptGenerated("p", prepared).accepted).toBe(true);
    const commit = broker.commitPrepared("p", prepared.preparedId, { monoClockMs: now, viewId: "front", skinId: "default", stateVersion: 1, occupiedChannels: [], contacts: [] }, new Set());
    expect(commit.accepted).toBe(true);
    expect(played.length).toBe(1);
  });

  it("播放时效已过 → commitPrepared 拒绝并处置 prepared", () => {
    let now = 0;
    const { broker } = makeBroker(() => now);
    const prepared = makePrepared({ playbackDeadlineMonoMs: 500 });
    broker.enqueuePrepared(prepared);
    now = 600;
    const commit = broker.commitPrepared("p", prepared.preparedId, { monoClockMs: now, viewId: "front", skinId: "default", stateVersion: 1, occupiedChannels: [], contacts: [] }, new Set());
    expect(commit.accepted).toBe(false);
    expect(broker.getPrepared(prepared.preparedId)).toBeUndefined(); // 已被处置
  });

  it("通道占用 → 保持待命不销毁；空闲后可再次提交", () => {
    const { broker } = makeBroker();
    const prepared = makePrepared();
    broker.enqueuePrepared(prepared);
    const busy = broker.commitPrepared("p", prepared.preparedId, { monoClockMs: 1, viewId: "front", skinId: "default", stateVersion: 1, occupiedChannels: [], contacts: [] }, new Set(["rightArm"]));
    expect(busy.accepted).toBe(false);
    expect(broker.getPrepared(prepared.preparedId)).toBeDefined();
    const ok = broker.commitPrepared("p", prepared.preparedId, { monoClockMs: 2, viewId: "front", skinId: "default", stateVersion: 1, occupiedChannels: [], contacts: [] }, new Set());
    expect(ok.accepted).toBe(true);
  });

  it("disposePrepared token 不匹配被拒（旧回调不得销毁新实例，V09）", () => {
    const { broker } = makeBroker();
    const prepared = makePrepared();
    broker.enqueuePrepared(prepared);
    expect(broker.disposePrepared(prepared.preparedId, "wrong-token")).toBe(false);
    expect(broker.getPrepared(prepared.preparedId)).toBeDefined();
    expect(broker.disposePrepared(prepared.preparedId, prepared.disposalToken)).toBe(true);
  });
});

describe("PlanCoordinator（§7 / V10 / V11）", () => {
  function makeCoordinator() {
    const committed: string[] = [];
    const coordinator = new PlanCoordinator({
      clock: () => 1000,
      commit: (prepared): CommitResult => {
        committed.push(prepared.sliceId);
        return { ok: true };
      },
    });
    return { coordinator, committed };
  }

  it("V10：s2 未 ready 时 s3 缓存不增加可用前缀秒数；补齐后计入", () => {
    const { coordinator } = makeCoordinator();
    coordinator.beginPlan({ planId: "p", mode: "buffered", actorEpoch: 1, sliceIds: ["s1", "s2", "s3"], clockMs: 0 });
    coordinator.noteReady("p", 0, makePrepared({ sliceId: "s1", unitIndex: 0 }, { contentMs: 2000 }));
    expect(coordinator.readyPrefixMs("p")).toBe(2000); // s1 计入；s2 缺失即停
    coordinator.noteReady("p", 2, makePrepared({ sliceId: "s3", unitIndex: 2 }, { contentMs: 3000 }));
    expect(coordinator.readyPrefixMs("p")).toBe(2000); // 缺失点之后的 s3 缓存不增加可用前缀秒数
    coordinator.noteReady("p", 1, makePrepared({ sliceId: "s2", unitIndex: 1 }, { contentMs: 1000 }));
    expect(coordinator.readyPrefixMs("p")).toBe(6000);
    expect(coordinator.canStart("p")).toBe(true);
  });

  it("buffered 未备齐不启播；commitNext 严格按序、无越序播放", () => {
    const { coordinator, committed } = makeCoordinator();
    coordinator.beginPlan({ planId: "p", mode: "buffered", actorEpoch: 1, sliceIds: ["s1", "s2"], clockMs: 0 });
    coordinator.noteReady("p", 1, makePrepared({ sliceId: "s2", unitIndex: 1 }));
    expect(coordinator.canStart("p")).toBe(false);
    expect(coordinator.commitNext("p", new Set()).reason).toBe("nothing-ready");
    coordinator.noteReady("p", 0, makePrepared({ sliceId: "s1", unitIndex: 0 }));
    coordinator.commitNext("p", new Set());
    coordinator.commitNext("p", new Set());
    expect(committed).toEqual(["s1", "s2"]);
  });

  it("取消计划后迟到的 noteReady 被隔离丢弃（V09/V12 网络断开场景）", () => {
    const { coordinator, committed } = makeCoordinator();
    coordinator.beginPlan({ planId: "p", mode: "buffered", actorEpoch: 1, sliceIds: ["s1"], clockMs: 0 });
    coordinator.cancelPlan("p", "user-cancel");
    expect(coordinator.noteReady("p", 0, makePrepared())).toBe(false);
    expect(coordinator.commitNext("p", new Set()).reason).toBe("nothing-ready");
    expect(committed).toEqual([]);
  });

  it("V11：actorEpoch 变化使未播后缀全部失效", () => {
    const { coordinator, committed } = makeCoordinator();
    const other = makeCoordinator();
    coordinator.beginPlan({ planId: "p1", mode: "buffered", actorEpoch: 1, sliceIds: ["s1", "s2"], clockMs: 0 });
    coordinator.noteReady("p1", 0, makePrepared({ sliceId: "s1", unitIndex: 0 }));
    coordinator.noteReady("p1", 1, makePrepared({ sliceId: "s2", unitIndex: 1 }));
    coordinator.commitNext("p1", new Set()); // s1 已提交
    const invalidated = coordinator.invalidateOnEpochChange("model-switched");
    expect(invalidated).toBe(1); // 只剩 s2 未播
    expect(other.committed).toEqual([]);
    expect(coordinator.commitNext("p1", new Set()).reason).toBe("nothing-ready");
    expect(committed).toEqual(["s1"]);
  });
});

describe("Rolling RTF 准入（§7.3 / V14）", () => {
  it("样本不足不启用 rolling（不做偏快承诺）；足量且达标才准入", () => {
    const tracker = new RtfTracker();
    for (let i = 0; i < 7; i++) tracker.record({ produceMs: 2600, newPlayableMs: 3800 });
    expect(tracker.admitsRolling()).toBe(false); // 7 < minSamples
    tracker.record({ produceMs: 2600, newPlayableMs: 3800 }); // RTF ≈ 0.684 ≤ 0.7
    expect(tracker.admitsRolling()).toBe(true);
  });

  it("单元 RTF p95 ≤ 0.7 且 RTF_total < 1 才准入；永久失败记录一票否决", () => {
    const tracker = new RtfTracker();
    for (let i = 0; i < 8; i++) tracker.record({ produceMs: 2600, newPlayableMs: 3800 }); // RTF ≈ 0.68
    expect(tracker.admitsRolling()).toBe(true);
    tracker.recordFailure();
    expect(tracker.admitsRolling()).toBe(false); // 失败不从分母消失
  });

  it("慢 provider（RTF>1）被拒绝并退回 buffered（V14）", () => {
    const tracker = new RtfTracker();
    for (let i = 0; i < 8; i++) tracker.record({ produceMs: 4600, newPlayableMs: 3800 }); // RTF ≈ 1.21
    expect(tracker.admitsRolling()).toBe(false);
    const stats = tracker.stats();
    expect(stats.rtfTotal).toBeGreaterThan(1);
  });

  it("启播阈值 = max(首段时长, L95+J)；抖动余量初值 500ms", () => {
    const tracker = new RtfTracker();
    for (let i = 0; i < 10; i++) tracker.record({ produceMs: 4000 + i, newPlayableMs: 3800 });
    const threshold = tracker.startThresholdMs(3800);
    expect(threshold).toBeGreaterThanOrEqual(3800);
    expect(threshold).toBe(tracker.stats().l95Ms + 500);
  });

  it("resolveSchedule：有效占用 = mixIn + content + mixOut；新增时长扣除 overlap", () => {
    const s = resolveSchedule({ contentMs: 4000, mixInMs: 150, mixOutMs: 250, overlapMs: 300 });
    expect(s.occupancyMs).toBe(4400);
    expect(newPlayableMs(s)).toBe(3700);
    const fast = resolveSchedule({ contentMs: 4000, playbackRate: 2 });
    expect(fast.contentMs).toBe(2000); // 时间拉伸后按变速重算（Spec §4.5-10）
  });
});
