/**
 * 候选验证管线（指导书 Spec 9.1 七步顺序）：
 * 1 响应完整性/身份回显 → 2 控制能力 → 3 类型/数值/时间/阶段/数量/缓动 →
 * 4 真实写集与冲突（规则解释器） → 5+6 编译与隔离采样 → 7 提交前状态复核（调度器负责）。
 * 全部确定性；任何失败诊断都给出实际失败点（Spec 10.2）。
 */
import type { ControlProfile } from "../../rig/controlProfile.js";
import { openControls } from "../../rig/controlProfile.js";
import { compileDraft, type CompiledMotion } from "../compiler/compile.js";
import type { spine36 as spine } from "spine-webgl";
import type { RigProfile } from "../../rig/rigProfile.js";
import { LAFEI_8_FRONT_CANDIDATES, SPINEBOY_BINDINGS } from "../../rig/rigProfile.js";
import { parseAuthorResponse, DEFAULT_BUDGET, type AuthorResponse, type GuideRequest, type GenerationBudget } from "./protocol.js";
import { diag, hasFailures, type AuthorFinding } from "./diagnostics.js";
import { evaluateRules } from "./rules.js";
import { translateDraft } from "./translate.js";
import { sampleTrajectory, type SampleOptions } from "./sample.js";

export interface ValidateOptions {
  budget?: GenerationBudget;
  /** 允许的输出字节上限（截断即失败，Spec 8.4） */
  rawBytes?: number;
  /** 隔离采样参数 */
  sample?: SampleOptions;
  /** 提供 skeletonData 时执行编译+采样（步骤 5/6） */
  skeletonData?: spine.SkeletonData;
  /** 档案 → RigProfile 绑定（缺省走 registerProfileBinding 注册表） */
  rig?: RigProfile;
}

/** 档案 profileId → RigProfile 注册表（M4：第二骨架注册自己的绑定）。 */
const rigRegistry = new Map<string, RigProfile>();
export function registerProfileBinding(profileId: string, rig: RigProfile): void {
  rigRegistry.set(profileId, rig);
}
export function resolveRig(profileId: string): RigProfile | undefined {
  return rigRegistry.get(profileId);
}

// 默认注册：拉菲（主角色）与 spineboy（第二骨架，官方示例）
registerProfileBinding("lafei_8.front.cp1", LAFEI_8_FRONT_CANDIDATES);
registerProfileBinding("spineboy.front.cp1", SPINEBOY_BINDINGS);

export interface ValidatedCandidate {
  ok: boolean;
  findings: AuthorFinding[];
  compiled?: CompiledMotion;
  /** status=motion 且通过全部检查时为内部 MotionDraft（已编译） */
  response?: AuthorResponse;
}

/** 步骤 1：响应结构与身份回显。返回归一化的响应或失败集。 */
function checkResponseEnvelope(raw: unknown, request: GuideRequest, rawBytes: number | undefined): { findings: AuthorFinding[]; response?: AuthorResponse } {
  const findings: AuthorFinding[] = [];
  if (rawBytes != null && rawBytes > request.generationBudget.maxOutputBytes) {
    findings.push(diag({
      code: "OUTPUT_TRUNCATED",
      stage: "response",
      requestId: request.requestId,
      expected: `≤ ${request.generationBudget.maxOutputBytes} 字节`,
      actual: `${rawBytes} 字节`,
      recoverable: true,
      message: "响应超过输出字节上限（Spec 8.4：截断响应视为失败）",
    }));
    return { findings };
  }
  const parsed = parseAuthorResponse(raw);
  if (parsed.error || !parsed.response) {
    findings.push(diag({
      code: "INVALID_TIMELINE",
      stage: "response",
      requestId: request.requestId,
      expected: "严格判别联合响应",
      actual: parsed.error ?? "结构不合法",
      recoverable: true,
      message: "响应结构不合法",
    }));
    return { findings };
  }
  const r = parsed.response;
  if (r.requestId !== request.requestId || r.contextId !== request.contextId || r.profileDigest !== request.profileRef.profileDigest) {
    findings.push(diag({
      code: "PROFILE_MISMATCH",
      stage: "identity",
      requestId: request.requestId,
      expected: `requestId=${request.requestId} contextId=${request.contextId} digest=${request.profileRef.profileDigest}`,
      actual: `requestId=${r.requestId} contextId=${r.contextId} digest=${r.profileDigest}`,
      recoverable: false,
      message: "响应身份回显与请求不一致（候选必须原样回传，Spec 8.1）",
    }));
    return { findings };
  }
  return { findings, response: r };
}

