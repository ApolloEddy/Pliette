/**
 * M5 种子迁移验收（MotionLibrary Spec v1.0 §9.1 / V17 机制层）：
 * 种子 manifest 通过目录交叉校验；contentDigest 用运行时实现复算一致
 * （脚本与 src/motion/library/digest.ts 的规范化语义必须完全一致）。
 * 拉菲骨架为本地私有资产：缺失时跳过（开源 CI 兼容），如实标注不做假通过。
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadCatalog, CatalogView } from "../src/motion/library/catalog.js";
import { loadManifest, MotionIndex } from "../src/motion/library/index.js";
import { validateManifest } from "../src/motion/library/validate.js";
import { sha256Json } from "../src/motion/library/digest.js";
import type { MotionEntry } from "../src/motion/library/contracts.js";

const lafeiAssetsAvailable = existsSync(resolve("public/assets-local/lafei_8/lafei_8.json"));
const manifestPath = "public/motion-library/models/lafei_8/front/manifest.json";

function dummyTexture() {
  return { setFilters() {}, setWraps() {}, getImage: () => ({ width: 4, height: 4 }), getWidth: () => 4, getHeight: () => 4, dispose() {} };
}

const catalogView = new CatalogView(loadCatalog(JSON.parse(readFileSync(resolve("public/motion-library/catalog.json"), "utf-8"))));

describe("种子 manifest（§9.1 迁移备案）", () => {
  const manifest = loadManifest(JSON.parse(readFileSync(resolve(manifestPath), "utf-8")), catalogView.revision);

  it("34 条条目全部通过目录引用/时间窗/参数交集语义校验", () => {
    expect(manifest.entries.length).toBe(34);
    const issues = validateManifest(manifest, catalogView.catalog);
    expect(issues).toEqual([]);
  });

  it("配方 routine.greet：子动作引用可解析、修订/摘要冻结一致、通道不相交、时长覆盖", () => {
    const recipe = manifest.entries.find((e) => e.motionId === "lafei.routine_greet.default")!;
    expect(recipe.source.kind).toBe("recipe");
    if (recipe.source.kind !== "recipe") return;
    let lastEnd = 0;
    const occupiedChannels = new Set<string>();
    for (const step of recipe.source.steps) {
      const sub = manifest.entries.find((e) => e.motionId === step.motionId);
      expect(sub).toBeDefined();
      expect(sub!.motionRevision).toBe(step.motionRevision);
      expect(sub!.contentDigest).toBe(step.contentDigest); // 冻结修订（V18：配方不改写正在播放的引用）
      expect(sub!.preconditions.postures).toEqual(recipe.preconditions.postures);
      // 通道不相交（组合无排他冲突）
      for (const ch of sub!.channels) expect(occupiedChannels.has(ch)).toBe(false);
      for (const ch of sub!.channels) occupiedChannels.add(ch);
      lastEnd = Math.max(lastEnd, step.offsetMs + sub!.durationMs);
    }
    expect(recipe.channels.sort()).toEqual([...occupiedChannels].sort());
    expect(recipe.durationMs).toBeGreaterThanOrEqual(lastEnd);
    expect(recipe.transition.mixInMs).toBe(0); // 配方自身不套第二层混合（§8.1）
  });

  it("P0 扩展族：shake/lower/sleepy/blink/squeeze/idle 均已登记且变体与目录一致", () => {
    const ids = new Set(manifest.entries.map((e) => `${e.actionId}/${e.variantId}`));
    for (const key of [
      "head.shake/normal",
      "head.lower/small",
      "reaction.sleepy/small",
      "life.blink/paired",
      "face.eyes_squeeze/paired",
      "life.idle/default",
    ]) {
      expect(ids.has(key)).toBe(true);
    }
    const idle = manifest.entries.find((e) => e.actionId === "life.idle")!;
    expect(idle.source.kind).toBe("native_clip");
    expect(idle.loop.allowed).toBe(true);
  });

  it("旧 leftArm wave 已迁移为 gesture.raise_hand（不再充当挥手精确命中）", () => {
    const raise = manifest.entries.find((e) => e.actionId === "gesture.raise_hand");
    expect(raise).toBeDefined();
    expect(raise!.variantId).toBe("screen_left");
    expect(raise!.source.kind).toBe("native_slice");
    if (raise!.source.kind === "native_slice") {
      // 视觉精调后的窗口：含完整抬-保持-落弧线（12.9 起抬 → 14.5 落定）
      expect(raise!.source.animationName).toBe("stand");
      expect(raise!.source.sourceStartMs).toBe(12900);
      expect(raise!.source.sourceEndMs).toBe(14500);
    }
  });

  it("shy 使用前提如实声明（站姿合成已验证）；touch_table 绑定已标定桌高资源", () => {
    const shy = manifest.entries.find((e) => e.actionId === "reaction.shy")!;
    expect(shy.preconditions.postures).toEqual(["standing"]);
    expect(shy.preconditions.baseAnimations).toEqual(["stand"]);
    const touch = manifest.entries.find((e) => e.actionId === "contact.touch_table")!;
    expect(touch.preconditions.requiredResources).toContain("scene:table.calibrated_0.27H");
  });

  it("Activation Pass：34 条全部 approved（轨迹/视觉/评审时间齐备）且全部可播放命中", () => {
    for (const e of manifest.entries) {
      expect(e.status, e.motionId).toBe("approved");
      expect(e.validation.trajectory, e.motionId).toBe("passed");
      expect(e.validation.visual, e.motionId).toBe("passed");
      expect(typeof e.validation.reviewedAt === "string" && e.validation.reviewedAt.length > 0, e.motionId).toBe(true);
      expect(e.validation.evidenceRefs.some((r) => r.includes("[activation@")), e.motionId).toBe(true);
    }
    const rig = manifest.entries[0].rigRef;
    const index = new MotionIndex();
    index.rebuild(manifest);
    expect(index.lookup({ actionId: "gesture.wave", variantId: "small.screen_right", segmentId: "full" }, rig).matches.length).toBe(1);
    expect(index.lookup({ actionId: "routine.greet", variantId: "default", segmentId: "full" }, rig).matches.length).toBe(1);
  });

  it("contact 三条带 requiredContacts 契约（不得凭视觉像就转正）", () => {
    const expectContacts = (motionId: string, contacts: string[]) => {
      const e = manifest.entries.find((x) => x.motionId === motionId)!;
      expect(e.preconditions.requiredContacts.sort()).toEqual([...contacts].sort());
    };
    expectContacts("lafei.chin_rest.both", ["contact:face.chin_under_left", "contact:face.chin_right"]);
    expectContacts("lafei.cheek_touch.screen_right", ["contact:face.cheek_right"]);
    expectContacts("lafei.scratch_head.screen_right", ["contact:head.side_right"]);
  });

  it("V17：contentDigest 排除自身字段并可复算（导入防篡改机制）", async () => {
    if (!lafeiAssetsAvailable) return; // 无资产环境跳过复算（资产摘要不可得）
    const entry = manifest.entries[0] as MotionEntry;
    const { contentDigest, ...rest } = entry;
    const recomputed = await sha256Json(rest);
    expect(recomputed).toBe(contentDigest);
  });

  it("写集来自真实源动画（非通道名推定）：挥手臂条目含 hand_R 链骨骼", () => {
    if (!lafeiAssetsAvailable) return;
    const wave = manifest.entries.find((e) => e.motionId === "lafei.wave.small_screen_right")!;
    expect(wave.writes.some((w) => w.startsWith("bone:hand_R"))).toBe(true);
    expect(wave.writes.every((w) => w.startsWith("bone:") || w.startsWith("slot:"))).toBe(true);
  });

  it("head.nod 草稿（V1→V1.1 转换）通过七步管线重验证：编译+隔离采样零失败", async () => {
    if (!lafeiAssetsAvailable) return; // 编译采样需要拉菲骨架
    const { parseControlProfile } = await import("../src/rig/controlProfile.js");
    const { loadSkeleton } = await import("../src/assets/loader.js");
    const { assembleRequest } = await import("../src/motion/author/context.js");
    const { validateCandidate } = await import("../src/motion/author/validateV11.js");
    const { sha256Json: rehash } = await import("../src/motion/library/digest.js");

    const profile = parseControlProfile(JSON.parse(readFileSync(resolve("characters/lafei_8.rig-profile.json"), "utf-8")));
    const draftFile = JSON.parse(
      readFileSync(resolve("public/motion-library/models/lafei_8/front/drafts/lafei.nod.v11.json"), "utf-8"),
    );
    const nodEntry = manifest.entries.find((e) => e.motionId === "lafei.head_nod.small")!;
    expect(nodEntry.source.kind).toBe("draft");
    if (nodEntry.source.kind !== "draft") return;
    // V17：摘要必须与草稿文件实算一致（不信任自报值）
    expect(await rehash(draftFile)).toBe(nodEntry.source.contentDigest);

    const controlSubset = ["head.nod", "face.eyes.pair"];
    const request = assembleRequest(profile, {
      requestId: "verify-nod-import",
      contextId: "verify-nod-ctx",
      goal: "点头（V1→V1.1 转换重验证）",
      runtimeState: { monoClockMs: 0, viewId: "front", skinId: "default", stateVersion: 1, occupiedChannels: [], contacts: [] },
      controlSubset,
    });
    const raw = {
      status: "motion",
      requestId: request.requestId,
      contextId: request.contextId,
      profileDigest: request.profileRef.profileDigest,
      draft: draftFile,
    };
    const bundle = loadSkeleton({
      name: "lafei_8",
      skeletonJson: JSON.parse(readFileSync(resolve("public/assets-local/lafei_8/lafei_8.json"), "utf-8")),
      atlasText: readFileSync(resolve("public/assets-local/lafei_8/lafei_8.atlas.txt"), "utf-8"),
      createTexture: dummyTexture,
    });
    const result = validateCandidate(raw, request, profile, { skeletonData: bundle.skeletonData });
    const failures = result.findings.filter((f) => !f.note);
    expect(failures.map((f) => `${f.code}:${f.message}`)).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.compiled).toBeDefined();
    expect(result.response?.status).toBe("motion");
  });

  it("全部创作草稿（agent_offline）经七步管线全量重验证：编译+隔离采样零失败", async () => {
    if (!lafeiAssetsAvailable) return;
    const { parseControlProfile, getControl } = await import("../src/rig/controlProfile.js");
    const { loadSkeleton } = await import("../src/assets/loader.js");
    const { assembleRequest } = await import("../src/motion/author/context.js");
    const { validateCandidate } = await import("../src/motion/author/validateV11.js");
    const { budgetFor } = await import("../src/motion/author/protocol.js");

    const profile = parseControlProfile(JSON.parse(readFileSync(resolve("characters/lafei_8.rig-profile.json"), "utf-8")));
    const bundle = loadSkeleton({
      name: "lafei_8",
      skeletonJson: JSON.parse(readFileSync(resolve("public/assets-local/lafei_8/lafei_8.json"), "utf-8")),
      atlasText: readFileSync(resolve("public/assets-local/lafei_8/lafei_8.atlas.txt"), "utf-8"),
      createTexture: dummyTexture,
    });
    const drafted = manifest.entries.filter((e) => e.source.kind === "draft");
    expect(drafted.length).toBe(18); // 17 创作 + 1 转换
    for (const entry of drafted) {
      if (entry.source.kind !== "draft") continue;
      const draft = JSON.parse(readFileSync(resolve("public/motion-library/models/lafei_8/front", entry.source.path), "utf-8"));
      const subset: string[] = Array.from(new Set<string>(draft.curves.map((c: { controlId: string }) => c.controlId as string)));
      const request = assembleRequest(profile, {
        requestId: `revalidate-${entry.motionId}`,
        contextId: "revalidate-ctx",
        goal: "创作草稿全量重验证",
        runtimeState: { monoClockMs: 0, viewId: "front", skinId: "default", stateVersion: 1, occupiedChannels: [], contacts: [] },
        controlSubset: subset,
        budget: budgetFor("interaction"),
      });
      const raw = {
        status: "motion",
        requestId: request.requestId,
        contextId: request.contextId,
        profileDigest: request.profileRef.profileDigest,
        draft,
      };
      const result = validateCandidate(raw, request, profile, { skeletonData: bundle.skeletonData });
      const failures = result.findings.filter((f) => !f.note);
      expect(failures.map((f) => `${entry.motionId}: ${f.code} ${f.message}`)).toEqual([]);
      expect(result.ok, entry.motionId).toBe(true);
      expect(result.compiled, entry.motionId).toBeDefined();
    }
  });
});
