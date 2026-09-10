/**
 * V1.1 翻译（指导书 Spec 8.2）：外部 controlId 草稿 → 内部 MotionDraft v1（role+property，唯一映射）。
 * composite 控制按登记映射展开为多条子曲线；标量/向量按 sign 换算（枚举不换算）。
 */
import type { ControlProfile, ControlDefinition } from "../../rig/controlProfile.js";
import type { MotionDraft, MotionCurve, MotionKey } from "../authoring/draft.js";
import { DRAFT_SCHEMA_VERSION, type DraftV11 } from "./protocol.js";

export interface TranslateResult {
  draft?: MotionDraft;
  /** controlId → 实际生成的内部曲线数（composite 展开可能 >1） */
  expansion: Map<string, number>;
}

function applySign(value: number | [number, number], sign: 1 | -1 | undefined): number | [number, number] {
  const s = sign ?? 1;
  if (s === 1) return value;
  return typeof value === "number" ? -value : ([value[0] * -1, value[1] * -1] as [number, number]);
}

function convertKeys(
  keys: DraftV11["curves"][number]["keys"],
  sign: 1 | -1 | undefined,
  numeric: boolean,
): MotionKey[] {
  return keys.map((k, i) => {
    const last = i === keys.length - 1;
    const ease = last ? undefined : k.ease;
    if (!numeric) {
      return { t: k.timeSec, value: k.value as string, ease: ease === "smooth" ? "stepped" : ease } as MotionKey;
    }
    const raw = k.value;
    if (typeof raw !== "number" && !Array.isArray(raw)) {
      throw new Error(`数值控制收到非数值 ${JSON.stringify(raw)}`);
    }
    // Spec 8.2：smooth 映射为固定、经采样测试的有界缓动（easeInOut，无过冲），不让 LLM 自由生成 Bézier
    const out = { t: k.timeSec, value: applySign(raw as number | [number, number], sign) } as MotionKey;
    if (ease === "smooth") {
      out.ease = "bezier";
      out.bezierCP = [0.25, 0.1, 0.25, 1];
    } else if (ease === "linear" || ease === "stepped") {
      out.ease = ease;
    }
    return out;
  });
}

/** 组合控制展开：枚举值 → 各子控制器的固定目标（登记映射，Spec 4.1）。 */
function expandComposite(c: ControlDefinition, value: string): Array<{ controlId: string; attachment: string }> {
  const hit = (c.binding.compositeEntries ?? []).find((e) => e.key === value);
  if (!hit) throw new Error(`组合控制 ${c.controlId} 缺少枚举值 ${value} 的登记映射`);
  return hit.targets.map((t) => ({ controlId: t.controlId, attachment: String(t.value) }));
}

/** V1.1 draft → 内部 MotionDraft。校验过的输入才可进入（由 validateV11 保证）。 */
export function translateDraft(v11: DraftV11, profile: ControlProfile, rigProfileId: string): TranslateResult {
  const curves: MotionCurve[] = [];
  const channels = new Set<string>();
  const expansion = new Map<string, number>();
  const byId = new Map(profile.controls.map((c) => [c.controlId, c]));

  for (const curve of v11.curves) {
    const def = byId.get(curve.controlId);
    if (!def) throw new Error(`未知控制 ${curve.controlId}`);
    if (def.kind === "composite") {
      // 每个键的枚举值可能不同 → 按时间分段生成子曲线（同子控制多段合并为多键）
      const subKeys = new Map<string, MotionKey[]>();
      for (const k of curve.keys) {
        const expanded = expandComposite(def, String(k.value));
        for (const t of expanded) {
          const list = subKeys.get(t.controlId) ?? [];
          list.push({ t: k.timeSec, value: t.attachment, ease: "stepped" });
          subKeys.set(t.controlId, list);
        }
      }
      for (const [controlId, keys] of subKeys) {
        const subDef = byId.get(controlId)!;
        if (!subDef.mapsTo) throw new Error(`子控制 ${controlId} 缺少 mapsTo`);
        const ordered = [...keys].sort((a, b) => a.t - b.t).filter((k, i, arr) => i === 0 || k.t > arr[i - 1].t);
        if (ordered.length > 0) delete ordered[ordered.length - 1].ease;
        curves.push({
          role: subDef.mapsTo.role,
          property: subDef.mapsTo.property,
          mode: "relativeToReference",
          keys: ordered,
        });
        channels.add(subDef.channel);
        expansion.set(curve.controlId, (expansion.get(curve.controlId) ?? 0) + 1);
      }
      continue;
    }
    if (!def.mapsTo) throw new Error(`控制 ${curve.controlId} 缺少 mapsTo`);
    const numeric = def.input.type !== "enum";
    curves.push({
      role: def.mapsTo.role,
      property: def.mapsTo.property,
      mode: "relativeToReference",
      keys: convertKeys(curve.keys, def.binding.sign, numeric),
    });
    channels.add(def.channel);
    expansion.set(curve.controlId, 1);
  }

  const draft: MotionDraft = {
    schemaVersion: 1,
    id: v11.id,
    rigProfile: rigProfileId,
    durationSec: v11.durationSec,
    channels: [...channels],
    phases: v11.phases
      ? {
          prepareEnd: v11.phases.find((p) => p.name === "prepare")?.endSec,
          strokeEnd: v11.phases.find((p) => p.name === "stroke")?.endSec,
          recoverEnd: v11.phases.find((p) => p.name === "recover")?.endSec,
        }
      : undefined,
    curves,
    provenance: { kind: "llm", note: `translated from ${DRAFT_SCHEMA_VERSION}` },
    approval: "draft",
  };
  return { draft, expansion };
}
