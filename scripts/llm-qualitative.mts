/**
 * 定性画面核验：真实 LLM 一次调用 → 校验 → 翻译为内部草稿 → 落盘 public/motions/llm_*.json。
 * 之后用既有 ?motion=&poseAt= 管线截图复核。用法: npx vite-node scripts/llm-qualitative.mts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseControlProfile } from "../src/rig/controlProfile.js";
import { assembleRequest } from "../src/motion/author/context.js";
import { validateCandidate } from "../src/motion/author/validateV11.js";
import { LlmAuthorClient } from "../src/motion/author/client.js";
import { translateDraft } from "../src/motion/author/translate.js";
import { LAFEI_8_FRONT_CANDIDATES } from "../src/rig/rigProfile.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const profile = parseControlProfile(JSON.parse(readFileSync(resolve(root, "characters/lafei_8.rig-profile.json"), "utf-8")));
const cfg = JSON.parse(readFileSync(resolve(root, "config/llm.local.json"), "utf-8"));
const apiKey = process.env[cfg.apiKeyEnv ?? ""];

const GOALS: [string, string][] = [
  ["llm_nod", "轻轻点头示意"],
  ["llm_lean_blink", "倾身倾听并且眨眨眼"],
];

const client = new LlmAuthorClient(
  { endpoint: cfg.endpoint, apiKey, model: cfg.model, temperature: cfg.temperature, reasoningEffort: cfg.reasoningEffort },
  { deadlineMs: cfg.deadlineMs ?? 8000, maxBytes: 32 * 1024 },
);

for (const [name, goal] of GOALS) {
  const request = assembleRequest(profile, {
    requestId: `qual-${name}`,
    contextId: `qual-${name}-ctx`,
    goal,
    runtimeState: { monoClockMs: 0, viewId: "front", skinId: "default", stateVersion: 1, occupiedChannels: [], contacts: [] },
  });
  try {
    const gen = await client.generate(request, profile);
    const v = validateCandidate(gen.raw, request, profile, { skeletonData: undefined });
    console.log(`${name}: 校验=${v.ok ? "通过" : "失败"} latency=${gen.meta.latencyMs}ms`);
    if (!v.ok || v.response?.status !== "motion") {
      console.log("  findings:", v.findings.map((f) => f.code).join(","), "| status:", v.response?.status);
      continue;
    }
    const tr = translateDraft(v.response.draft, profile, LAFEI_8_FRONT_CANDIDATES.id);
    writeFileSync(resolve(root, `public/motions/${name}.json`), JSON.stringify(tr.draft, null, 2) + "\n");
    // 同步导出 V1.1 原始候选（真实 LLM 输出，留存）
    writeFileSync(resolve(root, `experiments/motion-guide/run-llm-mimo-8s/candidate-${name}.json`), JSON.stringify(gen.raw, null, 2) + "\n");
    console.log(`  已落盘 public/motions/${name}.json（时长 ${v.response.draft.durationSec}s，曲线 ${v.response.draft.curves.length} 条）`);
  } catch (e) {
    console.log(`${name}: 失败 ${(e as Error).message}`);
  }
}
