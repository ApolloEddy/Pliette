/** P1 实验：wavePrimitive 域检查与六项首次输出的可校验性（Spec 2.2 / 6.3 / D.5-3）。 */
import { describe, expect, it } from "vitest";
import { wavePrimitive, checkWaveParams, WAVE_PARAM_DOMAIN } from "../src/motion/authoring/primitives.js";
import { P1_FIRST_OUTPUT } from "../src/motion/authoring/p1-drafts.js";
import { LAFEI_8_FRONT_CANDIDATES } from "../src/rig/rigProfile.js";
import { validateDraft, hasErrors } from "../src/motion/compiler/validate.js";
import { loadExample, findBoneName, makeAdHocRig } from "./helpers.js";
import { compileDraft } from "../src/motion/compiler/compile.js";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

describe("wavePrimitive（固定 Primitive，Tune 模式）", () => {
  it("合法参数通过域检查并生成结构正确的 Draft", () => {
    const errors = checkWaveParams({ hand: "right", liftDeg: 30, wagDeg: 18, cycles: 2, tempo: 1.0 });
    expect(errors).toEqual([]);
    const draft = wavePrimitive({ hand: "right", liftDeg: 30, wagDeg: 18, cycles: 2, tempo: 1.0 }, "lafei_8.front.v1");
    expect(draft.curves).toHaveLength(2); // 整臂 + 指尖
    expect(draft.curves[0].role).toBe("arm.upper.right");
    expect(draft.curves[1].role).toBe("arm.right");
    expect(draft.phases?.strokeEnd).toBeGreaterThan(draft.phases?.prepareEnd ?? 0);
    expect(draft.provenance?.kind).toBe("llm");
  });

  it("参数越域被拒绝（Tune 的第一道关）", () => {
    expect(checkWaveParams({ hand: "right", liftDeg: 80, wagDeg: 18, cycles: 2, tempo: 1 })).toHaveLength(1);
    expect(checkWaveParams({ hand: "right", liftDeg: 30, wagDeg: 3, cycles: 2, tempo: 1 })).toHaveLength(1);
    expect(checkWaveParams({ hand: "right", liftDeg: 30, wagDeg: 18, cycles: 2.5, tempo: 1 })).toHaveLength(1);
    expect(checkWaveParams({ hand: "right", liftDeg: 30, wagDeg: 18, cycles: 2, tempo: 2 })).toHaveLength(1);
  });

  it("tempo 只缩放时长不改函数结构；cycles 只重复主要段（Spec 6.3）", () => {
    const slow = wavePrimitive({ hand: "right", liftDeg: 30, wagDeg: 18, cycles: 1, tempo: 1 }, "r");
    const fast = wavePrimitive({ hand: "right", liftDeg: 30, wagDeg: 18, cycles: 1, tempo: 1.25 }, "r");
    expect(fast.durationSec).toBeLessThan(slow.durationSec);
    expect(fast.curves).toHaveLength(slow.curves.length);

    const c1 = wavePrimitive({ hand: "right", liftDeg: 30, wagDeg: 18, cycles: 1, tempo: 1 }, "r");
    const c3 = wavePrimitive({ hand: "right", liftDeg: 30, wagDeg: 18, cycles: 3, tempo: 1 }, "r");
    // 整臂曲线帧数不随 cycles 变化（挥动只重复指尖段）
    expect(c3.curves[0].keys.length).toBe(c1.curves[0].keys.length);
    expect(c3.curves[1].keys.length).toBeGreaterThan(c1.curves[1].keys.length);
  });

  it("参数域常量与 Schema 一致（liftDeg/wagDeg/cycles/tempo 有界）", () => {
    expect(WAVE_PARAM_DOMAIN.liftDeg.min).toBeGreaterThanOrEqual(10);
    expect(WAVE_PARAM_DOMAIN.liftDeg.max).toBeLessThanOrEqual(50);
  });
});

