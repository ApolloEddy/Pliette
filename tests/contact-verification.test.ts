/**
 * 接触类动作接触约束验证（MotionLibrary Spec §4.4 requiredContacts / §15.2 接触误差）：
 * contact.chin_rest / contact.cheek_touch / contact.scratch_head 在视觉验收
 * （台账 TUNING-LOG 创作批次：chin_rest v4 四轮迭代、cheek_touch/scratch_head 冻结截图）
 * 基础上建立"手-脸"确定性接触约束：
 *   1) 探针 = 手部佩戴锚点（hand_R2/hand_L2 槽位当前附件——可乐/手套精灵的骨骼局部基准点，
 *      即视觉上"碰到脸"的可见手部载体的跟随点）；
 *   2) 接触锚点 = 相对面骨的偏移（H 单位），随头部姿态移动；标定方法与 touch_table 场景一致
 *      （视觉定稿姿态 → 实测手位 → 冻结锚点与阈值）；
 *   3) 接触窗口内探针到锚点距离误差 ≤ maxErrorH（与 touch_table 的 0.02H 同标准）；
 *   4) 解剖学约束：锚点必须落在面部邻域（0.10–0.28H）且在正确侧（|x| ≥ 0.08H），
 *      不得把锚点定义到远处或脸中央凑数。
 * 验证通过是这三条 entry 提升 approved 的前置门（见 scripts/promote-manifest.mjs）。
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { spine36 as spine } from "spine-webgl";
import { parseControlProfile } from "../src/rig/controlProfile.js";
import { loadSkeleton } from "../src/assets/loader.js";
import { assembleRequest } from "../src/motion/author/context.js";
import { validateCandidate } from "../src/motion/author/validateV11.js";
import { budgetFor } from "../src/motion/author/protocol.js";

const lafeiAssetsAvailable = existsSync(resolve("public/assets-local/lafei_8/lafei_8.json"));

interface ContactSpec {
  schemaVersion: string;
  anchors: Record<string, { bone: string; offsetHX: number; offsetHY: number; anatomyNote: string; kind?: "side" | "under" }>;
  motions: Record<
    string,
    { draftFile: string; anchors: Record<string, string>; windowSec: [number, number]; maxErrorH: number }
  >;
}

function dummyTexture() {
  return { setFilters() {}, setWraps() {}, getImage: () => ({ width: 4, height: 4 }), getWidth: () => 4, getHeight: () => 4, dispose() {} };
}

/** 槽位当前附件的骨骼局部基准点 → 世界坐标（跟随骨骼变换） */
function slotAnchorWorld(sk: spine.Skeleton, slotName: string): { x: number; y: number } | null {
  const slot = sk.findSlot(slotName);
  const att = (slot as unknown as { attachment?: { x?: number; y?: number } } | null)?.attachment;
  if (!slot || !att) return null;
  const ax = att.x ?? 0;
  const ay = att.y ?? 0;
  const b = slot.bone;
  return { x: b.worldX + ax * b.a + ay * b.b, y: b.worldY + ax * b.c + ay * b.d };
}

