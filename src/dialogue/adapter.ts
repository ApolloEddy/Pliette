/**
 * 对话适配器（Spec 11 / P4）：对话文本 → 行为意图（Select 模式）。
 * 两种实现共用同一接口：RuleSelectAdapter（离线规则，立即可用）与
 * LlmSelectAdapter（真实 LLM，需用户配置密钥——密钥只存宿主/本地配置，不进前端资源）。
 */
import type { ChannelId } from "../rig/rigProfile.js";

export interface DialogueInput {
  text: string;
  /** 当前情境（Spec 11.1：LLM 接收精简情境，不接收骨架每帧状态） */
  context: { posture: "standing" | "seated"; busyChannels: ChannelId[] };
}

export interface DialogueResponse {
  reply: string;
  /** 行为配方事件（映射到 EVENT_RECIPES） */
  events: string[];
  /** 直接手势（可选） */
  gestures?: { action: string; hand?: "left" | "right" | "auto" }[];
}

export interface DialogueAdapter {
  readonly name: string;
  respond(input: DialogueInput): DialogueResponse;
}

/** 关键词规则版：离线可用的 Select 实现（真实 LLM 接入前的运行时底座） */
export class RuleSelectAdapter implements DialogueAdapter {
  readonly name = "rule-select";

  private static RECIPES: { keywords: string[]; reply: string; events: string[] }[] = [
    { keywords: ["你好", "hi", "hello", "在吗"], reply: "你好呀！我在哦～", events: ["greet"] },
    { keywords: ["厉害", "棒", "真棒", "好棒", "praise"], reply: "嘿嘿，谢谢夸奖！", events: ["praise"] },
    { keywords: ["摸摸", "摸头", "拍拍"], reply: "最喜欢被摸头了～", events: ["pet"] },
    { keywords: ["吓", "怕", "惊"], reply: "呀！吓我一跳！", events: ["scare"] },
    { keywords: ["害羞", "讨厌", "坏"], reply: "讨厌啦……", events: ["tease"] },
    { keywords: ["为什么", "怎么", "？", "?"], reply: "唔……让我想想。", events: ["question"] },
    { keywords: ["喝", "可乐", "渴"], reply: "可乐最好喝了！", events: ["drink"] },
  ];

  respond(input: DialogueInput): DialogueResponse {
    const text = input.text.toLowerCase();
    const posture = input.context?.posture ?? "standing";
    for (const r of RuleSelectAdapter.RECIPES) {
      if (r.keywords.some((k) => text.includes(k))) {
        // 坐姿时不用需要站姿的表达（Spec 11.1 情境参与可行性判断）
        const events = posture === "seated" && (r.events.includes("wave") || r.events.includes("pump"))
          ? r.events.filter((e) => e !== "wave" && e !== "pump")
          : r.events;
        return { reply: r.reply, events: events.length ? events : ["ambient"] };
      }
    }
    return { reply: "嗯嗯，我在听～", events: ["ambient"] };
  }
}

export interface LlmConfig {
  endpoint: string;
  apiKey: string;
  model: string;
}

/** 真实 LLM 版骨架：接口就绪，等用户配置 provider/key 后即可切换（Select 层不变）。 */
export class LlmSelectAdapter implements DialogueAdapter {
  readonly name = "llm-select";

  constructor(private cfg: LlmConfig) {}

  respond(input: DialogueInput): DialogueResponse {
    throw new Error(
      "LlmSelectAdapter 尚未配置可用服务。请在 config/llm.local.json 填入 endpoint/apiKey/model（该文件已 gitignore，密钥不入库）。当前可先用 rule-select。",
    );
  }

  /** 预留：真实实现为受限 JSON 请求（能力表+情境+允许事件枚举，Spec 11.1），此处仅示契约 */
  static systemPrompt(): string {
    return [
      "你是桌面角色的行为决策器。根据对话与情境，从允许事件中选择 0-2 个：",
      "greet, praise, pet, scare, tease, question, drink, ambient",
      "只输出 JSON: {\"reply\": string, \"events\": string[]}。不输出其他内容。",
    ].join("\n");
  }
}

export function createDialogueAdapter(preferLlm: boolean): DialogueAdapter {
  if (preferLlm) {
    try {
      // Lab 浏览器环境：由宿主（Electron preload/本地服务）注入配置；纯浏览器下不可用时回退规则版
      const cfg = (window as unknown as { __llmConfig?: LlmConfig }).__llmConfig;
      if (cfg?.apiKey) return new LlmSelectAdapter(cfg);
    } catch {
      /* 回退 */
    }
  }
  return new RuleSelectAdapter();
}
