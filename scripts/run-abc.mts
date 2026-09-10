/**
 * A/B/C 对照实验 runner（指导书 Spec 11）——工程验收骨架。
 * 当前无 LLM 密钥：以 MockAuthorClient 走完整管线，验证实验框架、统计与记录格式；
 * A/B 差异（指导书内容对生成质量的影响）必须等真实 LLM 接入后才能测得——本 run 不冒充实测。
 *
 * A 组：最小接口说明（控制列表+域+预算+协议；不含指导片段与规则教学）
 * B 组：A + 指导片段 + 必带规则（完整请求包）
 * C 组：复用 B 的同一原始输出，经正式验证/编译/提交（程序筛选能挡住什么）
 *
 * 用法: npx vite-node scripts/run-abc.mts [runId=run1]
 * 输出: experiments/motion-guide/<runId>/{config,results}.json + summary.md
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSkeleton } from "../src/assets/loader.js";
import { parseControlProfile } from "../src/rig/controlProfile.js";
import { assembleRequest } from "../src/motion/author/context.js";
import { validateCandidate } from "../src/motion/author/validateV11.js";
import { MockAuthorClient, LlmAuthorClient, type AuthorClient } from "../src/motion/author/client.js";
import { AuthorBroker } from "../src/motion/author/authorBroker.js";
import { formatDiagnostic } from "../src/motion/author/diagnostics.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const useLlm = process.argv.includes("--llm");
// runId：第一个非 --llm 的位置参数；缺省 mock=run1 / llm=run-llm
const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const runId = positional[0] ?? (useLlm ? "run-llm" : "run1");

/** LLM 客户端装配：config/llm.local.json（gitignored，不含密钥）+ apiKeyEnv 指定的环境变量。 */
function readLlmBudget(): { deadlineMs: number; maxOutputBytes: number } {
  if (useLlm) {
    try {
      const cfg = JSON.parse(readFileSync(resolve(root, "config/llm.local.json"), "utf-8"));
      if (typeof cfg.deadlineMs === "number") return { deadlineMs: cfg.deadlineMs, maxOutputBytes: 32 * 1024 };
    } catch {}
  }
  return { deadlineMs: 2500, maxOutputBytes: 32 * 1024 };
}

function buildClient(budget: { deadlineMs: number; maxOutputBytes: number }): AuthorClient | null {
  if (!useLlm) return new MockAuthorClient(5);
  const cfgPath = resolve(root, "config/llm.local.json");
  let cfg: { endpoint?: string; model?: string; temperature?: number; apiKeyEnv?: string; apiKey?: string };
  try {
    cfg = JSON.parse(readFileSync(cfgPath, "utf-8"));
  } catch {
    console.error(`⛔ 未找到 ${cfgPath}（--llm 需要）；或先用 Mock 跑 run1`);
    return null;
  }
  const envName = cfg.apiKeyEnv ?? "";
  const apiKey = cfg.apiKey ?? (envName ? process.env[envName] : undefined);
  if (!cfg.endpoint || !cfg.model || !apiKey) {
    console.error(`⛔ LLM 配置不完整：endpoint/model/${envName || "apiKey"} 缺失（密钥应放环境变量，不写入本文件）`);
    return null;
  }
  return new LlmAuthorClient(
    { endpoint: cfg.endpoint, apiKey, model: cfg.model, temperature: cfg.temperature, reasoningEffort: cfg.reasoningEffort },
    { deadlineMs: budget.deadlineMs, maxBytes: budget.maxOutputBytes, label: runId },
  );
}

// ---- 冻结配置 ----
const profileSrc = JSON.parse(readFileSync(resolve(root, "characters/lafei_8.rig-profile.json"), "utf-8"));
const profile = parseControlProfile(profileSrc);
const rawJson = JSON.parse(readFileSync(resolve(root, "public/assets-local/lafei_8/lafei_8.json"), "utf-8"));
const atlasText = readFileSync(resolve(root, "public/assets-local/lafei_8/lafei_8.atlas.txt"), "utf-8");
const bundle = loadSkeleton({
  name: "lafei_8",
  skeletonJson: rawJson,
  atlasText,
  createTexture: () => ({ setFilters() {}, setWraps() {}, getImage: () => ({ width: 4, height: 4 }), getWidth: () => 4, getHeight: () => 4, dispose() {} }),
});

