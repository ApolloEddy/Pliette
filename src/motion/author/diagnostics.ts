/** 诊断与错误码（指导书 Spec 10.2 最低错误码集合）。 */

export type ErrorCode =
  | "UNKNOWN_CONTROL"
  | "UNVERIFIED_CONTROL"
  | "PROFILE_MISMATCH"
  | "UNSUPPORTED_VIEW"
  | "INVALID_VALUE"
  | "RANGE_VIOLATION"
  | "RATE_VIOLATION"
  | "PROPERTY_CONFLICT"
  | "CONTACT_DEPENDENCY"
  | "INVALID_TIMELINE"
  | "STALE_CONTEXT"
  | "DEADLINE_EXCEEDED"
  | "OUTPUT_TRUNCATED"
  | "INSUFFICIENT_CONTEXT";

export type AuthorStage =
  | "response"
  | "identity"
  | "control"
  | "value"
  | "timeline"
  | "write"
  | "compile"
  | "sample"
  | "schedule";

export interface AuthorDiagnostic {
  code: ErrorCode;
  stage: AuthorStage;
  requestId?: string;
  draftId?: string;
  controlId?: string;
  ruleId?: string;
  expected?: string;
  actual?: string;
  affectedTimeRange?: [number, number];
  recoverable: boolean;
  message: string;
}

export function diag(d: Omit<AuthorDiagnostic, "recoverable"> & { recoverable?: boolean }): AuthorDiagnostic {
  return { recoverable: false, ...d };
}

/**
 * 失败判定：诊断即失败（14 个错误码全部阻断候选）。
 * warn 级规则违规由解释器降级为注释性条目（`note: true`），不计入失败。
 */
export interface AuthorFinding extends AuthorDiagnostic {
  /** true=注释性发现（warn 规则），不算失败 */
  note?: boolean;
}

export function hasFailures(findings: AuthorFinding[]): boolean {
  return findings.some((f) => !f.note);
}

export const ALL_CODES: Record<ErrorCode, true> = {
  UNKNOWN_CONTROL: true,
  UNVERIFIED_CONTROL: true,
  PROFILE_MISMATCH: true,
  UNSUPPORTED_VIEW: true,
  INVALID_VALUE: true,
  RANGE_VIOLATION: true,
  RATE_VIOLATION: true,
  PROPERTY_CONFLICT: true,
  CONTACT_DEPENDENCY: true,
  INVALID_TIMELINE: true,
  STALE_CONTEXT: true,
  DEADLINE_EXCEEDED: true,
  OUTPUT_TRUNCATED: true,
  INSUFFICIENT_CONTEXT: true,
};

/** 供 Lab/日志渲染的一句话定位（Spec 10.2：错误消息指出实际失败点） */
export function formatDiagnostic(d: AuthorDiagnostic): string {
  const where = [d.stage, d.controlId, d.ruleId].filter(Boolean).join("/");
  const range = d.affectedTimeRange ? `@${d.affectedTimeRange[0]}-${d.affectedTimeRange[1]}s` : "";
  const cmp = d.expected != null ? `（期望 ${d.expected}，实际 ${d.actual ?? "?"}）` : "";
  return `[${d.code}] ${where}${range}: ${d.message}${cmp}`;
}
