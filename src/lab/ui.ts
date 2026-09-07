/** Motion Lab 界面接线：资产导入、基线播放、探针/绑定、Draft 校验编译预览、调度演示与主循环。 */
import { Stage } from "../scene/stage.js";
import { PaperActor } from "../render/actor.js";
import { SpineView, type AssetSourceConfig } from "../render/spineView.js";
import { inspectSkeletonData, assetReportMarkdown, assetReportJson, type AssetReport } from "../assets/inspector.js";
import { LAFEI_8_FRONT_CANDIDATES, guessBinding, type RigProfile, type ChannelId } from "../rig/rigProfile.js";
import { validateDraft, type Diagnostic } from "../motion/compiler/validate.js";
import { compileDraft, type CompiledMotion } from "../motion/compiler/compile.js";
import { nodHeadDraft, waveSmallDraft, type MotionDraft } from "../motion/authoring/draft.js";
import { MotionScheduler, type MotionInstance } from "../motion/runtime/scheduler.js";
import { GestureLayer, CHANNEL_TRACK } from "../motion/runtime/gestureLayer.js";
import { DEFAULT_CATALOG } from "../motion/parameters/presets.js";
import { resolveParams, applyStyle, STYLE_HAPPY } from "../motion/parameters/registry.js";
import { LabRecorder } from "./recorder.js";

interface AssetEntry extends AssetSourceConfig {
  label: string;
  optional?: boolean;
  characterId: string;
}

const ASSETS: AssetEntry[] = [
  {
    name: "spineboy",
    label: "Spineboy（官方示例 · PMA）",
    characterId: "spineboy",
    jsonUrl: "/examples/spineboy/spineboy-pro.json",
    atlasUrl: "/examples/spineboy/spineboy-pma.atlas",
    imagePathFor: (n) => `/examples/spineboy/${n}`,
    premultipliedAlpha: true,
  },
  {
    name: "goblins",
    label: "Goblins（官方示例 · 双皮肤）",
    characterId: "goblins",
    jsonUrl: "/examples/goblins/goblins-pro.json",
    atlasUrl: "/examples/goblins/goblins-pma.atlas",
    imagePathFor: (n) => `/examples/goblins/${n}`,
    premultipliedAlpha: true,
  },
  {
    name: "stretchyman",
    label: "Stretchyman（官方示例 · IK/Mesh）",
    characterId: "stretchyman",
    jsonUrl: "/examples/stretchyman/stretchyman-pro.json",
    atlasUrl: "/examples/stretchyman/stretchyman-pma.atlas",
    imagePathFor: (n) => `/examples/stretchyman/${n}`,
    premultipliedAlpha: true,
  },
  {
    name: "lafei_8",
    label: "拉菲 lafei_8（assets-local）",
    characterId: "lafei_8",
    jsonUrl: "/assets-local/lafei_8/lafei_8.json",
    atlasUrl: "/assets-local/lafei_8/lafei_8.atlas.txt",
    imagePathFor: (n) => `/assets-local/lafei_8/${n}`,
    premultipliedAlpha: true,
    optional: true,
  },
];

const BG_COLORS: Record<string, [number, number, number]> = {
  black: [0, 0, 0],
  white: [1, 1, 1],
  gray: [0.5, 0.5, 0.5],
  green: [0, 0.69, 0.25],
  blue: [0.16, 0.17, 0.21],
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const isFlat = () => document.body.classList.contains("flat-mode");
const activeView = () => (isFlat() ? flatView : actor.view);

const stage = new Stage($("stage3d") as HTMLCanvasElement);
const actor = new PaperActor(1);
stage.actorAnchor.add(actor.object3D);

const flatCanvas = $("spine-flat") as HTMLCanvasElement;
const flatView = new SpineView(720, 960, flatCanvas);

const scheduler = new MotionScheduler(DEFAULT_CATALOG);
let gestureFlat: GestureLayer | null = null;
let gesture3d: GestureLayer | null = null;

let currentEntry: AssetEntry | null = null;
let currentRig: RigProfile = emptyRig();
let lastReport: AssetReport | null = null;
let lastIntent: { requestId: string; action: string; params: Record<string, unknown> } | null = null;
let lastInstanceId: string | null = null;
let lastCompiled: CompiledMotion | null = null;
let logicalTime = 0;
let fpsAvg = 60;

function emptyRig(): RigProfile {
  return { id: "none", characterId: "none", view: "front", skeletonExportVersion: "-", heightUnits: null, bones: {}, capabilities: [] };
}

function log(message: string, cls: "" | "good" | "bad" | "warn" = ""): void {
  const el = $("log");
  const t = (performance.now() / 1000).toFixed(2);
  const line = document.createElement("div");
  if (cls) line.className = cls;
  line.innerHTML = `<span class="t">[${t}s]</span> ${message}`;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
}

function renderDiagnostics(diags: Diagnostic[]): void {
  const box = $("diagnostics");
  box.innerHTML = "";
  if (diags.length === 0) {
    const ok = document.createElement("div");
    ok.className = "ok-line";
    ok.textContent = "✓ 校验通过";
    box.appendChild(ok);
    return;
  }
  for (const d of diags) {
    const div = document.createElement("div");
    div.className = `diag ${d.level}`;
    div.textContent = `${d.level === "error" ? "✗" : "⚠"} [${d.code}] ${d.message}`;
    box.appendChild(div);
  }
}

function fillSelect(select: HTMLSelectElement, values: string[], selected?: string | null): void {
  select.innerHTML = "";
  for (const v of values) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    select.appendChild(opt);
  }
  if (selected != null) select.value = selected;
}

