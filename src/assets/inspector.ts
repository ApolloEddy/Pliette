import { spine36 as spine } from "spine-webgl";
import type { AssetBundle } from "./loader.js";
import { SPINE_RUNTIME_VERSION } from "../version.js";

export interface BoneReport {
  name: string;
  parent: string | null;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

export interface ConstraintReport {
  name: string;
  bones: string[];
  target?: string;
  mix?: number;
  bendDirection?: number;
}

export interface AnimationReport {
  name: string;
  duration: number;
  timelines: Record<string, number>;
}

export interface SkinAttachmentSummary {
  skin: string;
  total: number;
  byType: Record<string, number>;
}

export interface AtlasPageReport {
  name: string;
  width: number | null;
  height: number | null;
}

/** Spec 4.1：导入后的检查报告 */
export interface AssetReport {
  assetName: string;
  exportVersion: string;
  runtimeVersion: string;
  versionMatch: boolean;
  setupWidth: number | null;
  setupHeight: number | null;
  boneCount: number;
  bones: BoneReport[];
  slotCount: number;
  slots: { name: string; bone: string; attachment: string | null }[];
  skins: SkinAttachmentSummary[];
  ikConstraints: ConstraintReport[];
  transformConstraintCount: number;
  pathConstraintCount: number;
  animations: AnimationReport[];
  events: string[];
  atlasPages: AtlasPageReport[];
  /** 正反面组织方式：未完成完整播放核查前保持声明（Spec 4.2 / D.2） */
  frontBackStructure: string;
}

function attachmentTypeName(att: unknown): string {
  const name = (att as { constructor?: { name?: string } })?.constructor?.name ?? "unknown";
  return name.replace(/Attachment$/, "").toLowerCase();
}

export function inspectSkeletonData(bundle: AssetBundle): AssetReport {
  const data: spine.SkeletonData = bundle.skeletonData;
  const raw = bundle.rawJson as any;

  const bones: BoneReport[] = data.bones.map((b) => ({
    name: b.name,
    parent: b.parent?.name ?? null,
    x: b.x,
    y: b.y,
    rotation: b.rotation,
    scaleX: b.scaleX,
    scaleY: b.scaleY,
  }));

  const slots = data.slots.map((s) => ({
    name: s.name,
    bone: s.boneData?.name ?? (s as any).bone?.name ?? "?",
    attachment: s.attachmentName ?? null,
  }));

  const skins: SkinAttachmentSummary[] = data.skins.map((skin) => {
    const byType: Record<string, number> = {};
    let total = 0;
    const entries = typeof (skin as any).getAttachments === "function" ? (skin as any).getAttachments() : [];
    for (const entry of entries) {
      total++;
      const t = attachmentTypeName(entry.attachment);
      byType[t] = (byType[t] ?? 0) + 1;
    }
    return { skin: skin.name, total, byType };
  });

  const ikConstraints: ConstraintReport[] = (data as any).ikConstraints?.map((ik: any) => ({
    name: ik.name,
    bones: (ik.bones ?? []).map((b: any) => b.name),
    target: ik.target?.name,
    mix: ik.mix,
    bendDirection: ik.bendDirection,
  })) ?? [];

  const animations: AnimationReport[] = data.animations.map((a) => {
    const timelines: Record<string, number> = {};
    for (const tl of a.timelines) {
      const name = (tl as { constructor?: { name?: string } }).constructor?.name ?? "unknown";
      timelines[name] = (timelines[name] ?? 0) + 1;
    }
    return { name: a.name, duration: a.duration, timelines };
  });

  const atlasPages: AtlasPageReport[] = (bundle.atlas as any).pages?.map((p: any) => ({
    name: p.name,
    width: typeof p.width === "number" ? p.width : null,
    height: typeof p.height === "number" ? p.height : null,
  })) ?? [];

  return {
    assetName: bundle.name,
    exportVersion: bundle.exportVersion,
    runtimeVersion: SPINE_RUNTIME_VERSION,
    versionMatch: bundle.exportVersion.split(".").slice(0, 2).join(".") === SPINE_RUNTIME_VERSION.split(".").slice(0, 2).join("."),
    setupWidth: typeof raw?.skeleton?.width === "number" ? raw.skeleton.width : null,
    setupHeight: typeof raw?.skeleton?.height === "number" ? raw.skeleton.height : null,
    boneCount: bones.length,
    bones,
    slotCount: slots.length,
    slots,
    skins,
    ikConstraints,
    transformConstraintCount: (data as any).transformConstraints?.length ?? 0,
    pathConstraintCount: (data as any).pathConstraints?.length ?? 0,
    animations,
    events: ((data as any).events ?? []).map((e: any) => e.name),
    atlasPages,
    frontBackStructure:
      "尚未完成完整播放核查：本包只有一组 skel/图集/纹理，既不证明只有正面，也不证明存在完整背面（Spec 4.2 / D.2）",
  };
}

export function assetReportJson(report: AssetReport): string {
  return JSON.stringify(report, null, 2);
}

export function assetReportMarkdown(report: AssetReport): string {
  const L: string[] = [];
  L.push(`# AssetReport · ${report.assetName}`);
  L.push("");
  L.push(`- 导出版本：**${report.exportVersion}** · 运行时：**${report.runtimeVersion}** · major.minor ${report.versionMatch ? "匹配 ✅" : "不匹配 ❌"}`);
  L.push(`- setup 包围盒：${report.setupWidth ?? "?"} × ${report.setupHeight ?? "?"}（不等于标定身高 H）`);
  L.push(`- 骨骼：${report.boneCount} 根 · Slot：${report.slotCount} 个 · 动画：${report.animations.length} 段 · 事件：${report.events.length} 个`);
  L.push(`- IK 约束：${report.ikConstraints.length} 条 · Transform：${report.transformConstraintCount} · Path：${report.pathConstraintCount}`);
  L.push(`- 图集页：${report.atlasPages.map((p) => `${p.name}${p.width ? ` (${p.width}×${p.height})` : ""}`).join("、") || "无"}`);
  L.push(`- 正反面：${report.frontBackStructure}`);
  if (report.ikConstraints.length > 0) {
    L.push("");
    L.push("## IK 约束");
    L.push("");
    L.push("| 名称 | 骨骼链 | 目标 | mix | bendDirection |");
    L.push("| --- | --- | --- | --- | --- |");
    for (const ik of report.ikConstraints) {
      L.push(`| ${ik.name} | ${ik.bones.join(" → ")} | ${ik.target ?? "?"} | ${ik.mix ?? "?"} | ${ik.bendDirection ?? "?"} |`);
    }
  }
  L.push("");
  L.push("## 皮肤与附件");
  L.push("");
  L.push("| 皮肤 | 附件数 | 类型分布 |");
  L.push("| --- | --- | --- |");
  for (const s of report.skins) {
    const dist = Object.entries(s.byType).map(([k, v]) => `${k}×${v}`).join("、") || "空";
    L.push(`| ${s.skin} | ${s.total} | ${dist} |`);
  }
  L.push("");
  L.push("## 动画");
  L.push("");
  L.push("| 名称 | 时长(s) | Timeline 分布 |");
  L.push("| --- | --- | --- |");
  for (const a of report.animations) {
    const dist = Object.entries(a.timelines).map(([k, v]) => `${k}×${v}`).join("、");
    L.push(`| ${a.name} | ${a.duration.toFixed(2)} | ${dist} |`);
  }
  L.push("");
  L.push("## 骨骼层级");
  L.push("");
  L.push("| 名称 | 父节点 | x | y | rotation | scaleX | scaleY |");
  L.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const b of report.bones) {
    L.push(`| ${b.name} | ${b.parent ?? "—"} | ${b.x} | ${b.y} | ${b.rotation} | ${b.scaleX} | ${b.scaleY} |`);
  }
  return L.join("\n");
}