describe("contact 类动作接触约束（转正前置门）", () => {
  if (!lafeiAssetsAvailable) return;

  const profile = parseControlProfile(JSON.parse(readFileSync(resolve("characters/lafei_8.rig-profile.json"), "utf-8")));
  const bundle = loadSkeleton({
    name: "lafei_8",
    skeletonJson: JSON.parse(readFileSync(resolve("public/assets-local/lafei_8/lafei_8.json"), "utf-8")),
    atlasText: readFileSync(resolve("public/assets-local/lafei_8/lafei_8.atlas.txt"), "utf-8"),
    createTexture: dummyTexture,
  });
  const H = profile.identity.heightUnits ?? 335;
  const spec: ContactSpec = JSON.parse(
    readFileSync(resolve("public/motion-library/models/lafei_8/front/contacts.json"), "utf-8"),
  );

  function sampleHandError(motionId: string): { maxErrorH: number; samples: number; probesH: Record<string, { x: number; y: number }> } {
    const req = spec.motions[motionId];
    const draftFile = JSON.parse(
      readFileSync(resolve("public/motion-library/models/lafei_8/front/drafts", req.draftFile), "utf-8"),
    );
    const subset = [...new Set<string>(draftFile.curves.map((c: { controlId: string }) => c.controlId))];
    const request = assembleRequest(profile, {
      requestId: `contact-${motionId}`,
      contextId: "contact-ctx",
      goal: "接触约束验证",
      runtimeState: { monoClockMs: 0, viewId: "front", skinId: "default", stateVersion: 1, occupiedChannels: [], contacts: [] },
      controlSubset: subset,
      budget: budgetFor("interaction"),
    });
    const raw = {
      status: "motion" as const,
      requestId: request.requestId,
      contextId: request.contextId,
      profileDigest: request.profileRef.profileDigest,
      draft: draftFile,
    };
    const result = validateCandidate(raw, request, profile, { skeletonData: bundle.skeletonData });
    const failures = result.findings.filter((f) => !f.note);
    expect(failures.map((f) => `${motionId}: ${f.code} ${f.message}`)).toEqual([]);
    expect(result.compiled, motionId).toBeDefined();
    const overlay = result.compiled!.animation;

    const skeleton = new spine.Skeleton(bundle.skeletonData);
    const stand = bundle.skeletonData.findAnimation("stand")!;
    const face = skeleton.findBone("face");
    expect(face, "face 骨").toBeDefined();

    const [w0, w1] = req.windowSec;
    const step = 0.05;
    let maxErrorH = 0;
    let samples = 0;
    const probesH: Record<string, { x: number; y: number }> = {};
    for (const [probeSlot, anchorId] of Object.entries(req.anchors)) {
      probesH[probeSlot] = { x: 0, y: 0 };
      const anchor = spec.anchors[anchorId];
      for (let t = w0; t <= w1 + 1e-9; t += step) {
        skeleton.setToSetupPose();
        stand.apply(skeleton, 0, 0, false, [], 1, spine.MixPose.setup, spine.MixDirection.in);
        // 与运行时叠加语义一致：track0 基础用 setup，overlay 轨道用 current（rotate 为 setup 相对偏移叠加）
        overlay.apply(skeleton, 0, Math.min(t, overlay.duration), false, [], 1, spine.MixPose.current, spine.MixDirection.in);
        skeleton.updateWorldTransform();
        const probe = slotAnchorWorld(skeleton, probeSlot);
        expect(probe, `${motionId} 探针槽位 ${probeSlot} 在接触窗口必须有附件`).toBeDefined();
        const err = Math.hypot(
          (probe!.x - (face!.worldX + anchor.offsetHX * H)) / H,
          (probe!.y - (face!.worldY + anchor.offsetHY * H)) / H,
        );
        maxErrorH = Math.max(maxErrorH, err);
        probesH[probeSlot] = { x: (probe!.x - face!.worldX) / H, y: (probe!.y - face!.worldY) / H };
        samples += 1;
      }
    }
    return { maxErrorH, samples, probesH };
  }

  for (const motionId of Object.keys(spec.motions)) {
    it(`${motionId}：接触窗口内手-锚点误差 ≤ ${spec.motions[motionId].maxErrorH}H`, () => {
      const { maxErrorH, samples, probesH } = sampleHandError(motionId);
      const req = spec.motions[motionId];
      console.log(
        `[contact] ${motionId}: 窗口 ${samples} 采样 max=${maxErrorH.toFixed(4)}H（阈值 ${req.maxErrorH}H）手部锚点(相对face) ` +
          Object.entries(probesH)
            .map(([s, o]) => `${s}=(${o.x.toFixed(3)},${o.y.toFixed(3)})H`)
            .join(" "),
      );
      expect(maxErrorH, `${motionId} 接触误差 ${maxErrorH.toFixed(4)}H 超阈值 ${req.maxErrorH}H`).toBeLessThanOrEqual(req.maxErrorH);
    });
  }

  it("锚点解剖学约束：side=脸侧（|x| ≥ 0.08H）；under=下巴正下（|x| ≤ 0.06H 且 y ≤ −0.08H）；均须在面部邻域（0.10–0.28H）", () => {
    for (const [id, a] of Object.entries(spec.anchors)) {
      const r = Math.hypot(a.offsetHX, a.offsetHY);
      expect(r, `${id} 锚点偏移 ${r.toFixed(3)}H 不在面部邻域内`).toBeGreaterThanOrEqual(0.1);
      expect(r, `${id} 锚点偏移 ${r.toFixed(3)}H 超出面部邻域`).toBeLessThanOrEqual(0.28);
      if (a.kind === "under") {
        expect(Math.abs(a.offsetHX), `${id} 下巴下方锚点偏中（|x|=${Math.abs(a.offsetHX).toFixed(3)}H）`).toBeLessThanOrEqual(0.06);
        expect(a.offsetHY, `${id} 下巴下方锚点必须低于 face 骨（y=${a.offsetHY.toFixed(3)}H）`).toBeLessThanOrEqual(-0.08);
      } else {
        expect(Math.abs(a.offsetHX), `${id} 锚点不在脸侧（|x|=${Math.abs(a.offsetHX).toFixed(3)}H）`).toBeGreaterThanOrEqual(0.08);
      }
    }
  });
});
