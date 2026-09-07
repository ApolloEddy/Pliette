/**
 * 参数集模块（Spec 7）：类型、单位、有效域、影响属性、映射语义、updatePolicy。
 * 参数快照按 动作默认 → 角色默认 → 命名预置 → 显式覆盖 顺序解析（7.4）。
 */

export interface ParameterDomain {
  min?: number;
  max?: number;
  integer?: boolean;
  enum?: string[];
}

export interface ParameterDefinition {
  name: string;
  type: "number" | "integer" | "enum";
  unit: string;
  default: number | string;
  domain: ParameterDomain;
  /** 已验证范围（Spec 7.8）；进入正式库前必须记录 */
  verifiedDomain?: ParameterDomain;
  /** 允许该参数的动作 id，"*" 表示全部 */
  appliesTo: string[];
  /** 影响证据：固定姿态/阶段/种子下可观察的属性（7.8） */
  affectedProperties: string[];
  observableRoles: string[];
  activePhases: string[];
  updatePolicy: "nextAction" | "phaseBoundary" | "smoothLive";
  mapping: "scale" | "offset" | "default";
}

export const PARAMETER_DEFINITIONS: ParameterDefinition[] = [
  {
    name: "amplitude",
    type: "number",
    unit: "无量纲（对动作参考中心的偏移幅度）",
    default: 0.75,
    domain: { min: 0, max: 2 },
    appliesTo: ["wave", "nod", "point", "lean", "shrink"],
    affectedProperties: ["bone:*/rotate"],
    observableRoles: ["arm.right", "arm.left", "head.main"],
    activePhases: ["stroke"],
    updatePolicy: "smoothLive",
    mapping: "scale",
  },
  {
    name: "tempo",
    type: "number",
    unit: "1 为原速",
    default: 1.0,
    domain: { min: 0.5, max: 2 },
    appliesTo: ["wave", "nod", "walk", "point"],
    affectedProperties: ["time:stroke"],
    observableRoles: ["arm.right", "arm.left", "head.main"],
    activePhases: ["stroke"],
    updatePolicy: "phaseBoundary",
    mapping: "scale",
  },
  {
    name: "cycles",
    type: "integer",
    unit: "整数次数",
    default: 2,
    domain: { min: 1, max: 4, integer: true },
    appliesTo: ["wave", "nod"],
    affectedProperties: ["time:stroke"],
    observableRoles: ["arm.right", "arm.left"],
    activePhases: ["stroke"],
    updatePolicy: "phaseBoundary",
    mapping: "default",
  },
  {
    name: "hand",
    type: "enum",
    unit: "left | right | auto",
    default: "right",
    domain: { enum: ["left", "right", "auto"] },
    appliesTo: ["wave", "point", "hold"],
    affectedProperties: [],
    observableRoles: [],
    activePhases: ["prepare"],
    updatePolicy: "nextAction",
    mapping: "default",
  },
  {
    name: "strideH",
    type: "number",
    unit: "H（步幅）",
    default: 0.35,
    domain: { min: 0.1, max: 0.8 },
    appliesTo: ["walk", "run"],
    affectedProperties: ["bone:leg_*/translate"],
    observableRoles: ["leg.ik.left", "leg.ik.right"],
    activePhases: ["stroke"],
    updatePolicy: "nextAction",
    mapping: "default",
  },
  {
    name: "headTiltDeg",
    type: "number",
    unit: "度",
    default: 0,
    domain: { min: -15, max: 15 },
    appliesTo: ["look_at", "listen", "shrink"],
    affectedProperties: ["bone:face/rotate"],
    observableRoles: ["head.main"],
    activePhases: ["hold"],
    updatePolicy: "smoothLive",
    mapping: "offset",
  },
];

const BY_NAME = new Map(PARAMETER_DEFINITIONS.map((p) => [p.name, p]));

export function getParameterDefinition(name: string): ParameterDefinition | undefined {
  return BY_NAME.get(name);
}

export interface ResolutionInput {
  actionId: string;
  actionDefaults?: Record<string, unknown>;
  characterDefaults?: Record<string, unknown>;
  preset?: Record<string, unknown>;
  overrides?: Record<string, unknown>;
  /** 该动作已注册的合法参数名（来自动作定义 / 目录）；缺省时用 appliesTo 判定 */
  allowedParams?: string[];
}

export interface ResolutionResult {
  values: Record<string, unknown>;
  /** 每个值的最终来源层（Spec 7.4） */
  sources: Record<string, string>;
  diagnostics: Diagnostic[];
}

export interface Diagnostic {
  level: "error" | "warn";
  code: string;
  message: string;
}

