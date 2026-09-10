/** Lab Author 面板冒烟：加载 Lab（拉菲）→ 点 Mock 生成 → 读诊断区 + 日志。 */
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const BASE = "http://localhost:5174";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9226;

for (const [file, marker] of [["src/lab/ui.ts", "wireAuthorPanel"]] as const) {
  const text = await (await fetch(`${BASE}/${file}`)).text();
  if (!text.includes(marker)) { console.error(`⛔ dev server 陈旧（${file}）`); process.exit(1); }
}

const userDataDir = join(tmpdir(), `pliette-author-smoke-${Date.now()}`);
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

await send("Page.navigate", { url: `${BASE}/?asset=lafei_8&view=flat` }, sessionId);
// 等资产加载完成
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 500));
  const ready = await evaluate(`!!window.__labDebug && !!window.__labDebug.skeleton()`);
  if (ready) break;
}
console.log("资产加载:", await evaluate(`window.__labDebug ? !!window.__labDebug.skeleton() : false`));

for (const action of ["mock", "context"]) {
  await evaluate(`document.getElementById("${action === "mock" ? "btn-author-mock" : "btn-author-context"}").click()`);
  await new Promise((r) => setTimeout(r, 800));
  const diag = await evaluate(`document.getElementById("author-diag").innerText`);
  console.log(`\n== ${action} ==\n${diag}`);
}
proc.kill();
