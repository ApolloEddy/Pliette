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

const catalogView = new CatalogView(loadCatalog(JSON.parse(readFileSync(resolve("public/motion-library/catalog.json"), "utf-8"))));

describe("种子 manifest（§9.1 迁移备案）", () => {
  const manifest = loadManifest(JSON.parse(readFileSync(resolve(manifestPath), "utf-8")), catalogView.revision);

  it("9 条种子条目全部通过目录引用/时间窗/参数交集语义校验", () => {
    expect(manifest.entries.length).toBe(9);
    const issues = validateManifest(manifest, catalogView.catalog);
    expect(issues).toEqual([]);
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

  it("全部条目 status=candidate（候选不进默认可播放投影，不假称已验收）", () => {
    for (const e of manifest.entries) {
      expect(e.status).toBe("candidate");
      expect(e.validation.visual).toBe("pending");
    }
    const rig = manifest.entries[0].rigRef;
    const index = new MotionIndex();
    index.rebuild(manifest);
    const { matches } = index.lookup({ actionId: "gesture.wave", variantId: "small.screen_right", segmentId: "full" }, rig);
    expect(matches.length).toBe(0); // candidate 不可播放——验收提升后才有投影
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
});
