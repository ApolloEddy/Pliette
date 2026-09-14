/**
 * MotionLibrary 结构契约（MotionLibrary Spec v1.0 §4 / schemas/motion-contracts.schema.json）：
 * - MotionPlan：上游语义规划的机器可解析切片指令（pliette.motion-plan/1.0）；
 * - MotionCatalog：语义动作词表（pliette.motion-catalog/1.0）；
 * - MotionManifest / MotionEntry：当前角色的具体实现清单（pliette.motion-manifest/1.0 / pliette.motion-entry/1.0）。
 * JSON Schema 只负责形状；跨记录引用、时间区间、所有权等确定性语义校验在 validate.ts 承担。
 */
import Ajv, { type ValidateFunction } from "ajv";
import contractSchema from "../../../schemas/motion-contracts.schema.json";

// ---------------------------------------------------------------------------
// MotionPlan（切片指令）
// ---------------------------------------------------------------------------

export type PlanSchemaVersion = "pliette.motion-plan/1.0";

export interface MotionLookup {
  actionId: string;
  variantId: string;
  segmentId: string;
}

export interface MotionSlice {
  sliceId: string;
  description: string;
  lookup: MotionLookup;
  parameters: Record<string, unknown>;
  /** 软时长意图；不是截断许可（Spec 3.3） */
  durationHintMs?: number;
}

export interface MotionPlan {
  schemaVersion: PlanSchemaVersion;
  /** 程序发放并要求回显；不得作为永久动作身份 */
  requestId: string;
  /** 回显本轮得到的目录版本；陈旧版本不得悄悄映射到新语义 */
  catalogRevision: string;
  reply: string;
  description: string;
  slices: MotionSlice[];
}

// ---------------------------------------------------------------------------
// MotionCatalog（语义目录）
// ---------------------------------------------------------------------------

export type CatalogEntryStatus = "planned" | "registered" | "deprecated";
export type CatalogSide = "screen_left" | "screen_right" | "both" | "none";

export interface CatalogVariant {
  variantId: string;
  description: string;
  side: CatalogSide;
  segmentIds: string[];
  /** 待映射的语义能力要求；不是 controlId，也不直接授权 */
  requiredCapabilities: string[];
  parameterSchema: Record<string, unknown>;
  authorable: "capability_check" | "disabled";
  status: CatalogEntryStatus;
}

export interface CatalogAction {
  actionId: string;
  label: string;
  category: string;
  aliasesZh: string[];
  priority: "P0" | "P1" | "P2";
  status: CatalogEntryStatus;
  variants: CatalogVariant[];
  productionNote: string;
}

export interface CatalogCategory {
  id: string;
  label: string;
}

export interface MotionCatalog {
  schemaVersion: "pliette.motion-catalog/1.0";
  catalogRevision: string;
  description: string;
  categories: CatalogCategory[];
  actions: CatalogAction[];
}

// ---------------------------------------------------------------------------
// MotionManifest / MotionEntry（角色实现清单）
// ---------------------------------------------------------------------------

export type MotionEntryStatus = "candidate" | "validated" | "approved" | "disabled";

export interface RigRef {
  modelId: string;
  profileId: string;
  profileDigest: string;
  assetDigest: string;
  referencePoseDigest: string;
  viewId: string;
  skinId: string;
  runtimeVersion: string;
  adapterVersion: string;
}

export interface NativeSource {
  kind: "native_clip" | "native_slice";
  animationName: string;
  sourceStartMs: number;
  sourceEndMs: number;
}

export interface DraftSource {
  kind: "draft";
  /** 相对路径由宿主解析；LLM 不提供 */
  path: string;
  contentDigest: string;
  draftSchemaVersion: "pliette.motion-draft/1.1";
}

export interface RecipeStep {
  stepId: string;
  motionId: string;
  motionRevision: number;
  contentDigest: string;
  segmentId: string;
  /** 该子动作有效占用区间在配方时间轴上的起点 */
  offsetMs: number;
  parameters: Record<string, unknown>;
}

export interface RecipeSource {
  kind: "recipe";
  steps: RecipeStep[];
}

export type MotionSource = NativeSource | DraftSource | RecipeSource;

export interface MotionSegment {
  startMs: number;
  endMs: number;
  entryBoundaryId: string;
  exitBoundaryId: string;
  interruptibleAtEnd: boolean;
}

export interface MotionBoundary {
  poseClass: string;
  snapshotRef: string;
  contacts: string[];
  resources: string[];
}

