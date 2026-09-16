/**
 * 异步语义规划适配器（MotionLibrary Spec v1.0 §1.1 / §3）：
 * 自然语言 + 机器可解析切片指令共同输出（MotionPlan）。
 * - RulePlanAdapter：离线确定性规则 → 登记逻辑键；零网络、零 LLM。
 * - LlmPlanAdapter：OpenAI 兼容 chat/completions；程序发放 requestId / 填充协议信封，
 *   LLM 只产出 reply/description/slices；陈旧目录版本、方向冲突做一次有界纠错请求，
 *   仍失败则明确报错（不悄悄播出）。可取消（AbortSignal）；密钥不进日志/记录。
 * 上游语义 LLM 的延迟单独计量（meta.latencyMs），与库命中的零增量 Author 调用分开统计。
 */
import type { ChannelId } from "../rig/rigProfile.js";
import type { CatalogView } from "../motion/library/catalog.js";
import type { MotionPlan, MotionSlice } from "../motion/library/contracts.js";
import { parseMotionPlan } from "../motion/library/contracts.js";
import { detectDirectionConflict, validateMotionPlan } from "../motion/library/validate.js";
import { LEGACY_EVENT_KEYS } from "../motion/library/legacyAdapter.js";

export interface PlanAdapterInput {
  text: string;
  context: { posture: "standing" | "seated"; busyChannels: ChannelId[] };
  catalog: CatalogView;
  /** 当前角色可播放动作族（能力投影；不让 LLM 把 planned 条目当可执行能力） */
  playableActions: ReadonlySet<string>;
  /** 程序发放；要求模型产物以切片形式组织，信封由程序填充 */
  requestId: string;
}

export interface PlanResult {
  reply: string;
  plan: MotionPlan;
  meta: { adapter: string; latencyMs: number; rounds: number; note?: string };
}

export interface MotionPlanAdapter {
  readonly name: string;
  respond(input: PlanAdapterInput, signal?: AbortSignal): Promise<PlanResult>;
}

export class PlanGenerationError extends Error {
  constructor(message: string, readonly reasonCode: string) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// 规则版：离线可用的确定性规划（真实 LLM 未配置时的运行时底座）
// ---------------------------------------------------------------------------

interface RuleEntry {
  keywords: string[];
  reply: string;
  keys: { actionId: string; variantId: string; segmentId: string; description: string; parameters?: Record<string, unknown> }[];
  /** 坐姿不可用的动作（沿用旧规则语义：站姿表达不硬塞进坐姿） */
  standingOnly?: boolean;
}

const RULES: RuleEntry[] = [
  {
    keywords: ["你好", "hi", "hello", "在吗"],
    reply: "你好呀！我在哦～",
    keys: [{ actionId: "routine.greet", variantId: "default", segmentId: "full", description: "挥手并向用户点头问候" }],
    standingOnly: true,
  },
  {
    keywords: ["深呼吸", "呼吸", "冷静"],
    reply: "呼——吸——，平静下来了～",
    keys: [{ actionId: "life.breathe", variantId: "subtle", segmentId: "full", description: "深呼吸起伏两轮", parameters: { repeats: 2 } }],
  },
  {
    keywords: ["厉害", "棒", "真棒", "praise"],
    reply: "嘿嘿，谢谢夸奖！",
    keys: [
      { actionId: "gesture.pump", variantId: "screen_right", segmentId: "full", description: "画面右臂庆祝挥拳" },
      { actionId: "reaction.happy", variantId: "small", segmentId: "full", description: "眯眼开心" },
    ],
  },
  { keywords: ["摸摸", "摸头", "拍拍"], reply: "最喜欢被摸头了～", keys: [{ actionId: "reaction.happy", variantId: "small", segmentId: "full", description: "被摸头开心" }] },
  { keywords: ["吓", "怕", "惊"], reply: "呀！吓我一跳！", keys: [{ actionId: "reaction.dizzy", variantId: "small", segmentId: "full", description: "晕乎乎反应" }] },
  { keywords: ["害羞", "讨厌", "坏"], reply: "讨厌啦……", keys: [{ actionId: "reaction.shy", variantId: "small", segmentId: "full", description: "低头害羞" }] },
  { keywords: ["为什么", "怎么", "？", "?"], reply: "唔……让我想想。", keys: [{ actionId: "head.tilt", variantId: "gentle.screen_right", segmentId: "full", description: "歪头思考" }] },
  {
    keywords: ["喝", "可乐", "渴"],
    reply: "可乐最好喝了！",
    keys: [{ actionId: "gesture.wave", variantId: "small.screen_right", segmentId: "full", description: "画面右侧手臂小幅挥手" }],
    standingOnly: true,
  },
];

export class RulePlanAdapter implements MotionPlanAdapter {
  readonly name: string = "rule-plan";

