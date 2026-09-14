/**
 * 语义目录视图（MotionLibrary Spec v1.0 §3.4 / §4.3）：
 * - 目录解析与投影：别名规范化、动作/变体/片段查询；
 * - 能力卡：由真实 catalog 生成的紧凑词表，供语义规划 LLM 消费；
 *   只暴露登记键与合法变体，不暴露资产路径、原始写集或审批状态。
 * 纯数据逻辑，不依赖 DOM / 网络。
 */
import type { CatalogAction, CatalogVariant, MotionCatalog } from "./contracts.js";
import { parseMotionCatalog, type ShapeResult } from "./contracts.js";
import { validateCatalog, type SemanticIssue } from "./validate.js";

export class CatalogParseError extends Error {}

/** 解析并做目录级语义校验；别名冲突等问题直接拒绝（别名必须唯一指向登记语义）。 */
export function loadCatalog(raw: unknown): MotionCatalog {
  const shape: ShapeResult<MotionCatalog> = parseMotionCatalog(raw);
  if (shape.error || !shape.value) throw new CatalogParseError(shape.error);
  const issues = validateCatalog(shape.value);
  const fatal = issues.filter((i) => i.code === "DUPLICATE_ACTION" || i.code === "AMBIGUOUS_ALIAS" || i.code === "DUPLICATE_VARIANT" || i.code === "MISSING_FULL_SEGMENT" || i.code === "UNKNOWN_CATEGORY");
  if (fatal.length > 0) {
    throw new CatalogParseError(fatal.map((i) => `${i.code}: ${i.message}`).join("; "));
  }
  return shape.value;
}

/** 目录投影：查询 + 别名规范化 + 能力卡。 */
export class CatalogView {
  readonly catalog: MotionCatalog;
  private readonly byAction = new Map<string, CatalogAction>();
  private readonly aliasToAction = new Map<string, string>();

  constructor(catalog: MotionCatalog) {
    this.catalog = catalog;
    for (const action of catalog.actions) {
      this.byAction.set(action.actionId, action);
      for (const alias of action.aliasesZh) {
        if (!this.aliasToAction.has(alias)) this.aliasToAction.set(alias, action.actionId);
      }
    }
  }

  get revision(): string {
    return this.catalog.catalogRevision;
  }

  action(actionId: string): CatalogAction | undefined {
    return this.byAction.get(actionId);
  }

  variant(actionId: string, variantId: string): CatalogVariant | undefined {
    return this.byAction.get(actionId)?.variants.find((v) => v.variantId === variantId);
  }

  /** 唯一静态别名规范化；记录原键（Spec 5.1-2）。非别名的未知词返回 undefined。 */
  normalizeAlias(word: string): { actionId: string; original: string } | undefined {
    const actionId = this.aliasToAction.get(word);
    if (!actionId) return undefined;
    return { actionId, original: word };
  }

  actionsByStatus(status: CatalogAction["status"]): CatalogAction[] {
    return this.catalog.actions.filter((a) => a.status === status);
  }

  /** 当前角色投影计数（Spec 3.4：不要把待制作条目当作可执行能力）。 */
  projection(entriesByAction: ReadonlyMap<string, { approved: number; generatable: boolean }>): {
    playable: number;
    registered: number;
    planned: number;
    unsupported: number;
  } {
    let playable = 0;
    let registered = 0;
    let planned = 0;
    let unsupported = 0;
    for (const action of this.catalog.actions) {
      const p = entriesByAction.get(action.actionId);
      if (p && p.approved > 0) playable += 1;
      else if (action.status === "registered") registered += 1;
      else if (p?.generatable || action.variants.some((v) => v.authorable === "capability_check")) unsupported += 1;
      else planned += 1;
    }
    return { playable, registered, planned, unsupported };
  }

  /**
   * 紧凑能力卡（LLM 输入）：键、简短语义、合法变体、可用片段、参数枚举、当前可用状态。
   * 目录较小时一次提供全部动作族（Spec 3.4）；增长后由调用方按类别裁剪，不引入向量库。
   */
  capabilityCards(opts: { playableActions?: ReadonlySet<string> } = {}): string[] {
    const lines: string[] = [
      `【动作目录 ${this.catalog.catalogRevision}】每个动作只能引用以下登记键；没有合适语义时用 actionId="custom"。`,
    ];
    for (const action of this.catalog.actions) {
      const playable = opts.playableActions?.has(action.actionId) ? "可播放" : action.status;
      const variants = action.variants
        .map((v) => {
          const params = Object.keys((v.parameterSchema.properties ?? {}) as Record<string, unknown>);
          const paramPart = params.length > 0 ? `；参数 ${params.join("/")}` : "";
          return `${v.variantId}[${v.status}${paramPart}]`;
        })
        .join("、");
      lines.push(`- ${action.actionId}（${action.label}，${action.priority}，${playable}）：变体 ${variants}；${action.productionNote}`);
    }
    return lines;
  }
}
