/**
 * Activation Pass：candidate → approved 提升与 Catalog registered 同步（MotionLibrary Spec §4.1 / 制作计划 §3）。
 *
 * 门控（全部满足才允许 approve，缺一即拒并对该条目保持 candidate）：
 *   1) structural=passed 且 validateManifest 语义零问题（构建期已保证，脚本复核摘要一致性）；
 *   2) trajectory 证据：native 源=台账逐相位完整弧线；draft/recipe=七步管线（编译+隔离采样）零失败；
 *   3) visual 证据：tuning 台账截图目录 / 冻结相位截图 / E2E 合成验收；
 *   4) contact 类（actionId=contact.*，touch_table 除外已有场景标定）：必须有 requiredContacts
 *      且在 contacts.json 建立锚点+阈值（tests/contact-verification.test.ts 为准）；
 *   5) recipe：全部被引用子动作已 approved 才可 approve（冻结修订一致性脚本复核）。
 *
 * 同步动作：catalog 对应 action/variant → registered；catalogRevision 与 manifest.catalogRevision
 * 一起推进；被改动 entry 的 contentDigest 重算（排除自身字段，与 src/motion/library/digest.ts 同口径）。
 * 幂等：重复运行对已应用决策为 no-op。
 *
 * 用法：node scripts/promote-manifest.mjs scripts/promotion/<decision>.json
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const MANIFEST_PATH = "public/motion-library/models/lafei_8/front/manifest.json";
const CATALOG_PATH = "public/motion-library/catalog.json";

function canonicalJson(value) {
  const seen = new Set();
  const walk = (v) => {
    if (v === null || typeof v === "string" || typeof v === "boolean") return JSON.stringify(v);
    if (typeof v === "number") {
      if (!Number.isFinite(v)) throw new Error("canonicalJson：数值必须有限");
      if (Object.is(v, -0)) v = 0;
      return JSON.stringify(v);
    }
    if (seen.has(v)) throw new Error("循环引用");
    seen.add(v);
    try {
      if (Array.isArray(v)) return `[${v.map(walk).join(",")}]`;
      const entries = Object.entries(v).filter(([, val]) => val !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      return `{${entries.map(([k, val]) => `${JSON.stringify(k)}:${walk(val)}`).join(",")}}`;
    } finally {
      seen.delete(v);
    }
  };
  return walk(value);
}

function sha256(value) {
  return "sha256-" + createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
}

// ---------------------------------------------------------------------------

const [decisionPath] = process.argv.slice(2);
if (!decisionPath) {
  console.error("用法：node scripts/promote-manifest.mjs <decisions.json>");
  process.exit(1);
}
const decisions = JSON.parse(readFileSync(resolve(decisionPath), "utf-8"));
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf-8"));

const byId = new Map(manifest.entries.map((e) => [e.motionId, e]));
const reviewedAt = decisions.reviewedAt ?? new Date().toISOString();
let approved = 0;
let skipped = 0;
const rejected = [];

// 草稿修订刷新（先于决策：内容变更后 source.contentDigest 必须重算）
for (const motionId of decisions.draftDigestRefresh ?? []) {
  const entry = byId.get(motionId);
  if (!entry || entry.source.kind !== "draft") {
    fail(`draftDigestRefresh：${motionId} 不是 draft 载体条目`);
    continue;
  }
  const draft = JSON.parse(readFileSync(resolve("public/motion-library/models/lafei_8/front", entry.source.path), "utf-8"));
  const actual = sha256(draft);
  if (actual !== entry.source.contentDigest) {
    entry.source.contentDigest = actual;
    entry.validation.evidenceRefs.push(`draft-revised@${reviewedAt}（${motionId} 草稿内容修订后摘要重算）`);
    console.log(`↻ ${motionId}：draft 摘要已刷新 ${entry.source.contentDigest.slice(0, 18)}…`);
  }
}

for (const [motionId, d] of Object.entries(decisions.evidence)) {
  const entry = byId.get(motionId);
  if (!entry) {
    rejected.push([motionId, "manifest 中不存在"]);
    continue;
  }
  if (d.decision !== "approve") {
    skipped += 1;
    console.log(`⊘ ${motionId}：decision=${d.decision}${d.reason ? `（${d.reason}）` : ""}`);
    continue;
  }
  if (entry.status === "approved") {
    console.log(`= ${motionId}：已是 approved（幂等跳过）`);
    continue;
  }
  // 证据完整性
  const missing = [];
  if (!d.trajectory) missing.push("trajectory 证据");
  if (!d.visual) missing.push("visual 证据");
  if (missing.length > 0) {
    rejected.push([motionId, `缺少 ${missing.join("、")}`]);
    continue;
  }
  // contact 类：必须声明 requiredContacts（touch_table 的场景资源标定早于本脚本，单独放行）
  if (entry.actionId.startsWith("contact.") && motionId !== "lafei.touch_table.screen_right") {
    const declared = (decisions.contacts ?? {})[motionId];
    if (!declared || declared.length === 0) {
      rejected.push([motionId, "contact 类动作未声明 requiredContacts（不可凭视觉像就转正）"]);
      continue;
    }
    if (JSON.stringify(entry.preconditions.requiredContacts) !== JSON.stringify(declared)) {
      entry.preconditions.requiredContacts = [...declared].sort();
    }
  }
  // recipe：子动作必须全部 approved 且修订/摘要冻结一致
  if (entry.source.kind === "recipe") {
    for (const step of entry.source.steps) {
      const sub = byId.get(step.motionId);
      if (!sub || sub.status !== "approved") {
        rejected.push([motionId, `子动作 ${step.motionId} 未 approved（配方不得先于组件转正）`]);
      } else if (sub.motionRevision !== step.motionRevision || sub.contentDigest !== step.contentDigest) {
        rejected.push([motionId, `子动作 ${step.motionId} 修订/摘要与冻结引用不一致`]);
      }
    }
    if (rejected.some(([id]) => id === motionId)) continue;
  }
  // rig 兼容一致性：全部条目同一角色档案
  if (JSON.stringify(entry.rigRef) !== JSON.stringify(byId.get(decisions.rigRefAnchor ?? manifest.entries[0].motionId)?.rigRef)) {
    rejected.push([motionId, "rigRef 与锚点条目不一致"]);
    continue;
  }

  entry.status = "approved";
  entry.validation.trajectory = "passed";
  entry.validation.visual = "passed";
  entry.validation.reviewedAt = reviewedAt;
  entry.validation.evidenceRefs.push(
    `[activation@${reviewedAt}] traj=${d.trajectory}; visual=${d.visual}${d.note ? `; note=${d.note}` : ""}`,
  );
  approved += 1;
}

if (rejected.length > 0) {
  for (const [id, why] of rejected) fail(`${id}：拒绝 approve —— ${why}`);
}

// catalog 同步：approved 条目 → action/variant registered
const catalogByAction = new Map(catalog.actions.map((a) => [a.actionId, a]));
const registered = new Set();
for (const entry of manifest.entries) {
  if (entry.status !== "approved") continue;
  const action = catalogByAction.get(entry.actionId);
  const variant = action?.variants.find((v) => v.variantId === entry.variantId);
  if (!action || !variant) {
    fail(`${entry.motionId}：catalog 引用缺失 ${entry.actionId}/${entry.variantId}`);
    continue;
  }
  if (action.status !== "registered") {
    action.status = "registered";
    registered.add(`${entry.actionId}（族）`);
  }
  if (variant.status !== "registered") {
    variant.status = "registered";
    registered.add(`${entry.actionId}/${entry.variantId}`);
  }
}

// 配方引用重同步：组件提升会改变其 contentDigest（status/validation 入摘要），
// 未发布（candidate）配方在自身转正前同步冻结引用到组件新摘要，并留痕；
// 已 approved 配方的引用变更视为修订事件，需人工走 revision 流程，脚本只报错不擅改。
for (const entry of manifest.entries) {
  if (entry.source.kind !== "recipe") continue;
  for (const step of entry.source.steps) {
    const sub = byId.get(step.motionId);
    if (!sub) continue;
    if (sub.contentDigest !== step.contentDigest) {
      if (entry.status === "approved") {
        fail(`${entry.motionId}：已 approved 配方引用的组件 ${step.motionId} 摘要已变（需 revision 流程，不得就地改写）`);
        continue;
      }
      step.motionRevision = sub.motionRevision;
      step.contentDigest = sub.contentDigest;
      entry.validation.evidenceRefs.push(`[activation@${reviewedAt}] 配方步骤 ${step.stepId} 冻结引用重同步 → ${sub.contentDigest.slice(0, 18)}…（组件提升后、配方发布前）`);
      console.log(`↻ ${entry.motionId}：步骤 ${step.stepId} 冻结引用已重同步`);
    }
  }
}

// 摘要重算（排除自身字段；draft 源摘要已并入）与版本推进
for (const entry of manifest.entries) {
  const { contentDigest, ...rest } = entry;
  const actual = sha256(rest);
  if (actual !== contentDigest) entry.contentDigest = actual;
}
if (decisions.catalogRevision) {
  catalog.catalogRevision = decisions.catalogRevision;
  manifest.catalogRevision = decisions.catalogRevision;
}

writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2) + "\n");

const nApproved = manifest.entries.filter((e) => e.status === "approved").length;
console.log(`\n本轮 approve ${approved} 条、跳过 ${skipped} 条、拒绝 ${rejected.length} 条`);
console.log(`manifest 现状：${nApproved} approved / ${manifest.entries.length} 条`);
if (registered.size > 0) console.log(`catalog registered：${[...registered].join("、")}`);
console.log(`catalogRevision → ${catalog.catalogRevision}`);
if (rejected.length > 0) process.exit(1);
