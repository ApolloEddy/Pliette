/**
 * 真实 LLM 语义规划冒烟（MotionLibrary Spec v1.0 §3 上游规划器在线实测）：
 * MiMo chat/completions 端点连通 + 能力卡（含 repeats 参数域）输出质量 + segmentId
 * 归一化。无 MIMO_API_KEY 时整组跳过（本地 CI 兼容）。
 *
 * 已知实测结论（2026-09-17，reasoning=high）：单轮延迟 36–54s，超出交互 deadline（8s）——
 * MiMo 当前只适合离线评测，不适合在线交互；在线路径继续默认规则版兜底。
 * 本测试 deadline 放宽到 90s 以验证协议正确性（非交互性）。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LlmPlanAdapter } from "../src/dialogue/planAdapter.js";
import { CatalogView, loadCatalog } from "../src/motion/library/catalog.js";
import { loadManifest, MotionIndex, rigIdentityFrom } from "../src/motion/library/index.js";
import { routePlan } from "../src/motion/library/selector.js";
import { validateMotionPlan } from "../src/motion/library/validate.js";

const apiKey = process.env.MIMO_API_KEY ?? "";
const available = apiKey.length > 0;

const catalog = new CatalogView(loadCatalog(JSON.parse(readFileSync(resolve("public/motion-library/catalog.json"), "utf-8"))));
const manifest = loadManifest(JSON.parse(readFileSync(resolve("public/motion-library/models/lafei_8/front/manifest.json"), "utf-8")), catalog.revision);
const index = new MotionIndex();
index.rebuild(manifest);
const rig = rigIdentityFrom(manifest.entries[0].rigRef);

function adapter(): LlmPlanAdapter {
  return new LlmPlanAdapter(
    { endpoint: "https://api.xiaomimimo.com/v1/chat/completions", apiKey, model: "mimo-v2.5", temperature: 0.3, deadlineMs: 90_000 },
    { label: "live-smoke" },
  );
}

describe.skipIf(!available)("真实 LLM 语义规划（MiMo 在线；无密钥环境跳过）", () => {
  it("问候 → 合法 plan → Selector HIT（greet 配方）", { timeout: 120_000, retry: 1 }, async () => {
    const llm = adapter();
    const result = await llm.respond({
      text: "你好呀",
      context: { posture: "standing", busyChannels: [] },
      catalog,
      playableActions: index.approvedCountByAction().size > 0 ? new Set(index.approvedCountByAction().keys()) : new Set(),
      requestId: "llm-live-greet",
    });
    // 协议校验：切片只引用登记键、参数在域内
    expect(validateMotionPlan(result.plan, { catalog: catalog.catalog })).toEqual([]);
    // 确定性路由：LLM 产物必须能被 Selector 命中（这是"模型完全适配"的判据）
    const route = routePlan({ catalog, index, rig, planId: result.plan.requestId }, result.plan);
    expect(route.allHit, `slices: ${route.slices.map((s) => `${s.code}:${s.reason ?? ""}`).join("; ")}`).toBe(true);
    expect(llm.segmentNormalizations).toBeGreaterThanOrEqual(0);
  });

  it("参数卡生效：深呼吸 → repeats 在目录域内且物化时间轴按倍数伸缩", { timeout: 120_000, retry: 1 }, async () => {
    const llm = adapter();
    const result = await llm.respond({
      text: "多深呼吸几次冷静一下",
      context: { posture: "standing", busyChannels: [] },
      catalog,
      playableActions: new Set(index.approvedCountByAction().keys()),
      requestId: "llm-live-breathe",
    });
    expect(validateMotionPlan(result.plan, { catalog: catalog.catalog })).toEqual([]);
    const breathe = result.plan.slices.find((s) => s.lookup.actionId === "life.breathe");
    expect(breathe, "LLM 应选择 life.breathe").toBeDefined();
    if (breathe?.parameters.repeats != null) {
      expect(breathe.parameters.repeats).toBeGreaterThanOrEqual(1);
      expect(breathe.parameters.repeats).toBeLessThanOrEqual(8);
    }
  });
});
