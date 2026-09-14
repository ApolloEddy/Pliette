/**
 * PreparedMotion（MotionLibrary Spec v1.0 §8.2）：
 * "本次计划中已准备好可以尝试提交的一段动作"——会话临时，不可作为公共库存储。
 * 不携带可供 LLM 改写的 approved 标记；prepared 只表示"当前准备完成"，
 * 实际 commit 仍可能因外部状态改变而失败（commitPrepared 复核）。
 */
import type { MotionChannel } from "../library/contracts.js";

/** 精确执行时间轴（调度、buffer 与录像标记读取同一份，Spec §8.1） */
export interface ResolvedSchedule {
  /** 混入发生在内容前（使用边界姿态），不吞 stroke 帧 */
  mixInMs: number;
  /** 内容时间轴长度（变速后） */
  contentMs: number;
  /** 混出发生在内容后 */
  mixOutMs: number;
  /** 有效占用时长 = mixIn + content + mixOut */
  occupancyMs: number;
  /** 与前一单元共享的重叠窗（只播放一次；新增时长扣除，Spec §7.4） */
  overlapMs: number;
  playbackRate: number;
}

export interface PreparedMotion {
  /** 宿主分配：精确定位准备单元；不复用库动作身份作为实例身份 */
  preparedId: string;
  planId: string;
  sliceId: string;
  unitIndex: number;
  /** 命中预置时为空；生成时追溯请求 */
  generationRequestId: string | null;
  /** 角色语境身份；换模型/Skin/视图/外部干预时变化（Spec §6.4） */
  actorEpoch: number;
  profileDigest: string;
  /** 已确认计划前缀的哈希；自身计划推进不改变它（V11） */
  expectedPrefixHash: string;
  /** 冻结实现引用（库 motionId@revision 或临时候选） */
  sourceRef: { motionId: string; motionRevision: number; contentDigest: string } | { candidateRef: string };
  resolvedParameters: Record<string, unknown>;
  /** 本地编译对象（宿主类型：CompiledMotion / 库曲线句柄）；commitPrepared 原样交给播放钩子 */
  compiledHandle: unknown;
  /** 由验证器派生，供 Scheduler 原子申请 */
  writes: string[];
  channels: MotionChannel[];
  resources: string[];
  /** 官方运行时预测的进入/退出边界与离散前提 */
  entryBoundary: string;
  exitBoundary: string;
  /** 预测结束状态摘要（连续相位用前段采样结果衔接，Spec §6.4） */
  expectedState: string;
  resolvedSchedule: ResolvedSchedule;
  /** 去重 overlap 后的可新增可播放时长 */
  newPlayableMs: number;
  /** 准备完成时刻（单调时钟） */
  readyAtMonoMs: number;
  /** 播放时效截止；不使用已结束生成任务的旧截止（Spec §6.3） */
  playbackDeadlineMonoMs: number;
  /** 验证证据引用 */
  validationReportRef: string | null;
  /** 缓存 pin 与准确回收标识 */
  disposalToken: string;
}

export interface ResolvedScheduleInput {
  mixInMs?: number;
  contentMs: number;
  mixOutMs?: number;
  overlapMs?: number;
  playbackRate?: number;
}

/** 按统一归一规则折算时间轴（Spec §8.1：有效占用 = mixIn + content/rate + mixOut）。 */
export function resolveSchedule(input: ResolvedScheduleInput): ResolvedSchedule {
  const rate = input.playbackRate ?? 1;
  const mixInMs = input.mixInMs ?? 0;
  const mixOutMs = input.mixOutMs ?? 0;
  const contentMs = Math.round(input.contentMs / rate);
  const overlapMs = input.overlapMs ?? 0;
  return { mixInMs, contentMs, mixOutMs, overlapMs, playbackRate: rate, occupancyMs: mixInMs + contentMs + mixOutMs };
}

/** 新增可播放时长：内容时长扣除与相邻单元的重复 overlap（重复部分只播放一次，Spec §7.4）。 */
export function newPlayableMs(schedule: ResolvedSchedule): number {
  return Math.max(0, schedule.contentMs - schedule.overlapMs);
}
