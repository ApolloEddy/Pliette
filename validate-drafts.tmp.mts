import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { parseControlProfile } from "./src/rig/controlProfile.js";
import { assembleRequest } from "./src/motion/author/context.js";
import { validateCandidate } from "./src/motion/author/validateV11.js";
import { loadSkeleton } from "./src/assets/loader.js";
import { budgetFor } from "./src/motion/author/protocol.js";

const profile = parseControlProfile(JSON.parse(readFileSync(resolve("characters/lafei_8.rig-profile.json"), "utf-8")));
const dummy = () => ({ setFilters() {}, setWraps() {}, getImage: () => ({ width: 4, height: 4 }), getWidth: () => 4, getHeight: () => 4, dispose() {} });
const bundle = loadSkeleton({
  name: "lafei_8",
  skeletonJson: JSON.parse(readFileSync(resolve("public/assets-local/lafei_8/lafei_8.json"), "utf-8")),
  atlasText: readFileSync(resolve("public/assets-local/lafei_8/lafei_8.atlas.txt"), "utf-8"),
  createTexture: dummy,
});

const dir = resolve("public/motion-library/models/lafei_8/front/drafts");
let pass = 0, fail = 0;
for (const file of readdirSync(dir).filter((f) => f.endsWith(".v11.json"))) {
  const draft = JSON.parse(readFileSync(resolve(dir, file), "utf-8"));
  const subset = [...new Set(draft.curves.map((c: any) => c.controlId))];
  const request = assembleRequest(profile, {
    requestId: `validate-${file}`, contextId: "ctx", goal: "batch validate",
    runtimeState: { monoClockMs: 0, viewId: "front", skinId: "default", stateVersion: 1, occupiedChannels: [], contacts: [] },
    controlSubset: subset,
    budget: budgetFor("interaction"),
  });
  const raw = { status: "motion", requestId: request.requestId, contextId: request.contextId, profileDigest: request.profileRef.profileDigest, draft };
  const result = validateCandidate(raw, request, profile, { skeletonData: bundle.skeletonData });
  const failures = result.findings.filter((f) => !f.note);
  if (result.ok && result.compiled) {
    pass++;
    console.log(`✓ ${file}`);
  } else {
    fail++;
    console.log(`✗ ${file}: ${failures.map((f) => `${f.code}(${f.controlId ?? ""} ${f.expected ?? ""} vs ${f.actual ?? ""})`).join("; ")}`);
  }
}
console.log(`\n${pass} 通过 / ${fail} 失败`);
