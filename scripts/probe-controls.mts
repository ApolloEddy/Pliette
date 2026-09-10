/**
 * 单控制标定探针（指导书 Spec 5.1 步骤 3-4）：
 * 隔离实例（清轨道 + setup 参考姿态）→ 每控制按小步长 ± 梯度定值 →
 * 采样关键骨世界坐标/局部角 + 截图。范围探索只在小梯度内递进，不探索极端姿态。
 *
 * 前置：vite dev server @ :5174 且代码新鲜（内置预检，vite 陈旧模块教训）。
 * 用法: npx vite-node scripts/probe-controls.mts [--out-tag tag]
 * 输出: experiments/rig-calibration/lafei_8/probe-samples<tag>.json（入库）
 *       experiments/media/rig-calibration/lafei_8/*.png（本地，不入库）
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const BASE = "http://localhost:5174";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9224;

// ---- 新鲜度预检（vite dev server 会服务陈旧模块的既有教训）----
for (const [file, marker] of [["src/lab/ui.ts", "resetToSetup"], ["src/rig/rigProfile.ts", "face.eyeR"]] as const) {
  const text = await (await fetch(`${BASE}/${file}`)).text();
  if (!text.includes(marker)) {
    console.error(`⛔ dev server 代码非最新（${file} 缺 ${marker} 标记），请重启 vite 后重试`);
    process.exit(1);
  }
}
console.log("✓ dev server 代码新鲜度检查通过");

// ---- 探针计划：controlId → 角色梯次 ----
// 阶梯=候选探索值（度或 H）；0 为基线帧。数值上限受保守边界约束，不做极端姿态探索。
const PLAN = [
  { id: "arm.right.raise", spec: "arm.upper.right|rotate", bones: ["hand_R", "hand_R3", "body", "face"], values: [-60, -40, -20, -10, -5, 0, 5, 10, 20, 40, 60, 90] },
  { id: "arm.right.forearm", spec: "arm.right|rotate", bones: ["hand_R3", "hand_R", "body"], values: [-40, -20, -10, -5, 0, 5, 10, 20, 40, 60] },
  { id: "arm.left.raise", spec: "arm.upper.left|rotate", bones: ["hand_L", "hand_L3", "body", "face"], values: [-60, -40, -20, -10, -5, 0, 5, 10, 20, 40, 60, 90] },
  { id: "arm.left.forearm", spec: "arm.left|rotate", bones: ["hand_L3", "hand_L", "body"], values: [-40, -20, -10, -5, 0, 5, 10, 20, 40, 60] },
  { id: "head.nod", spec: "head.main|rotate", bones: ["face", "body", "hand_R", "hand_L"], values: [-40, -24, -12, -6, -3, 0, 3, 6, 12, 24, 40] },
  { id: "torso.lean", spec: "body.root|rotate", bones: ["body", "face", "hand_R", "hand_L", "leg_L3", "leg_R3"], values: [-30, -20, -12, -6, -3, 0, 3, 6, 12, 20, 30] },
  { id: "torso.bob.y", spec: "body.root|translate", bones: ["body", "face", "leg_L3", "leg_R3"], translate: [[0, -0.08], [0, -0.04], [0, -0.02], [0, -0.01], [0, 0], [0, 0.01], [0, 0.02], [0, 0.04], [0, 0.08]] },
  { id: "torso.bob.x", spec: "body.root|translate", bones: ["body", "face", "leg_L3", "leg_R3"], translate: [[-0.04, 0], [-0.02, 0], [-0.01, 0], [0.01, 0], [0.02, 0], [0.04, 0]] },
];

// 眼睛配对枚举（成对附件；视觉含义由截图复核确认，配对控制实现待本探针之后）
const EYE_PAIRS: [string, string][] = [
  ["eye_L", "eye_R"],
  ["eye_2_1", "eye_2_2"],
  ["eye_3_1", "eye_3_2"],
  ["eye_4_1", "eye_4_2"],
  ["eye_L2", "eye_R2"],
  ["eye_L3", "eye_R3"],
  ["eye_L4", "eye_R4"],
  ["eye_L5", "eye_R5"],
];

// ---- CDP 微型客户端 ----
const userDataDir = join(tmpdir(), `pliette-probe-${Date.now()}`);
const proc = spawn(EDGE, [
  "--headless=new",
  "--disable-gpu-sandbox",
  "--use-angle=swiftshader",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${userDataDir}`,
  "--window-size=520,760",
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });

const wsUrl = await new Promise((res, rej) => {
  const timer = setTimeout(() => rej(new Error("等待 DevTools 端点超时")), 15000);
  proc.stderr.on("data", (chunk) => {
    const m = String(chunk).match(/DevTools listening on (ws:\/\/\S+)/);
    if (m) { clearTimeout(timer); res(m[1]); }
  });
});
const browserWs = new WebSocket(wsUrl.replace(/\/devtools\/browser\/.*$/, `/devtools/browser/${wsUrl.split("/").pop()}`));
await new Promise((res, rej) => { browserWs.onopen = res; browserWs.onerror = rej; });

let msgId = 0;
const pending = new Map();
browserWs.onmessage = (ev) => {
  const msg = JSON.parse(String(ev.data));
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
};
function send(method, params = {}, sessionId) {
  const id = ++msgId;
  return new Promise((res, rej) => {
    pending.set(id, (msg) => (msg.error ? rej(new Error(`${method}: ${msg.error.message}`)) : res(msg.result)));
    browserWs.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}
const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
  return r.result.value;
};

async function probeStep(label, url, bones, shotPath) {
  await send("Page.navigate", { url }, sessionId).catch(() => {});
  // 等探针冻结日志出现（applyBootParams 在资产加载完成后执行）
  const deadline = Date.now() + 15000;
  let frozen = false;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 300));
    const t = await evaluate(`document.querySelector("#log,.log,body")?.textContent ?? ""`).catch(() => "");
    if (typeof t === "string" && t.includes(label)) { frozen = true; break; }
  }
  if (!frozen) throw new Error(`探针未冻结：${url}`);
  await new Promise((r) => setTimeout(r, 250));
  const samples = await evaluate(`window.__labDebug ? JSON.stringify(window.__labDebug.sampleWorld(${JSON.stringify(bones)})) : null`);
  const shot = await send("Page.captureScreenshot", { format: "png" }, sessionId);
  writeFileSync(shotPath, Buffer.from(shot.data, "base64"));
  return JSON.parse(samples);
}

// ---- 执行 ----
const onlyArg = process.argv.slice(2).find((a) => !a.startsWith("--"));
const outMedia = resolve(root, "experiments/media/rig-calibration/lafei_8");
mkdirSync(outMedia, { recursive: true });
const outData = resolve(root, "experiments/rig-calibration/lafei_8");
mkdirSync(outData, { recursive: true });

const results = [];
let runError: unknown = null;
try {
  for (const plan of PLAN) {
    if (onlyArg && !plan.id.includes(onlyArg)) continue;
    for (const value of plan.translate ?? plan.values) {
      const valStr = plan.translate ? JSON.stringify(value) : String(value);
      const label = `控制探针冻结：${plan.spec}|${valStr}`;
      const url = `${BASE}/?asset=lafei_8&capture=1&view=flat&probeControl=${encodeURIComponent(`${plan.spec}|${valStr}`)}&freezeAt=0.5`;
      const file = join(outMedia, `${plan.id}_${String(value).replaceAll(/["[\],]/g, "")}.png`);
      const samples = await probeStep(label, url, plan.bones, file);
      results.push({ control: plan.id, value, samples, screenshot: relative(root, file) });
      const tip = plan.bones[0];
      const s0 = samples.find((s) => s.name === tip);
      console.log(`${plan.id.padEnd(18)} ${String(value).padStart(10)}  ${tip}=(${s0?.x?.toFixed(1)},${s0?.y?.toFixed(1)}) rot=${s0?.rotation?.toFixed(2)}`);
    }
  }
  // 眼睛配对枚举（成对附件；视觉含义由截图复核确认，配对控制实现待本探针之后）
  for (const [l, r] of EYE_PAIRS) {
    if (onlyArg && !onlyArg.includes("eye")) continue;
    const spec = `face.eyes|attachment|${l};face.eyeR|attachment|${r}`;
    const label = `控制探针冻结：${spec}`;
    const url = `${BASE}/?asset=lafei_8&capture=1&view=flat&probeControl=${encodeURIComponent(spec)}&freezeAt=0.5`;
    const file = join(outMedia, `eyes_${l}_${r}.png`);
    const samples = await probeStep(label, url, ["face", "body"], file);
    results.push({ control: "face.eyes.pair", value: [l, r], samples, screenshot: relative(root, file) });
    console.log(`eyes ${l}+${r} 已截图`);
  }
} catch (e) {
  runError = e;
} finally {
  proc.kill();
  // 即使中断也保存已采集数据（中断点之后可 --only 续采）
  const outFile = resolve(outData, "probe-samples.json");
  if (results.length > 0) {
    let prior: { results?: unknown[] } = {};
    if (existsSync(outFile)) prior = JSON.parse(readFileSync(outFile, "utf-8"));
    const merged = { ...(prior as object), date: new Date().toISOString().slice(0, 10), runtime: "3.6.53", refPose: "setup", results };
    writeFileSync(outFile, JSON.stringify(merged, null, 2) + "\n");
    console.log(`\n已保存 ${results.length} 步 -> ${relative(root, outFile)}`);
  }
  if (runError) {
    console.error("探针中断：", runError);
    process.exit(1);
  }
}
console.log(`完成 ${results.length} 步。截图 -> ${relative(root, outMedia)}（本地，不入库）`);
