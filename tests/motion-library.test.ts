/**
 * M1 契约与索引（MotionLibrary Spec v1.0 §4 / §5 / §12 V04/V05/V07）：
 * - 真实目录（public/motion-library/catalog.json）加载与能力卡；
 * - 合成条目上的精确索引/兼容过滤/确定性选取；
 * - Selector 路由：HIT / MISS_ASSET / MISS_CUSTOM / INVALID_REFERENCE / SEMANTIC_CONFLICT；
 * - Entry 语义校验（full 边界、源窗口、retime、参数交集、事件范围）。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CatalogView, loadCatalog, CatalogParseError } from "../src/motion/library/catalog.js";
import { MotionIndex, loadManifest, keyOf, type RigIdentity } from "../src/motion/library/index.js";
import { routePlan } from "../src/motion/library/selector.js";
import { legacyKeyFor, LEGACY_EVENT_KEYS } from "../src/motion/library/legacyAdapter.js";
import { validateEntry, validateMotionPlan, detectDirectionConflict } from "../src/motion/library/validate.js";
import type { MotionCatalog, MotionEntry, MotionPlan } from "../src/motion/library/contracts.js";

const RIG: RigIdentity = {
  modelId: "lafei_8",
  profileId: "lafei_8.front.cp1",
  profileDigest: "fnv1a64-profile",
  assetDigest: "sha256-asset",
  referencePoseDigest: "fnv1a64-refpose",
  viewId: "front",
  skinId: "default",
  runtimeVersion: "3.6.53",
  adapterVersion: "control-profile/1.0",
};

/** 最小可用测试目录：wave（registered，左右变体）、chin_rest（planned）、gesture.point（registered） */
function testCatalog(): MotionCatalog {
  return loadCatalog({
    schemaVersion: "pliette.motion-catalog/1.0",
    catalogRevision: "test.1",
    description: "测试目录",
    categories: [{ id: "gesture", label: "手势" }, { id: "contact", label: "接触" }],
    actions: [
      {
        actionId: "gesture.wave",
        label: "挥手",
        category: "gesture",
        aliasesZh: ["挥手", "打招呼"],
        priority: "P0",
        status: "registered",
        productionNote: "测试",
        variants: [
          { variantId: "small.screen_right", description: "画面右侧小幅挥手", side: "screen_right", segmentIds: ["full"], requiredCapabilities: [], parameterSchema: { type: "object", properties: {}, additionalProperties: false }, authorable: "capability_check", status: "registered" },
          { variantId: "small.screen_left", description: "画面左侧小幅挥手", side: "screen_left", segmentIds: ["full"], requiredCapabilities: [], parameterSchema: { type: "object", properties: {}, additionalProperties: false }, authorable: "capability_check", status: "registered" },
        ],
      },
      {
        actionId: "routine.chin_rest",
        label: "托腮",
        category: "contact",
        aliasesZh: ["托腮"],
        priority: "P1",
        status: "planned",
        productionNote: "能力缺口备案",
        variants: [
          { variantId: "both", description: "双手托腮", side: "both", segmentIds: ["full"], requiredCapabilities: ["contact.both_hands_face"], parameterSchema: { type: "object", properties: {}, additionalProperties: false }, authorable: "disabled", status: "planned" },
        ],
      },
      {
        actionId: "gesture.point",
        label: "指向",
        category: "gesture",
        aliasesZh: [],
        priority: "P0",
        status: "registered",
        productionNote: "测试",
        variants: [
          { variantId: "screen_right", description: "画面右侧指向", side: "screen_right", segmentIds: ["full"], requiredCapabilities: [], parameterSchema: { type: "object", properties: {}, additionalProperties: false }, authorable: "capability_check", status: "registered" },
        ],
      },
    ],
  });
}

