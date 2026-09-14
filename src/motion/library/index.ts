/**
 * 实现索引与精确匹配（MotionLibrary Spec v1.0 §5.1）：
 * 逻辑索引键 `actionId + variantId + segmentId` → 当前角色可播放实现。
 * 过滤：rigRef 兼容（profile/asset/视图/皮肤/运行时版本）、status=approved、参数域交集；
 * 选取：preferred 实现优先（构建配置），其余按已批准修订降序 + 稳定 ID 升序——
 * 固定输入与库版本必须产生固定结果（不让 LLM 评分）。
 * 纯数据逻辑；空库可启动（无数据库依赖）。
 */
import type { MotionEntry, MotionManifest, RigRef } from "./contracts.js";
import { parseMotionManifest } from "./contracts.js";

/** 当前角色的资产身份；索引按它过滤实现（§4.4 rigRef 绑定）。 */
export interface RigIdentity {
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

export function rigIdentityFrom(rigRef: RigRef): RigIdentity {
  return { ...rigRef };
}

export class ManifestParseError extends Error {}

/** 加载 manifest（结构 + catalogRevision 一致性）；损坏清单拒绝加载而非静默跳过。 */
export function loadManifest(raw: unknown, expectedCatalogRevision?: string): MotionManifest {
  const parsed = parseMotionManifest(raw);
  if (parsed.error || !parsed.value) throw new ManifestParseError(parsed.error);
  if (expectedCatalogRevision && parsed.value.catalogRevision !== expectedCatalogRevision) {
    throw new ManifestParseError(`manifest catalogRevision ${parsed.value.catalogRevision} ≠ 目录 ${expectedCatalogRevision}`);
  }
  return parsed.value;
}

export interface LookupKey {
  actionId: string;
  variantId: string;
  segmentId: string;
}

export function keyOf(k: LookupKey): string {
  return `${k.actionId}|${k.variantId}|${k.segmentId}`;
}

export interface IndexEntryMatch {
  entry: MotionEntry;
  /** 参与选取的排序键（诊断/评测输出用） */
  rank: string;
}

export interface LookupOutcome {
  matches: IndexEntryMatch[];
}

/**
 * 内存实现索引。第一版 JSON 清单 + Map；曲线按需加载由宿主承担。
 * 热更新 = 整表原子替换（build 新实例后切换引用），新旧引用不混用（§4.5-9）。
 */
export class MotionIndex {
  private byKey = new Map<string, MotionEntry[]>();
  private entries: MotionEntry[] = [];
  private preferred: ReadonlySet<string>;

  constructor(
    /** 逻辑键 → 偏好的 motionId（构建配置；缺省无偏好） */
    preferred: Record<string, string> = {},
  ) {
    this.preferred = new Set(Object.values(preferred));
  }

  /** 原子替换索引内容（热更新）。 */
  rebuild(manifest: MotionManifest): void {
    const byKey = new Map<string, MotionEntry[]>();
    for (const entry of manifest.entries) {
      for (const segmentId of Object.keys(entry.segments)) {
        const key = keyOf({ actionId: entry.actionId, variantId: entry.variantId, segmentId });
        const list = byKey.get(key) ?? [];
        list.push(entry);
        byKey.set(key, list);
      }
    }
    this.byKey = byKey;
    this.entries = [...manifest.entries];
  }

  all(): readonly MotionEntry[] {
    return this.entries;
  }

  /** rigRef 是否与当前角色兼容（§4.5-9：失效 profile/asset/revision 的实现移出可播放投影）。 */
  isCompatible(entry: MotionEntry, rig: RigIdentity): boolean {
    const r = entry.rigRef;
    return (
      r.modelId === rig.modelId &&
      r.profileId === rig.profileId &&
      r.profileDigest === rig.profileDigest &&
      r.assetDigest === rig.assetDigest &&
      r.referencePoseDigest === rig.referencePoseDigest &&
      r.viewId === rig.viewId &&
      r.skinId === rig.skinId &&
      r.runtimeVersion === rig.runtimeVersion &&
      r.adapterVersion === rig.adapterVersion
    );
  }

  /**
   * 精确键查询 + 兼容过滤 + 确定性排序。
   * 来源（原生切片/离线 Agent/已验收在线）地位相同——来源不能越过验收与兼容检查（§5.1-5）。
   */
  lookup(key: LookupKey, rig: RigIdentity): LookupOutcome {
    const list = this.byKey.get(keyOf(key)) ?? [];
    const matches = list
      .filter((e) => e.status === "approved")
      .filter((e) => this.isCompatible(e, rig))
      .sort((a, b) => this.compare(a, b))
      .map((entry) => ({ entry, rank: this.rankOf(entry) }));
    return { matches };
  }

  private rankOf(e: MotionEntry): string {
    return `${e.motionId}@r${e.motionRevision}`;
  }

  private compare(a: MotionEntry, b: MotionEntry): number {
    const pa = this.preferred.has(a.motionId) ? 0 : 1;
    const pb = this.preferred.has(b.motionId) ? 0 : 1;
    if (pa !== pb) return pa - pb;
    if (b.motionRevision !== a.motionRevision) return b.motionRevision - a.motionRevision;
    return a.motionId < b.motionId ? -1 : a.motionId > b.motionId ? 1 : 0;
  }

  /** 按动作统计 approved 实现（目录投影用）。 */
  approvedCountByAction(): Map<string, number> {
    const out = new Map<string, number>();
    for (const e of this.entries) {
      if (e.status !== "approved") continue;
      out.set(e.actionId, (out.get(e.actionId) ?? 0) + 1);
    }
    return out;
  }
}
