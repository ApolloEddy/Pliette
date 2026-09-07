/**
 * CDP 调试：导航到 ?eyes= 页面，读取真实运行时状态（轨道/附件）。
 * 用法: node scripts/debug-eyes.mjs
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9224;
const dir = mkdtempSync(join(tmpdir(), "pliette-dbg-"));
const proc = spawn(EDGE, ["--headless=new", "--disable-gpu-sandbox", "--use-angle=swiftshader", `--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`, "--window-size=768,1000", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
const wsUrl = await new Promise((res, rej) => {
  const timer = setTimeout(() => rej(new Error("timeout")), 15000);
  proc.stderr.on("data", (c) => { const m = String(c).match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(timer); res(m[1]); } });
});
const ws = new WebSocket(wsUrl);
await new Promise((res) => (ws.onopen = res));
let msgId = 0; const pending = new Map();
ws.onmessage = (ev) => { const d = JSON.parse(ev.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const send = (method, params = {}, sessionId) => new Promise((res) => { const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method, params, sessionId })); });

const { result: targetResult } = await send("Target.createTarget", { url: "http://localhost:5174/?asset=lafei_8&view=flat&anim=stand&eyes=eye_4_1,eye_4_2&freezeAt=1.0" });
const targetId = targetResult.targetId;
await new Promise((r) => setTimeout(r, 1500));
const attach = await send("Target.attachToTarget", { targetId, flatten: true });
const sessionId = attach.result.sessionId;
await new Promise((r) => setTimeout(r, 8000));
const expr = `JSON.stringify({
  tracks: [0,1,2,3,4,5].map(i => { const e = __labDebug.flatView.state.tracks[i]; return e ? e.animation.name : null; }),
  eyeL: __labDebug.flatView.skeleton?.findSlot("eye_L")?.getAttachment()?.name,
  eyeR: __labDebug.flatView.skeleton?.findSlot("eye_R")?.getAttachment()?.name,
  paused: __labDebug.flatView.paused,
  logs: Array.from(document.querySelectorAll("#log div")).map(d => d.textContent).slice(-5)
})`;
const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true }, sessionId);
console.log(r.result?.result?.value ?? JSON.stringify(r).slice(0, 400));
proc.kill(); setTimeout(() => { try { rmSync(dir, { recursive: true, force: true }); } catch {} }, 1200); process.exit(0);