let entrySeq = 0;
function makeEntry(overrides: Partial<MotionEntry> = {}): MotionEntry {
  entrySeq += 1;
  const base: MotionEntry = {
    schemaVersion: "pliette.motion-entry/1.0",
    motionId: `seed.wave.r${entrySeq}`,
    motionRevision: 1,
    actionId: "gesture.wave",
    variantId: "small.screen_right",
    status: "approved",
    rigRef: { ...RIG },
    source: { kind: "native_slice", animationName: "stand", sourceStartMs: 4900, sourceEndMs: 7300 },
    durationMs: 2400,
    channels: ["rightArm"],
    writes: ["bone:hand_R/rotate"],
    dependsOn: ["ancestor:body"],
    requiredCapabilities: [],
    preconditions: { postures: ["standing"], baseAnimations: ["stand"], requiredResources: [], requiredContacts: [] },
    segments: {
      full: { startMs: 0, endMs: 2400, entryBoundaryId: "enter", exitBoundaryId: "exit", interruptibleAtEnd: true },
    },
    boundaries: {
      enter: { poseClass: "idle", snapshotRef: "stand@4900", contacts: [], resources: [] },
      exit: { poseClass: "idle", snapshotRef: "stand@7300", contacts: [], resources: [] },
    },
    parameterSchema: { type: "object", properties: {}, additionalProperties: false },
    retime: { minRate: 1, maxRate: 1 },
    loop: { allowed: false, segmentId: null, maxRepeats: 1 },
    transition: { mixInMs: 150, mixOutMs: 200, maxBlendMs: 250, continuousEligible: false },
    events: [],
    provenance: { origin: "legacy_slice", sourceRef: "gestures.ts#wave", generatorModel: null, promptDigest: null },
    validation: { structural: "passed", trajectory: "passed", visual: "passed", evidenceRefs: ["ev-1"], reviewedAt: "2026-09-14" },
    contentDigest: "sha256-fake",
  };
  return { ...base, ...overrides };
}

function planOf(slices: MotionPlan["slices"], overrides: Partial<MotionPlan> = {}): MotionPlan {
  return {
    schemaVersion: "pliette.motion-plan/1.0",
    requestId: "req-test",
    catalogRevision: "test.1",
    reply: "",
    description: "",
    slices,
    ...overrides,
  };
}

describe("真实目录加载（public/motion-library/catalog.json）", () => {
  const raw = JSON.parse(readFileSync(resolve("public/motion-library/catalog.json"), "utf-8"));
  const view = new CatalogView(loadCatalog(raw));

  it("110 个动作族 / 154 个变体全部通过唯一性与分类校验", () => {
    expect(view.catalog.actions.length).toBe(110);
    const variantCount = view.catalog.actions.reduce((n, a) => n + a.variants.length, 0);
    expect(variantCount).toBe(154);
  });

  it("全部条目为 planned（本包备案不承诺可播放）", () => {
    for (const a of view.catalog.actions) expect(a.status).toBe("planned");
  });

  it("别名唯一指向登记语义；能力卡只含登记键不含资产路径", () => {
    expect(view.normalizeAlias("自然待机")?.actionId).toBe("life.idle");
    const cards = view.capabilityCards().join("\n");
    expect(cards).toContain("gesture.wave");
    expect(cards).not.toContain(".json");
    expect(cards).not.toContain("public/");
  });
});

describe("目录与清单解析", () => {
  it("别名冲突直接拒绝（相近动作不是同义词）", () => {
    const bad = testCatalog();
    bad.actions[2].aliasesZh = ["挥手"];
    expect(() => loadCatalog(bad)).toThrow(CatalogParseError);
  });

  it("空清单可启动；manifest catalogRevision 与目录不一致拒绝", () => {
    const index = new MotionIndex();
    index.rebuild(loadManifest({ schemaVersion: "pliette.motion-manifest/1.0", catalogRevision: "test.1", entries: [] }, "test.1"));
    expect(index.all().length).toBe(0);
    expect(() => loadManifest({ schemaVersion: "pliette.motion-manifest/1.0", catalogRevision: "other", entries: [] }, "test.1")).toThrow();
  });
});

