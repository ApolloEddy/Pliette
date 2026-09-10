/**
 * 规则解释器（指导书 Spec 6.3）：有限规则类型，每种一个确定性解释器。
 * 绝不执行来自文档或 LLM 的任意表达式代码（Spec 6.3 硬约束）。
 */
import type { RuleDefinition, ControlProfile, ControlDefinition } from "../../rig/controlProfile.js";
import { diag, type AuthorFinding } from "./diagnostics.js";
import type { DraftV11, RuntimeStateSnapshot } from "./protocol.js";

export interface RuleContext {
  profile: ControlProfile;
  draft: DraftV11;
  /** 程序提供的当前状态（LLM 不能改写，Spec 7.3） */
  state: RuntimeStateSnapshot;
  /** 参与本次请求的控制集合（availableControls） */
  allowedControlIds: ReadonlySet<string>;
}

function valueAt(keys: { timeSec: number; value: number | [number, number] | string }[], t: number): number | [number, number] | string | undefined {
  if (keys.length === 0) return undefined;
  if (t <= keys[0].timeSec) return keys[0].value;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (t >= a.timeSec && t <= b.timeSec) {
      if (typeof a.value === "number" && typeof b.value === "number") return a.value + ((b.value - a.value) * (t - a.timeSec)) / Math.max(1e-9, b.timeSec - a.timeSec);
      return a.value; // 附件/非数值：取段起点
    }
  }
  return keys[keys.length - 1].value;
}

function checkNumericRange(
  rule: RuleDefinition,
  c: ControlDefinition,
  curve: DraftV11["curves"][number],
  min: number | undefined,
  max: number | undefined,
  out: AuthorFinding[],
  ctx: RuleContext,
  verified: boolean,
): void {
  if (min == null && max == null) return;
  if (c.input.type === "enum") return;
  const steps = 12;
  let worst: { t: number; v: number | [number, number] | string } | null = null;
  for (let i = 0; i <= steps; i++) {
    const t = (curve.keys[curve.keys.length - 1].timeSec * i) / steps;
    const v = valueAt(curve.keys, t);
    if (typeof v === "number") {
      if ((min != null && v < min - 1e-9) || (max != null && v > max + 1e-9)) {
        if (!worst || Math.abs(v) > Math.abs(worst.v as number)) worst = { t, v };
      }
    } else if (Array.isArray(v)) {
      for (const comp of v) {
        if ((min != null && comp < min - 1e-9) || (max != null && comp > max + 1e-9)) {
          if (!worst) worst = { t, v };
        }
      }
    }
  }
  if (worst) {
    out.push(diag({
      code: "RANGE_VIOLATION",
      stage: "value",
      requestId: ctx.draft.id,
      draftId: ctx.draft.id,
      controlId: c.controlId,
      ruleId: rule.ruleId,
      expected: verified ? `verified [${min ?? "-∞"}, ${max ?? "+∞"}]` : `[${min ?? "-∞"}, ${max ?? "+∞"}]`,
      actual: Array.isArray(worst.v) ? `[${worst.v.join(", ")}]` : String(worst.v),
      affectedTimeRange: [worst.t, worst.t],
      recoverable: true,
      message: verified ? `超出已验证域（Spec 9.4：作者候选超界优先拒绝）` : `超出允许域`,
    }));
  }
}

/**
 * 对 draft 执行档案规则 + 控制域的确定性检查。
 * severity=error → 失败诊断；severity=warn → note（注释性发现，不算失败）。
 */
