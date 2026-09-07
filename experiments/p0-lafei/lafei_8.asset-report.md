# AssetReport · lafei_8（真实资产验收）

生成：2026-09-07 · 导出版本 **3.6.52** · 运行时 3.6.53 · major.minor 匹配 ✅

- 骨骼 **79** · Slot **42** · 附件 **67**（mesh×11、region×56） · 皮肤：default（唯一）
- 动画 **20** 段：attack(1s)、attack_left(1s)、dance(1.17s)、dead(0.83s)、motou(7.33s)、move(6s)、move_left(6s)、normal(4.67s)、sit(1.33s)、skill(6s)、sleep(4s)、stand(20.33s)、stand2(20.33s)、touch(0.67s)、tuozhuai(0.83s)、tuozhuai2(0.83s)、victory(7.33s)、walk(1.17s)、wash(2.67s)、yun(2s)
- IK：leg_L leg_L1→leg_L3 target=leg_L mix=1；leg_R leg_R1→leg_R3 target=leg_R mix=1
- 事件：action、finish
- 标定：heightUnits=335，脚底基准 y=-2.4（setup/stand/walk 三姿态附件世界包围盒（333.8/332.8/337.0），非纹理尺寸）

## 正反面判定（Spec 4.2）

仅正面：唯一 default 皮肤、67 附件无任何 back 部件；move_left/attack_left 与正向版本骨骼写集与附件切换完全一致（仅关键帧数值不同），属朝左行为变体而非背面视图（Spec 4.2 判定）。镜像不得作为背面；完整转身需后续素材或限制展示朝向。

## 面部能力（Spec 10.3 分级）

eye_L/eye_R 各 8 个附件变体（睁闭/大小/形状），meimao1 slot 含 5 种眉毛，bushuang1/2 补丁，hongyun 红晕，sleep2 睡眼，dangao/kele/lanzi/mao_* 道具附件——表情/道具切换能力丰富，适合 slotState 控制器（Spec 10.3 分级：独立眼部附件）

## 转换记录

- 工具：wang606/SpineSkeletonDataConverter v3.8（PolyForm Noncommercial，本地工具目录，不入分发产物）
- 命令：`SpineSkeletonDataConverter.exe lafei_8.skel lafei_8.json`（自动识别 3.6，同版本输出）
- 原始 skel SHA-256 `b86c72e8...35f8c4`；转换 JSON SHA-256 `13e52701...313abc`
- 官方运行时加载验证：node 端 SkeletonJson 解析 + attack@0.5s 采样 + 浏览器 Lab 平面/3D 双模式目视（walk 动画、贴图、透明全部正常）