describe("精确索引与确定性选取（§5.1）", () => {
  it("只返回 approved + rigRef 兼容实现；validated/candidate/disabled 不进默认可播放投影", () => {
    const index = new MotionIndex();
    index.rebuild(loadManifest({
      schemaVersion: "pliette.motion-manifest/1.0",
      catalogRevision: "test.1",
      entries: [
        makeEntry({ motionId: "seed.a", status: "approved" }),
        makeEntry({ motionId: "seed.b", status: "validated" }),
        makeEntry({ motionId: "seed.c", status: "disabled" }),
      ],
    }, "test.1"));
    const { matches } = index.lookup({ actionId: "gesture.wave", variantId: "small.screen_right", segmentId: "full" }, RIG);
    expect(matches.length).toBe(1);
    expect(matches[0].entry.motionId).toBe("seed.a");
  });

  it("资产/档案版本不兼容 → 零命中（不复用错误数值，V06）", () => {
    const index = new MotionIndex();
    index.rebuild(loadManifest({
      schemaVersion: "pliette.motion-manifest/1.0",
      catalogRevision: "test.1",
      entries: [makeEntry({ rigRef: { ...RIG, assetDigest: "sha256-old" } })],
    }, "test.1"));
    const { matches } = index.lookup({ actionId: "gesture.wave", variantId: "small.screen_right", segmentId: "full" }, RIG);
    expect(matches.length).toBe(0);
  });

  it("选取顺序：preferred 优先，其余已批准修订降序 + 稳定 ID 升序", () => {
    const index = new MotionIndex({ "gesture.wave|small.screen_right|full": "seed.z" });
    index.rebuild(loadManifest({
      schemaVersion: "pliette.motion-manifest/1.0",
      catalogRevision: "test.1",
      entries: [
        makeEntry({ motionId: "seed.m", motionRevision: 3 }),
        makeEntry({ motionId: "seed.z", motionRevision: 1 }),
        makeEntry({ motionId: "seed.a", motionRevision: 2 }),
        makeEntry({ motionId: "seed.b", motionRevision: 2 }),
      ],
    }, "test.1"));
    const { matches } = index.lookup({ actionId: "gesture.wave", variantId: "small.screen_right", segmentId: "full" }, RIG);
    // preferred(seed.z) 优先；其余按修订降序（m@r3 → a@r2 → b@r2）+ 稳定 ID 升序
    expect(matches.map((m) => m.entry.motionId)).toEqual(["seed.z", "seed.m", "seed.a", "seed.b"]);
  });

  it("热更新原子替换：旧引用继续可用，新查询使用新投影（V18 机制层）", () => {
    const index = new MotionIndex();
    index.rebuild(loadManifest({ schemaVersion: "pliette.motion-manifest/1.0", catalogRevision: "test.1", entries: [makeEntry({ motionId: "seed.old" })] }, "test.1"));
    const key = { actionId: "gesture.wave", variantId: "small.screen_right", segmentId: "full" };
    const before = index.lookup(key, RIG).matches;
    expect(before.length).toBe(1);
    index.rebuild(loadManifest({ schemaVersion: "pliette.motion-manifest/1.0", catalogRevision: "test.1", entries: [makeEntry({ motionId: "seed.new", motionRevision: 2 })] }, "test.1"));
    expect(before[0].entry.motionId).toBe("seed.old"); // 旧引用对象未被改写
    expect(index.lookup(key, RIG).matches[0].entry.motionId).toBe("seed.new");
  });
});

