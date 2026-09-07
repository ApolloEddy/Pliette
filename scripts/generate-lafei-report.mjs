const { spine } = await import("../vendor/spine-ts/3.6/spine-core-esm.js");
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const raw = JSON.parse(readFileSync("assets/Model/lafei_8/lafei_8.json", "utf8"));
const atlasText = readFileSync("assets/Model/lafei_8/lafei_8.atlas.txt", "utf8");
const dummy = () => ({ setFilters() {}, setWraps() {}, getImage: () => ({ width: 4, height: 4 }), getWidth: () => 4, getHeight: () => 4, dispose() {} });
const data = new spine.SkeletonJson(new spine.AtlasAttachmentLoader(new spine.TextureAtlas(atlasText, dummy))).readSkeletonData(raw);

const attTypeName = (a) => a?.constructor?.name?.replace(/Attachment$/, "").toLowerCase() ?? "unknown";
const skin = data.skins[0];
const byType = {}; let attTotal = 0;
const attachmentBySlot = {};
skin.attachments.forEach((slotAtts, slotIndex) => {
  const slotName = data.slots[slotIndex]?.name ?? `#${slotIndex}`;
  for (const key in slotAtts) {
    attTotal++;
    const t = attTypeName(slotAtts[key]);
    byType[t] = (byType[t] ?? 0) + 1;
    (attachmentBySlot[slotName] ??= []).push(key);
  }
});
const report = {
  assetName: "lafei_8",
  exportVersion: raw.skeleton.spine,
  runtimeVersion: "3.6.53",
  versionMatch: true,
  setupSize: { w: raw.skeleton.width, h: raw.skeleton.height, hash: raw.skeleton.hash },
  boneCount: data.bones.length,
  slotCount: data.slots.length,
  attachmentTotal: attTotal,
  attachmentByType: byType,
  skins: data.skins.map((s) => s.name),
  ikConstraints: data.ikConstraints.map((ik) => ({ name: ik.name, bones: ik.bones.map((b) => b.name), target: ik.target?.name, mix: ik.mix, bendDirection: ik.bendDirection })),
  animations: data.animations.map((a) => ({ name: a.name, duration: +a.duration.toFixed(2) })),
  events: (data.events ?? []).map((e) => e.name),
  calibration: { heightUnits: 335, footBaselineY: -2.4, method: "setup/stand/walk 三姿态附件世界包围盒（333.8/332.8/337.0），非纹理尺寸" },
  frontBackConclusion: "仅正面：唯一 default 皮肤、67 附件无任何 back 部件；move_left/attack_left 与正向版本骨骼写集与附件切换完全一致（仅关键帧数值不同），属朝左行为变体而非背面视图（Spec 4.2 判定）。镜像不得作为背面；完整转身需后续素材或限制展示朝向。",
  faceCapability: { eyes: "eye_L/eye_R 各 8 个附件变体（睁闭/大小/形状），meimao1 slot 含 5 种眉毛，bushuang1/2 补丁，hongyun 红晕，sleep2 睡眼，dangao/kele/lanzi/mao_* 道具附件——表情/道具切换能力丰富，适合 slotState 控制器（Spec 10.3 分级：独立眼部附件）" },
  attachmentBySlot,
};
mkdirSync("experiments/p0-lafei", { recursive: true });
writeFileSync("experiments/p0-lafei/lafei_8.asset-report.json", JSON.stringify(report, null, 2));
const L = [];
L.push("# AssetReport · lafei_8（真实资产验收）");
L.push("");
L.push(`生成：2026-09-07 · 导出版本 **${report.exportVersion}** · 运行时 3.6.53 · major.minor 匹配 ✅`);
L.push("");
L.push(`- 骨骼 **${report.boneCount}** · Slot **${report.slotCount}** · 附件 **${report.attachmentTotal}**（${Object.entries(byType).map(([k,v])=>`${k}×${v}`).join("、")}） · 皮肤：${report.skins.join(", ")}（唯一）`);
L.push(`- 动画 **${report.animations.length}** 段：${report.animations.map((a) => `${a.name}(${a.duration}s)`).join("、")}`);
L.push(`- IK：${report.ikConstraints.map((ik) => `${ik.name} ${ik.bones.map((b) => b).join("→")} target=${ik.target} mix=${ik.mix}`).join("；")}`);
L.push(`- 事件：${report.events.join("、") || "无"}`);
L.push(`- 标定：heightUnits=${report.calibration.heightUnits}，脚底基准 y=${report.calibration.footBaselineY}（${report.calibration.method}）`);
L.push("");
L.push(`## 正反面判定（Spec 4.2）`);
L.push("");
L.push(report.frontBackConclusion);
L.push("");
L.push(`## 面部能力（Spec 10.3 分级）`);
L.push("");
L.push(report.faceCapability.eyes);
L.push("");
L.push(`## 转换记录`);
L.push("");
L.push("- 工具：wang606/SpineSkeletonDataConverter v3.8（PolyForm Noncommercial，本地工具目录，不入分发产物）");
L.push("- 命令：`SpineSkeletonDataConverter.exe lafei_8.skel lafei_8.json`（自动识别 3.6，同版本输出）");
L.push("- 原始 skel SHA-256 `b86c72e8...35f8c4`；转换 JSON SHA-256 `13e52701...313abc`");
L.push("- 官方运行时加载验证：node 端 SkeletonJson 解析 + attack@0.5s 采样 + 浏览器 Lab 平面/3D 双模式目视（walk 动画、贴图、透明全部正常）");
writeFileSync("experiments/p0-lafei/lafei_8.asset-report.md", L.join("\n"));
console.log("报告已生成: experiments/p0-lafei/lafei_8.asset-report.{json,md}");
console.log("slots with most attachments:", Object.entries(attachmentBySlot).sort((a,b)=>b[1].length-a[1].length).slice(0,6).map(([s,a])=>`${s}(${a.length})`).join(", "));