/* ---------------- RigProfile 绑定面板 ---------------- */

const ROLE_KEYS = ["body.root", "head.main", "arm.left", "arm.right"] as const;

function guessFromNames(names: string[], role: string): string | null {
  if (currentEntry?.characterId === "lafei_8") {
    const cand = LAFEI_8_FRONT_CANDIDATES.bones[role];
    if (cand && names.includes(cand.bone)) return cand.bone;
  }
  const patterns: Record<string, RegExp[]> = {
    "head.main": [/^head$/i, /head/i, /face/i],
    "arm.left": [/hand[_-]?l/i, /arm[_-]?l/i, /handl/i, /arml/i],
    "arm.right": [/hand[_-]?r/i, /arm[_-]?r/i, /handr/i, /armr/i],
    "body.root": [/^(body|hip|torso)$/i],
  };
  for (const re of patterns[role] ?? []) {
    const hit = names.find((n) => re.test(n));
    if (hit) return hit;
  }
  return names[0] ?? null;
}

function buildBindingPanel(names: string[]): void {
  const box = $("rig-bindings");
  box.innerHTML = "";
  for (const role of ROLE_KEYS) {
    const label = document.createElement("label");
    label.textContent = role;
    const select = document.createElement("select");
    select.dataset.role = role;
    fillSelect(select, names, guessFromNames(names, role));
    select.addEventListener("change", () => rebuildRig());
    box.appendChild(label);
    box.appendChild(select);
  }
}

function rebuildRig(): void {
  const data = flatView.skeletonData;
  if (!data || !currentEntry) return;
  const names = data.bones.map((b) => b.name);
  const bones: RigProfile["bones"] = {};
  document.querySelectorAll<HTMLSelectElement>("#rig-bindings select").forEach((select) => {
    const role = select.dataset.role!;
    const boneName = select.value;
    if (!names.includes(boneName)) return;
    const channel: ChannelId =
      role === "head.main" ? "head" : role === "arm.left" ? "leftArm" : role === "arm.right" ? "rightArm" : "torso";
    const lafei = LAFEI_8_FRONT_CANDIDATES.bones[role];
    bones[role] =
      currentEntry!.characterId === "lafei_8" && lafei && lafei.bone === boneName
        ? { ...lafei, channel }
        : { bone: boneName, kind: "localFk", channel, status: "candidate" };
  });
  currentRig = {
    id: `${currentEntry.characterId}.front.lab`,
    characterId: currentEntry.characterId,
    view: "front",
    skeletonExportVersion: lastReport?.exportVersion ?? "-",
    heightUnits: lastReport?.setupHeight ?? null,
    bones,
    capabilities: [],
  };
  fillDraftTemplate($("template-select") as HTMLSelectElement);
  log(`RigProfile 更新：${currentRig.id}（${Object.keys(bones).length} 个绑定）`);
}

/* ---------------- Draft 模板与编译预览 ---------------- */

function makeTemplateDraft(kind: string): MotionDraft {
  if (kind === "wave_right") return waveSmallDraft(currentRig.id, "right");
  if (kind === "wave_left") return waveSmallDraft(currentRig.id, "left");
  return nodHeadDraft(currentRig.id);
}

function fillDraftTemplate(select: HTMLSelectElement): void {
  const draft = makeTemplateDraft(select.value);
  ($("draft-editor") as HTMLTextAreaElement).value = JSON.stringify(draft, null, 2);
  $("compile-info").textContent = "";
  renderDiagnostics([]);
}