describe("Selector 路由（§5）", () => {
  const catalog = new CatalogView(testCatalog());

  function makeIndex(entries: MotionEntry[]): MotionIndex {
    const index = new MotionIndex();
    index.rebuild(loadManifest({ schemaVersion: "pliette.motion-manifest/1.0", catalogRevision: "test.1", entries }, "test.1"));
    return index;
  }

  it("V01：registered + approved → HIT_READY，携带固定实现引用", () => {
    const route = routePlan(
      { catalog, index: makeIndex([makeEntry({ motionId: "seed.wave.main" })]), rig: RIG, planId: "p1" },
      planOf([{ sliceId: "s1", description: "小幅挥手", lookup: { actionId: "gesture.wave", variantId: "small.screen_right", segmentId: "full" }, parameters: {} }]),
    );
    expect(route.allHit).toBe(true);
    expect(route.slices[0].code).toBe("HIT_READY");
    expect(route.slices[0].match?.entry.motionId).toBe("seed.wave.main");
  });

  it("V04：planned 条目不算可播放命中（托腮备案不表示当前角色能做）", () => {
    const route = routePlan(
      { catalog, index: makeIndex([]), rig: RIG, planId: "p2" },
      planOf([{ sliceId: "s1", description: "双手托腮", lookup: { actionId: "routine.chin_rest", variantId: "both", segmentId: "full" }, parameters: {} }]),
    );
    expect(route.allHit).toBe(false);
    expect(route.slices[0].code).toBe("MISS_ASSET");
    expect(route.slices[0].generatable).toBe(false); // authorable=disabled：不调用不可能完成任务的 Author
  });

  it("V03：custom/custom/full → MISS_CUSTOM（进入受限生成，不污染公共目录）", () => {
    const route = routePlan(
      { catalog, index: makeIndex([]), rig: RIG, planId: "p3" },
      planOf([{ sliceId: "s1", description: "依次抬双臂", lookup: { actionId: "custom", variantId: "custom", segmentId: "full" }, parameters: {} }]),
    );
    expect(route.slices[0].code).toBe("MISS_CUSTOM");
  });

  it("拼写错误的变体 → INVALID_REFERENCE（不当作新动作自动扩库）", () => {
    const route = routePlan(
      { catalog, index: makeIndex([]), rig: RIG, planId: "p4" },
      planOf([{ sliceId: "s1", description: "挥手", lookup: { actionId: "gesture.wave", variantId: "big.screen_right", segmentId: "full" }, parameters: {} }]),
    );
    expect(route.slices[0].code).toBe("INVALID_REFERENCE");
  });

  it("V05：显式左手描述配 screen_right 键 → SEMANTIC_CONFLICT，不自动播出", () => {
    const route = routePlan(
      { catalog, index: makeIndex([makeEntry()]), rig: RIG, planId: "p5" },
      planOf([{ sliceId: "s1", description: "用画面左侧的手小幅挥手", lookup: { actionId: "gesture.wave", variantId: "small.screen_right", segmentId: "full" }, parameters: {} }]),
    );
    expect(route.slices[0].code).toBe("SEMANTIC_CONFLICT");
  });

  it("目录版本回显不匹配 → STALE_CATALOG（陈旧版本不得悄悄映射到新语义）", () => {
    const route = routePlan(
      { catalog, index: makeIndex([]), rig: RIG, planId: "p6" },
      planOf([{ sliceId: "s1", description: "挥手", lookup: { actionId: "gesture.wave", variantId: "small.screen_right", segmentId: "full" }, parameters: {} }], { catalogRevision: "old.0" }),
    );
    expect(route.slices[0].code).toBe("STALE_CATALOG");
  });

  it("未登记参数被拒绝（V07 参数部分）", () => {
    const issues = validateMotionPlan(
      planOf([{ sliceId: "s1", description: "挥手", lookup: { actionId: "gesture.wave", variantId: "small.screen_right", segmentId: "full" }, parameters: { amplitude: 3 } }]),
      { catalog: catalog.catalog },
    );
    expect(issues.some((i) => i.code === "PARAM_NOT_ALLOWED")).toBe(true);
  });
});