  async respond(input: PlanAdapterInput): Promise<PlanResult> {
    const started = Date.now();
    const text = input.text.toLowerCase();
    const seated = input.context.posture === "seated";
    let reply = "嗯嗯，我在听～";
    let keys: RuleEntry["keys"] = [];
    for (const rule of RULES) {
      if (rule.keywords.some((k) => text.includes(k))) {
        reply = rule.reply;
        keys = seated && rule.standingOnly ? [] : [...rule.keys];
        break;
      }
    }
    // 规则产物只引用当前目录真实登记的键；未登记的（全 planned 阶段）按 custom 语义输出，
    // 由 Selector 路由 MISS_CUSTOM——不伪装成库命中。
    const slices: MotionSlice[] = keys.map((k, i) => {
      const registered = input.catalog.variant(k.actionId, k.variantId) != null;
      return {
        sliceId: `s${i + 1}`,
        description: k.description,
        lookup: registered
          ? { actionId: k.actionId, variantId: k.variantId, segmentId: k.segmentId }
          : { actionId: "custom", variantId: "custom", segmentId: "full" },
        parameters: registered ? { ...(k.parameters ?? {}) } : {},
      };
    });
    const plan = this.envelope(input, slices, reply, text);
    return { reply, plan, meta: { adapter: this.name, latencyMs: Date.now() - started, rounds: 0 } };
  }

  protected envelope(input: PlanAdapterInput, slices: MotionSlice[], reply: string, description: string): MotionPlan {
    return {
      schemaVersion: "pliette.motion-plan/1.0",
      requestId: input.requestId,
      catalogRevision: input.catalog.revision,
      reply,
      description,
      slices,
    };
  }
}

// ---------------------------------------------------------------------------
// 真实 LLM 版：受限 JSON 协议 + 能力卡 + 有界纠错
// ---------------------------------------------------------------------------

export interface LlmPlanConfig {
  endpoint: string;
  apiKey: string;
  model: string;
  temperature?: number;
  /** 首轮总截止（ms）；语义规划属"单次可等待"交互 */
  deadlineMs?: number;
}

/** 语义规划的允许切片上限与协议一致（§3.3：0–16 个） */
const MAX_SLICES = 16;

export function buildPlanSystemPrompt(cards: string[]): string {
  return [
    "你是桌面角色的语义规划器。阅读用户消息，输出一个 JSON 对象：",
    '{"reply": string, "description": string, "slices": [...]}。',
    "reply=对用户说的话（可为空串）；description=整体动作说明（无动作时为空串且 slices=[]）。",
    "每个 slice 形状：{\"sliceId\":\"s1\",\"description\":\"…\",\"lookup\":{\"actionId\":\"…\",\"variantId\":\"…\",\"segmentId\":\"…\"},\"parameters\":{}}。",
    'segmentId 一律填 "full"（卡片未列其他片段的动作只有 full）。',
    "actionId/variantId/segmentId 只能取自下方动作目录卡片中登记的键；",
    "没有合适登记语义时用 {\"actionId\":\"custom\",\"variantId\":\"custom\",\"segmentId\":\"full\"} 并在 description 写完整说明。",
    "slices 按数组顺序执行，最多 " + MAX_SLICES + " 个；不要发明并行依赖；不要输出时间数值。",
    "parameters 只能使用卡片中登记的参数名；不确定就留空对象。",
    "只输出一个 JSON 对象：不要 markdown 围栏、不要注释、不要 JSON 之外的文字。",
    "",
    ...cards,
  ].join("\n");
}

interface ParsedModelPlan {
  reply?: unknown;
  description?: unknown;
  slices?: unknown;
}

export class LlmPlanAdapter extends RulePlanAdapter {
  readonly name: string;
  /** segmentId 空值归一化计数（诊断：模型输出完整性的观测口径） */
  segmentNormalizations = 0;

  constructor(
    private cfg: LlmPlanConfig,
    private opts: { fetchImpl?: typeof fetch; label?: string } = {},
  ) {
    super();
    this.name = `llm-plan(${cfg.model}${opts.label ? `@${opts.label}` : ""})`;
  }

  override async respond(input: PlanAdapterInput, signal?: AbortSignal): Promise<PlanResult> {
    const started = Date.now();
    const deadline = this.cfg.deadlineMs ?? 8000;
    const cards = input.catalog.capabilityCards({ playableActions: input.playableActions });
    const userContent = JSON.stringify({ text: input.text, posture: input.context.posture, busyChannels: input.context.busyChannels });
    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: buildPlanSystemPrompt(cards) },
      { role: "user", content: userContent },
    ];

