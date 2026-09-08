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
import { P1_FIRST_OUTPUT } from "../motion/authoring/p1-drafts.js";
import { DEFAULT_CATALOG } from "../motion/parameters/presets.js";
import { resolveParams, applyStyle, STYLE_HAPPY } from "../motion/parameters/registry.js";
import { buildChannels, filterAnimation, playSlice, type ChannelDef, type OverlayHandle } from "../motion/library/overlay.js";
import { findGesture, gestureWindowSec } from "../motion/library/gestures.js";
import { spine36 as spine } from "spine-webgl";
import { LabRecorder } from "./recorder.js";
import { createDialogueAdapter } from "../dialogue/adapter.js";
import { MockTts } from "../speech/adapter.js";

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
    label: "拉菲 lafei_8（原始分辨率）",
    characterId: "lafei_8",
    jsonUrl: "/assets-local/lafei_8/lafei_8.json",
    atlasUrl: "/assets-local/lafei_8/lafei_8.atlas.txt",
    imagePathFor: (n) => `/assets-local/lafei_8/${n}`,
    premultipliedAlpha: true,
    optional: true,
  },
  {
    name: "lafei_8hd",
    label: "拉菲 lafei_8（超分 3x）",
    characterId: "lafei_8",
    jsonUrl: "/assets-local/lafei_8/lafei_8.json",
    atlasUrl: "/assets-local/lafei_8/lafei_8.atlas.txt",
    imagePathFor: () => `/assets-local/lafei_8/lafei_8-upscale-3x.png`,
    premultipliedAlpha: true,
    textureScale: 3,
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

const ROLE_KEYS = ["body.root", "head.main", "arm.left", "arm.right", "arm.upper.left", "arm.upper.right"] as const;

function guessFromNames(names: string[], role: string): string | null {
  if (currentEntry?.characterId === "lafei_8") {
    const cand = LAFEI_8_FRONT_CANDIDATES.bones[role];
    if (cand && names.includes(cand.bone)) return cand.bone;
  }
  const patterns: Record<string, RegExp[]> = {
    "head.main": [/^head$/i, /head/i, /face/i],
    "arm.left": [/hand[_-]?l3/i, /handl3/i, /hand[_-]?l/i, /arml/i],
    "arm.right": [/hand[_-]?r3/i, /handr3/i, /hand[_-]?r/i, /armr/i],
    "arm.upper.left": [/^hand[_-]?l$/i, /arm[_-]?upper[_-]?l/i, /shoulder[_-]?l/i],
    "arm.upper.right": [/^hand[_-]?r$/i, /arm[_-]?upper[_-]?r/i, /shoulder[_-]?r/i],
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
  const picks: Record<string, string> = {};
  document.querySelectorAll<HTMLSelectElement>("#rig-bindings select").forEach((select) => {
    picks[select.dataset.role!] = select.value;
  });

  // lafei_8：面板选择与 D.3 候选完全一致时使用规范 RigProfile（id 与 Draft 契约一致）
  if (currentEntry.characterId === "lafei_8") {
    const canonical = Object.entries(LAFEI_8_FRONT_CANDIDATES.bones)
      .filter(([role]) => role in picks)
      .every(([role, binding]) => picks[role] === binding.bone);
    if (canonical) {
      currentRig = { ...LAFEI_8_FRONT_CANDIDATES };
      fillDraftTemplate($("template-select") as HTMLSelectElement);
      log(`RigProfile 使用规范绑定：${currentRig.id}（${Object.keys(currentRig.bones).length} 个角色，含整臂/腿 IK/眼部）`);
      return;
    }
  }

  const bones: RigProfile["bones"] = {};
  for (const [role, boneName] of Object.entries(picks)) {
    if (!names.includes(boneName)) continue;
    const channel: ChannelId =
      role === "head.main" ? "head"
        : role === "arm.left" || role === "arm.upper.left" ? "leftArm"
          : role === "arm.right" || role === "arm.upper.right" ? "rightArm"
            : "torso";
    bones[role] = { bone: boneName, kind: "localFk", channel, status: "candidate" };
  }
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

/** 候选整体预览：作为完整小动画在轨道 0 播放（孤立评审）。
 * 先瞬时清空轨道（mix=0），避免从原动画（attack 等）做 0.2s 混合造成开头抖动；
 * 空动画=setup 姿态，而候选动作首帧即 setup，因此无可见跳变。 */
function playCompiledOnView(view: SpineView, layer: GestureLayer | null, motion: CompiledMotion): void {
  if (!view.state) return;
  const savedMix = view.state.data.defaultMix;
  view.state.setEmptyAnimation(0, 0);
  view.state.update(0);
  view.state.data.defaultMix = 0;
  view.state.setAnimationWith(0, motion.animation, false);
  view.state.data.defaultMix = savedMix;
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
  buildOverlayPanel();

  const animName = ($("anim-select") as HTMLSelectElement).value || null;
  flatView.setAnimation(animName, ($("loop-check") as HTMLInputElement).checked);
  actor.view.setAnimation(animName, ($("loop-check") as HTMLInputElement).checked);
  // lafei 默认待机用 stand（官方待机，含专业呼吸/小动作），不用列表第一个（attack）
  const preferred = data.animations.find((a) => a.name === "stand") ?? data.animations[0];
  if (preferred && (!animName || animName === "attack")) {
    const select = $("anim-select") as HTMLSelectElement;
    select.value = preferred.name;
    flatView.setAnimation(preferred.name, true);
    actor.view.setAnimation(preferred.name, true);
  }

  $("asset-status").textContent = `${entry.name} · 导出 ${lastReport.exportVersion} · ${lastReport.boneCount} 骨骼 · ${lastReport.animations.length} 动画`;
  log(`资产加载完成：${entry.label}（导出 ${lastReport.exportVersion}，运行时匹配 ${lastReport.versionMatch ? "✓" : "✗"}）`, "good");
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
  if (benchParams.active) {
    benchParams.dts.push(now - lastFrame);
    lastFrame = now;
    benchFrame();
    requestAnimationFrame(frame);
    return;
  }
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
  autoTick(logicalTime);
  blinkTick(logicalTime);
  if (a08Runtime.active) {
    a08Step(a08Runtime.state, dt);
    stage.actorAnchor.position.x = a08Runtime.state.x;
    a08Camera(a08Runtime.state.x);
    if (a08Runtime.state.phase === "done") {
      a08Runtime.active = false;
      a08Camera(0);
      log("A08 场景完成：走回起点", "good");
    }
  }

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

/* ---------------- P1 候选实验台 ---------------- */

async function saveMotionToPublic(draft: MotionDraft): Promise<void> {
  try {
    const res = await fetch("/__save-motion", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: draft.id, draft }),
    });
    const data = (await res.json()) as { ok: boolean; saved?: string; error?: string };
    log(data.ok ? `候选已保存：public/motions/${data.saved}` : `保存失败：${data.error}`, data.ok ? "good" : "bad");
  } catch (e) {
    log(`保存失败（dev server 未运行插件？）：${(e as Error).message}`, "bad");
  }
}

function wireP1Panel(): void {
  const select = $("p1-action-select") as HTMLSelectElement;
  const fillEditor = (key: string) => {
    const draft = P1_FIRST_OUTPUT[key];
    if (!draft) return;
    ($("draft-editor") as HTMLTextAreaElement).value = JSON.stringify(draft, null, 2);
    renderDiagnostics([]);
    $("compile-info").textContent = "";
  };
  select.addEventListener("change", () => fillEditor(select.value));
  $("btn-p1-play").addEventListener("click", () => {
    fillEditor(select.value);
    compileAndPreview();
  });
  $("btn-p1-save").addEventListener("click", async () => {
    const draft = parseEditorDraft();
    if (!draft) return;
    await saveMotionToPublic(draft);
  });
}

/* ---------------- 实时性能基准（?bench=1，真实计时，非虚拟时间） ---------------- */

const benchParams = { active: false, untilMs: 0, frames: 0, dts: [] as number[], spineMs: [] as number[], threeMs: [] as number[] };

function benchFrame(): void {
  if (!benchParams.active) return;
  const now = performance.now();
  benchParams.frames++;
  const t0 = performance.now();
  // 完整产品路径：actor 的 Spine 更新+绘制 → CanvasTexture 上传 → Three.js 场景渲染
  stage.render(1 / 60, actor);
  const t1 = performance.now();
  benchParams.spineMs.push(t1 - t0);
  if (now >= benchParams.untilMs) {
    benchParams.active = false;
    const sorted = benchParams.dts.slice().sort((a, b) => a - b);
    const p = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
    const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
    const secs = (benchParams.untilMs - benchStart) / 1000;
    const report = [
      `Pliette 实时性能基准 · 完整产品路径（Spine 绘制+纹理上传+3D 场景）`,
      `渲染环境：headless SwiftShader 软件渲染（真机 GPU 只会更快）；资产=${currentEntry?.name ?? "?"}`,
      `采样：${benchParams.frames} 帧 / ${secs.toFixed(2)}s 真实时间`,
      `平均 FPS：${(benchParams.frames / secs).toFixed(1)}`,
      `帧间隔 ms：avg=${(sum(benchParams.dts) / benchParams.dts.length).toFixed(2)} p50=${p(0.5).toFixed(2)} p95=${p(0.95).toFixed(2)} max=${sorted[sorted.length - 1]?.toFixed(2)}`,
      `整帧渲染（Spine+纹理上传+场景）avg=${(sum(benchParams.spineMs) / benchParams.spineMs.length).toFixed(3)}ms`,
      `Spec 15.4 目标：稳定 60 FPS、p95 帧间隔 ≤20ms`,
    ].join("\n");
    document.body.innerHTML = `<pre style="color:#d6dbe6;font:14px/1.7 Consolas,monospace;padding:24px;white-space:pre-wrap">${report}</pre>`;
  }
}

let benchStart = 0;

/* ---------------- 原动画切片叠加（专业数据复用路线） ---------------- */

let channels: Record<string, ChannelDef> | null = null;
const activeOverlays = new Map<string, { handle: OverlayHandle; flatTrack: number; threeTrack: number }>();

function buildOverlayPanel(): void {
  const data = flatView.skeletonData;
  if (!data) return;
  channels = buildChannels(data);
  const sourceSelect = $("overlay-source") as HTMLSelectElement;
  fillSelect(
    sourceSelect,
    data.animations.map((a) => a.name),
    "touch",
  );
  const channelSelect = $("overlay-channel") as HTMLSelectElement;
  fillSelect(channelSelect, ["head", "face", "leftArm", "rightArm", "torso"], "head");
  ($("btn-overlay-play") as HTMLButtonElement).disabled = false;
  ($("btn-overlay-clear") as HTMLButtonElement).disabled = false;
}

function playOverlayFromPanel(): void {
  if (!channels || !flatView.state || !actor.view.state || !currentEntry) return;
  const sourceName = ($("overlay-source") as HTMLSelectElement).value;
  const channelName = ($("overlay-channel") as HTMLSelectElement).value;
  const t0 = Number(($("overlay-start") as HTMLInputElement).value) || 0;
  const t1 = Number(($("overlay-end") as HTMLInputElement).value) || 0.67;
  const mixIn = Number(($("overlay-mixin") as HTMLInputElement).value) || 0.15;
  const source = flatView.skeletonData!.findAnimation(sourceName);
  if (!source) {
    log(`源动画不存在：${sourceName}`, "bad");
    return;
  }
  const channel = channels[channelName];
  const filtered = filterAnimation(flatView.skeletonData!, source, channel, `${sourceName}#${channelName}`);
  if (!filtered) {
    log(`${sourceName} 在通道 ${channelName} 上没有可过滤的 timeline`, "warn");
    return;
  }
  const windowSec = Math.max(0.2, Math.min(t1, source.duration) - Math.min(t0, source.duration));
  const handle: OverlayHandle = { source: sourceName, channel: channelName, startTime: t0, windowSec, track: channel.track };
  for (const [view, layer] of [[flatView, gestureFlat], [actor.view, gesture3d]] as const) {
    if (!view.state) continue;
    playSlice(view.state, filtered, handle, mixIn, 0.25);
  }
  activeOverlays.set(channelName, { handle, flatTrack: channel.track, threeTrack: channel.track });
  log(
    `叠加：${sourceName} [${t0.toFixed(2)}~${(t0 + windowSec).toFixed(2)}s] → 通道 ${channelName}（轨道 ${channel.track}，混合 ${mixIn}s/0.25s），` +
      `基础层继续播放，结束后交还`,
    "good",
  );
}

function clearOverlays(): void {
  for (const view of [flatView, actor.view]) {
    if (!view.state) continue;
    for (const { flatTrack } of activeOverlays.values()) view.state.setEmptyAnimation(flatTrack, 0.25);
  }
  activeOverlays.clear();
  log("已清除全部叠加层（0.25s 混出交还基础层）");
}

function wireOverlayPanel(): void {
  $("btn-overlay-play").addEventListener("click", playOverlayFromPanel);
  $("btn-overlay-clear").addEventListener("click", clearOverlays);
}

/* ---------------- 自动待机行为（?auto=1）：stand 打底 + 随机表情/动作切片 ---------------- */

const AUTO_GESTURES = ["happy", "shy", "dizzy", "fresh", "wave", "pump"];
const autoState = { active: false, nextAt: 0 };

function autoTick(logicalTime: number): void {
  if (!autoState.active || !channels || !flatView.state) return;
  if (logicalTime < autoState.nextAt) return;
  const action = AUTO_GESTURES[Math.floor(Math.random() * AUTO_GESTURES.length)];
  submitGesture(action, action === "wave" ? (Math.random() < 0.5 ? "right" : "auto") : undefined);
  autoState.nextAt = logicalTime + 6 + Math.random() * 5;
}

/* ---------------- 行为库演示（原动画切片 + 调度器，A04 流程） ---------------- */

function submitGesture(action: string, hand?: string): void {
  if (!channels || !flatView.state || !actor.view.state || !currentEntry) {
    log("资产未加载", "warn");
    return;
  }
  const requestId = `act-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const result = scheduler.submit({ schemaVersion: 1, requestId, action, params: hand ? { hand } : {} });
  if (result.status !== "accepted") {
    log(
      `提交 ${action}${hand ? `·${hand}` : ""} → ${result.status}${result.reason ? `（${result.reason}${result.detail ? "：" + result.detail : ""}）` : ""}`,
      "warn",
    );
    return;
  }
  lastInstanceId = result.instanceId!;
  const gesture = findGesture(action, result.channel!);
  if (!gesture) {
    log(`调度已接受，但行为库中没有 ${action}@${result.channel} 的切片`, "bad");
    return;
  }
  const source = flatView.skeletonData!.findAnimation(gesture.source);
  if (!source) return;
  const filtered = filterAnimation(flatView.skeletonData!, source, channels[gesture.channel], `${gesture.source}#${gesture.channel}`);
  if (!filtered) return;
  const windowSec = Math.min(gestureWindowSec(gesture), source.duration - gesture.start);
  const inst = scheduler.get(result.instanceId!)!;
  for (const view of [flatView, actor.view]) {
    if (!view.state) continue;
    playSlice(view.state, filtered, { track: CHANNEL_TRACK[gesture.channel]!, channel: gesture.channel, source: gesture.source, startTime: gesture.start, windowSec }, 0.15, 0.25);
  }
  inst.durationSec = windowSec;
  lastIntent = { requestId, action, params: hand ? { hand } : {} };
  log(`行为 ${action}（${gesture.label}）→ accepted（${result.instanceId}，通道 ${result.channel}，${windowSec.toFixed(2)}s）`, "good");
}

function cancelCurrentGesture(): void {
  if (!lastInstanceId) {
    log("当前没有已接受的手势实例", "warn");
    return;
  }
  const inst = scheduler.get(lastInstanceId);
  const ok = scheduler.cancel(lastInstanceId, "user");
  if (inst) {
    // 局部取消：只清该实例的通道轨道，基础层与其他通道继续（A04）
    const track = CHANNEL_TRACK[inst.channel];
    if (track != null) {
      flatView.state?.setEmptyAnimation(track, 0.25);
      actor.view.state?.setEmptyAnimation(track, 0.25);
    }
  }
  log(ok ? `已取消实例 ${lastInstanceId}（局部取消，base 与其他通道继续）` : `实例 ${lastInstanceId} 已不在活动状态`, ok ? "good" : "warn");
}

function wireBehaviorPanel(): void {
  $("btn-g-wave-r").addEventListener("click", () => submitGesture("wave", "right"));
  $("btn-g-wave-auto").addEventListener("click", () => submitGesture("wave", "auto"));
  $("btn-g-wave-l").addEventListener("click", () => submitGesture("wave", "left"));
  $("btn-g-dizzy").addEventListener("click", () => submitGesture("dizzy"));
  $("btn-g-happy").addEventListener("click", () => submitGesture("happy"));
  $("btn-g-shy").addEventListener("click", () => submitGesture("shy"));
  $("btn-g-pump").addEventListener("click", () => submitGesture("pump"));
  $("btn-g-point").addEventListener("click", () => submitGesture("point"));
  $("btn-g-a05").addEventListener("click", () => {
    // A05：右手指向（attack 切片），左手可乐为原生持有不受影响；再加头部 happy 展示三通道独立
    submitGesture("point");
    submitGesture("dizzy");
  });
  $("btn-g-a08").addEventListener("click", () => a08StartLive());
  $("btn-g-base-walk").addEventListener("click", () => {
    flatView.setAnimation("walk", true);
    actor.view.setAnimation("walk", true);
    log("基础层切换：walk（循环）——可在其上叠加手势验证 A04");
  });
  $("btn-g-base-stand").addEventListener("click", () => {
    flatView.setAnimation("stand", true);
    actor.view.setAnimation("stand", true);
    log("基础层切换：stand（循环）");
  });
  $("btn-g-cancel").addEventListener("click", cancelCurrentGesture);
  $("btn-g-dup").addEventListener("click", () => {
    if (!lastIntent) return;
    const result = scheduler.submit({ schemaVersion: 1, ...lastIntent });
    log(`重发相同 requestId → ${result.status}${result.instanceId ? `（同一实例 ${result.instanceId}，幂等）` : ""}`, result.status === "accepted" ? "good" : "warn");
  });
}

/* ---------------- P3：姿态切换与 A08 场景（走向椅子坐下） ---------------- */

type BaseName = "stand" | "walk" | "sit";

function setBase(name: BaseName, hold = false): void {
  for (const view of [flatView, actor.view]) {
    if (!view.state || !view.skeletonData) continue;
    const anim = view.skeletonData.findAnimation(name);
    if (!anim) continue;
    if (hold) {
      const e = view.state.setAnimationWith(0, anim, false);
      e.animationEnd = 1e6; // 保持末帧（坐姿持续）
    } else {
      view.state.setAnimation(0, name, true);
    }
  }
}

// 行走速度标定值：scripts/calibrate-walk-speed.mjs 实测步幅 44.9 单位/周期 1.17s = 38.4 单位/s = 0.115 H/s（H=335）
const A08 = { start: -0.5, seat: 0.6, walkSpeed: 0.115, sitAt: 9.6, standAt: 11.8, walkBackAt: 12.2, end: 21.6 };

function a08Camera(x: number): void {
  // 有限视差跟随（Spec 5.4 允许水平 ±12°）：镜头偏移为角色位置的一半
  const cx = Math.max(-0.5, Math.min(0.7, x * 0.55));
  stage.camera.position.x = cx;
  stage.camera.lookAt(cx, 0.8, 0);
}

interface A08State { t: number; x: number; phase: "walk_in" | "sitting" | "hold_seated" | "standing_up" | "walk_back" | "done"; fired: Set<string>; }

function a08Fresh(): A08State {
  return { t: 0, x: A08.start, phase: "walk_in", fired: new Set() };
}

function a08ResetViews(): void {
  for (const view of [flatView, actor.view]) {
    view.state?.setEmptyAnimations(0);
    view.state?.setEmptyAnimation(0, 0);
  }
  stage.actorAnchor.position.x = A08.start;
  stage.turnActor(0);
  a08Camera(A08.start);
}

function a08Step(s: A08State, dt: number): void {
  s.t += dt;
  const seated = s.phase === "sitting" || s.phase === "hold_seated";
  // 坐姿锚点抬升到椅面高度（0.42H）
  stage.actorAnchor.position.y = seated ? 0.42 : 0;
  const fire = (key: string, fn: () => void) => {
    if (!s.fired.has(key) && s.t >= (Number(key.split(":")[1]) || 0)) {
      s.fired.add(key);
      fn();
    }
  };
  if (s.phase === "walk_in") {
    s.x = Math.max(A08.seat, s.x - A08.walkSpeed * dt);
    if (s.x <= A08.seat + 0.001) {
      s.phase = "sitting";
      fire(`sit:${A08.sitAt}`, () => setBase("sit", true));
      s.fired.add(`sit:${A08.sitAt}`);
    }
  } else if (s.phase === "sitting") {
    if (s.t >= A08.standAt) {
      s.phase = "standing_up";
      setBase("stand");
    }
  } else if (s.phase === "standing_up") {
    if (s.t >= A08.walkBackAt) {
      s.phase = "walk_back";
      setBase("walk");
    }
  } else if (s.phase === "walk_back") {
    s.x = Math.min(A08.start, s.x - A08.walkSpeed * dt);
    if (s.x <= A08.start + 0.001) s.phase = "done";
  }
}

const a08Runtime = { active: false, state: a08Fresh() };

function a08StartLive(): void {
  a08ResetViews();
  a08Runtime.state = a08Fresh();
  setBase("walk");
  a08Runtime.active = true;
  autoState.active = false;
  log(`A08 场景开始：走向椅子（x=${A08.seat}）→ 坐下 → 保持 → 起身 → 走回`, "good");
}

/** 确定性回放：从 0 以固定步长推进到 freezeAt（真实混合语义），用于逐帧出证 */
function a08ReplayTo(freezeAt: number): void {
  a08ResetViews();
  const s = a08Fresh();
  setBase("walk");
  const step = 1 / 24;
  while (s.t < freezeAt) {
    const dt = Math.min(step, freezeAt - s.t);
    a08Step(s, dt);
    for (const view of [flatView, actor.view]) view.state?.update(dt);
    stage.actorAnchor.position.x = s.x;
    a08Camera(s.x);
  }
  flatView.paused = true;
  actor.view.paused = true;
  log(`A08 回放冻结于 t=${freezeAt.toFixed(2)}s（phase=${s.phase}, x=${s.x.toFixed(2)}）`);
}

/** 强制双眼附件（表情调制/眨眼）。holdForever=false 时到时自动结束，基础动画恢复当前表情。 */
function playEyesOverride(lName: string, rName: string, holdSec = 1, holdForever = true): void {
  for (const view of [flatView, actor.view]) {
    if (!view.state || !view.skeletonData) continue;
    const timelines: spine.Timeline[] = [];
    for (const [slotName, attName] of [["eye_L", lName], ["eye_R", rName]] as const) {
      const slotIndex = view.skeletonData.findSlotIndex(slotName);
      if (slotIndex < 0) continue;
      const tl = new spine.AttachmentTimeline(1);
      tl.slotIndex = slotIndex;
      tl.setFrame(0, 0, attName);
      timelines.push(tl);
    }
    if (!timelines.length) continue;
    const anim = new spine.Animation(`eyes:${lName}`, timelines, holdSec);
    const e = view.state.setAnimationWith(5, anim, holdForever);
    if (holdForever) e.animationEnd = 1e6;
  }
}

/** 眨眼：face 通道附件调制（eye_2 = 动画师使用的自然闭眼素材，normal/move 内建）。结束自动恢复。 */
const blinkState = { nextAt: 1.5 };
let blinkEnabled = true;

function blinkTick(logicalTime: number): void {
  if (!blinkEnabled || !channels) return;
  if (logicalTime < blinkState.nextAt) return;
  if (scheduler.snapshot().ownership.head) {
    // 头部通道被表情叠加占用时不闪（避免打架），稍后重试
    blinkState.nextAt = logicalTime + 1;
    return;
  }
  playEyesOverride("eye_2_1", "eye_2_2", 0.1, false);
  blinkState.nextAt = logicalTime + 2.2 + Math.random() * 3.4;
}

/* ---------------- 行为配方：对话事件 → 手势（P4 对话层的映射表雏形） ---------------- */

const EVENT_RECIPES: Record<string, string[]> = {
  greet: ["wave"],
  praise: ["pump", "happy"],
  pet: ["happy"],
  scare: ["dizzy"],
  tease: ["shy"],
  question: ["shy"],
  ambient: ["fresh"],
  drink: ["wave"],
};

function emitEvent(name: string): void {
  const actions = EVENT_RECIPES[name];
  if (!actions) {
    log(`未知事件：${name}（可用：${Object.keys(EVENT_RECIPES).join(", ")}）`, "warn");
    return;
  }
  for (const action of actions) submitGesture(action, action === "wave" ? "auto" : undefined);
  log(`事件 ${name} → 配方 ${actions.join("+")}`);
}

/* ---------------- P3：触碰矮桌接触交互（Spec 15.2 接触误差 ≤0.02H） ---------------- */

// 接触锚点：矮桌前沿 (0.85, 0.27)；victory[0.7-1.2] 右手稳定高度实测 90/335=0.2687
const TOUCH = { start: 0.3, contactX: 0.85, contactY: 0.27, handLocalX: 26 / 335, walkSpeed: 0.115, arriveAt: 0, window: 0.5 };

interface TouchState { t: number; x: number; phase: "walk_in" | "contact" | "done"; fired: Set<string>; errors: number[]; }

function touchFresh(): TouchState {
  return { t: 0, x: TOUCH.start, phase: "walk_in", fired: new Set(), errors: [] };
}

function touchResetViews(): void {
  for (const view of [flatView, actor.view]) {
    view.state?.setEmptyAnimations(0);
    view.state?.setEmptyAnimation(0, 0);
  }
  stage.actorAnchor.position.set(TOUCH.start, 0, 0);
  stage.turnActor(0);
  a08Camera(TOUCH.start);
}

function touchStep(s: TouchState, dt: number): void {
  s.t += dt;
  if (s.phase === "walk_in") {
    const targetX = TOUCH.contactX - TOUCH.handLocalX;
    s.x = Math.min(targetX, s.x + TOUCH.walkSpeed * dt);
    if (s.x >= targetX - 0.001) {
      s.phase = "contact";
      s.fired.add("touch");
      submitGesture("touch_table");
    }
    return;
  }
  if (s.phase === "contact") {
    // 稳定接触段采样：排除混入（前 0.15s）与释放（后 0.1s），Spec 15.2 允许
    const inWindow = s.t >= TOUCH.arriveAt + 0.25 && s.t <= TOUCH.arriveAt + 0.4;
    if (inWindow && flatView.state && flatView.skeleton) {
      // 回放中无渲染循环，这里手动推进并应用姿态后读取
      flatView.state.apply(flatView.skeleton);
      flatView.skeleton.updateWorldTransform();
      const hand = flatView.skeleton.findBone("hand_R3");
      if (hand) {
        const hx = s.x + hand.worldX / 335;
        const hy = hand.worldY / 335;
        s.errors.push(Math.hypot(hx - TOUCH.contactX, hy - TOUCH.contactY));
      }
    }
    if (s.t >= TOUCH.arriveAt + 0.9) s.phase = "done";
  }
}

const touchRuntime = { active: false, state: touchFresh() };

function touchStartLive(): void {
  touchResetViews();
  touchRuntime.state = touchFresh();
  setBase("stand");
  touchRuntime.active = true;
  autoState.active = false;
  a08Runtime.active = false;
  log(`触碰场景开始：走向矮桌锚点（x=${(TOUCH.contactX - TOUCH.handLocalX).toFixed(3)}）→ 右手停在桌沿 0.27H`, "good");
}

/** 确定性回放：固定步长重演至 freezeAt，返回接触误差报告 */
function touchReplayTo(freezeAt: number): TouchState {
  touchResetViews();
  const s = touchFresh();
  setBase("stand");
  const step = 1 / 24;
  while (s.t < freezeAt) {
    const dt = Math.min(step, freezeAt - s.t);
    const prevPhase = s.phase;
    touchStep(s, dt);
    for (const view of [flatView, actor.view]) view.state?.update(dt);
    stage.actorAnchor.position.x = s.x;
    if (prevPhase === "walk_in" && s.phase === "contact") TOUCH.arriveAt = s.t;
  }
  flatView.paused = true;
  actor.view.paused = true;
  return s;
}

function touchReport(s: TouchState): string {
  const e = s.errors;
  if (!e.length) return "（无接触段采样）";
  const max = Math.max(...e), avg = e.reduce((a, b) => a + b, 0) / e.length;
  return `接触误差（${e.length} 采样，排除首尾）: max=${max.toFixed(4)}H avg=${avg.toFixed(4)}H → ${max <= 0.02 ? "≤0.02H 达标 ✅" : "超标 ❌"}`;
}

/* ---------------- 对话（Select 层）与语音（P4） ---------------- */

const dialogue = createDialogueAdapter(false);
const tts = new MockTts();
let currentPosture: "standing" | "seated" = "standing";

function appendChat(who: "user" | "char", text: string): void {
  const box = $("chat-history");
  const line = document.createElement("div");
  line.className = who;
  line.textContent = who === "user" ? `你：${text}` : `她：${text}`;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

function updateSpeechBubble(): void {
  const st = tts.state;
  const bubble = $("speech-bubble");
  if (st.active) {
    bubble.hidden = false;
    ($("speech-text") as HTMLElement).textContent = st.text;
  } else {
    bubble.hidden = true;
  }
}

function handleChatSend(): void {
  const input = $("chat-input") as HTMLInputElement;
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  appendChat("user", text);
  const resp = dialogue.respond({
    text,
    context: { posture: currentPosture, busyChannels: Object.keys(scheduler.snapshot().ownership) as ChannelId[] },
  });
  appendChat("char", resp.reply);
  log(`对话 → Select(${dialogue.name})：事件 [${resp.events.join(", ")}]`);
  tts.speak(resp.reply);
  submitGesture("fresh");
  for (const e of resp.events) emitEvent(e);
}

function wireChatPanel(): void {
  tts.onListen(() => updateSpeechBubble());
  $("btn-chat-send").addEventListener("click", handleChatSend);
  $("chat-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleChatSend();
  });
  $("btn-chat-cancel").addEventListener("click", () => {
    tts.cancel();
    log("语音已打断（A10：取消同时失效旧的说话状态与气泡）");
  });
  $("btn-a07").addEventListener("click", () => {
    setBase("sit", true);
    currentPosture = "seated";
    ($("chat-input") as HTMLInputElement).value = "在吗？";
    handleChatSend();
  });
}

/* ---------------- 启动 ---------------- */

/** URL 参数支持确定性截图：?asset=lafei_8&view=flat&anim=walk&probe=6&motion=nod_c1&poseAt=0.28 */
const bootParams = new URLSearchParams(location.search);

function applyBootParams(): Promise<void> {
  const assetName = bootParams.get("asset");
  const proceed = () => {
    if (bootParams.get("capture") === "1") {
      document.body.classList.add("capture-mode");
    }
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
    if (bootParams.get("bench") === "1") {
      const benchSec = Number(bootParams.get("benchSec")) || 6;
      document.body.classList.add("capture-mode");
      benchParams.active = true;
      benchParams.untilMs = performance.now() + benchSec * 1000;
      benchStart = performance.now();
      benchParams.frames = 0;
      benchParams.dts = [];
      benchParams.spineMs = [];
      benchParams.threeMs = [];
      log(`实时基准开始：${benchSec}s 真实时间（walk 动画循环播放）`);
    }
    const gesture = bootParams.get("gesture");
    if (gesture) {
      submitGesture(gesture, bootParams.get("hand") ?? undefined);
      const freezeAt = Number(bootParams.get("freezeAt"));
      const cancelAt = Number(bootParams.get("cancelAt"));
      // A03/A04：在 cancelAt 相位取消手势（局部），其余时间继续走基础层
      if (Number.isFinite(cancelAt) && cancelAt > 0) {
        for (const view of [flatView, actor.view]) view.state?.update(Math.min(cancelAt, freezeAt || cancelAt));
        if (lastInstanceId) {
          const inst = scheduler.get(lastInstanceId);
          scheduler.cancel(lastInstanceId, "script");
          const track = inst ? CHANNEL_TRACK[inst.channel] : undefined;
          if (track != null) {
            flatView.state?.setEmptyAnimation(track, 0.3);
            actor.view.state?.setEmptyAnimation(track, 0.3);
          }
        }
        if (Number.isFinite(freezeAt) && freezeAt > cancelAt) {
          for (const view of [flatView, actor.view]) {
            view.state?.update(freezeAt - cancelAt);
            view.paused = true;
          }
        }
        log(`脚本：手势在 ${cancelAt}s 相位被取消，剩余 ${((freezeAt || cancelAt) - cancelAt).toFixed(2)}s 观察基础层与混出`);
      } else if (Number.isFinite(freezeAt) && freezeAt > 0) {
        for (const view of [flatView, actor.view]) {
          view.state?.update(freezeAt);
          view.paused = true;
        }
        $("btn-play").textContent = "播放";
        log(`手势冻结于 t=${freezeAt}s（确定性截图模式）`);
      }
    }
    const overlay = bootParams.get("overlay");
    if (overlay) {
      // 格式 source:channel:t0:t1，如 overlay=touch:head:0:0.67
      const [srcName, chName, s0, s1] = overlay.split(":");
      const sourceSelect = $("overlay-source") as HTMLSelectElement;
      const channelSelect = $("overlay-channel") as HTMLSelectElement;
      if ([...sourceSelect.options].some((o) => o.value === srcName)) sourceSelect.value = srcName;
      if ([...channelSelect.options].some((o) => o.value === chName)) channelSelect.value = chName;
      ($("overlay-start") as HTMLInputElement).value = s0 ?? "0";
      ($("overlay-end") as HTMLInputElement).value = s1 ?? "0.67";
      playOverlayFromPanel();
      // freezeAt：确定性帧——把所有轨道（基础+叠加）一致推进 t 秒后冻结
      const freezeAt = Number(bootParams.get("freezeAt"));
      if (Number.isFinite(freezeAt) && freezeAt > 0) {
        for (const view of [flatView, actor.view]) {
          view.state?.update(freezeAt);
          view.paused = true;
        }
        $("btn-play").textContent = "播放";
        log(`叠加冻结于 t=${freezeAt}s（确定性截图模式）`);
      }
    }
    const scenario = bootParams.get("scenario");
    if (scenario === "a08") {
      const freezeAt = Number(bootParams.get("freezeAt"));
      if (Number.isFinite(freezeAt) && freezeAt > 0) {
        a08ReplayTo(freezeAt);
      } else {
        a08StartLive();
      }
    }
    if (scenario === "touch") {
      const freezeAt = Number(bootParams.get("freezeAt"));
      if (Number.isFinite(freezeAt) && freezeAt > 0) {
        const s = touchReplayTo(freezeAt);
        log(`触碰回放 t=${freezeAt.toFixed(2)}s phase=${s.phase} | ${touchReport(s)}`);
      } else {
        touchStartLive();
      }
    }
    const eyesOverride = bootParams.get("eyes");
    if (eyesOverride) {
      // 表情调制探针：?eyes=eye_4_1,eye_4_2（左,右附件名），用于识别眨眼/闭眼素材
      const [lName, rName] = eyesOverride.split(",");
      if (lName && rName) {
        playEyesOverride(lName, rName);
        const freezeAt = Number(bootParams.get("freezeAt"));
        if (Number.isFinite(freezeAt) && freezeAt > 0) {
          for (const view of [flatView, actor.view]) {
            view.state?.update(freezeAt);
            view.paused = true;
          }
        }
      }
    }
    const event = bootParams.get("event");
    if (event) setTimeout(() => emitEvent(event), 300);
    const motion = bootParams.get("motion");
    if (motion) {
      const loops = Math.max(1, Math.min(4, Number(bootParams.get("loops")) || 1));
      fetch(`/motions/${motion}.json`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((draft) => {
          ($("draft-editor") as HTMLTextAreaElement).value = JSON.stringify(draft, null, 2);
          compileAndPreview();
          const poseAt = Number(bootParams.get("poseAt"));
          if (Number.isFinite(poseAt) && poseAt > 0) {
            // 循环采样：state.update 累计时间，loop=true 时 TrackEntry 会回绕（两次执行）
            for (const view of [flatView, actor.view]) {
              const entry = view.state?.tracks[0];
              if (entry && loops > 1) entry.loop = true;
              view.state?.update(poseAt);
              view.paused = true;
            }
            $("btn-play").textContent = "播放";
            log(`姿态冻结于 motion=${motion} t=${poseAt}s × ${loops} 循环（确定性截图模式）`);
          }
        })
        .catch((e) => log(`motion 加载失败 ${motion}：${(e as Error).message}`, "bad"));
    }
    return Promise.resolve();
  };
  if (assetName) {
    const entry = ASSETS.find((a) => a.name === assetName);
    if (entry) {
      const select = $("asset-select") as HTMLSelectElement;
      if ([...select.options].some((o) => o.value === assetName)) select.value = assetName;
      return loadAsset(entry).then(() => {
        if (bootParams.get("auto") === "1") {
          autoState.active = true;
          autoState.nextAt = 2;
          log("自动待机行为开启：stand 打底，随机叠加表情/动作切片");
        }
        return proceed();
      });
    }
  }
  return proceed();
}

function boot(): void {
  wireStaticControls();
  wireP1Panel();
  wireOverlayPanel();
  wireChatPanel();
  (window as unknown as { __labDebug: unknown }).__labDebug = {
    flatView,
    actorView: actor.view,
    stage,
    scheduler,
    skeleton: () => flatView.skeleton,
    eyeSlot: () => flatView.skeleton?.findSlot("eye_L"),
    emit: emitEvent,
  };
  fillDraftTemplate($("template-select") as HTMLSelectElement);
  log("Motion Lab 就绪。选择资产开始基线播放验证（Spec P0）。", "good");
  log("拉菲 lafei_8 已就位：assets/Model/lafei_8/（原始资产不入库），Lab 从 public/assets-local/ 读取。");
  void applyBootParams();
  requestAnimationFrame(frame);
}

boot();
