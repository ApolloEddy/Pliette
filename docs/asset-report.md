# AssetReport · Pliette P0 阶段

更新：2026-09-07（第二次：拉菲真实资产验收完成）· 状态：**P0 管线与用户角色均已验证**

## 1. 结论速览

| 项 | 状态 | 说明 |
| --- | --- | --- |
| 官方运行时接入 | ✅ 已验证 | spine-ts **3.6.53**（vendor 锁定，哈希见 `runtime-lock.md`） |
| 管线可用（官方示例） | ✅ 已验证 | spineboy / goblins / stretchyman 三套资产加载、解析、渲染、采样全部通过 |
| 用户角色可用（lafei_8） | ✅ 已验证 | 转换 + 加载 + 双模式目视 + 结构核对 + H 标定全部完成（见第 4 节） |
| 正反面组织 | ✅ 已核查 | **仅正面**：无背面皮肤/附件；`_left` 为朝左行为变体非背面（Spec 4.2 判定，详见 4.3） |

完整结构报告：[experiments/p0-lafei/lafei_8.asset-report.md](../experiments/p0-lafei/lafei_8.asset-report.md)（含附件按 Slot 清单 JSON）。

## 2. 播放器管线验证（官方示例资产）

来源：spine-runtimes 标签 3.6.53 `examples/<角色>/export/`，导出 JSON 内嵌版本 **3.6.32**（major.minor 与运行时 3.6 匹配）。加载链：`官方 TextureAtlas → AtlasAttachmentLoader → SkeletonJson → Skeleton / AnimationState → SceneRenderer(WebGL) → 完整角色画布 → Three.js CanvasTexture → 纸片平面`。

| 资产 | 骨骼 | 动画 | 验证点 | 结果 |
| --- | --- | --- | --- | --- |
| spineboy-pma | 65 | 11（walk/run/aim 等） | PMA 透明、3D 纸片、动画列表、逐帧 | ✅ 截图目视 + 60 FPS |
| goblins-pma | — | — | 双 Skin（`skins.length ≥ 2` 断言） | ✅ 单元测试 |
| stretchyman-pma | — | — | IK 约束（骨骼链 + 目标存在） | ✅ 单元测试 |

透明验收：3D 场景中画布 alpha=0（透明纸片、无黑边/矩形底板，lab2 截图）；平面模式保留不透明底色用于黑/白/灰/绿背景切换验收（Spec 5.2）。

## 3. 编译语义的重要实测结论（影响所有后续动作工作）

按 Spec D.5「用该版本 API 的实际采样结果验收」，在 3.6.53 运行时上实测确认：

1. **RotateTimeline 的帧值是相对 setup 姿态的偏移量**：官方 apply 行为为 `bone.rotation += amount`（alpha=1）。MotionDraft 的 `rotate` 值（relativeToReference 偏移角）直接写入帧值即可，**不得叠加 setup 角**。
2. **CurveTimeline 内部布局**：每段 `BEZIER_SIZE=19` 槽位，段首标签 `LINEAR=0 / STEPPED=1 / BEZIER=2`；`setCurve(frameIndex, cx1, cy1, cx2, cy2)` 接收归一化控制点并展开为曲线查找表。
3. TranslateTimeline 按 setup 相对语义应用，H 比例 → Spine 单位换算（`heightUnits`）实测通过（0.05H 位移误差 < 浮点容差）。

以上均由 `npx vitest run`（tests/compiler.test.ts）以官方运行时采样断言固定，防回归。

## 4. lafei_8 真实资产验收（2026-09-07 完成）

### 4.1 二进制导入

采用现成工具 **wang606/SpineSkeletonDataConverter v3.8**（C++ 预编译 exe，活跃维护，PolyForm Noncommercial 许可，存于 `tools/spine-converter/`，仅本地工具不入分发产物）：`lafei_8.skel → lafei_8.json`，自动识别 3.6、同版本输出。转换产物经官方 3.6.53 运行时 node 端解析 + 动画采样 + 浏览器双模式目视验证。文件哈希记录于 `characters/lafei_8.character.json`。

### 4.2 结构核对（与 Spec D.2 预录逐项一致）

79 骨骼 ✓ · 42 Slot ✓ · 67 附件（Mesh×10/Region×57）✓ · 双腿 IK（leg_L1→leg_L3 / leg_R1→leg_R3，target 挂 root，mix=1）✓ · body setup rotation=-90° ✓ · face 与 body 为 bone 下兄弟节点 ✓ · Nonessential=false ✓ · **20 段动画**（stand/stand2 待机、walk/move/move_left 移动、attack/attack_left/skill 战斗、sit/sleep/wash/dance/victory/touch/tuozhuai/dead/yun/motou/normal）· 无导出事件。

### 4.3 正反面判定：仅正面（Spec 4.2 三种结构逐项排除）

1. 不是"不同 Skin/Attachment"——只有 default 一个皮肤，67 个附件中无任何 back/背面命名部件；
2. 不是"独立骨架"——move_left 与 move 的骨骼写集（78 根）与 attachment 切换（仅眼睛）完全一致，区别只在关键帧数值；
3. **结论**：`_left` 后缀是"朝左移动/攻击"的行为变体（Q 版常配素材），**不存在背面视图**。镜像不得当作背面；完整转身需后续素材，当前限制展示朝向、侧面变薄作为纸片视觉风格（Spec 5.1 允许）。

### 4.4 标定与绑定

- **heightUnits = 335**，脚底基准 y≈-2.4：由 setup / stand@0.01s / walk@0.58s 三个姿态的附件世界包围盒高度（333.8 / 332.8 / 337.0）取值，非纹理尺寸、非 skeleton 包围盒字段（D.2 要求的实际播放标定）。
- D.3 候选绑定全部存在性核实：body（rot=-90）、face、hand_L3（parent=hand_L）、hand_R3、leg_L/leg_R IK 目标、eye_L/eye_R。RigProfile 已写入标定值（`src/rig/rigProfile.ts`）。
- 面部能力实测（Spec 10.3）：eye_L 8 个 / eye_R 9 个附件变体（睁闭/大小/形状）+ meimao1 slot 5 种眉毛 + hongyun 红晕 + sleep2 睡眼 → **独立眼部附件级**，可做 slotState 表情切换；无 mouth slot，嘴部能力未证实，不宣称口型同步。
- 额外能力：sit 动画自带（坐姿素材直接支持）；道具附件丰富（dangao/kele/lanzi/mao_*/paopoo）。

### 4.5 视觉验收截图

`experiments/media/p0/lafei1.png`（平面基线，stand）、`lafei2.png`（3D 纸片，walk）。贴图、透明、轮廓与原资源一致；关闭全部新参数即恢复原资源形态（P0 通过条件）。

## 5. 复现方式

```bash
npm install
npm run dev        # 打开 Motion Lab，选择资产；?view=flat&anim=walk&probe=6 可复现确定性视角
npm run test       # 40 项测试：Schema 拒绝、官方运行时采样、调度幂等/冲突/局部取消
```

Lab 的「AssetReport」按钮生成当前资产的完整报告（骨骼层级 / Slot / 皮肤附件类型分布 / IK / 动画 Timeline 分布 / 图集页）。
