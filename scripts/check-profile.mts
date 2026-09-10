/**
 * ControlProfile 档案源校验器：严格解析 + 摘要输出。
 * 用法: npx vite-node scripts/check-profile.mts <profile.json> [profile2.json ...]
 * 任何结构/引用问题都以非零退出码失败（Guide Builder 的前置检查）。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseControlProfile, openControls } from "../src/rig/controlProfile.js";

let failed = false;
for (const arg of process.argv.slice(2)) {
  const path = resolve(process.cwd(), arg);
  try {
    const p = parseControlProfile(JSON.parse(readFileSync(path, "utf-8")));
    const open = openControls(p);
    console.log(`✅ ${arg}`);
    console.log(`   profileId=${p.identity.profileId} rev=${p.identity.profileRevision} digest=${p.profileDigest}`);
    console.log(`   controls=${p.controls.length}（开放 ${open.length}） rules=${p.rules.length} evidence=${p.evidence.length}`);
    if (open.length === 0) console.log("   ⚠ 当前无 verified 控制器——指导书尚未完成标定（候选状态）");
  } catch (e) {
    failed = true;
    console.error(`❌ ${arg}\n   ${e instanceof Error ? e.message : e}`);
  }
}
process.exit(failed ? 1 : 0);
