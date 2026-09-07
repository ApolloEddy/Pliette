/** 原动画切片叠加：通道过滤正确性（Spec P2 属性过滤的前置验证）。 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildChannels, filterAnimation } from "../src/motion/library/overlay.js";
import { loadExample } from "./helpers.js";

describe("filterAnimation 通道过滤", () => {
  const bundle = loadExample("spineboy");
  const channels = buildChannels(bundle.skeletonData);

  it("head 通道只保留头部骨骼与表情槽的 timeline", () => {
    const source = bundle.skeletonData.findAnimation("walk")!;
    const filtered = filterAnimation(bundle.skeletonData, source, channels.head, "walk#head");
    expect(filtered).not.toBeNull();
    expect(filtered!.timelines.length).toBeLessThan(source.timelines.length);
    expect(filtered!.duration).toBeCloseTo(source.duration, 6);
  });

  it("无匹配 timeline 时返回 null 而非空动画", () => {
    const source = bundle.skeletonData.findAnimation("walk")!;
    const empty = { channel: "torso" as const, track: 3, bones: new Set<number>([9999]), slots: new Set<number>([9999]) };
    expect(filterAnimation(bundle.skeletonData, source, empty, "none")).toBeNull();
  });

  it("通道构建：lafei/示例骨架都能建立五个通道", () => {
    expect(Object.keys(channels).sort()).toEqual(["face", "head", "leftArm", "rightArm", "torso"]);
    expect(channels.head.bones.size).toBeGreaterThan(0);
    expect(channels.head.slots.size).toBeGreaterThan(0);
  });

  it("lafei 真实资产：stand 的 head 切片包含表情附件 timeline（资源在位时）", async () => {
    const lafeiJson = resolve(process.cwd(), "public/assets-local/lafei_8/lafei_8.json");
    if (!existsSync(lafeiJson)) return;
    const { readFileSync } = await import("node:fs");
    const raw = JSON.parse(readFileSync(lafeiJson, "utf8"));
    const atlasText = readFileSync(resolve(process.cwd(), "public/assets-local/lafei_8/lafei_8.atlas.txt"), "utf8");
    const { loadSkeleton } = await import("../src/assets/loader.js");
    const bundle = loadSkeleton({
      name: "lafei_8", skeletonJson: raw, atlasText,
      createTexture: () => ({ setFilters() {}, setWraps() {}, getImage: () => ({ width: 4, height: 4 }), getWidth: () => 4, getHeight: () => 4, dispose() {} }),
    });
    const channels = buildChannels(bundle.skeletonData);
    const stand = bundle.skeletonData.findAnimation("touch")!;
    const filtered = filterAnimation(bundle.skeletonData, stand, channels.head, "touch#head");
    expect(filtered).not.toBeNull();
    expect(filtered!.timelines.some((t) => t.constructor.name === "AttachmentTimeline")).toBe(true);
  });
});