describe("Entry 语义校验（§4.5 静态部分）", () => {
  const catalog = testCatalog();

  it("合法种子条目零问题", () => {
    expect(validateEntry(makeEntry(), catalog)).toEqual([]);
  });

  it("full 必须为 [0, durationMs]；片段越界拒绝", () => {
    const issues = validateEntry(makeEntry({ durationMs: 2000, segments: { full: { startMs: 0, endMs: 2400, entryBoundaryId: "enter", exitBoundaryId: "exit", interruptibleAtEnd: true } } }), catalog);
    expect(issues.some((i) => i.code === "SEGMENT_BOUNDS")).toBe(true);
  });

  it("native_slice 时长必须等于源窗口长度；源窗口方向非法拒绝", () => {
    expect(validateEntry(makeEntry({ source: { kind: "native_slice", animationName: "stand", sourceStartMs: 4900, sourceEndMs: 8000 } }), catalog).some((i) => i.code === "DURATION_MISMATCH")).toBe(true);
    expect(validateEntry(makeEntry({ source: { kind: "native_slice", animationName: "stand", sourceStartMs: 7300, sourceEndMs: 4900 } }), catalog).some((i) => i.code === "SOURCE_WINDOW")).toBe(true);
  });

  it("首期 retime 只允许 1.0（未验证变速不得静默放行）", () => {
    expect(validateEntry(makeEntry({ retime: { minRate: 0.5, maxRate: 2 } }), catalog).some((i) => i.code === "RETIME_UNVERIFIED")).toBe(true);
  });

  it("引用未登记边界 / 事件越界被拒", () => {
    const badBoundary = makeEntry({ segments: { full: { startMs: 0, endMs: 2400, entryBoundaryId: "ghost", exitBoundaryId: "exit", interruptibleAtEnd: true } } });
    expect(validateEntry(badBoundary, catalog).some((i) => i.code === "UNKNOWN_BOUNDARY")).toBe(true);
    const badEvent = makeEntry({ events: [{ eventId: "e1", atMs: 9999, eventType: "contact_acquire", resourceId: "table" }] });
    expect(validateEntry(badEvent, catalog).some((i) => i.code === "EVENT_OUT_OF_RANGE")).toBe(true);
  });

  it("实现参数超出语义目录许可域被拒", () => {
    const entry = makeEntry({ parameterSchema: { type: "object", properties: { amplitude: { type: "number" } }, additionalProperties: false } });
    expect(validateEntry(entry, catalog).some((i) => i.code === "PARAM_NOT_ALLOWED")).toBe(true);
  });
});

describe("legacyAdapter（旧入口 → 新契约）", () => {
  it("旧 leftArm wave 按语义迁移为 gesture.raise_hand（不能继续充当挥手命中）", () => {
    expect(legacyKeyFor("wave", "rightArm")).toEqual({ actionId: "gesture.wave", variantId: "small.screen_right", segmentId: "full" });
    expect(legacyKeyFor("wave", "leftArm")!.actionId).toBe("gesture.raise_hand");
  });

  it("行为配方事件映射到逻辑键（V01 完整配方优先）", () => {
    expect(LEGACY_EVENT_KEYS.greet![0].actionId).toBe("routine.greet");
    expect(LEGACY_EVENT_KEYS.tease![0].actionId).toBe("reaction.shy");
  });

  it("keyOf 稳定（逻辑索引键格式）", () => {
    expect(keyOf({ actionId: "a.b", variantId: "v", segmentId: "full" })).toBe("a.b|v|full");
  });

  it("方向冲突检测器直接可用", () => {
    const issues = detectDirectionConflict(planOf([{ sliceId: "s1", description: "左手", lookup: { actionId: "gesture.wave", variantId: "small.screen_right", segmentId: "full" }, parameters: {} }]));
    expect(issues.length).toBe(1);
  });
});
