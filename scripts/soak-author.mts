/**
 * 在线通路浸泡（指导书 Spec 12.1）：交替请求/取消/陈旧/回退 连续 ≥10 分钟，
 * 检查实例数、监听器（Broker 内部表）与堆内存是否持续增长。纯逻辑层（无浏览器/无网络）。
 * 用法: npx vite-node scripts/soak-author.mts [minutes=10]
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseControlProfile } from "../src/rig/controlProfile.js";
import { assembleRequest } from "../src/motion/author/context.js";
import { validateCandidate } from "../src/motion/author/validateV11.js";
import { MockAuthorClient } from "../src/motion/author/client.js";
import { AuthorBroker } from "../src/motion/author/authorBroker.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const minutes = Number(process.argv[2] ?? 10);
const profile = parseControlProfile(JSON.parse(readFileSync(resolve(root, "characters/lafei_8.rig-profile.json"), "utf-8")));

// 不加载骨架（validate 不带 skeletonData → 跳过编译/采样；浸泡对象是请求生命周期与 Broker 状态机）
const GOALS = ["向用户挥手", "轻轻点头", "眨一下眼", "身体前倾倾听", "呼吸起伏", "晕乎乎晃一晃", "张开双臂", "唱一首歌"];

let played = 0;
let cancelled = 0;
const broker = new AuthorBroker({
  play: () => { played++; return `inst-${played}`; },
  cancel: () => { cancelled++; },
});
const client = new MockAuthorClient(0);

const heap0 = process.memoryUsage().heapUsed;
let submitted = 0;
let accepted = 0;
let staleRejected = 0;
let unsupported = 0;
let seq = 0;

// 编译产物存根：浸泡对象是请求生命周期与 Broker 状态机（编译/采样在其他测试覆盖），
// 提供合法形状使接纳路径也被真实行使。
const stubCompiled = { id: "soak", writes: [], channels: ["head"], animation: {}, durationSec: 1 } as never;

const endAt = Date.now() + minutes * 60_000;
let stateVersion = 1;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
while (Date.now() < endAt) {
  seq++;
  const goal = GOALS[seq % GOALS.length];
  const requestId = `soak-${seq}`;
  const request = assembleRequest(profile, {
    requestId,
    contextId: `soak-ctx-${seq}`,
    goal,
    runtimeState: { monoClockMs: Date.now(), viewId: "front", skinId: "default", stateVersion, occupiedChannels: [], contacts: [] },
  });
  // 模拟配置/Skin/视图变化：每 50 次请求离散版本 +1（在途请求按 Spec 9.3 过时）
  if (seq % 50 === 0) stateVersion++;

  broker.begin(profile.identity.profileId, requestId, request.contextId, stateVersion, request.generationBudget.deadlineMs);
  submitted++;

  // 每 7 个请求主动取消（在途请求取消，Spec 12.1 交替取消）
  if (seq % 7 === 0) broker.cancel(profile.identity.profileId, requestId);

  const gen = await client.generate(request, profile);
  const v = validateCandidate(gen.raw, request, profile);
  if (v.response?.status === "unsupported") unsupported++;
  const commit = broker.commit(profile.identity.profileId, {
    request,
    response: v.response!,
    compiled: v.ok ? stubCompiled : undefined,
    current: { monoClockMs: Date.now(), viewId: "front", skinId: "default", stateVersion, occupiedChannels: [], contacts: [] },
    occupiedChannels: new Set(),
  });
  if (commit.accepted) {
    accepted++;
    // 接纳后按播放节拍释放（真实系统由混出完成事件触发）
    if (seq % 2 === 0) broker.releasePlayback(requestId);
  } else if (commit.findings.some((f) => f.code === "STALE_CONTEXT" || f.code === "DEADLINE_EXCEEDED")) {
    staleRejected++;
  }

  // 接近真实请求节奏（~200 req/s 上限），避免把 Node 推到纯 CPU 极限造成失真
  if (seq % 20 === 0) await sleep(4);

  if (seq % 2000 === 0) {
    const heap = process.memoryUsage().heapUsed;
    const snap = broker.snapshot();
    console.log(`seq=${seq} 提交=${submitted} 接纳=${accepted} 过时/截止拒=${staleRejected} 不支持=${unsupported} heap=${(heap / 1048576).toFixed(1)}MB memo=${snap.memoSize} 播放记录=${snap.playing.length}`);
  }
}

const heapGrowth = (process.memoryUsage().heapUsed - heap0) / 1048576;
const snap = broker.snapshot();
console.log(`\n浸泡 ${minutes} 分钟完成：`);
console.log(`  提交 ${submitted} · 接纳 ${accepted} · 过时/截止拒绝 ${staleRejected} · unsupported ${unsupported}`);
console.log(`  活跃请求（应≤角色数）：${snap.activeRequests.length} · 播放记录：${snap.playing.length} · 幂等窗口：${snap.memoSize}（上限 8192）`);
console.log(`  堆增长：${heapGrowth.toFixed(2)} MB（首次 GC 前含正常分配噪声）`);
if (snap.activeRequests.length > 1 || snap.playing.length > 8192) {
  console.error("⛔ 状态泄漏：活跃请求或播放记录异常增长");
  process.exit(1);
}
console.log("✅ 浸泡通过：无实例/状态泄漏");
