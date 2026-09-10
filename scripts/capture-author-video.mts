/**
 * 04_online_generation 录像采集（指导书 Spec 12.2-4）：
 * Lab（拉菲）→ 请求上下文生成 → Mock 在线请求 → 校验 → 提交播放，逐阶段截图。
 * 用法: npx vite-node scripts/capture-author-video.mts
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const BASE = "http://localhost:5174";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9227;
const outDir = resolve(root, "experiments/media/motion-guide/frames/author");
mkdirSync(outDir, { recursive: true });

const marker = "wireAuthorPanel";
const served = await (await fetch(`${BASE}/src/lab/ui.ts`)).text();
if (!served.includes(marker)) { console.error("⛔ dev server 陈旧"); process.exit(1); }

const userDataDir = join(tmpdir(), `pliette-author-video-${Date.now()}`);
const proc = spawn(EDGE, ["--headless=new", "--disable-gpu-sandbox", "--use-angle=swiftshader", `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDataDir}`, "--window-size=1280,900", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
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
let shotIdx = 0;
async function shot(label) {
  const shot = await send("Page.captureScreenshot", { format: "png" }, sessionId);
  const t = performance.now();
  const file = join(outDir, `${String(++shotIdx).padStart(2, "0")}_${label}.png`);
  writeFileSync(file, Buffer.from(shot.data, "base64"));
  console.log(`[${((t - t0) / 1000).toFixed(1)}s] ${label}`);
}
const t0 = performance.now();

await send("Page.navigate", { url: `${BASE}/?asset=lafei_8&view=flat` }, sessionId);
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 500));
  if (await evaluate(`!!window.__labDebug && !!window.__labDebug.skeleton()`)) break;
}
await shot("01_asset_loaded");

await evaluate(`document.getElementById("btn-author-context").click()`);
await new Promise((r) => setTimeout(r, 600));
await shot("02_request_context_built");
const ctxInfo = await evaluate(`document.getElementById("author-diag").innerText`);
console.log(ctxInfo.split("\n")[1]);

await evaluate(`document.getElementById("btn-author-mock").click()`);
await new Promise((r) => setTimeout(r, 300));
await shot("03_request_sent");
await new Promise((r) => setTimeout(r, 500));
await shot("04_response_validated_playing");
await new Promise((r) => setTimeout(r, 700));
await shot("05_playing");
const diag = await evaluate(`document.getElementById("author-diag").innerText`);
console.log("诊断:", diag.replaceAll("\n", " | "));
proc.kill();
console.log("帧序列 ->", relative(root, outDir));