    let rounds = 0;
    let lastIssues: string[] = [];
    // 最多一次有界纠错（§3.3 / §5.2：语义冲突最多一次纠错请求）
    for (let attempt = 0; attempt < 2; attempt++) {
      rounds = attempt + 1;
      const remaining = deadline - (Date.now() - started);
      if (remaining <= 0) throw new PlanGenerationError(`语义规划截止 ${deadline}ms 已到`, "GENERATION_TIMEOUT");
      const raw = await this.callModel(messages, remaining, signal);
      const candidate = this.toPlan(input, raw);
      if (candidate.ok) {
        const issues = [
          ...validateMotionPlan(candidate.plan, { catalog: input.catalog.catalog }).map((i) => `${i.code}: ${i.message}`),
          ...detectDirectionConflict(candidate.plan).map((i) => `${i.code}: ${i.message}`),
        ];
        if (issues.length === 0) {
          return { reply: candidate.plan.reply, plan: candidate.plan, meta: { adapter: this.name, latencyMs: Date.now() - started, rounds } };
        }
        lastIssues = issues;
      } else {
        lastIssues = [candidate.error];
      }
      // 纠错轮：把问题原样回给模型，要求修正
      messages.push({ role: "assistant", content: JSON.stringify(raw) });
      messages.push({
        role: "user",
        content: `你的输出存在以下问题，请修正后重新输出完整 JSON（仍然只输出 JSON）：\n${lastIssues.map((s) => `- ${s}`).join("\n")}`,
      });
    }
    throw new PlanGenerationError(`语义规划两次尝试未通过程序校验：${lastIssues.join("; ")}`, "SEMANTIC_CONFLICT");
  }

  /** 程序填充协议信封（schemaVersion/requestId/catalogRevision 由程序拥有，§3.3）。 */
  private toPlan(input: PlanAdapterInput, raw: unknown): { ok: true; plan: MotionPlan } | { ok: false; error: string } {
    if (typeof raw !== "object" || raw === null) return { ok: false, error: "模型输出不是对象" };
    const o = raw as ParsedModelPlan;
    if (typeof o.reply !== "string" || typeof o.description !== "string" || !Array.isArray(o.slices)) {
      return { ok: false, error: "缺少 reply/description/slices 字段或类型不符" };
    }
    if (o.slices.length > MAX_SLICES) return { ok: false, error: `slices ${o.slices.length} 超过 ${MAX_SLICES}` };
    // 确定性归一化：模型常把 segmentId 留空。仅当变体唯一登记片段就是 full 时补 full
    // （无第二种解释，不构成语义改写）；其余留待 validateMotionPlan 如实拒绝。
    let normalizedSegments = 0;
    const slices = (o.slices as MotionSlice[]).map((slice) => {
      if (slice.lookup.segmentId !== "") return slice;
      const variant = input.catalog.variant(slice.lookup.actionId, slice.lookup.variantId);
      if (variant && variant.segmentIds.length === 1 && variant.segmentIds[0] === "full") {
        normalizedSegments += 1;
        return { ...slice, lookup: { ...slice.lookup, segmentId: "full" } };
      }
      return slice;
    });
    if (normalizedSegments > 0) this.segmentNormalizations += normalizedSegments;
    const plan: MotionPlan = {
      schemaVersion: "pliette.motion-plan/1.0",
      requestId: input.requestId,
      catalogRevision: input.catalog.revision,
      reply: o.reply,
      description: o.description,
      slices,
    };
    const shape = parseMotionPlan(plan);
    if (shape.error || !shape.value) return { ok: false, error: shape.error ?? "形状不合法" };
    return { ok: true, plan: shape.value };
  }

  private async callModel(messages: { role: string; content: string }[], deadlineMs: number, signal?: AbortSignal): Promise<unknown> {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort);
    const timer = setTimeout(() => controller.abort(), deadlineMs);
    try {
      const doFetch = this.opts.fetchImpl ?? fetch.bind(globalThis);
      const res = await doFetch(this.cfg.endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${this.cfg.apiKey}` },
        body: JSON.stringify({
          model: this.cfg.model,
          temperature: this.cfg.temperature ?? 0.7,
          messages,
        }),
      });
      if (!res.ok) throw new PlanGenerationError(`HTTP ${res.status}`, "PROVIDER_ERROR");
      const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = body.choices?.[0]?.message?.content ?? "";
      const first = text.indexOf("{");
      const last = text.lastIndexOf("}");
      if (first < 0 || last <= first) throw new PlanGenerationError("响应不含 JSON 主体", "PROVIDER_ERROR");
      return JSON.parse(text.slice(first, last + 1));
    } catch (e) {
      if (e instanceof PlanGenerationError) throw e;
      if ((e as Error).name === "AbortError") throw new PlanGenerationError(`语义规划截止 ${deadlineMs}ms（从提交计时）`, "GENERATION_TIMEOUT");
      throw new PlanGenerationError(`语义规划请求失败：${(e as Error).message}`, "PROVIDER_ERROR");
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }
}

/** 适配器工厂：Lab/宿主注入 window.__llmConfig 时启用 LLM 版；否则规则版兜底。 */
export function createPlanAdapter(preferLlm: boolean): MotionPlanAdapter {
  if (preferLlm) {
    try {
      const cfg = (window as unknown as { __llmConfig?: LlmPlanConfig }).__llmConfig;
      if (cfg?.apiKey) return new LlmPlanAdapter(cfg);
    } catch {
      /* 非浏览器环境回退 */
    }
  }
  return new RulePlanAdapter();
}

/** 供宿主（Electron preload 等）在启动时注入已读配置（密钥只存宿主侧，不进前端资源）。 */
export function injectPlanLlmConfig(cfg: LlmPlanConfig | undefined): void {
  (window as unknown as { __llmConfig?: LlmPlanConfig }).__llmConfig = cfg;
}

// re-export：既有调用方从 dialogue 层取事件映射
export { LEGACY_EVENT_KEYS };