function parseEditorDraft(): MotionDraft | null {
  try {
    return JSON.parse(($("draft-editor") as HTMLTextAreaElement).value) as MotionDraft;
  } catch (e) {
    renderDiagnostics([{ level: "error", code: "jsonParse", message: `JSON 解析失败：${(e as Error).message}` }]);
    return null;
  }
}

/** 直接把编译动画放到对应通道轨道（绕过调度器的快速预览路径） */
function playCompiledOnView(view: SpineView, layer: GestureLayer | null, motion: CompiledMotion): void {
  const channel = (motion.channels[0] ?? "torso") as ChannelId;
  const track = CHANNEL_TRACK[channel] ?? 3;
  if (!view.state) return;
  view.state.setAnimationWith(track, motion.animation, false);
  view.state.addEmptyAnimation(track, 0.15, Math.max(0, motion.durationSec - 0.15));
  void layer;
}

function compileAndPreview(): void {
  const draft = parseEditorDraft();
  if (!draft) return;
  const { motion, diagnostics } = compileDraft(draft, currentRig, flatView.skeletonData!);
  renderDiagnostics(diagnostics);
  if (!motion) {
    $("compile-info").textContent = "";
    log("编译失败：存在 error 级诊断", "bad");
    return;
  }
  lastCompiled = motion;
  const warnings = motion.warnings.map((w) => `⚠ [${w.code}] ${w.message}`);
  $("compile-info").textContent =
    `写集：${motion.writes.join("、") || "无"}\n` +
    (warnings.length ? `警告：\n${warnings.join("\n")}` : "无警告");
  playCompiledOnView(flatView, gestureFlat, motion);
  playCompiledOnView(actor.view, gesture3d, motion);
  log(`编译并预览 ${motion.id}：写集 ${motion.writes.join("、") || "无"}`, "good");
}

/* ---------------- 资产加载 ---------------- */

async function loadAsset(entry: AssetEntry): Promise<void> {
  $("asset-status").textContent = "加载中…";
  try {
    await Promise.all([flatView.loadFromUrls(entry), actor.view.loadFromUrls(entry)]);
  } catch (e) {
    $("asset-status").textContent = entry.optional ? "未找到本地资产（等待放入 assets-local/）" : `加载失败：${(e as Error).message}`;
    log(`资产加载失败 ${entry.name}：${(e as Error).message}`, entry.optional ? "warn" : "bad");
    return;
  }
  currentEntry = entry;
  const data = flatView.skeletonData!;
  lastReport = inspectSkeletonData(flatView.currentBundle!);
  const names = data.bones.map((b) => b.name);

  fillSelect($("anim-select") as HTMLSelectElement, data.animations.map((a) => a.name), data.animations[0]?.name ?? null);
  ($("anim-select") as HTMLSelectElement).disabled = false;
  fillSelect($("probe-bone") as HTMLSelectElement, names, guessFromNames(names, "head.main"));
  ($("probe-bone") as HTMLSelectElement).disabled = false;
  ($("probe-angle") as HTMLInputElement).disabled = false;
  ($("btn-probe-on") as HTMLButtonElement).disabled = false;
  ($("btn-probe-off") as HTMLButtonElement).disabled = false;

  buildBindingPanel(names);
  rebuildRig();

  gestureFlat = new GestureLayer(flatView.state!, scheduler);
  gesture3d = new GestureLayer(actor.view.state!, scheduler);

  const animName = ($("anim-select") as HTMLSelectElement).value || null;
  flatView.setAnimation(animName, ($("loop-check") as HTMLInputElement).checked);
  actor.view.setAnimation(animName, ($("loop-check") as HTMLInputElement).checked);

  $("asset-status").textContent = `${entry.name} · 导出 ${lastReport.exportVersion} · ${lastReport.boneCount} 骨骼 · ${lastReport.animations.length} 动画`;
  log(`资产加载完成：${entry.label}（导出 ${lastReport.exportVersion}，运行时匹配 ${lastReport.versionMatch ? "✓" : "✗"}）`, "good");
}

/* ---------------- 调度演示 ---------------- */

