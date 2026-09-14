# MotionLibrary 制作计划（2026-09-14）

对应备案目录：`docs/motion-library/catalog-plan.json`（12 类、110 动作族、154 变体，全部 planned）。
本计划面向后续内容 Agent 与人工制作，逐模型给出真实控制/原动画映射、制作方法、证据要求与优先级。

## 0. 当前真实状态（不得当作已完成能力）

| 项 | 状态 |
|---|---|
| 目录备案 | 110 动作族/154 变体全部 `planned`；目录有记录 ≠ 当前角色能做 |
| manifest 条目 | **17 条 candidate**（9 §9.1 种子迁移 + 6 P0 扩展族 + 1 head.nod V1→V1.1 转换 + 1 routine.greet 配方）——覆盖 native_slice/native_clip/draft/recipe 四种载体 |
| 视觉精调 | 上述 16 条动作已逐相位截图验收并定稿窗口/混合参数（[台账](../experiments/motion-library/tuning/TUNING-LOG.md)，截图本地保留）；配方视觉合成待播放接线 |
| llm_nod / llm_lean_blink | llm_nod **已完成 V1→V1.1 转换并通过七步管线重验证**（drafts/lafei.nod.v11.json，bezier 转 smooth 后按限速 retime 1.25×）；llm_lean_blink 待同法转换 |
| 托腮 routine.chin_rest | 能力缺口（无双手-脸接触标定）；authorable=disabled，重点备案不承诺生成 |
| 可播放投影 | 0 条 approved——candidate 提升路径见 §3；枕位注意：全部条目仍为 candidate，approved 需 §3 三项齐备 |

## 1. 逐模型制作方式

### lafei_8 / front（主角色，assetDigest sha256-a02373…，runtime 3.6.53）

2026-09-14/15 夜间批次已完成视觉精调（逐相位+3D 视角）的 16 条动作见台账；
此处仅列后续仍需制作的族：

| 优先级 | 动作 | 制作方式 | 证据要求 |
|---|---|---|---|
| P0 | head.tilt / gentle.screen_left·right | dance/stand 倾头段裁剪或离线 Author（head.nod 控制域内） | 世界坐标验证方向（画面基准）；左右分别录屏 |
| P1 | gesture.beckon、gesture.present（双手原子）、reaction.celebrate（pump+happy 配方） | recipe 组合或 Author | 全序列录屏 |
| P1 | routine.farewell（挥手后收回） | wave 组件 + hands_reset（待 hands_reset 素材勘探） | 序列不能截断在举手中 |
| P2 | 生命感层（breathe/shift_weight/listen_idle） | stand2 变体勘探 + Author | 循环首尾同相位验证 |

### 本 rig 的窗口勘探禁区与发现（后续内容 Agent 必读）

- **stand[7.55, 12.1] 是低头弯倾段**：头部 arotation 0→-26°→-31→-41→回正——已是
  sleepy/lower 的素材源，其他头部动作窗口必须避开。
- **dance[0,1.17]**：左右大幅摆头+单眼眨（head.shake 素材）；**sleep[0,4]**：-40°~-49°
  闭眼垂头（sleep_idle 素材，需 alpha 渐升驱动才能做保持型切片）。
- **overlay 首个 entry mixIn 无效**（3.6 无 mixingFrom 时不混合）——保持型动作
  切片必须自带进入/退出过渡，或实现 alpha 渐升驱动（infra TODO）。

### spineboy / front（第二骨架，机制验证用）

仅做机制验收（档案绑定/编译/采样/调度），不做内容大库。head.tilt、torso.sway、arm.front.raise 三个已验证控制可作为离线 Author 的第二角色冒烟。

## 2. 制作方法优先序（Spec §9.2）

1. **专业原动画再利用**：native_slice 迁移（已有 9 条）→ 补齐边界与退出验收后提升。
2. **已验收动作组合**：recipe（深度 ≤2、≤32 步、子动作冻结修订）。
3. **离线 Author 产出缺口**：使用 interaction/continuation 预算档案；产出完整可复用单元+命名相位，不存逐帧数组。
4. 人工修改与 Agent 生成同标准验收；来源差异记入 provenance（origin + generatorModel + promptDigest）。

## 3. candidate → validated → approved 提升流程

1. **结构**：manifest 语义校验零问题（`validateManifest`，测试已内置）。
2. **轨迹**：官方运行时隔离采样——速率逐轴、H 单位换算、混入/混出窗口纳入（`sampleTrajectory` 已支持）。
3. **视觉**：Lab `?gesture=…&freezeAt=…` 确定性截图或录屏；边界前后各 1 帧 + stroke 中段 1 帧，人工记 `reviewedAt` 与 evidenceRefs。
4. 三项通过后把 entry `status` 改为 `approved` 并原子的 manifest 更新（热更新整表替换，新旧引用不混用）。

## 4. 离线批量队列（本轮只建格式，不启动）

任务记录字段：`logicalKey（action/variant/segment）、targetModel、budgetProfile、status(queued/running/done/failed)、attempt、digest、evidenceRefs、costEstimate`。
支持预算上限、断点续跑、按逻辑键去重、失败记录；入口 `scripts/`（待后续轮次实现 runner）。

## 5. 明确的能力缺口（不伪装）

- 嘴型（mouth 通道无独立附件控制证据）
- 手指/手型（thumbs_up、ok、peace、clap 等）
- 背面动作（唯一 default 皮肤无背面部件）
- 接触类：chin_rest、cheek_touch、hug_self 等（无接触标定）
- locomotion.to_target/approach（场景根节点位移与步态相位联动未标定）

以上条目保持 planned/unsupported；在能力卡中按 `authorable=disabled` 呈现，Selector 返回 UNSUPPORTED_CAPABILITY/MISS_ASSET，不调用不可能完成任务的 Author。