/** 步骤 2-6：motion 候选的完整校验（控制/数值/时间线/规则/编译/采样）。 */
function checkMotionDraft(response: AuthorResponse, request: GuideRequest, profile: ControlProfile, opts: ValidateOptions): { findings: AuthorFinding[]; compiled?: CompiledMotion } {
  const findings: AuthorFinding[] = [];
  let compiled: CompiledMotion | undefined;
  if (response.status !== "motion") return { findings }; // unsupported / needs_context：无曲线可验

  const draft = response.draft;
  const budget = opts.budget ?? request.generationBudget ?? DEFAULT_BUDGET;
  const requestId = response.requestId;

  // ---- 步骤 2：控制能力 ----
  const open = openControls(profile);
  const openIds = new Set(open.map((c) => c.controlId));
  const allowedIds = new Set(request.availableControls.map((c) => c.controlId));
  const byId = new Map(profile.controls.map((c) => [c.controlId, c]));

  // ---- 步骤 3：类型/数值/时间/阶段/数量/缓动 ----
  if (typeof draft.durationSec !== "number" || !Number.isFinite(draft.durationSec) || draft.durationSec <= 0) {
    findings.push(diag({ code: "INVALID_VALUE", stage: "value", requestId, draftId: draft.id, expected: "有限正数", actual: String(draft.durationSec), recoverable: true, message: "durationSec 非法" }));
  } else if (draft.durationSec < budget.minDurationSec - 1e-9 || draft.durationSec > budget.maxDurationSec + 1e-9) {
    findings.push(diag({ code: "RANGE_VIOLATION", stage: "value", requestId, draftId: draft.id, expected: `[${budget.minDurationSec}, ${budget.maxDurationSec}]s`, actual: `${draft.durationSec}s`, recoverable: true, message: "时长超出请求预算" }));
  }
  if (!Array.isArray(draft.curves) || draft.curves.length === 0) {
    findings.push(diag({ code: "INVALID_TIMELINE", stage: "timeline", requestId, draftId: draft.id, expected: "≥1 条曲线", actual: `${draft.curves?.length ?? 0}`, recoverable: true, message: "curves 缺失或为空" }));
    return { findings };
  }
  if (draft.curves.length > budget.maxControls) {
    findings.push(diag({ code: "INVALID_TIMELINE", stage: "timeline", requestId, draftId: draft.id, expected: `≤${budget.maxControls} 控制器`, actual: `${draft.curves.length}`, recoverable: true, message: "控制器数量超预算" }));
  }
  const seen = new Set<string>();
  let totalKeys = 0;
  for (const curve of draft.curves) {
    const cid = curve.controlId;
    const label = cid;
    if (!byId.has(cid)) {
      findings.push(diag({ code: "UNKNOWN_CONTROL", stage: "control", requestId, draftId: draft.id, controlId: cid, expected: "档案中存在的控制", actual: "未知", recoverable: false, message: `控制 ${label} 不存在——写陌生控制名不会获得访问权` }));
      continue;
    }
    if (!openIds.has(cid) || !allowedIds.has(cid)) {
      findings.push(diag({ code: "UNVERIFIED_CONTROL", stage: "control", requestId, draftId: draft.id, controlId: cid, expected: "开放且在本次请求列表中", actual: byId.get(cid)!.status, recoverable: false, message: `控制 ${label} 未开放（status=${byId.get(cid)!.status}）或不在 availableControls` }));
      continue;
    }
    if (seen.has(cid)) {
      findings.push(diag({ code: "INVALID_TIMELINE", stage: "timeline", requestId, draftId: draft.id, controlId: cid, expected: "同一控制一条曲线", actual: "重复", recoverable: true, message: `控制 ${label} 被多条曲线重复引用` }));
    }
    seen.add(cid);

    const def = byId.get(cid)!;
    const keys = curve.keys ?? [];
    totalKeys += keys.length;
    if (keys.length < 2 || keys.length > budget.maxKeysPerCurve) {
      findings.push(diag({ code: "INVALID_TIMELINE", stage: "timeline", requestId, draftId: draft.id, controlId: cid, expected: `2~${budget.maxKeysPerCurve} 键`, actual: `${keys.length}`, recoverable: true, message: `曲线 ${label} 关键帧数超预算` }));
    }
    if (keys.length >= 2) {
      if (keys[0].timeSec !== 0) {
        findings.push(diag({ code: "INVALID_TIMELINE", stage: "timeline", requestId, draftId: draft.id, controlId: cid, expected: "首键 timeSec=0", actual: String(keys[0].timeSec), recoverable: true, message: `曲线 ${label} 首键必须为 0` }));
      }
      if (Math.abs(keys[keys.length - 1].timeSec - draft.durationSec) > 1e-9) {
        findings.push(diag({ code: "INVALID_TIMELINE", stage: "timeline", requestId, draftId: draft.id, controlId: cid, expected: `末键=durationSec(${draft.durationSec})`, actual: String(keys[keys.length - 1].timeSec), recoverable: true, message: `曲线 ${label} 末键必须收在时长处` }));
      }
      for (let i = 1; i < keys.length; i++) {
        if (!(keys[i].timeSec > keys[i - 1].timeSec)) {
          findings.push(diag({ code: "INVALID_TIMELINE", stage: "timeline", requestId, draftId: draft.id, controlId: cid, expected: "严格递增", actual: `${keys[i - 1].timeSec}→${keys[i].timeSec}`, recoverable: true, affectedTimeRange: [keys[i - 1].timeSec, keys[i].timeSec], message: `曲线 ${label} 时间非严格递增` }));
        }
      }
      if (keys[keys.length - 1].ease != null) {
        findings.push(diag({ code: "INVALID_TIMELINE", stage: "timeline", requestId, draftId: draft.id, controlId: cid, expected: "末键无 ease", actual: String(keys[keys.length - 1].ease), recoverable: true, message: `曲线 ${label} 末键携带无效 ease` }));
      }
    }
    // 值类型与有限性（按控制输入类型）
    for (const k of keys) {
      if (def.input.type === "enum") {
        if (typeof k.value !== "string" || !(def.input.enumValues ?? []).includes(k.value)) {
          findings.push(diag({ code: "INVALID_VALUE", stage: "value", requestId, draftId: draft.id, controlId: cid, expected: `enum [${(def.input.enumValues ?? []).join("/")}]`, actual: JSON.stringify(k.value), recoverable: true, message: `控制 ${label} 的值不在允许枚举内` }));
        }
        if (k.ease != null && k.ease !== "stepped") {
          findings.push(diag({ code: "INVALID_TIMELINE", stage: "timeline", requestId, draftId: draft.id, controlId: cid, expected: "stepped", actual: String(k.ease), recoverable: true, message: `附件/枚举曲线只允许 stepped（Spec 8.2）` }));
        }
      } else if (def.input.type === "scalar") {
        if (typeof k.value !== "number" || !Number.isFinite(k.value)) {
          findings.push(diag({ code: "INVALID_VALUE", stage: "value", requestId, draftId: draft.id, controlId: cid, expected: "有限数值", actual: JSON.stringify(k.value), recoverable: true, message: `控制 ${label} 需要标量数值` }));
        }
      } else {
        if (!Array.isArray(k.value) || k.value.length !== 2 || !k.value.every((x) => typeof x === "number" && Number.isFinite(x))) {
          findings.push(diag({ code: "INVALID_VALUE", stage: "value", requestId, draftId: draft.id, controlId: cid, expected: "[x, y] 有限数值", actual: JSON.stringify(k.value), recoverable: true, message: `控制 ${label} 需要二元向量` }));
        }
      }
      if (def.binding.property !== "attachment" && k.ease === "stepped") {
        findings.push(diag({ code: "INVALID_TIMELINE", stage: "timeline", requestId, draftId: draft.id, controlId: cid, expected: "linear|smooth", actual: "stepped", recoverable: true, affectedTimeRange: [k.timeSec, k.timeSec], message: `连续参数在线默认禁用 stepped（Spec 8.2）` }));
      }

      // 控制自身的域（程序边界，Spec 3.4）：allowed 之外拒绝；verified 之外也拒绝（超界优先拒绝，Spec 9.4）
      if (def.input.type !== "enum" && typeof k.value !== "string") {
        const comps = Array.isArray(k.value) ? k.value : [k.value];
        const limit = (min: number | undefined, max: number | undefined, kind: "allowed" | "verified"): boolean => {
          if (min == null && max == null) return true;
          for (const v of comps) {
            if ((min != null && v < min - 1e-9) || (max != null && v > max + 1e-9)) {
              findings.push(diag({
                code: "RANGE_VIOLATION",
                stage: "value",
                requestId,
                draftId: draft.id,
                controlId: cid,
                expected: `${kind} [${min ?? "-∞"}, ${max ?? "+∞"}]（逐轴）`,
                actual: Array.isArray(k.value) ? `[${comps.join(", ")}]` : String(v),
                recoverable: true,
                affectedTimeRange: [k.timeSec, k.timeSec],
                message: kind === "verified" ? "超出已验证域（作者候选超界优先拒绝，Spec 9.4）" : "超出允许域",
              }));
              return false;
            }
          }
          return true;
        };
        if (limit(def.domain.min, def.domain.max, "allowed")) {
          limit(def.domain.verifiedMin, def.domain.verifiedMax, "verified");
        }
      }
    }
  }
  if (totalKeys > budget.maxTotalKeys) {
    findings.push(diag({ code: "INVALID_TIMELINE", stage: "timeline", requestId, draftId: draft.id, expected: `≤${budget.maxTotalKeys}`, actual: `${totalKeys}`, recoverable: true, message: "关键帧总数超预算" }));
  }
  // 阶段（Spec 8.2：有序、不重叠、首起 0、末收 durationSec；允许省略）
  if (draft.phases) {
    const ph = draft.phases;
    if (ph.length > 0) {
      if (Math.abs(ph[0].startSec) > 1e-9 || Math.abs(ph[ph.length - 1].endSec - draft.durationSec) > 1e-9) {
        findings.push(diag({ code: "INVALID_TIMELINE", stage: "timeline", requestId, draftId: draft.id, expected: "覆盖 [0, durationSec]", actual: `${ph[0].startSec}~${ph[ph.length - 1].endSec}`, recoverable: true, message: "阶段未覆盖全时长" }));
      }
      const names = new Set(ph.map((p) => p.name));
      if (names.size !== ph.length) {
        findings.push(diag({ code: "INVALID_TIMELINE", stage: "timeline", requestId, draftId: draft.id, expected: "阶段名唯一", actual: "重复", recoverable: true, message: "阶段名重复" }));
      }
      for (let i = 1; i < ph.length; i++) {
        if (ph[i].startSec < ph[i - 1].endSec - 1e-9) {
          findings.push(diag({ code: "INVALID_TIMELINE", stage: "timeline", requestId, draftId: draft.id, expected: "有序不重叠", actual: `${ph[i].name} 起点早于前段终点`, recoverable: true, affectedTimeRange: [ph[i - 1].endSec, ph[i].startSec], message: "阶段重叠" }));
        }
      }
    }
  }

  if (hasFailures(findings)) return { findings };

  // ---- 步骤 4：规则解释器（写集/依赖闭包的确定性检查） ----
  const ruleFindings = evaluateRules({
    profile,
    draft,
    state: request.runtimeState,
    allowedControlIds: allowedIds,
  });
  findings.push(...ruleFindings);
  if (hasFailures(findings)) return { findings };

  // ---- 步骤 5+6：翻译 → 官方编译 → 隔离采样 ----
  if (opts.skeletonData) {
    const rig = opts.rig ?? resolveRig(request.profileRef.profileId);
    if (!rig) {
      findings.push(diag({
        code: "PROFILE_MISMATCH",
        stage: "compile",
        requestId,
        draftId: draft.id,
        expected: "档案已注册 RigProfile 绑定",
        actual: request.profileRef.profileId,
        recoverable: false,
        message: "档案没有注册绑定层（无法翻译为 role+property 编译）",
      }));
      return { findings };
    }
    const tr = translateDraft(draft, profile, rig.id);
    if (!tr.draft) {
      findings.push(diag({
        code: "INVALID_TIMELINE",
        stage: "compile",
        requestId,
        draftId: draft.id,
        expected: "翻译成功",
        actual: "translateDraft 未返回草稿",
        recoverable: true,
        message: "V1.1 → 内部草稿翻译失败",
      }));
      return { findings };
    }
    const { motion, diagnostics } = compileDraft(tr.draft, rig, opts.skeletonData);
    const errors = diagnostics.filter((d) => d.level === "error");
    if (!motion || errors.length > 0) {
      findings.push(diag({
        code: "INVALID_TIMELINE",
        stage: "compile",
        requestId,
        draftId: draft.id,
        expected: "编译通过",
        actual: errors.map((e) => `${e.code} ${e.message}`).join("; ") || "未知编译失败",
        recoverable: true,
        message: "官方编译失败",
      }));
      return { findings };
    }
    // 采样目标：被引用的控制 + composite 的子控制（附件离散值仅记录占用，数值控制查域/速率）
    const referenced = open.filter((c) => seen.has(c.controlId) || (draft.curves.some((cu) => cu.controlId === c.controlId && byId.get(cu.controlId)?.kind === "composite" && (byId.get(cu.controlId)!.binding.compositeOf ?? []).includes(c.controlId))));
    const sample = sampleTrajectory(opts.skeletonData, motion.animation, referenced, opts.sample);
    findings.push(...sample.findings);
    compiled = motion;
  }
  return { findings, compiled };
}

/**
 * 完整验证入口（步骤 1-6；步骤 7 在调度器提交时执行）。
 */
export function validateCandidate(raw: unknown, request: GuideRequest, profile: ControlProfile, opts: ValidateOptions = {}): ValidatedCandidate {
  const { findings, response } = checkResponseEnvelope(raw, request, opts.rawBytes);
  if (!response) return { ok: false, findings };
  if (response.status !== "motion") {
    // unsupported / needs_context：合法响应，无曲线；由调度策略决定回退/记录
    return { ok: true, findings, response };
  }
  const { findings: motionFindings, compiled } = checkMotionDraft(response, request, profile, opts);
  const all = [...findings, ...motionFindings];
  return { ok: !hasFailures(all), findings: all, response, compiled: hasFailures(all) ? undefined : compiled };
}