function submitDemo(action: string, params: Record<string, unknown>, label: string): void {
  const requestId = `turn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const intent = { schemaVersion: 1 as const, requestId, action, params };
  lastIntent = { requestId, action, params };
  const result = scheduler.submit(intent);
  if (result.status !== "accepted") {
    log(
      `提交 ${label} → ${result.status}${result.reason ? `（${result.reason}${result.detail ? "：" + result.detail : ""}）` : ""}` +
        (result.alternatives?.length ? ` 可替代通道：${result.alternatives.join(",")}` : ""),
      "warn",
    );
    return;
  }
  lastInstanceId = result.instanceId!;
  const hand = (result.channel === "leftArm" ? "left" : "right") as "left" | "right";
  const draft = waveSmallDraft(currentRig.id, hand);
  const { motion, diagnostics } = compileDraft(draft, currentRig, flatView.skeletonData!);
  if (!motion) {
    renderDiagnostics(diagnostics);
    log("调度已接受，但挥手编译失败（检查绑定）", "bad");
    return;
  }
  const inst = scheduler.get(result.instanceId!)!;
  let ok = true;
  if (gestureFlat) ok = gestureFlat.play(inst, motion.animation) && ok;
  if (gesture3d) ok = gesture3d.play(inst, motion.animation) && ok;
  log(`提交 ${label} → accepted（实例 ${result.instanceId}，通道 ${result.channel}）`, "good");
}

function cancelCurrentGesture(): void {
  if (!lastInstanceId) {
    log("当前没有已接受的手势实例", "warn");
    return;
  }
  const ok = scheduler.cancel(lastInstanceId, "user");
  if (gestureFlat) gestureFlat.cancel(lastInstanceId);
  if (gesture3d) gesture3d.cancel(lastInstanceId);
  log(ok ? `已取消实例 ${lastInstanceId}（局部取消，base 与其他通道继续）` : `实例 ${lastInstanceId} 已不在活动状态`, ok ? "good" : "warn");
}

/* ---------------- 探针 ---------------- */

function applyProbe(on: boolean): void {
  const boneName = ($("probe-bone") as HTMLSelectElement).value;
  const deg = Number(($("probe-angle") as HTMLInputElement).value);
  $("probe-value").textContent = on ? `${boneName} +${deg}°` : "";
  for (const view of [flatView, actor.view]) {
    view.probes.clear();
    if (on) view.probes.set(boneName, { rot: deg });
  }
  log(on ? `探针施加：${boneName} 旋转 +${deg}°（观察方向与轮廓）` : "探针复位");
}

/* ---------------- 报告 / 录像 / 背景 / 视图 ---------------- */

const recorder = new LabRecorder();

function wireStaticControls(): void {
  const assetSelect = $("asset-select") as HTMLSelectElement;
  fillSelect(
    assetSelect,
    ASSETS.map((a) => a.name),
    ASSETS[0].name,
  );
  for (const [i, opt] of [...assetSelect.options].entries()) opt.textContent = ASSETS[i].label;
  assetSelect.addEventListener("change", () => {
    const entry = ASSETS.find((a) => a.name === assetSelect.value)!;
    void loadAsset(entry);
  });

  $("btn-play").addEventListener("click", () => {
    const paused = !flatView.paused;
    flatView.paused = paused;
    actor.view.paused = paused;
    $("btn-play").textContent = paused ? "播放" : "暂停";
  });
  $("btn-step").addEventListener("click", () => {
    flatView.paused = true;
    actor.view.paused = true;
    $("btn-play").textContent = "播放";
    flatView.stepOnce(1 / 60);
  });
  $("speed-select").addEventListener("change", () => {
    const v = Number(($("speed-select") as HTMLSelectElement).value);
    flatView.speed = v;
    actor.view.speed = v;
  });
  $("loop-check").addEventListener("change", () => {
    const loop = ($("loop-check") as HTMLInputElement).checked;
    const name = ($("anim-select") as HTMLSelectElement).value || null;
    flatView.setAnimation(name, loop);
    actor.view.setAnimation(name, loop);
  });
  $("anim-select").addEventListener("change", () => {
    const name = ($("anim-select") as HTMLSelectElement).value || null;
    flatView.setAnimation(name, ($("loop-check") as HTMLInputElement).checked);
    actor.view.setAnimation(name, ($("loop-check") as HTMLInputElement).checked);
    log(`切换原动画：${name}（轨道 0 / base）`);
  });

  $("debug-check").addEventListener("change", () => {
    const v = ($("debug-check") as HTMLInputElement).checked;
    flatView.debug = v;
    actor.view.debug = v;
  });
  $("freecam-check").addEventListener("change", () => {
    stage.setFreeCamera(($("freecam-check") as HTMLInputElement).checked);
  });
  $("mirror-check").addEventListener("change", () => {
    actor.setMirroredBack(($("mirror-check") as HTMLInputElement).checked);
    log(($("mirror-check") as HTMLInputElement).checked ? "镜像背面开启（演示用途，非真实背面）" : "镜像背面关闭");
  });
  document.querySelectorAll<HTMLButtonElement>(".swatch").forEach((btn) => {
    btn.addEventListener("click", () => {
      const c = BG_COLORS[btn.dataset.c!];
      flatView.backgroundColor = c;
      actor.view.backgroundColor = c;
      log(`画布背景 → ${btn.dataset.c}（透明/黑边验收）`);
    });
  });

  $("btn-view-3d").addEventListener("click", () => {
    document.body.classList.remove("flat-mode");
    $("btn-view-3d").classList.add("primary");
    $("btn-view-flat").classList.remove("primary");
  });
  $("btn-view-flat").addEventListener("click", () => {
    document.body.classList.add("flat-mode");
    $("btn-view-flat").classList.add("primary");
    $("btn-view-3d").classList.remove("primary");
  });

  $("btn-probe-on").addEventListener("click", () => applyProbe(true));
  $("btn-probe-off").addEventListener("click", () => applyProbe(false));
  $("probe-angle").addEventListener("input", () => {
    $("probe-value").textContent = `${($("probe-angle") as HTMLInputElement).value}°`;
  });

  $("btn-report").addEventListener("click", () => {
    if (!lastReport) return;
    $("report-content").textContent = assetReportMarkdown(lastReport);
    ($("report-dialog") as HTMLDialogElement).showModal();
  });
  $("btn-report-close").addEventListener("click", () => ($("report-dialog") as HTMLDialogElement).close());
  $("btn-report-md").addEventListener("click", () => downloadText("asset-report.md", assetReportMarkdown(lastReport!)));
  $("btn-report-json").addEventListener("click", () => downloadText("asset-report.json", assetReportJson(lastReport!)));

  $("btn-record").addEventListener("click", () => {
    if (recorder.recording) {
      recorder.stop();
      $("btn-record").textContent = "开始录像";
      $("record-status").textContent = "录像结束，WebM 已下载";
    } else {
      const source = isFlat() ? flatCanvas : ($("stage3d") as HTMLCanvasElement);
      recorder.start(source, getHudText, () => {
        $("btn-record").textContent = "开始录像";
      });
      $("btn-record").textContent = "停止录像";
      $("record-status").textContent = "录制中…";
    }
  });

  $("template-select").addEventListener("change", () => fillDraftTemplate($("template-select") as HTMLSelectElement));
  $("btn-reset-draft").addEventListener("click", () => fillDraftTemplate($("template-select") as HTMLSelectElement));
  $("btn-validate").addEventListener("click", () => {
    const draft = parseEditorDraft();
    if (!draft) return;
    renderDiagnostics(validateDraft(draft, currentRig));
  });
  $("btn-compile").addEventListener("click", compileAndPreview);

  $("btn-submit-wave-r").addEventListener("click", () => submitDemo("wave", { hand: "right" }, "挥手·右手"));
  $("btn-submit-wave-auto").addEventListener("click", () => submitDemo("wave", { hand: "auto" }, "挥手·auto"));
  $("btn-submit-wave-l").addEventListener("click", () => submitDemo("wave", { hand: "left" }, "挥手·左手"));
  $("btn-submit-nod").addEventListener("click", () => {
    // 点头：编译 nod 模板并经调度器 head 通道播放
    submitHeadNod();
  });
  $("btn-cancel").addEventListener("click", cancelCurrentGesture);
  $("btn-dup-submit").addEventListener("click", () => {
    if (!lastIntent) return;
    const result = scheduler.submit({ schemaVersion: 1, ...lastIntent });
    log(`重发相同 requestId → ${result.status}${result.instanceId ? `（同一实例 ${result.instanceId}，幂等）` : ""}`, result.status === "accepted" ? "good" : "warn");
  });
}

function submitHeadNod(): void {
  const requestId = `turn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const result = scheduler.submit({ schemaVersion: 1, requestId, action: "nod", params: {} });
  if (result.status !== "accepted") {
    log(`提交 点头 → ${result.status}（${result.reason}）`, "warn");
    return;
  }
  lastInstanceId = result.instanceId!;
  const draft = nodHeadDraft(currentRig.id);
  const { motion, diagnostics } = compileDraft(draft, currentRig, flatView.skeletonData!);
  if (!motion) {
    renderDiagnostics(diagnostics);
    return;
  }
  const inst = scheduler.get(result.instanceId!)!;
  gestureFlat?.play(inst, motion.animation);
  gesture3d?.play(inst, motion.animation);
  log(`提交 点头 → accepted（${result.instanceId}，通道 head）`, "good");
}

