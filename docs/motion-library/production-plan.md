# MotionLibrary 制作计划（2026-09-14 首发；2026-09-16 Activation Pass 更新）

对应备案目录：`docs/motion-library/catalog-plan.json`（12 类、110 动作族、154 变体）。
本计划面向后续内容 Agent 与人工制作，逐模型给出真实控制/原动画映射、制作方法、证据要求与优先级。

## 0. 当前真实状态（2026-09-16 Activation Pass 完成后）

| 项 | 状态 |
|---|---|
| 目录备案 | 110 动作族/154 变体中，**31 族/34 变体 `registered`**（有 approved 实现的族），其余保持 `planned`；catalogRevision `activation-2026-09-16.1` |
| manifest 条目 | **34/34 条 approved**（9 §9.1 种子迁移 + 6 P0 扩展族 + 1 head.nod V1→V1.1 转换 + 17 受限 Author 创作 + 1 routine.greet 配方）——覆盖 native_slice/native_clip/draft/recipe 四种载体 |
| 验收证据 | 每条 approved 均有 trajectory+visual 证据与 reviewedAt（`scripts/promotion/stage1-33.json` / `stage2-greet.json` 为决策备案；contact 三条另有接触契约，见下） |
| 对话链路 | Lab 实际对话入口已切至 PlanAdapter → Selector → materialization → PlanCoordinator（buffered）：`chat=你好` → routine.greet 整条配方 HIT → **0 次 Author 调用** → wave+nod 按时间轴合成播放（E2E 相位证据 `tuning/act-e2e-greet/`） |
| 接触契约 | chin_rest / cheek_touch / scratch_head 已建立 `requiredContacts` 锚点 + 0.02H 误差阈值（`contacts.json` + `tests/contact-verification.test.ts`）；左臂在已验证域（±45°）内不可达左颊，chin_rest 左手为下巴前下方收拢位（`contact:face.chin_under_left`），域扩展后可上调 |
| mixIn 缺陷 | overlay 首个 entry 混入无效的 infra TODO 已落地：`playSlice` opt-in `alphaRamp`（0→1 渐升，`tickAlphaRamps` 每帧驱动），sleep 保持型切片入场平滑已视觉验证（`tuning/act-alpha-sleep2/`）；已验收切片默认不启用，视觉定稿不变 |
| rolling | 继续默认 buffered；RTF 真实证据（8 样本、15s 连续、首帧延迟）未采前不开启自动 rolling |
| 新缺口备案 | 离线批量制作 runner 未实现（格式见 §4，优先级靠后不影响主链路）；sit 姿态下的坐姿复验（reaction.shy 等）；lipsync/fingers/back 仍为 planned |

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
- 接触类残余缺口：hug_self 等多点接触（chin_rest/cheek_touch/scratch_head 已于 Activation Pass 建立锚点+0.02H 误差契约并 approved）
- locomotion.to_target/approach（场景根节点位移与步态相位联动未标定）

以上条目保持 planned/unsupported；在能力卡中按 `authorable=disabled` 呈现，Selector 返回 UNSUPPORTED_CAPABILITY/MISS_ASSET，不调用不可能完成任务的 Author。
