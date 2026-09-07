/** 测试公用：从 public/examples 加载官方示例资产（node 环境，dummy 贴图）。 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadSkeleton, type AssetBundle } from "../src/assets/loader.js";
import { makeAdHocRig } from "../src/rig/rigProfile.js";
import type { spine36 as spine } from "spine-webgl";

/** 满足官方 TextureAtlas 解析期调用的最小贴图对象（node 无 GL，不渲染）。 */
function dummyTexture(): unknown {
  const image = { width: 4, height: 4 };
  return {
    setFilters() {},
    setWraps() {},
    getImage: () => image,
    getWidth: () => image.width,
    getHeight: () => image.height,
    dispose() {},
  };
}

export function loadExample(name: "spineboy" | "goblins" | "stretchyman"): AssetBundle {
  const dir = resolve(process.cwd(), "public/examples", name);
  const rawJson = JSON.parse(readFileSync(resolve(dir, `${name}-pro.json`), "utf-8"));
  const atlasText = readFileSync(resolve(dir, `${name}-pma.atlas`), "utf-8");
  return loadSkeleton({
    name,
    skeletonJson: rawJson,
    atlasText,
    createTexture: () => dummyTexture(),
  });
}

export function findBoneName(data: spine.SkeletonData, pattern: RegExp): string {
  const hit = data.bones.find((b) => pattern.test(b.name));
  if (!hit) throw new Error(`找不到匹配 ${pattern} 的骨骼`);
  return hit.name;
}

export { makeAdHocRig };