export interface MotionPreconditions {
  /** [] 仅表示该维度已验证不限制；未测试必须保留 candidate（Spec 4.4） */
  postures: string[];
  baseAnimations: string[];
  requiredResources: string[];
  requiredContacts: string[];
}

export interface MotionEvent {
  eventId: string;
  atMs: number;
  eventType: "contact_acquire" | "contact_release" | "object_attach" | "object_detach";
  resourceId: string;
}

export interface MotionProvenance {
  origin: "native" | "legacy_slice" | "agent_offline" | "author_online" | "recipe";
  sourceRef: string;
  generatorModel: string | null;
  promptDigest: string | null;
}

export interface MotionValidation {
  structural: "pending" | "passed" | "failed";
  trajectory: "pending" | "passed" | "failed";
  visual: "pending" | "passed" | "failed";
  evidenceRefs: string[];
  reviewedAt: string | null;
}

export type MotionChannel = "base" | "leftArm" | "rightArm" | "torso" | "head" | "face" | "mouth";

export interface MotionEntry {
  schemaVersion: "pliette.motion-entry/1.0";
  motionId: string;
  motionRevision: number;
  actionId: string;
  variantId: string;
  status: MotionEntryStatus;
  rigRef: RigRef;
  source: MotionSource;
  durationMs: number;
  channels: MotionChannel[];
  writes: string[];
  dependsOn: string[];
  requiredCapabilities: string[];
  preconditions: MotionPreconditions;
  /** 必含 full（Spec 4.4） */
  segments: Record<string, MotionSegment>;
  boundaries: Record<string, MotionBoundary>;
  parameterSchema: Record<string, unknown>;
  retime: { minRate: number; maxRate: number };
  loop: { allowed: boolean; segmentId: string | null; maxRepeats: number };
  transition: { mixInMs: number; mixOutMs: number; maxBlendMs: number; continuousEligible: boolean };
  events: MotionEvent[];
  provenance: MotionProvenance;
  validation: MotionValidation;
  /** 修订规范化记录摘要；排除自身 digest 字段并纳入被引用资产摘要（Spec 4.4） */
  contentDigest: string;
}

export interface MotionManifest {
  schemaVersion: "pliette.motion-manifest/1.0";
  catalogRevision: string;
  entries: MotionEntry[];
}

// ---------------------------------------------------------------------------
// Ajv 结构校验（Draft-07；形状判别，语义在 validate.ts）
// ---------------------------------------------------------------------------

const ajv = new Ajv({ allErrors: true, strict: false });

const defs = (contractSchema as { definitions: Record<string, object> }).definitions;
function compile(ref: string): ValidateFunction {
  const schema = { $schema: "http://json-schema.org/draft-07/schema#", definitions: defs, $ref: `#/definitions/${ref}` };
  return ajv.compile(schema);
}

const validatePlanShape = compile("MotionPlan");
const validateCatalogShape = compile("MotionCatalog");
const validateManifestShape = compile("MotionManifest");
const validateEntryShape = compile("MotionEntry");

export interface ShapeResult<T> {
  value?: T;
  error?: string;
}

function formatAjvError(v: ValidateFunction): string {
  const errs = (v.errors ?? []).slice(0, 4).map((e) => `${e.instancePath || "/"} ${e.message ?? ""}`);
  return errs.join("; ");
}

export function parseMotionPlan(raw: unknown): ShapeResult<MotionPlan> {
  if (!validatePlanShape(raw)) return { error: `MotionPlan 形状不合法：${formatAjvError(validatePlanShape)}` };
  return { value: raw as MotionPlan };
}

export function parseMotionCatalog(raw: unknown): ShapeResult<MotionCatalog> {
  if (!validateCatalogShape(raw)) return { error: `MotionCatalog 形状不合法：${formatAjvError(validateCatalogShape)}` };
  return { value: raw as MotionCatalog };
}

export function parseMotionManifest(raw: unknown): ShapeResult<MotionManifest> {
  if (!validateManifestShape(raw)) return { error: `MotionManifest 形状不合法：${formatAjvError(validateManifestShape)}` };
  return { value: raw as MotionManifest };
}

export function parseMotionEntry(raw: unknown): ShapeResult<MotionEntry> {
  if (!validateEntryShape(raw)) return { error: `MotionEntry 形状不合法：${formatAjvError(validateEntryShape)}` };
  return { value: raw as MotionEntry };
}