// 域内请求集（Spec 11.2：6 基本 + 4 组合/中断；示例集与测试集分开——此为测试集，表达均未写进 Mock 模板注释）
const REQUESTS = [
  { id: "q01", goal: "轻轻点头示意", kind: "basic" },
  { id: "q02", goal: "对镜头眨一下眼", kind: "basic" },
  { id: "q03", goal: "害羞地挥挥手打招呼", kind: "basic" },
  { id: "q04", goal: "身体前倾认真倾听", kind: "basic" },
  { id: "q05", goal: "深呼吸一样起伏一下", kind: "basic" },
  { id: "q06", goal: "眨左眼 wink", kind: "basic" },
  { id: "q07", goal: "点头的同时眨眼", kind: "combo" },
  { id: "q08", goal: "倾身倾听并且眨眨眼", kind: "combo" },
  { id: "q09", goal: "向两边张开手臂再放下", kind: "combo" },
  { id: "q10", goal: "晕头晕脑地摇摇晃晃", kind: "combo" },
];

const config = {
  runId,
  date: new Date().toISOString().slice(0, 10),
  profileDigest: profile.profileDigest,
  profileRevision: profile.identity.profileRevision,
  model: useLlm ? "真实 LLM（config/llm.local.json）" : "mock-author(deterministic) —— LLM 实测未执行（无密钥）",
  note: useLlm
    ? "真实 LLM run：A/B 差异与 11.3 指标有效；冻结配置见本文件与档案 digest。"
    : "工程验收 run：验证实验框架/统计/记录格式。A/B 质量差异需真实 LLM。",
  budgetKeys: ["minDurationSec", "maxDurationSec", "maxControls", "maxKeysPerCurve", "maxTotalKeys", "deadlineMs"],
  requests: REQUESTS,
  runsPerGroup: 2,
};
const outDir = resolve(root, "experiments/motion-guide", runId);
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, "config.json"), JSON.stringify(config, null, 2) + "\n");

// ---- 请求装配（A 最小 / B 完整） ----
function buildRequest(groupId: "A" | "B", req: (typeof REQUESTS)[number], gen: number) {
  const requestId = `${runId}-${groupId}-${req.id}-g${gen}`;
  const full = assembleRequest(profile, {
    requestId,
    contextId: `${requestId}-ctx`,
    goal: req.goal,
    runtimeState: {
      monoClockMs: 0,
      viewId: profile.identity.viewId,
      skinId: profile.identity.skinId,
      stateVersion: 1,
      occupiedChannels: [],
      contacts: [],
    },
  });
  if (groupId === "A") {
    // 最小接口：保留控制列表/域/预算/协议；剥离指导片段与教学性规则（保留硬边界规则的数据面）
    return { ...full, guideExcerpts: [], mandatoryRules: full.mandatoryRules.filter((r) => r.type === "range" || r.type === "rateLimit") };
  }
  return full;
}

// ---- 执行 ----
const broker = new AuthorBroker({ play: () => "sink", cancel: () => {} });
const client = buildClient(readLlmBudget());
if (!client) process.exit(1);
console.log(`客户端：${client.name}`);
const results: Record<string, unknown>[] = [];
let bRawCache = new Map<string, unknown>();

for (const group of ["A", "B"] as const) {
  for (let gen = 1; gen <= config.runsPerGroup; gen++) {
    for (const req of REQUESTS) {
      const request = buildRequest(group, req, gen);
      const t0 = performance.now();
      let raw: unknown;
      let bytes = 0;
      try {
        const gen2 = await client.generate(request, profile);
        raw = gen2.raw;
        bytes = gen2.bytes;
      } catch (e) {
        results.push({ group, req: req.id, gen, outcome: "client_error", error: (e as Error).message });
        continue;
      }
      if (group === "B") bRawCache.set(`${req.id}-g${gen}`, raw);
      const v = validateCandidate(raw, request, profile, { skeletonData: bundle.skeletonData });
      const findings = v.findings.map((f) => formatDiagnostic(f));
      if (!v.ok || !v.response) {
        // 程序筛选（C 组统计的"拒绝"）：候选未通过校验，不进入提交阶段
        results.push({
          group, req: req.id, goal: req.goal, kind: req.kind, gen, bytes,
          latencyMs: Math.round(performance.now() - t0),
          validateOk: false, commitAccepted: false,
          status: v.response?.status ?? "invalid",
          rawSnippet: JSON.stringify(raw).slice(0, 400),
          findings,
        });
        continue;
      }
      broker.begin(profile.identity.profileId, request.requestId, request.contextId, 1, request.generationBudget.deadlineMs);
      const commit = broker.commit(profile.identity.profileId, {
        request,
        response: v.response,
        compiled: v.compiled,
        current: { monoClockMs: 0, viewId: "front", skinId: "default", stateVersion: 1, occupiedChannels: [], contacts: [] },
        occupiedChannels: new Set(),
      });
      results.push({
        group,
        req: req.id,
        goal: req.goal,
        kind: req.kind,
        gen,
        bytes,
        latencyMs: Math.round(performance.now() - t0),
        validateOk: v.ok,
        commitAccepted: commit.accepted,
        status: v.response.status,
        findings,
      });
    }
  }
}

