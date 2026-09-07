/** MotionDraft 校验：Schema（Ajv）+ 业务规则（Spec 6.2 / A.1）。禁止把候选当脚本执行。 */
import Ajv, { type ValidateFunction } from "ajv";
import draftSchema from "../../../schemas/motion-draft.schema.json";
import type { MotionDraft, MotionCurve } from "../authoring/draft.js";
import type { RigProfile } from "../../rig/rigProfile.js";

export interface Diagnostic {
  level: "error" | "warn";
  code: string;
  message: string;
  path?: string;
}

const ajv = new Ajv({ allErrors: true, strict: false });
const validateSchemaFn: ValidateFunction = ajv.compile(draftSchema as object);

export function validateDraft(draft: unknown, rig?: RigProfile): Diagnostic[] {
  const diags: Diagnostic[] = [];
  if (!validateSchemaFn(draft)) {
    for (const e of validateSchemaFn.errors ?? []) {
      diags.push({ level: "error", code: "schema", message: `${e.instancePath || "/"} ${e.message ?? ""}`.trim(), path: e.instancePath });
    }
    return diags;
  }
  const d = draft as MotionDraft;
  const label = (c: MotionCurve) => `curves[${c.role}.${c.property}]`;

  for (const c of d.curves) {
    for (let i = 0; i < c.keys.length; i++) {
      const k = c.keys[i];
      if (i > 0 && !(k.t > c.keys[i - 1].t)) {
        diags.push({ level: "error", code: "keyTimeNotIncreasing", message: `${label(c)} 第 ${i} 个关键帧时间必须严格递增`, path: label(c) });
      }
      if (k.t > d.durationSec) {
        diags.push({ level: "error", code: "keyOutOfRange", message: `${label(c)} 关键帧 t=${k.t} 超出 durationSec=${d.durationSec}`, path: label(c) });
      }
      const numeric = c.property === "rotate" ? [k.value as number] : Array.isArray(k.value) ? (k.value as number[]) : [];
      for (const v of numeric) {
        if (!Number.isFinite(v)) diags.push({ level: "error", code: "valueNotFinite", message: `${label(c)} 关键帧数值必须有限`, path: label(c) });
      }
      if (k.ease === "bezier" && k.bezierCP) {
        const [x1, , x2] = k.bezierCP;
        if (x1 > x2) {
          diags.push({ level: "error", code: "bezierTimeNotMonotonic", message: `${label(c)} Bézier 时间控制点必须单调 (x1=${x1} > x2=${x2})`, path: label(c) });
        }
      }
      if (c.property === "attachment" && k.ease != null && k.ease !== "stepped") {
        diags.push({ level: "error", code: "attachmentNotStepped", message: `${label(c)} Attachment 切换只允许 stepped`, path: label(c) });
      }
    }
    if (c.keys.length > 8) {
      diags.push({ level: "warn", code: "curveBudget", message: `${label(c)} 关键帧数 ${c.keys.length} 超出 6.3 节建议预算（3-8）`, path: label(c) });
    }
  }

  const seen = new Set<string>();
  for (const c of d.curves) {
    const id = `${c.role}/${c.property}`;
    if (seen.has(id)) {
      diags.push({ level: "error", code: "duplicateProperty", message: `同一属性被多条曲线重复写：${id}`, path: id });
    }
    seen.add(id);
  }

  if (d.phases) {
    const entries = Object.entries(d.phases).filter(([, v]) => typeof v === "number") as [string, number][];
    for (const [name, v] of entries) {
      if (v < 0 || v > d.durationSec) {
        diags.push({ level: "error", code: "phaseRange", message: `阶段 ${name}=${v} 超出 [0, ${d.durationSec}]`, path: `phases.${name}` });
      }
    }
    const seq = ["prepareEnd", "strokeEnd", "recoverEnd"].map((n) => [n, d.phases?.[n]] as const).filter(([, v]) => v != null) as [string, number][];
    for (let i = 1; i < seq.length; i++) {
      if (!(seq[i][1] >= seq[i - 1][1])) {
        diags.push({ level: "error", code: "phaseOrder", message: `阶段必须非递减：${seq[i - 1][0]}(${seq[i - 1][1]}) > ${seq[i][0]}(${seq[i][1]})`, path: "phases" });
      }
    }
  }

  if (rig) {
    for (const c of d.curves) {
      const binding = rig.bones[c.role];
      if (!binding) {
        diags.push({ level: "error", code: "unknownRole", message: `RigProfile ${rig.id} 中不存在角色 ${c.role}`, path: label(c) });
        continue;
      }
      if (!d.channels.includes(binding.channel)) {
        diags.push({ level: "error", code: "channelMissing", message: `角色 ${c.role} 属于通道 ${binding.channel}，未在 channels 中声明`, path: "channels" });
      }
      if (c.property === "attachment" && binding.kind !== "slotState") {
        diags.push({ level: "error", code: "attachmentBindingKind", message: `角色 ${c.role} 不是 slotState 绑定，不能写 attachment`, path: label(c) });
      }
      if (c.property !== "attachment" && binding.kind === "slotState") {
        diags.push({ level: "error", code: "slotBindingKind", message: `角色 ${c.role} 是 slotState 绑定，只能写 attachment`, path: label(c) });
      }
    }
    if (d.rigProfile !== rig.id) {
      diags.push({ level: "error", code: "rigProfileMismatch", message: `draft.rigProfile=${d.rigProfile} 与当前 rig.id=${rig.id} 不一致`, path: "rigProfile" });
    }
  }

  return diags;
}

export function hasErrors(diags: Diagnostic[]): boolean {
  return diags.some((d) => d.level === "error");
}