function checkDomain(name: string, value: unknown, def: ParameterDefinition, diags: Diagnostic[]): boolean {
  if (def.type === "enum") {
    if (typeof value !== "string" || !def.domain.enum?.includes(value)) {
      diags.push({ level: "error", code: "domainEnum", message: `参数 ${name}=${JSON.stringify(value)} 不在允许集合 [${def.domain.enum?.join(", ")}]` });
      return false;
    }
    return true;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    diags.push({ level: "error", code: "domainType", message: `参数 ${name}=${JSON.stringify(value)} 必须是有限数值` });
    return false;
  }
  if (def.domain.integer && !Number.isInteger(value)) {
    diags.push({ level: "error", code: "domainInteger", message: `参数 ${name}=${value} 必须是整数（不把浮点截断当作次数，Spec 7.8）` });
    return false;
  }
  if (def.domain.min != null && value < def.domain.min) {
    diags.push({ level: "error", code: "domainMin", message: `参数 ${name}=${value} 低于有效域下限 ${def.domain.min}` });
    return false;
  }
  if (def.domain.max != null && value > def.domain.max) {
    diags.push({ level: "error", code: "domainMax", message: `参数 ${name}=${value} 超出有效域上限 ${def.domain.max}` });
    return false;
  }
  return true;
}

/** 未知键拒绝；无效字段返回可读错误（Spec 7.3 / A.2）。 */
export function resolveParams(input: ResolutionInput): ResolutionResult {
  const diags: Diagnostic[] = [];
  const values: Record<string, unknown> = {};
  const sources: Record<string, string> = {};

  const layers: [string, Record<string, unknown> | undefined][] = [
    ["actionDefaults", input.actionDefaults],
    ["characterDefaults", input.characterDefaults],
    ["preset", input.preset],
    ["overrides", input.overrides],
  ];

  // 先收集合法参数集合：目录显式列出，或 appliesTo 匹配
  const allowed = new Set<string>(input.allowedParams ?? []);
  if (input.allowedParams == null) {
    for (const def of PARAMETER_DEFINITIONS) {
      if (def.appliesTo.includes("*") || def.appliesTo.includes(input.actionId)) allowed.add(def.name);
    }
  }

  for (const [layerName, layer] of layers) {
    if (!layer) continue;
    for (const [key, value] of Object.entries(layer)) {
      if (!allowed.has(key)) {
        diags.push({ level: "error", code: "paramNotAllowed", message: `动作 ${input.actionId} 不接受参数 ${key}` });
        continue;
      }
      const def = getParameterDefinition(key);
      if (def) {
        const before = diags.length;
        if (!checkDomain(key, value, def, diags)) continue;
        if (def.verifiedDomain && typeof value === "number" && diags.length === before) {
          const vd = def.verifiedDomain;
          if ((vd.min != null && value < vd.min) || (vd.max != null && value > vd.max)) {
            diags.push({ level: "warn", code: "outsideVerifiedDomain", message: `参数 ${key}=${value} 超出已验证范围，执行但记录诊断` });
          }
        }
      }
      values[key] = value;
      sources[key] = layerName;
    }
  }

  return { values, sources, diagnostics: diags };
}

/** StyleProfile：动作族的稀疏配置（Spec 7.5），只允许有界 scale / offset 映射。 */
export interface StyleMappingRule {
  param: string;
  kind: "scale" | "offset";
  amount: number;
}

export interface StyleProfile {
  id: string;
  actions: Record<string, StyleMappingRule[]>;
}

export const STYLE_HAPPY: StyleProfile = {
  id: "happy.gesture.v1",
  actions: {
    wave: [
      { param: "amplitude", kind: "scale", amount: 1.15 },
      { param: "tempo", kind: "scale", amount: 1.1 },
    ],
    nod: [{ param: "tempo", kind: "scale", amount: 1.2 }],
  },
};

/** 应用风格映射：显式设置的值同样应用有界倍率（绝对目标/接触位置不应交给风格倍率，7.4 由调用方保证）。 */
export function applyStyle(
  values: Record<string, unknown>,
  actionId: string,
  style: StyleProfile,
  defs: Map<string, ParameterDefinition> = BY_NAME,
): { values: Record<string, unknown>; diagnostics: Diagnostic[] } {
  const diags: Diagnostic[] = [];
  const rules = style.actions[actionId] ?? [];
  const out = { ...values };
  for (const rule of rules) {
    const cur = out[rule.param];
    if (typeof cur !== "number") continue;
    const def = defs.get(rule.param);
    let next = rule.kind === "scale" ? cur * rule.amount : cur + rule.amount;
    if (def?.domain.min != null) next = Math.max(def.domain.min, next);
    if (def?.domain.max != null) next = Math.min(def.domain.max, next);
    out[rule.param] = def?.domain.integer ? Math.round(next) : next;
  }
  return { values: out, diagnostics: diags };
}