export function evaluateRules(ctx: RuleContext): AuthorFinding[] {
  const out: AuthorFinding[] = [];
  const { profile, draft, state } = ctx;

  for (const rule of profile.rules) {
    const push = (f: Omit<AuthorFinding, "note" | "recoverable"> & { recoverable?: boolean }) => {
      out.push({ note: rule.severity === "warn", recoverable: true, ...f } as AuthorFinding);
    };
    switch (rule.type) {
      case "requiresVariant": {
        // 条件: { view: string }；视图不匹配即拒（硬规则，无论 severity——背面请求没有可执行的宽容版本）
        const wantView = String(rule.condition.view ?? "");
        if (wantView && state.viewId !== wantView && rule.target === "*") {
          push({
            code: "UNSUPPORTED_VIEW",
            stage: "control",
            ruleId: rule.ruleId,
            expected: `view=${wantView}`,
            actual: `view=${state.viewId}`,
            message: rule.explanation,
          });
        }
        break;
      }
      case "range": {
        const target = profile.controls.find((c) => c.controlId === rule.target);
        if (!target) break;
        const curve = draft.curves.find((cu) => cu.controlId === rule.target);
        if (!curve) break;
        const allowedMin = typeof rule.params.min === "number" ? rule.params.min : undefined;
        const allowedMax = typeof rule.params.max === "number" ? rule.params.max : undefined;
        checkNumericRange(rule, target, curve, allowedMin, allowedMax, out, ctx, false);
        const vMin = typeof rule.params.verifiedMin === "number" ? rule.params.verifiedMin : undefined;
        const vMax = typeof rule.params.verifiedMax === "number" ? rule.params.verifiedMax : undefined;
        checkNumericRange(rule, target, curve, vMin, vMax, out, ctx, true);
        break;
      }
      case "rateLimit": {
        // 轨迹级速率检查在 sample.ts（真实编译曲线采样）执行；此处做关键帧间静态预检
        const target = profile.controls.find((c) => c.controlId === rule.target);
        const curve = draft.curves.find((cu) => cu.controlId === rule.target);
        if (!target || !curve || typeof rule.params.maxPerSec !== "number") break;
        const maxRate = rule.params.maxPerSec as number;
        for (let i = 0; i < curve.keys.length - 1; i++) {
          const a = curve.keys[i];
          const b = curve.keys[i + 1];
          if (typeof a.value === "number" && typeof b.value === "number") {
            const rate = Math.abs(b.value - a.value) / Math.max(1e-9, b.timeSec - a.timeSec);
            if (rate > maxRate + 1e-9) {
              push({
                code: "RATE_VIOLATION",
                stage: "value",
                draftId: draft.id,
                controlId: target.controlId,
                ruleId: rule.ruleId,
                expected: `≤ ${maxRate}/s`,
                actual: `${rate.toFixed(1)}/s`,
                affectedTimeRange: [a.timeSec, b.timeSec],
                message: `关键帧段静态速率超限（轨迹采样还会复核）`,
              });
            }
          }
        }
        break;
      }
      case "exclusiveWrite": {
        // 条件: { maxDrafts?: number }——同目标控制不得被多条曲线重复写
        const dup = draft.curves.filter((cu) => cu.controlId === rule.target);
        const maxD = typeof rule.params.maxDrafts === "number" ? rule.params.maxDrafts : 1;
        if (dup.length > maxD) {
          push({
            code: "PROPERTY_CONFLICT",
            stage: "write",
            draftId: draft.id,
            controlId: rule.target,
            ruleId: rule.ruleId,
            expected: `≤${maxD} 条曲线`,
            actual: `${dup.length} 条`,
            message: `同一控制被重复写入`,
          });
        }
        break;
      }
      case "requiresCapability": {
        // 条件: { requiresCapability: string }——目标控制被直接引用但能力未开放
        const need = String(rule.condition.requiresCapability ?? rule.params.capability ?? "");
        const used = draft.curves.find((cu) => cu.controlId === rule.target);
        if (used && need && !state.contacts.includes(`capability:${need}`) && !ctx.allowedControlIds.has(rule.target)) {
          push({
            code: "UNVERIFIED_CONTROL",
            stage: "control",
            draftId: draft.id,
            controlId: rule.target,
            ruleId: rule.ruleId,
            expected: `能力 ${need} 已登记`,
            actual: "未登记",
            message: rule.explanation,
          });
        }
        break;
      }
      case "contactDependency": {
        // 条件: { contact: string }——目标控制所需接触被占用（或能力缺失）
        const contact = String(rule.condition.contact ?? rule.params.contact ?? "");
        const used = draft.curves.find((cu) => cu.controlId === rule.target);
        if (used && contact && !state.contacts.includes(contact)) {
          push({
            code: "CONTACT_DEPENDENCY",
            stage: "write",
            draftId: draft.id,
            controlId: rule.target,
            ruleId: rule.ruleId,
            expected: `接触 ${contact} 成立`,
            actual: "未成立",
            message: rule.explanation,
          });
        }
        break;
      }
    }
  }
  return out;
}
