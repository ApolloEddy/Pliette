/**
 * AuthorTask 装配（MotionLibrary Spec v1.0 §6.1）：
 * 本地构造生成任务——原 MotionPlan 切片、通道控制子集、目标时长、边界上下文与关联身份。
 * 该对象是宿主协调信息；严格 V1.1 请求包仍由 assembleRequest 产出（单一来源）。
 */
import type { ControlProfile } from "../../rig/controlProfile.js";
import type { MotionSlice } from "../library/contracts.js";
import { budgetFor, type BudgetProfileName, type GenerationBudget } from "./protocol.js";

export interface AuthorTask {
  /** 隔离迟到结果的令牌：清理必须比较它（V09） */
  taskToken: string;
  planId: string;
  sliceId: string;
  unitIndex: number;
  /** 生成请求身份（程序发放） */
  requestId: string;
  contextId: string;
  /** 切片自然语言 + 精确动作键 + 不能省略的要求 */
  goal: string;
  /** 只来自当前模型、当前任务允许的控制子集；依赖说明不增加可写权限 */
  controlSubset: string[];
  budget: GenerationBudget;
  /** 首尾边界与前后动作摘要（独立标记的生成上下文；程序另行保存同份结构化边界） */
  boundaryContext: {
    entry?: string;
    exit?: string;
    previousSummary?: string;
    planSummary?: string;
  };
  profileName: BudgetProfileName;
}

let taskSeq = 0;

export interface AssembleTaskOptions {
  planId: string;
  slice: MotionSlice;
  unitIndex: number;
  /** 通道 → 控制子集从当前档案派生；缺省=全部开放控制 */
  channels?: string[];
  budgetProfile?: BudgetProfileName;
  /** 覆盖预算字段（仍以命名档案为底，不允许游离的第三份来源） */
  budgetOverride?: Partial<GenerationBudget>;
  boundaryContext?: AuthorTask["boundaryContext"];
  requestIdPrefix?: string;
}

export function assembleAuthorTask(profile: ControlProfile, opts: AssembleTaskOptions): AuthorTask {
  const profileName = opts.budgetProfile ?? "interaction";
  const channels = new Set(opts.channels ?? []);
  const controlSubset = profile.controls
    .filter((c) => channels.size === 0 || channels.has(c.channel))
    .map((c) => c.controlId);
  const lookup = opts.slice.lookup;
  const key = lookup.actionId === "custom" ? "custom（未登记语义）" : `${lookup.actionId} / ${lookup.variantId} / ${lookup.segmentId}`;
  const goal = [
    `动作要求：${opts.slice.description}`,
    `精确动作键：${key}`,
    opts.slice.durationHintMs != null ? `目标时长约 ${opts.slice.durationHintMs}ms（软意图；不得牺牲进入/退出边界凑数字）` : "",
    "硬性要求：动作完整覆盖进入与退出（首尾回到参考边界）；不得停在与基础层冲突的中间姿态。",
  ]
    .filter(Boolean)
    .join("\n");
  taskSeq += 1;
  return {
    taskToken: `task-${taskSeq}-${Math.random().toString(36).slice(2, 8)}`,
    planId: opts.planId,
    sliceId: opts.slice.sliceId,
    unitIndex: opts.unitIndex,
    requestId: `${opts.requestIdPrefix ?? "author"}-${taskSeq}-${Date.now().toString(36)}`,
    contextId: `ctx-${taskSeq}-${Date.now().toString(36)}`,
    goal,
    controlSubset,
    budget: { ...budgetFor(profileName), ...opts.budgetOverride },
    boundaryContext: opts.boundaryContext ?? {},
    profileName,
  };
}
