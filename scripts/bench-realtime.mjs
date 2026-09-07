/**
 * 实时性能基准（CDP 驱动，真实计时）：
 * 启动 headless Edge（--remote-debugging-port），导航到 ?bench=1 页面，
 * 等待真实秒数后用 Runtime.evaluate 读取基准报告。
 * 用法: node scripts/bench-realtime.mjs [asset] [benchSec]
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9223;
const asset = process.argv[2] ?? "lafei_8";
const benchSec = Number(process.argv[3] ?? 6);

const userDataDir = mkdtempSync(join(tmpdir(), "pliette-bench-"));
const proc = spawn(EDGE, [
  "--headless=new",
  "--disable-gpu-sandbox",
  "--use-angle=swiftshader",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${userDataDir}`,
  "--window-size=900,700",
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });

const wsUrl = await new Promise((res, rej) => {
  const timer = setTimeout(() => rej(new Error("等待 DevTools 端点超时")), 15000);
  proc.stderr.on("data", (chunk) => {
    const m = String(chunk).match(/DevTools listening on (ws:\/\/\S+)/);
    if (m) { clearTimeout(timer); res(m[1]); }
  });
});
// 浏览器级 WebSocket → 建新 tab
const ws = new WebSocket(wsUrl.replace(/\/devtools\/browser\/.*$/, `/devtools/browser/${wsUrl.split("/").pop()}`));
await new Promise((res) => (ws.onopen = res));

let msgId = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const data = JSON.parse(ev.data);
  if (data.id && pending.has(data.id)) { pending.get(data.id)(data); pending.delete(data.id); }
};
function send(method, params = {}, sessionId) {
  const id = ++msgId;
  return new Promise((res) => {
    pending.set(id, res);
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
}

const { result: targetResult } = await send("Target.createTarget", {
  url: `http://localhost:5174/?asset=${asset}&view=flat&anim=walk&bench=1&benchSec=${benchSec}`,
});
const targetId = targetResult.targetId;
await new Promise((r) => setTimeout(r, 1500));
const { result: targets } = await send("Target.getTargets");
const target = targets.targetInfos.find((t) => t.targetId === targetId);
const attachRes = await send("Target.attachToTarget", { targetId, flatten: true });
const sessionId = attachRes.result?.sessionId;
if (!sessionId) throw new Error(`attach 失败: ${JSON.stringify(attachRes.error ?? attachRes).slice(0, 200)}`);

// 等待 bench 完成（benchSec + 加载余量）
await new Promise((r) => setTimeout(r, (benchSec + 10) * 1000));
const evalResponse = await send("Runtime.evaluate", {
  expression: "document.body.innerText",
  returnByValue: true,
}, sessionId);
console.log("===== 基准报告 =====");
const value = evalResponse?.result?.result?.value ?? evalResponse?.result?.value ?? `(原始响应: ${JSON.stringify(evalResponse).slice(0, 400)})`;
console.log(value);

send("Target.closeTarget", { targetId }).catch(() => {});
proc.kill();
setTimeout(() => {
  try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* Edge 可能仍占用，忽略 */ }
}, 1500);
process.exit(0);
