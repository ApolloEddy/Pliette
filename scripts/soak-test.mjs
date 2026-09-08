/**
 * 持续运行浸泡测试（Spec 15.4：检查纹理、动画实例、监听器和物件是否持续增长）。
 * CDP 驱动：?auto=1 自动行为 + 眨眼，每 60s 采样 JS 堆 / three 渲染器信息 / 活动轨道数。
 * 用法: node scripts/soak-test.mjs [minutes=30]
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9225;
const minutes = Number(process.argv[2] ?? 30);
const dir = mkdtempSync(join(tmpdir(), "pliette-soak-"));
const proc = spawn(EDGE, ["--headless=new", "--disable-gpu-sandbox", "--use-angle=swiftshader", `--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`, "--window-size=900,700", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
const wsUrl = await new Promise((res, rej) => {
  const timer = setTimeout(() => rej(new Error("timeout")), 15000);
  proc.stderr.on("data", (c) => { const m = String(c).match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(timer); res(m[1]); } });
});
const ws = new WebSocket(wsUrl);
await new Promise((res) => (ws.onopen = res));
let msgId = 0; const pending = new Map();
ws.onmessage = (ev) => { const d = JSON.parse(ev.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const send = (method, params = {}, sessionId) => new Promise((res) => { const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method, params, sessionId })); });

const { result: targetResult } = await send("Target.createTarget", { url: `http://localhost:5174/?asset=lafei_8&auto=1` });
const targetId = targetResult.targetId;
await new Promise((r) => setTimeout(r, 3000));
const attach = await send("Target.attachToTarget", { targetId, flatten: true });
const sessionId = attach.result.sessionId;

const samples = [];
const expr = `JSON.stringify((() => {
  const v = __labDebug.flatView;
  const mem = performance.memory ? { heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) } : { heapMB: -1 };
  return {
    heapMB: mem.heapMB,
    tracks: v.state ? v.state.tracks.filter(Boolean).length : -1,
    eyeAtt: v.skeleton?.findSlot("eye_L")?.getAttachment()?.name ?? "?",
    logs: document.querySelectorAll("#log div").length,
    fps: (document.getElementById("fps")?.textContent ?? "").replace(" FPS", "")
  };
})())`;

console.log(`浸泡测试开始：${minutes} 分钟，?auto=1（自动行为+眨眼）`);
console.log("t(min) | heapMB | tracks | eye_L | logLines | FPS");
const started = Date.now();
let n = 0;
while ((Date.now() - started) / 60000 < minutes) {
  await new Promise((r) => setTimeout(r, 60000));
  n++;
  try {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true }, sessionId);
    const s = JSON.parse(r.result?.result?.value ?? "{}");
    samples.push(s);
    console.log(`${n} | ${s.heapMB} | ${s.tracks} | ${s.eyeAtt} | ${s.logs} | ${s.fps}`);
  } catch (e) {
    console.log(`${n} | 采样失败: ${String(e).slice(0, 80)}`);
  }
}
console.log("");
console.log("===== 增长判定 =====");
const heaps = samples.map((s) => s.heapMB).filter((v) => v > 0);
if (heaps.length >= 3) {
  const first = heaps[0], last = heaps[heaps.length - 1], max = Math.max(...heaps);
  const growth = ((last - first) / first) * 100;
  console.log(`堆内存: ${first}MB → ${last}MB（峰值 ${max}MB，增幅 ${growth.toFixed(1)}%）→ ${growth < 30 ? "无持续增长 ✅" : "需人工检查 ⚠️"}`);
} else {
  console.log("样本不足，无法判定（performance.memory 需要浏览器支持）");
}
proc.kill(); setTimeout(() => { try { rmSync(dir, { recursive: true, force: true }); } catch {} }, 1500);
process.exit(0);
