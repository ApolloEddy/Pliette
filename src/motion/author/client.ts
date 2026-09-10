/**
 * 受限在线 Author 客户端（指导书 Spec 8.4 / 10.3 / 11.2）：
 * - LlmAuthorClient：OpenAI 兼容 chat/completions，JSON 输出；请求截止从提交计时（非首 token）；
 *   超过字节上限或截断的响应视为失败（OUTPUT_TRUNCATED）；不记录 API 密钥。
 * - MockAuthorClient：确定性候选（域内模板按 goal 关键词选择），用于管线工程验收与 A/B/C 骨架；
 *   不冒充真实 LLM 测量（Spec 11.2）。
 * - importCandidateFile：候选文件导入（Spec 13-M2：先本地候选，再接已配置 LLM）。
 */
import type { ControlProfile } from "../../rig/controlProfile.js";
import { diag, type AuthorFinding } from "./diagnostics.js";
import type { AuthorResponse, GuideRequest } from "./protocol.js";
import { parseAuthorResponse } from "./protocol.js";

export interface AuthorClient {
  readonly name: string;
  /** 发送一次受限生成请求；返回原始文本与字节量（校验层负责语义）。 */
  generate(request: GuideRequest, profile: ControlProfile): Promise<{ text: string; bytes: number; raw: unknown; meta: Record<string, unknown> }>;
}

export class DeadlineExceededError extends Error {}
export class TruncatedOutputError extends Error {}

/** 渲染系统提示：只描述协议与边界；模型知识与数值范围来自请求包（单一来源）。 */
export function buildSystemPrompt(profile: ControlProfile): string {
  return [
    "你是桌面角色的受限动作创作者。根据用户消息中的请求 JSON（goal、runtimeState、availableControls），",
    "输出一个 JSON 对象作为响应。响应必须是下面三种形状之一（字段名一字不差，全部必需）：",
    '1. {"status":"motion","requestId":"<原样回传>","contextId":"<原样回传>","profileDigest":"<原样回传>","draft":{...}}',
    '2. {"status":"unsupported","requestId":"…","contextId":"…","profileDigest":"…","reasonCode":"…","details":"…"}',
    '3. {"status":"needs_context","requestId":"…","contextId":"…","profileDigest":"…","requestedCapabilities":["…"],"details":"…"}',
    "draft 形状：{\"schemaVersion\":\"pliette.motion-draft/1.1\",\"id\":\"…\",\"durationSec\":<有限正数>,\"curves\":[...]}，",
    "每条 curve：{\"controlId\":\"<只能取自 availableControls>\",\"keys\":[{\"timeSec\":<秒>,\"value\":<值>,\"ease\":\"linear\"|\"smooth\"}]}；",
    "首键 timeSec=0、末键 timeSec=durationSec（末键不带 ease）；每曲线 2~6 键；数值控制 value=数字，向量控制 value=[x,y]，枚举控制 value=字符串且只允许枚举集合内；附件/枚举段 ease 一律 \"stepped\"。",
    "requestId、contextId、profileDigest 三项必须从请求 JSON 原样复制到响应，不得省略或改名。",
    "两个最易犯的硬错误：① 最后一个 key 绝不带 ease 字段；② 最后一个 key 的 timeSec 必须恰好等于 durationSec。",
    "规范小示例（仅示意形状，数值必须来自请求）：",
    '{"status":"motion","requestId":"r1","contextId":"c1","profileDigest":"fnv1a64-xx","draft":{"schemaVersion":"pliette.motion-draft/1.1","id":"d1","durationSec":1.0,"curves":[{"controlId":"<请求提供的id>","keys":[{"timeSec":0,"value":0,"ease":"smooth"},{"timeSec":0.5,"value":10,"ease":"smooth"},{"timeSec":1.0,"value":0}]}]}}',
    "不确定就返回 unsupported（reasonCode 简短英文标识）；缺信息就返回 needs_context——不要猜参数。",
    "只输出一个 JSON 对象：不要 markdown 代码围栏、不要注释、不要 JSON 之外的任何文字。",
  ].join("\n");
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string }; finish_reason?: string }[];
  model?: string;
  usage?: { total_tokens?: number };
}

/** 剥离 markdown 代码围栏（```json … ```），并截取首个 { 到最后一个 } 的 JSON 主体。 */
export function stripCodeFence(text: string): string {
  let t = text.trim();
  const fence = t.match(/^```[a-zA-Z]*\s*\n([\s\S]*?)\n?```$/);
  if (fence) t = fence[1].trim();
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first >= 0 && last > first) t = t.slice(first, last + 1);
  return t;
}

