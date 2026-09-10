# 动作指导书与受限在线参数生成 · 实施报告

日期：2026-09-10 · Spec：`docs/Pliette_Spine_Motion_Guide_Development_Spec_v1.0.md` · 分支 main

## 0. 交付速览

| 里程碑 | 状态 | 结果 |
| --- | --- | --- |
| M0 仓库与资产基线 | ✅ | 55/55 测试基线、复用映射表（`implementation-plan.md`） |
| M1 主角色指导书 | ✅ | 拉菲档案 v2（8 开放控制/6 规则/12 证据），探针 89 步 + 速率挖掘出证，指导书生成 |
| M2 候选通路与验证 | ✅ | 协议 V1.1/规则解释器/翻译/官方编译/隔离采样/AuthorBroker/14 诊断码，测试 94/94 |
| M3 受限在线与实验 | ⚠️ 部分 | 管线全链路本地验收（Mock+候选导入+Lab 面板+A/B/C 骨架+浸泡）；**LLM 实测未做（无密钥）** |
| M4 第二骨架与总验收 | ✅（机制级） | spineboy（官方示例）标定+档案+指导书+跨角色隔离测试；类型限制已注明 |

测试：**94/94 通过**（新增 control-profile 13、author-pipeline 20、cross-character 6，原 55 全保留）。
`npm run typecheck` 干净。

## 1. Spec 13.2 问答

**现在有哪些真实角色可用，分别开放了哪些控制，哪些还不支持？**
- `lafei_8`（主角色，3.6.52 导出/3.6.53 运行时，front/default）开放 8 个：
  `arm.right.raise / arm.right.forearm / arm.left.raise / arm.left.forearm / head.nod / torso.lean / torso.bob`（7 个运动控制）+
  `face.eyes.pair`（枚举组合控制：open/blink/squeeze/dizzy/sleepy/wink）。
  不支持：口型/嘴部（无 mouth 附件）、背面视图（无背面素材，规则强制 front）、独立手指、接触类（托腮/持物无已验证控制器）、腿部生成曲线（行走由原动画切片提供）。单眼控制（`face.eyeL.state`/`face.eyeR.state`）标定为 candidate，只经 pair 间接写入。
- `spineboy`（第二骨架，官方示例 3.6.32 导出，**机制验证非产品角色**，Spec 5.3）开放 3 个：`head.tilt / torso.sway / arm.front.raise`。

**两个骨架究竟有什么不同，指导书怎样改变了生成参数？**
- 结构差异（画面级出证）：拉菲头与躯干是**兄弟**（躯干动头不动，需显式组合 head.nod+torso.lean）；spineboy 头在躯干**链内**（hip 旋转头自然随动，tests/cross-character.test.ts 用世界坐标机器验证：spineboy 头位移 >10 单位、拉菲 face <0.5 单位）。
  命名体系：拉菲 hand_L=屏幕左臂/hand_R=屏幕右臂（命名与屏幕侧一致但左右语义与 spineboy 的 front/rear 完全不同）。
- 参数差异：同一"挥手"意图，拉菲 `arm.right.raise` verified −40~+60/550°/s，spineboy `arm.front.raise` verified −30~+60/500°/s——**数值不可照搬**（测试断言 verified 与速率均不相等）；两角色 controlId 集合完全不相交（测试断言），错角色候选一律 UNKNOWN_CONTROL 拒绝。

**首轮质量改善多少；程序拒绝了多少；有哪些剩余视觉问题？**
- A/B/C run1（Mock，`experiments/motion-guide/run1/`）：A/B 校验通过 20/20，C 接纳 20/20。**该 run 只证明实验框架与统计管线正确，不证明指导书对生成质量的改善**——Mock 输出与上下文无关，A/B 差异无信息量。
- 视觉通过率、实际执行成功率、p95 延迟等 Spec 11.3 指标：**未测**（无 LLM 密钥，见 §3 阻塞）。
- 剩余视觉问题（已知）：躯干位移超 ±0.02H 头身分离（反例已入档案）；拉菲兄弟拓扑下"倾身"必须双曲线组合，单给 torso.lean 视觉不自然（指导书已写明）；spineboy rear 臂未开放。

**请求到动作的完整延迟是多少，在什么硬件、服务和设置下测得？**
- 未测 LLM 端到端。管线本地耗时（开发机，Mock 120ms 模拟延迟）：校验+编译+采样 <5ms（vitest 计时），Lab Mock 全链路（含模拟延迟）~0.5s 内完成提交。请求截止 2500ms 从提交计时，超期响应在 AuthorBroker 拒绝（DEADLINE_EXCEEDED，测试覆盖）。

**新动作是否真正由 LLM 创作？**
- 本轮全部候选来自 Mock 模板与候选导入，**没有 LLM 创作结果**。协议、校验、编译、调度、拒绝统计均为真实实现——LLM 接入后（`config/llm.local.json` 填 endpoint/apiKey/model）`LlmAuthorClient` 即为生产路径，Select 层（对话）不受影响。

