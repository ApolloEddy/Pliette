import { spine36 as spine } from "spine-webgl";
import { SPINE_RUNTIME_VERSION } from "../version.js";

/** 一次资产导入的完整产物（Spec 4.1） */
export interface AssetBundle {
  name: string;
  atlas: spine.TextureAtlas;
  skeletonData: spine.SkeletonData;
  rawJson: Record<string, unknown>;
  atlasText: string;
  exportVersion: string;
}

export interface VersionCheck {
  ok: boolean;
  exportVersion: string;
  message: string;
}

/** 导出数据与运行时必须匹配 major.minor（Spec 3.1 / 16）。 */
export function checkVersion(rawJson: unknown, runtimeVersion: string = SPINE_RUNTIME_VERSION): VersionCheck {
  const exportVersion = String((rawJson as any)?.skeleton?.spine ?? "unknown");
  const eParts = exportVersion.split(".").map(Number);
  const rParts = runtimeVersion.split(".").map(Number);
  const ok = eParts[0] === rParts[0] && eParts[1] === rParts[1];
  return {
    ok,
    exportVersion,
    message: ok
      ? `导出版本 ${exportVersion} 与运行时 ${runtimeVersion} 的 major.minor 匹配`
      : `导出版本 ${exportVersion} 与运行时 ${runtimeVersion} 的 major.minor 不匹配，已拒绝加载`,
  };
}

export interface LoadArgs {
  name: string;
  /** 已解析的 Spine 导出 JSON（对象） */
  skeletonJson: unknown;
  atlasText: string;
  /** 每页贴图工厂；浏览器传 GLTexture 工厂，node 检查/测试场景省略（不渲染） */
  createTexture?: (imagePath: string) => unknown;
}

/** 用官方运行时解析 skeleton JSON + atlas。版本不匹配直接抛错，不做兜底修补（Spec 4.1）。 */
export function loadSkeleton(args: LoadArgs): AssetBundle {
  const check = checkVersion(args.skeletonJson);
  if (!check.ok) throw new Error(check.message);
  const atlas = new spine.TextureAtlas(args.atlasText, (path: string) => args.createTexture?.(path));
  const attachmentLoader = new spine.AtlasAttachmentLoader(atlas);
  const json = new spine.SkeletonJson(attachmentLoader);
  const skeletonData = json.readSkeletonData(args.skeletonJson as any);
  return {
    name: args.name,
    atlas,
    skeletonData,
    rawJson: args.skeletonJson as Record<string, unknown>,
    atlasText: args.atlasText,
    exportVersion: check.exportVersion,
  };
}
