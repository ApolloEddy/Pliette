/**
 * RigProfile：角色专用的语义绑定（Spec 4.3）。
 * 它不是第二套骨架——只把语义部位映射到真实骨骼名，并记录方向、符号与状态。
 */
import type { spine36 as spine } from "spine-webgl";

export type ChannelId = "base" | "leftArm" | "rightArm" | "torso" | "head" | "face" | "mouth";
export type BindingKind = "localFk" | "ikTarget" | "slotState";

export interface RigBinding {
  /** 真实骨骼名（slotState 时为 Slot 名） */
  bone: string;
  /** 完整父子路径（如 root → bone → body），来自 AssetReport */
  chain?: string[];
  kind: BindingKind;
  channel: ChannelId;
  /** 旋转正负号：相对参考姿态的偏移换算（左右手/视图差异） */
  rotationSign?: 1 | -1;
  /** 参考（setup）旋转角，度 */
  setupRotationDeg?: number;
  notes?: string;
  status: "candidate" | "verified";
}

export interface RigProfile {
  id: string;
  characterId: string;
  view: "front" | "back";
  skeletonExportVersion: string;
  /** 标定身高 H 对应的 Spine 原生单位；未标定为 null（编译时降级并告警） */
  heightUnits: number | null;
  bones: Record<string, RigBinding>;
  /** 已验证或声明的动作族能力，如 wave.right / look.eyes（Spec 4.5） */
  capabilities: string[];
}

/** lafei_8 正面视图的候选绑定（Spec 附录 D.3，均待可视探针确认） */
export const LAFEI_8_FRONT_CANDIDATES: RigProfile = {
  id: "lafei_8.front.v1",
  characterId: "lafei_8",
  view: "front",
  skeletonExportVersion: "3.6.52",
  /** 2026-09-07 实测标定：setup/stand/walk 三姿态附件世界包围盒高度 333.8/332.8/337.0，脚底基准 y≈-2.4 */
  heightUnits: 335,
  capabilities: ["face.eyes.attachments", "mouth.unverified"],
  bones: {
    "body.root": {
      bone: "body",
      chain: ["root", "bone", "body"],
      kind: "localFk",
      channel: "torso",
      setupRotationDeg: -90,
      notes: "body 的 setup rotation 约为 -90°，使用偏移，不当作直立 0°",
      status: "candidate",
    },
    "head.main": {
      bone: "face",
      chain: ["root", "bone", "face"],
      kind: "localFk",
      channel: "head",
      notes: "face 与 body 是兄弟节点，躯干旋转不会自动带动头部",
      status: "candidate",
    },
    "arm.left": {
      bone: "hand_L3",
      chain: ["body", "hand_L", "hand_L3"],
      kind: "localFk",
      channel: "leftArm",
      notes: "两级候选控制链，可视确认后开放上下段参数",
      status: "candidate",
    },
    "arm.right": {
      bone: "hand_R3",
      chain: ["body", "hand_R", "hand_R3"],
      kind: "localFk",
      channel: "rightArm",
      notes: "与左臂独立写属性，但共享 body 祖先",
      status: "candidate",
    },
    "arm.upper.left": {
      bone: "hand_L",
      chain: ["body", "hand_L"],
      kind: "localFk",
      channel: "leftArm",
      notes: "整臂抬放（hand_L 为 body 直接子节点，旋转带动整个手臂链）",
      status: "candidate",
    },
    "arm.upper.right": {
      bone: "hand_R",
      chain: ["body", "hand_R"],
      kind: "localFk",
      channel: "rightArm",
      notes: "整臂抬放；挥手/指向的主驱动骨，指尖挥动配合 arm.right",
      status: "candidate",
    },
    "leg.ik.left": {
      bone: "leg_L",
      chain: ["root", "leg_L"],
      kind: "ikTarget",
      channel: "base",
      notes: "腿部 IK 目标骨，链条 leg_L1 → leg_L3；步态优先输出目标轨迹",
      status: "candidate",
    },
    "leg.ik.right": {
      bone: "leg_R",
      chain: ["root", "leg_R"],
      kind: "ikTarget",
      channel: "base",
      notes: "与左腿各自求解，需共同协调支撑和身体移动",
      status: "candidate",
    },
    "face.eyes": {
      bone: "eye_L",
      kind: "slotState",
      channel: "face",
      notes: "eye_L/eye_R 各 8-9 个附件变体（睁闭/大小/形状），meimao1 slot 含 5 种眉毛；2026-09-07 真实资产核查确认",
      status: "candidate",
    },
    "face.eyeR": {
      bone: "eye_R",
      kind: "slotState",
      channel: "face",
      notes: "eye_R slot 9 个附件变体；与 face.eyes（eye_L）必须成对切换（配对语义待标定，指导书 Spec 3.5）",
      status: "candidate",
    },
  },
};

