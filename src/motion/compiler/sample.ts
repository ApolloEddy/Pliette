/** 官方运行时数值采样：验收编译产物是否真实生效（Spec 15.5 / D.5）。 */
import { spine36 as spine } from "spine-webgl";

export interface BoneSample {
  /** 动画后的局部旋转（度） */
  rotation: number;
  /** 参考姿态局部旋转（度） */
  setupRotation: number;
  x: number;
  y: number;
  worldX: number;
  worldY: number;
}

export function sampleBone(
  skeletonData: spine.SkeletonData,
  animation: spine.Animation,
  boneName: string,
  times: number[],
): BoneSample[] {
  const boneIndex = skeletonData.findBoneIndex(boneName);
  if (boneIndex < 0) throw new Error(`采样目标骨骼不存在: ${boneName}`);
  const skeleton = new spine.Skeleton(skeletonData);
  const setupRotation = skeletonData.bones[boneIndex].rotation;
  return times.map((t) => {
    skeleton.setToSetupPose();
    animation.apply(skeleton, 0, t, false, [], 1, spine.MixPose.setup, spine.MixDirection.in);
    skeleton.updateWorldTransform();
    const b = skeleton.bones[boneIndex];
    return { rotation: b.rotation, setupRotation, x: b.x, y: b.y, worldX: b.worldX, worldY: b.worldY };
  });
}