export class LlmAuthorClient implements AuthorClient {
  readonly name: string;
  private controller: AbortController | null = null;

  constructor(
    private cfg: { endpoint: string; apiKey: string; model: string; temperature?: number; reasoningEffort?: string },
    private opts: { deadlineMs: number; maxBytes: number; fetchImpl?: typeof fetch; label?: string } ,
  ) {
    this.name = `llm-author(${cfg.model}${opts.label ? `@${opts.label}` : ""})`;
  }

  /** 取消当前请求（请求方主动）。 */
  cancel(): void {
    this.controller?.abort();
  }

  async generate(request: GuideRequest, profile: ControlProfile): Promise<{ text: string; bytes: number; raw: unknown; meta: Record<string, unknown> }> {
    const started = Date.now();
    this.controller = new AbortController();
    const timer = setTimeout(() => this.controller?.abort(), this.opts.deadlineMs);
    const buildBody = (useJsonMode: boolean) =>
      JSON.stringify({
        model: this.cfg.model,
        temperature: this.cfg.temperature ?? 0.7,
        max_tokens: request.generationBudget.maxOutputTokens,
        ...(this.cfg.reasoningEffort ? { reasoning_effort: this.cfg.reasoningEffort } : {}),
        ...(useJsonMode ? { response_format: { type: "json_object" } } : {}),
        messages: [
          { role: "system", content: buildSystemPrompt(profile) },
          { role: "user", content: JSON.stringify(request) },
        ],
      });
    try {
      const doFetch = this.opts.fetchImpl ?? fetch.bind(globalThis);
      let res = await doFetch(this.cfg.endpoint, {
        method: "POST",
        signal: this.controller.signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${this.cfg.apiKey}` },
        body: buildBody(true),
      });
      if (!res) throw new Error("fetch 不可用");
      // 部分兼容端点不支持 response_format：回退普通模式重试一次（仍在同一截止内）
      if (res.status === 400) {
        const errText = await res.text();
        if (/response_format|json_object/i.test(errText)) {
          res = await doFetch(this.cfg.endpoint, {
            method: "POST",
            signal: this.controller.signal,
            headers: { "content-type": "application/json", authorization: `Bearer ${this.cfg.apiKey}` },
            body: buildBody(false),
          });
        } else {
          throw new Error(`HTTP 400: ${errText.slice(0, 200)}`);
        }
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as ChatCompletionResponse;
      const text = body.choices?.[0]?.message?.content ?? "";
      const bytes = new TextEncoder().encode(text).length;
      const finish = body.choices?.[0]?.finish_reason;
      if (bytes > this.opts.maxBytes || finish === "length") {
        throw new TruncatedOutputError(`响应 ${bytes}B 超上限或被截断（finish=${finish}）`);
      }
      let raw: unknown = null;
      try {
        raw = JSON.parse(stripCodeFence(text));
      } catch {
        throw new TruncatedOutputError("响应不是完整 JSON（截断、围栏或夹带文本）");
      }
      return {
        text,
        bytes,
        raw,
        meta: { model: body.model, finish, tokens: body.usage?.total_tokens, latencyMs: Date.now() - started },
      };
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        throw new DeadlineExceededError(`请求截止 ${this.opts.deadlineMs}ms（从提交计时）`);
      }
      throw e;
    } finally {
      clearTimeout(timer);
      this.controller = null;
    }
  }
}

/**
 * Mock 作者：按 goal 关键词返回确定性域内候选（模板走同一协议）。
 * 用途：管线工程验收 / A/B/C 骨架联调 / 浸泡。明确不是 LLM 实测（Spec 11.2）。
 */
export class MockAuthorClient implements AuthorClient {
  readonly name = "mock-author(deterministic)";

  constructor(private latencyMs = 0) {}

  async generate(request: GuideRequest, _profile: ControlProfile): Promise<{ text: string; bytes: number; raw: unknown; meta: Record<string, unknown> }> {
    if (this.latencyMs > 0) await new Promise((r) => setTimeout(r, this.latencyMs));
    const draft = mockDraftFor(request);
    const text = JSON.stringify(draft);
    return { text, bytes: new TextEncoder().encode(text).length, raw: draft, meta: { model: "mock", latencyMs: this.latencyMs } };
  }
}

/** 域内模板：等待/点头/挥手/倾身/眨眼（controlId 与拉菲档案一致；域内取值）。 */
function mockDraftFor(request: GuideRequest): AuthorResponse {
  const goal = request.goal;
  const has = (c: string) => request.availableControls.some((x) => x.controlId === c);
  const d = { schemaVersion: "pliette.motion-draft/1.1", id: `mock-${Date.now().toString(36)}` };
  const mk = (curves: object[], durationSec = 1.2): AuthorResponse =>
    ({
      status: "motion",
      requestId: request.requestId,
      contextId: request.contextId,
      profileDigest: request.profileRef.profileDigest,
      draft: { ...d, durationSec, curves },
    }) as unknown as AuthorResponse;
  const ease = "smooth" as const;
  const curve = (controlId: string, pairs: [number, number | [number, number]][]) => ({
    controlId,
    keys: pairs.map(([t, v], i) => ({ timeSec: t, value: v, ...(i < pairs.length - 1 ? { ease } : {}) })),
  });
  if (/(眨|wink|blink)/.test(goal) && has("face.eyes.pair")) {
    return mk([{ controlId: "face.eyes.pair", keys: [
      { timeSec: 0, value: "open", ease: "stepped" },
      { timeSec: 0.15, value: "blink", ease: "stepped" },
      { timeSec: 0.3, value: "open" },
      { timeSec: 0.6, value: "open" },
    ] }], 0.6);
  }
  if (/晕|dizzy/.test(goal) && has("face.eyes.pair") && has("torso.lean")) {
    return mk([
      { controlId: "face.eyes.pair", keys: [
        { timeSec: 0, value: "dizzy", ease: "stepped" },
        { timeSec: 0.8, value: "dizzy" },
      ] },
      curve("torso.lean", [[0, 0], [0.25, 6], [0.5, -6], [0.8, 0]]),
    ], 0.8);
  }
  if (/张开|展臂|open arms/.test(goal) && has("arm.right.raise") && has("arm.left.raise")) {
    return mk([
      curve("arm.left.raise", [[0, 0], [0.35, 45], [0.8, 45], [1.2, 0]]),
      curve("arm.right.raise", [[0, 0], [0.35, 30], [0.8, 30], [1.2, 0]]),
    ]);
  }
  if (/点头|nod/.test(goal) && has("head.nod")) {
    return mk([curve("head.nod", [[0, 0], [0.3, 10], [0.6, 2], [0.9, 10], [1.2, 0]])]);
  }
  if (/挥手|wave|招手/.test(goal) && has("arm.right.raise")) {
    return mk([curve("arm.right.raise", [[0, 0], [0.3, 45], [0.6, 30], [0.9, 48], [1.2, 0]])]);
  }
  if (/倾身|倾听|lean/.test(goal) && has("torso.lean") && has("head.nod")) {
    return mk([curve("torso.lean", [[0, 0], [0.4, 8], [0.9, 8], [1.2, 0]]), curve("head.nod", [[0, 0], [0.4, -4], [0.9, -4], [1.2, 0]])]);
  }
  if (/呼吸|待机|idle/.test(goal) && has("torso.bob")) {
    return mk([curve("torso.bob", [[0, [0, 0]], [0.6, [0, 0.008]], [1.2, [0, 0]]])], 1.2);
  }
  return {
    status: "unsupported",
    requestId: request.requestId,
    contextId: request.contextId,
    profileDigest: request.profileRef.profileDigest,
    reasonCode: "mock_no_template",
    details: `Mock 无 goal="${goal}" 的模板（LLM 未接入；接入后由模型判断）`,
  } as AuthorResponse;
}

/** 候选文件导入：读取 V1.1 响应 JSON（语义校验交给 validateCandidate）。 */
export function importCandidateFile(text: string): { raw?: unknown; error?: AuthorFinding } {
  try {
    const raw = JSON.parse(text);
    const parsed = parseAuthorResponse(raw);
    if (parsed.error || !parsed.response) {
      return { error: diag({ code: "INVALID_TIMELINE", stage: "response", recoverable: true, message: parsed.error ?? "结构不合法" }) };
    }
    return { raw };
  } catch (e) {
    return { error: diag({ code: "OUTPUT_TRUNCATED", stage: "response", recoverable: true, message: `JSON 解析失败：${(e as Error).message}` }) };
  }
}
