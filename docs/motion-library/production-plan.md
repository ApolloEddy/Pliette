# MotionLibrary 制作计划（2026-09-14）

对应备案目录：`docs/motion-library/catalog-plan.json`（12 类、110 动作族、154 变体，全部 planned）。
本计划面向后续内容 Agent 与人工制作，逐模型给出真实控制/原动画映射、制作方法、证据要求与优先级。

## 0. 当前真实状态（不得当作已完成能力）

| 项 | 状态 |
|---|---|
| 目录备案 | 110 动作族/154 变体全部 `planned`；目录有记录 ≠ 当前角色能做 |
| 种子迁移 | 9 条 native_slice 条目已入 `lafei_8/front` manifest，**全部 candidate**（结构校验通过；轨迹/视觉验收待本机执行） |
| llm_nod / llm_lean_blink | 内部 V1 草稿（role 曲线格式），**不是** pliette.motion-draft/1.1；待转换+重验证后另行入册，未登记 |
| 托腮 routine.chin_rest | 能力缺口（无双手-脸接触标定）；authorable=disabled，重点备案不承诺生成 |
| 可播放投影 | 0 条 approved——candidate 提升路径见 §3 |

## 1. 逐模型制作方式

### lafei_8 / front（主角色，assetDigest sha256-a02373…，runtime 3.6.53）

| 优先级 | 动作 | 制作方式 | 证据要求 |
|---|---|---|---|
| P0 | gesture.wave / small.screen_right | 提升现有种子 lafei.wave.small_screen_right | 轨迹采样 + 混入/退出录屏；exit 边界回 stand |
| P0 | head.tilt / gentle.screen_left·right | 离线 Author（head 控制已验证 ±域）或 stand 原生切片勘探 | 世界坐标验证方向（画面基准）；左右分别录屏 |
| P0 | head.nod / small·normal | 转换 llm_nod（V1→V1.1）或 stand 勘探 | 速率 ≤191°/s（档案标定）；首尾回正 |
| P0 | reaction.happy / small | 提升种子；核实附件写集是否含眼部 slot | 附件切换前后对照帧 |
| P0 | gesture.raise_hand / screen_left | 提升种子（旧 wave/leftArm 语义纠正） | 区别于 wave 的完整收回 |
| P0 | routine.greet / default | 组合已验收 wave + nod 成完整配方（recipe，深度 1） | 全序列录屏；子动作共用冻结修订 |
| P1 | contact.touch_table / screen_right | 提升种子；限定已标定 0.27H 桌高 | 接触误差 ≤0.02H 采样报告 |
| P1 | gesture.pump、reaction.dizzy、reaction.shy、life.idle_fidget | 提升对应种子 | 各自边界录屏；shy 需坐姿前提 |
| P1 | routine.return_idle / default | 通用退出配方（按所有权退出，不 clearTracks） | 中断任一通道后回待机录屏 |

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