**如何启动、复现实验、切换角色、关闭在线生成并回到已有播放？**
- Lab：`npm run dev` → `http://localhost:5174/?asset=lafei_8&view=flat`，右侧「Author 在线通路 V1.1」面板：查看请求上下文 / Mock 在线生成 / 候选导入验证播放。
- 档案校验：`npx vite-node scripts/check-profile.mts characters/lafei_8.rig-profile.json characters/spineboy.rig-profile.json`
- 重建指导书：`npx vite-node scripts/build-guides.mts characters/lafei_8.rig-profile.json characters/spineboy.rig-profile.json`
- A/B/C：`npx vite-node scripts/run-abc.mts run2`（结果落 `experiments/motion-guide/run2/`）
- 浸泡：`npx vite-node scripts/soak-author.mts 10`
- 探针复标定：`npx vite-node scripts/probe-controls.mts`（拉菲）、`scripts/probe-spineboy.mts`
- 切换角色：Lab 资产下拉；程序侧 assembleRequest(对应档案) + registerProfileBinding 已注册两角色。
- 关闭在线生成：不点 Author 面板/不调用 AuthorBroker 即可——原动画切片叠加、手势库、Select 对话层完全不受影响（未改动其代码路径）。

## 2. 关键实测事实（全部有证据引用，见档案 evidence 字段）

1. 拉菲全部 20 段原动画写全部关键骨与双眼附件（write-coverage.json）——基础层完全覆盖，叠加=绝对接管+交还。
2. 拉菲探针（89 步，setup 参考隔离实例）：局部角=setup+值精确命中；hand_R=屏幕右臂且 + 为抬臂（+90 手入脸区）；hand_L=屏幕左臂 + 为外侧平举——左右非对称，禁止镜像。
3. torso.bob 反例：−0.08H 头身明显分离、−0.02H 颈部已露出 → 域 ±0.02H/verified ±0.01H（反例图入档）。
4. 速率标定取"动画师稳态节奏（stand）"：raise 550、forearm 550/600、head 200、torso 100°/s；stand@15.3s 的 10546°/s 为时间线阶跃伪影（剔除并在档案注明，运行时速率检查可拦截此类非连续曲线）。
5. 眼睛配对图鉴（8 组截图目视）：open/blink(弯月笑)/squeeze(><)/dizzy(螺旋)/sleepy(半闭)/wink(不对称)；L3/R3 与正常眼不可辨、L4/R4 不可见→不开放。
6. spineboy（18 步探针）：+40 抬头、hip+15 全身以髋为轴且头随动、前臂+90 直臂上举；side-view front/rear 命名。

## 3. 未完成项与阻塞（如实列出）

| 项 | 状态 | 阻塞 |
| --- | --- | --- |
| LLM 实测（Spec 11.3 全部指标、M3 门槛判定） | 未测 | `config/llm.local.json` 无密钥（用户待决策项）。接入后重跑 `run-abc` 即可出真实 A/B/C |
| 11.4 在线开放门槛（B 首轮视觉 ≥90%、执行成功率 ≥90%、p95 ≤2000ms） | 未判定 | 同上；**未达标前在线 Author 不应对外启用**（保留 Select/Tune） |
| 拉菲组合探针（Spec 6.2 必测矩阵的实拍部分） | 部分 | 双臂并行/头身组合的写集与调度已由单元测试+Broker 冲突路径覆盖；实拍录像待与 LLM 实测同批补齐 |
| 02_guide_ab_comparison.mp4 / 03_composition_and_interrupt.mp4 | 未录 | 依赖真实 LLM 输出（无 Mock 佐证的对照无意义）；01/04 已交付 |
| spineboy eyes/attachments、rear 臂 | 未标定 | M4 机制验证已达成；产品化需补探针 |

## 4. 交付物索引

- 档案源：`characters/lafei_8.rig-profile.json`（rev2，digest `fnv1a64-ebdddc81287bc754`）、`characters/spineboy.rig-profile.json`（rev1，`fnv1a64-d67dadd596443034`）
- 指导书：`docs/motion-guides/common.md`、`docs/motion-guides/lafei_8.md`、`docs/motion-guides/spineboy.md`（GENERATED，勿手改）
- 代码：`src/rig/controlProfile.ts`、`src/motion/author/{protocol,diagnostics,rules,translate,sample,validateV11,context,authorBroker,client}.ts`
- 标定证据：`experiments/rig-calibration/{lafei_8,spineboy}/`（探针 JSON/覆盖图/速率；截图在 `experiments/media/` 本地不入库）
- 实验：`experiments/motion-guide/run1/`（config/results/summary）
- 录像：`experiments/media/motion-guide/01_lafei_arm_probe.mp4`、`01_spineboy_arm_probe.mp4`、`04_online_generation_mock.mp4`（本地，不入库；Mock 流程演示非 LLM 实测）
- 脚本：`scripts/{check-profile,build-guides,compute-asset-digest,mine-write-coverage,mine-rates,mine-rates-generic,probe-controls,probe-spineboy,run-abc,soak-author,capture-author-video,make-video}.mts`