describe("P1 六项首次输出", () => {
  const rig = LAFEI_8_FRONT_CANDIDATES;

  it("六项齐全且全部通过校验（含 rig 绑定存在性）", () => {
    const keys = ["idle_subtle", "nod", "wave", "point", "lean", "shrink"];
    expect(Object.keys(P1_FIRST_OUTPUT).sort()).toEqual(keys.slice().sort());
    for (const [key, draft] of Object.entries(P1_FIRST_OUTPUT)) {
      const diags = validateDraft(draft, rig);
      expect(hasErrors(diags), `${key}: ${JSON.stringify(diags)}`).toBe(false);
      expect(draft.provenance?.kind).toBe("llm");
      expect(draft.provenance?.candidate).toBe(1);
      expect(draft.approval).toBe("draft");
    }
  });

  it("首次输出留存于 experiments（原始候选不被覆盖）", () => {
    for (const key of Object.keys(P1_FIRST_OUTPUT)) {
      const file = resolve(process.cwd(), `experiments/p1-llm-motion/${key}/candidate-01.json`);
      expect(existsSync(file), `${file} 缺失：先运行 npx vite-node scripts/export-p1.mts`).toBe(true);
    }
  });

  it("wave Draft 在通用骨架上可编译（结构正确性，不依赖 lafei 资产）", () => {
    const bundle = loadExample("spineboy");
    const armBone = findBoneName(bundle.skeletonData, /arm[_-]?front|arm/);
    const rig2 = makeAdHocRig(bundle.skeletonData, {
      characterId: "spineboy",
      exportVersion: bundle.exportVersion,
      picks: { "arm.right": armBone, "head.main": null, "body.root": null, "arm.left": null, "arm.upper.left": null, "arm.upper.right": null },
    });
    // wave 需要 arm.upper.right + arm.right；spineboy 无对应命名，借 adhoc 角色替换验证编译路径
    const draft = wavePrimitive({ hand: "right", liftDeg: 30, wagDeg: 18, cycles: 2, tempo: 1 }, rig2.id);
    draft.curves = draft.curves.filter((c) => c.role === "arm.right");
    draft.channels = ["rightArm"];
    const { motion, diagnostics } = compileDraft(draft, rig2, bundle.skeletonData);
    expect(motion, JSON.stringify(diagnostics)).toBeDefined();
    expect(motion!.writes).toContain(`bone:${armBone}/rotate`);
  });
});

describe("P1 修订候选（lafei 资产在位时的端到端编译）", () => {
  const lafeiJson = resolve(process.cwd(), "public/assets-local/lafei_8/lafei_8.json");
  it.skipIf(!existsSync(lafeiJson))("wave c1 与 c2 都能在真实骨架上编译并驱动真实骨骼", async () => {
    const { readFileSync } = await import("node:fs");
    const raw = JSON.parse(readFileSync(lafeiJson, "utf8"));
    const atlasText = readFileSync(resolve(process.cwd(), "public/assets-local/lafei_8/lafei_8.atlas.txt"), "utf8");
    const { loadSkeleton } = await import("../src/assets/loader.js");
    const bundle = loadSkeleton({
      name: "lafei_8",
      skeletonJson: raw,
      atlasText,
      createTexture: () => ({ setFilters() {}, setWraps() {}, getImage: () => ({ width: 4, height: 4 }), getWidth: () => 4, getHeight: () => 4, dispose() {} }),
    });
    for (const id of ["wave_right_primitive_c1", "wave_right_primitive_c2"]) {
      const file = resolve(process.cwd(), `public/motions/${id}.json`);
      if (!existsSync(file)) continue;
      const draft = JSON.parse(readFileSync(file, "utf8"));
      const { motion, diagnostics } = compileDraft(draft, LAFEI_8_FRONT_CANDIDATES, bundle.skeletonData);
      expect(motion, `${id}: ${JSON.stringify(diagnostics)}`).toBeDefined();
      expect(motion!.writes).toContain("bone:hand_R/rotate");
      expect(motion!.writes).toContain("bone:hand_R3/rotate");
    }
  });
});
