/**
 * spineboy 标定探针（指导书 Spec 5.1 / 5.3）：官方示例（机制验证，非产品标定）。
 * 结构差异目标：头在躯干链内（head←neck←torso3）、双段臂（front-upper-arm→bracer→fist）、IK 腿。
 * 用法: npx vite-node scripts/probe-spineboy.mts
 * 输出: experiments/rig-calibration/spineboy/probe-samples.json + experiments/media/rig-calibration/spineboy/*.png
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
const PORT = 9225;

for (const [file, marker] of [["src/lab/ui.ts", "front[_-]?upper[_-]?arm"]] as const) {
  const text = await (await fetch(`${BASE}/${file}`)).text();
  if (!text.includes(marker.replace(/\\\[/g, "["))) { console.error(`⛔ dev server 陈旧（${file}）`); process.exit(1); }
}
console.log("✓ dev server 代码新鲜度检查通过");

const PLAN = [
  { id: "head.tilt", spec: "head.main|rotate", bones: ["head", "neck", "torso3", "hip"], values: [-40, -20, -10, 0, 10, 20, 40] },
  { id: "torso.sway", spec: "body.root|rotate", bones: ["hip", "torso3", "head", "front-upper-arm"], values: [-15, -8, 0, 8, 15] },
  { id: "arm.front.raise", spec: "arm.upper.right|rotate", bones: ["front-upper-arm", "front-bracer", "front-fist", "torso3"], values: [-60, -30, 0, 30, 60, 90] },
];

const userDataDir = join(tmpdir(), `pliette-probe-sb-${Date.now()}`);
const proc = spawn(EDGE, ["--headless=new", "--disable-gpu-sandbox", "--use-angle=swiftshader", `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDataDir}`, "--window-size=520,760", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
const wsUrl = await new Promise((res, rej) => {
  const timer = setTimeout(() => rej(new Error("DevTools 超时")), 15000);
  proc.stderr.on("data", (c) => { const m = String(c).match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(timer); res(m[1]); } });
});
const ws = new WebSocket(wsUrl.replace(/\/devtools\/browser\/.*$/, `/devtools/browser/${wsUrl.split("/").pop()}`));
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let msgId = 0;
const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(String(ev.data)); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const id = ++msgId; pending.set(id, (msg) => (msg.error ? rej(new Error(msg.error.message)) : res(msg.result))); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId)).result?.value;

async function probeStep(label, url, bones, shotPath) {
  await send("Page.navigate", { url }, sessionId).catch(() => {});
  const deadline = Date.now() + 15000;
  let frozen = false;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 300));
    const t = await evaluate(`document.querySelector("#log,body")?.textContent ?? ""`).catch(() => "");
    if (typeof t === "string" && t.includes(label)) { frozen = true; break; }
  }
  if (!frozen) throw new Error(`探针未冻结：${url}`);
  await new Promise((r) => setTimeout(r, 250));
  const samples = await evaluate(`window.__labDebug ? JSON.stringify(window.__labDebug.sampleWorld(${JSON.stringify(bones)})) : null`);
  const shot = await send("Page.captureScreenshot", { format: "png" }, sessionId);
  writeFileSync(shotPath, Buffer.from(shot.data, "base64"));
  return JSON.parse(samples);
}

const outMedia = resolve(root, "experiments/media/rig-calibration/spineboy");
mkdirSync(outMedia, { recursive: true });
const outData = resolve(root, "experiments/rig-calibration/spineboy");
mkdirSync(outData, { recursive: true });

const results = [];
let runError = null;
try {
  for (const plan of PLAN) {
    for (const value of plan.values) {
      const label = `控制探针冻结：${plan.spec}|${value}`;
      const url = `${BASE}/?asset=spineboy&capture=1&view=flat&probeControl=${encodeURIComponent(`${plan.spec}|${value}`)}&freezeAt=0.5`;
      const file = join(outMedia, `${plan.id}_${value}.png`);
      const samples = await probeStep(label, url, plan.bones, file);
      results.push({ control: plan.id, value, samples, screenshot: relative(root, file) });
      const tip = plan.bones[0];
      const s0 = samples.find((s) => s.name === tip);
      console.log(`${plan.id.padEnd(18)} ${String(value).padStart(6)}  ${tip}=(${s0?.x?.toFixed(1)},${s0?.y?.toFixed(1)}) rot=${s0?.rotation?.toFixed(2)}`);
    }
  }
} catch (e) {
  runError = e;
} finally {
  proc.kill();
  const outFile = resolve(outData, "probe-samples.json");
  if (results.length > 0) {
    writeFileSync(outFile, JSON.stringify({ date: new Date().toISOString().slice(0, 10), runtime: "3.6.53", refPose: "setup", results }, null, 2) + "\n");
    console.log(`已保存 ${results.length} 步 -> ${relative(root, outFile)}`);
  }
  if (runError) { console.error("探针中断：", runError); process.exit(1); }
}
console.log(`完成 ${results.length} 步。`);
