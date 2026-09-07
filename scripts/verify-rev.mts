import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadSkeleton } from "../src/assets/loader.ts";
import { LAFEI_8_FRONT_CANDIDATES } from "../src/rig/rigProfile.ts";
import { compileDraft } from "../src/motion/compiler/compile.ts";
const cwd = process.cwd();
const raw = JSON.parse(readFileSync(resolve(cwd, "public/assets-local/lafei_8/lafei_8.json"), "utf8"));
const atlasText = readFileSync(resolve(cwd, "public/assets-local/lafei_8/lafei_8.atlas.txt"), "utf8");
const bundle = loadSkeleton({ name: "lafei_8", skeletonJson: raw, atlasText, createTexture: () => ({ setFilters() {}, setWraps() {}, getImage: () => ({ width: 4, height: 4 }), getWidth: () => 4, getHeight: () => 4, dispose() {} }) });
for (const id of ["wave_right_primitive_c3", "idle_subtle_c2", "lean_listen_c2", "shrink_shy_c2", "point_right_c2"]) {
  const draft = JSON.parse(readFileSync(resolve(cwd, `public/motions/${id}.json`), "utf8"));
  const { motion, diagnostics } = compileDraft(draft, LAFEI_8_FRONT_CANDIDATES, bundle.skeletonData);
  console.log(id, motion ? `OK 写集=${motion.writes.join(",")}` : `FAIL ${JSON.stringify(diagnostics)}`);
}