function downloadText(name: string, text: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/* ---------------- HUD 与主循环 ---------------- */

function getHudText(): string {
  const view = activeView();
  const track = view.currentTrack;
  const anim = track ? `${track.animation.name} ${track.trackTime.toFixed(2)}/${track.animation.duration.toFixed(2)}s` : "无动画";
  const occ = Object.entries(scheduler.snapshot().ownership)
    .map(([ch, v]) => `${ch}:${v}`)
    .join("  ") || "无占用";
  return [
    `Pliette Motion Lab · ${currentEntry?.name ?? "-"} · spine-ts 3.6.53`,
    `动画: ${anim}`,
    `逻辑时间: ${logicalTime.toFixed(2)}s · ${fpsAvg.toFixed(0)} FPS`,
    `通道: ${occ}`,
  ].join("\n");
}

let lastFrame = performance.now();
let fpsAccum = 0;
let fpsCount = 0;

function frame(now: number): void {
  const dt = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;
  logicalTime += dt;
  fpsAccum += dt;
  fpsCount++;
  if (fpsAccum >= 0.5) {
    fpsAvg = fpsCount / fpsAccum;
    fpsAccum = 0;
    fpsCount = 0;
  }

  // 单一逻辑时钟：调度器每帧只推进一次（Spec 8.8 / 9.1）
  scheduler.tick(dt);
  gestureFlat?.sync();
  gesture3d?.sync();

  stage.render(dt, actor);
  flatView.render(dt);

  const track = activeView().currentTrack;
  if (track) {
    $("anim-progress").textContent = `${track.trackTime.toFixed(2)}s / ${track.animation.duration.toFixed(2)}s`;
  }
  $("fps").textContent = `${fpsAvg.toFixed(0)} FPS`;
  $("hud").textContent = getHudText();

  const occ = scheduler.snapshot().ownership;
  const box = $("channel-occupancy");
  const keys = ["base", "leftArm", "rightArm", "torso", "head", "face", "mouth"];
  const html = keys
    .map((k) => {
      const v = occ[k];
      return `<span class="chip${v ? " occupied" : ""}">${k}${v ? " · " + v : " · 空闲"}</span>`;
    })
    .join(" ");
  if (box.dataset.prev !== html) {
    box.innerHTML = html;
    box.dataset.prev = html;
  }

  requestAnimationFrame(frame);
}

/* ---------------- 启动 ---------------- */

/** URL 参数支持确定性截图：?asset=lafei_8&view=flat&anim=walk&probe=6 */
const bootParams = new URLSearchParams(location.search);

function applyBootParams(): Promise<void> {
  const assetName = bootParams.get("asset");
  const proceed = () => {
    if (bootParams.get("view") === "flat") {
      document.body.classList.add("flat-mode");
      $("btn-view-flat").classList.add("primary");
      $("btn-view-3d").classList.remove("primary");
    }
    const anim = bootParams.get("anim");
    if (anim) {
      const select = $("anim-select") as HTMLSelectElement;
      if ([...select.options].some((o) => o.value === anim)) {
        select.value = anim;
        select.dispatchEvent(new Event("change"));
      }
    }
    const probe = bootParams.get("probe");
    if (probe != null && probe !== "") {
      ($("probe-angle") as HTMLInputElement).value = probe;
      applyProbe(true);
    }
    return Promise.resolve();
  };
  if (assetName) {
    const entry = ASSETS.find((a) => a.name === assetName);
    if (entry) {
      const select = $("asset-select") as HTMLSelectElement;
      if ([...select.options].some((o) => o.value === assetName)) select.value = assetName;
      return loadAsset(entry).then(proceed);
    }
  }
  return proceed();
}

function boot(): void {
  wireStaticControls();
  fillDraftTemplate($("template-select") as HTMLSelectElement);
  log("Motion Lab 就绪。选择资产开始基线播放验证（Spec P0）。", "good");
  log("拉菲 lafei_8 已就位：assets/Model/lafei_8/（原始资产不入库），Lab 从 public/assets-local/ 读取。");
  void applyBootParams();
  requestAnimationFrame(frame);
}

boot();