// ---- C：复用 B 的原始输出走正式管线（不再调用生成）；独立 broker（requestId 空间隔离） ----
const brokerC = new AuthorBroker({ play: () => "sink", cancel: () => {} });
for (const req of REQUESTS) {
  for (let gen = 1; gen <= config.runsPerGroup; gen++) {
    const raw = bRawCache.get(`${req.id}-g${gen}`);
    const request = buildRequest("B", req, gen);
    const v = validateCandidate(raw, request, profile, { skeletonData: bundle.skeletonData });
    if (!v.ok || !v.response) {
      // 校验未通过 = 程序筛选拒绝（真实 LLM 的候选会有相当比例落在这里）
      results.push({
        group: "C", req: req.id, gen, validateOk: false, commitAccepted: false,
        status: v.response?.status ?? "invalid",
        findings: v.findings.map((f) => formatDiagnostic(f)),
      });
      continue;
    }
    brokerC.begin(profile.identity.profileId, request.requestId, request.contextId, 1, request.generationBudget.deadlineMs);
    const commit = brokerC.commit(profile.identity.profileId, {
      request,
      response: v.response,
      compiled: v.compiled,
      current: { monoClockMs: 0, viewId: "front", skinId: "default", stateVersion: 1, occupiedChannels: [], contacts: [] },
      occupiedChannels: new Set(),
    });
    results.push({
      group: "C",
      req: req.id,
      gen,
      validateOk: v.ok,
      commitAccepted: commit.accepted,
      status: v.response.status,
      findings: v.findings.map((f) => formatDiagnostic(f)),
    });
  }
}

// ---- 统计 ----
function rate(rows: Record<string, unknown>[], pred: (r: Record<string, unknown>) => boolean): string {
  const hit = rows.filter(pred).length;
  return `${hit}/${rows.length}（${rows.length ? Math.round((100 * hit) / rows.length) : 0}%）`;
}
const bRows = results.filter((r) => r.group === "B");
const cRows = results.filter((r) => r.group === "C");
const aRows = results.filter((r) => r.group === "A");
const summary = {
  原始候选校验通过率: {
    A: rate(aRows, (r) => r.validateOk === true),
    B: rate(bRows, (r) => r.validateOk === true),
  },
  程序接纳率_C: rate(cRows, (r) => r.commitAccepted === true),
  拒绝明细: results.filter((r) => r.commitAccepted === false).slice(0, 20),
  免责: "Mock 输出确定性模板，A/B 差异无信息量；视觉通过率/延迟 p95/实际执行成功率等 Spec 11.3 指标必须等真实 LLM 实测，本 run 仅为管线工程验收。",
};
writeFileSync(resolve(outDir, "results.json"), JSON.stringify({ config, results, summary }, null, 2) + "\n");

const md = [
  `# A/B/C 工程 run：${runId}`,
  "",
  `- 日期：${config.date} · profileDigest：\`${config.profileDigest}\`（rev ${config.profileRevision}）`,
  `- 模型：**${config.model}**`,
  `- ${summary.原始候选校验通过率.A} / B 组 ${summary.原始候选校验通过率.B} / C 组接纳率 ${summary.程序接纳率_C}`,
  "",
  "> " + summary.免责,
  "",
].join("\n");
writeFileSync(resolve(outDir, "summary.md"), md);

console.log(`A 通过 ${summary.原始候选校验通过率.A} | B 通过 ${summary.原始候选校验通过率.B} | C 接纳 ${summary.程序接纳率_C}`);
console.log("输出 ->", relative(root, outDir));