/** spineboy 官方示例的绑定（M4 第二骨架，Spec 5.3：机制验证，非产品标定）。 */
export const SPINEBOY_BINDINGS: RigProfile = {
  id: "spineboy.front.cp1",
  characterId: "spineboy",
  view: "front",
  skeletonExportVersion: "3.6.32",
  heightUnits: null,
  capabilities: [],
  bones: {
    "head.main": {
      bone: "head",
      chain: ["root", "hip", "torso", "torso2", "torso3", "neck", "head"],
      kind: "localFk",
      channel: "head",
      notes: "头在躯干链内（子级）——躯干旋转带动头部（与拉菲兄弟拓扑相反）",
      status: "verified",
    },
    "body.root": {
      bone: "hip",
      chain: ["root", "hip"],
      kind: "localFk",
      channel: "torso",
      setupRotationDeg: 0,
      notes: "上身链根；旋转时头/臂随动，双脚被腿 IK 钉住",
      status: "verified",
    },
    "arm.upper.right": {
      bone: "front-upper-arm",
      chain: ["torso3", "front-upper-arm"],
      kind: "localFk",
      channel: "rightArm",
      notes: "side-view：front=屏幕右臂；rear-upper-arm 未开放",
      status: "verified",
    },
  },
};

/** 语义角色 → 骨骼名猜测规则（自动匹配只产生候选，不跳过可视确认，Spec 4.3） */
const GUESS_PATTERNS: Record<string, RegExp[]> = {
  "head.main": [/head/i, /face/i, /neck/i],
  "arm.left": [/_?l3?$/i, /hand[_-]?l/i, /arm[_-]?l/i, /left.*arm/i, /arm.*l$/i],
  "arm.right": [/_?r3?$/i, /hand[_-]?r/i, /arm[_-]?r/i, /right.*arm/i, /arm.*r$/i],
  "body.root": [/^(body|hip|torso|root)$/i],
};

export function guessBinding(skeletonData: spine.SkeletonData, role: string): string | null {
  const patterns = GUESS_PATTERNS[role];
  if (!patterns) return null;
  const names = skeletonData.bones.map((b) => b.name);
  for (const re of patterns) {
    const hit = names.find((n) => re.test(n));
    if (hit) return hit;
  }
  return null;
}

/** 用 AssetReport / SkeletonData 生成示例角色（spineboy 等）的临时 RigProfile，用于 Lab 与测试。 */
export function makeAdHocRig(
  skeletonData: spine.SkeletonData,
  opts: { characterId: string; view?: "front" | "back"; exportVersion: string; picks?: Record<string, string | null> },
): RigProfile {
  const bones: Record<string, RigBinding> = {};
  const roles = ["body.root", "head.main", "arm.left", "arm.right"];
  for (const role of roles) {
    const picked = opts.picks?.[role] ?? guessBinding(skeletonData, role);
    if (!picked) continue;
    const index = skeletonData.findBoneIndex(picked);
    if (index < 0) continue;
    const data = skeletonData.bones[index];
    const channel: ChannelId =
      role === "head.main" ? "head" : role === "arm.left" ? "leftArm" : role === "arm.right" ? "rightArm" : "torso";
    bones[role] = {
      bone: picked,
      kind: "localFk",
      channel,
      setupRotationDeg: data.rotation,
      status: "candidate",
    };
  }
  return {
    id: `${opts.characterId}.${opts.view ?? "front"}.adhoc`,
    characterId: opts.characterId,
    view: opts.view ?? "front",
    skeletonExportVersion: opts.exportVersion,
    heightUnits: null,
    bones,
    capabilities: [],
  };
}
