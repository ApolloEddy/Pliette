# Spec 15.2 关键用例对齐表（A01-A12）

更新：2026-09-08 凌晨 · 随开发推进持续更新

| 编号 | 用例 | 状态 | 证据/说明 |
| --- | --- | --- | --- |
| A01 | 原动画、正面与背面 | ✅ 部分 | 原动画播放验证（stand/walk/sit 等全部 20 段可播）；**背面：资产不存在**（仅正面，Spec 4.2 判定），用例按"限制展示朝向"处理 |
| A02 | 六项 LLM 候选原版与修订版 | ⛔ 已终止 | 手写关键帧路线经用户验收否决（review-round1/2）；参数可追溯与对照录像已交付但质量不达标；路线转向原动画切片复用（review-round3-overlay-route） |
| A03 | 同一手势 20/50/80% 相位替换 | ✅ 出证 | `a03_interrupt_{20,50,80}.mp4`（cancelAt=0.5/1.2/1.9s）：从当前姿态混合交还，不弹回站姿、不等整段完成 |
| A04 | 走路中挥手，再只取消挥手 | ✅ 出证 | `a04_walk_wave_cancel.mp4`：walk 基础层持续，挥手切片（stand[4.9-7.3] 举臂）2.2s 处取消后右臂 0.3s 混出交还，行走不中断 |
| A05 | 左手持杯，右手指向 | ✅ 机制出证 | 左手可乐为原生持有（kele 附件跟随左手）；右臂 attack[0.15-0.7] 指向切片叠加互不影响；`?gesture=point&freezeAt=0.45` 可复现；多通道同时叠加（指向+头晕）UI 按钮 |
| A06 | 对占用右手请求挥手 auto 换左手 | ✅ 逻辑层 | 调度器测试通过（auto→leftArm）；UI 行为库 auto 按钮；左手切片 stand[13.0-13.9] 较短（0.9s），观感待用户确认 |
| A07 | 坐姿看用户并说话、眨眼 | ✅ 部分 | **自动眨眼已实现**（face 通道 eye_2 附件调制，2.2-5.6s 随机，头部表情占用时避让）；说话/语音为 P4 |
| A08 | 跑向椅子后坐下 | ✅ 出证 | `a08_scenario.mp4`：walk 到椅子锚点 → 刹停坐下（sit 末帧保持）→ 保持 → 起身 → 走回；确定性回放（1/24 步长重演真实混合）；**行走速度标定 0.115 H/s**（实测步幅 44.9 单位/1.17s 周期，原 0.567 为脚滑根因） |
| 接触 | 触碰固定桌边（15.2 误差 ≤0.02H） | ✅ 出证 | 矮桌（0.27H，Q 版比例）+ victory[0.7-1.2] 右手稳定切片；**实测 max=0.0027H avg=0.0014H（4 采样，排除首尾）达标**；视频 `touch_table.mp4`；场景 `?scenario=touch&freezeAt=`；勘探脚本 mine-contact2.mjs |
| A09 | 动作中切到背面再切回 | ⚠️ N-A | 资产仅正面（见 A01）；不镜像冒充背面，限制展示朝向 |
| A10 | 暂停恢复、重复请求、语音取消 | ✅ 部分 | 暂停/恢复/逐帧 ✓（UI+Lab）；幂等 ✓（测试）；语音取消 ✓（MockTts）+ 动作计划同步打断（barge-in，2026-09-17） |
| A11 | 单参数变化与头部控制探针 | ✅ | 探针面板（±10°）+ 参数有效性测试（amplitude/tempo 域检查） |
| A12 | 官方运行时数值采样 | ✅ | 0°→−72°→0° 线性采样、bezier/stepped 内部布局断言（tests/compiler.test.ts） |

接触类误差：**已达标**（触碰矮桌 max=0.0027H，见上表）。

## MotionLibrary 新链路验收（2026-09-16/17 Activation Pass + 参数/演示接入）

| 项 | 状态 | 证据 |
| --- | --- | --- |
| 34 条 candidate 全量转正（trajectory/visual/reviewedAt 证据齐备） | ✅ | `scripts/promotion/*.json` 备案 + `scripts/promote-manifest.mjs`（幂等）；Selector registered+approved 命中条件首次真实成立 |
| 对话完整链路：你好 → routine.greet 整条配方 HIT → 0 次 Author → wave+nod 合成播放 | ✅ | 浏览器相位证据 `tuning/act-e2e-greet/`；日志逐切片路由可审计 |
| contact 三条转正前置门（手-脸接触锚点 + 0.02H 误差） | ✅ | `contacts.json` + `tests/contact-verification.test.ts`（0.0006/0.0003/0.0078H） |
| 参数传递全链路（catalog 域 → plan 切片 → 物化 → 播放时长） | ✅ | `repeats`（breathe×2 实测 6.4s，`tuning/act-params-breathe/`）；越界/非循环动作拒绝有测试 |
| 新消息打断（barge-in）+ 打断按钮停语音与动作 | ✅ | `tests/activation.test.ts` 打断场景（未完成计划失效 + 在播实例取消 + 新计划正常提交） |
| 自动待机走动作库（?auto=1 随机 approved 动作经 Selector） | ✅ | `src/lab/ui.ts#autoTick`；有计划在播时让路 |
| 一键演示（?demo=1 六轮对话） | ✅ | 浏览器实测 6/6 全 HIT、0 Author、0 失败（2026-09-17 日志） |
| 真实 LLM 语义规划（MiMo 在线） | ✅ 协议层 | `tests/llm-plan-live.test.ts`（无密钥跳过）：plan 合法、Selector HIT、参数卡生效；**延迟 28-45s 超交互 deadline，在线回退规则底座（诚实标注）** |
| 混入 alpha 渐升（保持型切片 infra TODO） | ✅ | `playSlice` opt-in `alphaRamp`；sleep 入场平滑实测 `tuning/act-alpha-sleep2/` |

## P3 验收状态（Spec 14）

"交付到达目标、刹停、落座、起身及一项接触交互的连续录像。通过条件是位置、姿态和接触逻辑一致，中途取消不会留下错误占用或悬空状态。"——**已满足**：`a08_scenario.mp4`（到达/刹停/落座/起身/走回）+ `touch_table.mp4`（接触交互+误差实测）。A05 拾取/放下完整链按 Spec 10.2 允许延后（机制设计已记录）。

## 已发现并修复的问题

1. 3.6 RotateTimeline 值 = setup 相对偏移（编译器曾双倍偏移）— tests/compiler.test.ts 固定
2. Lab 预览开头抖动 = 轨道替换默认混合 — 预览前清空轨道修复
3. wavePrimitive durationSec 舍入致末帧超界 — 校验器拦截后修复
4. capture 模式 grid 塌陷致黑屏 — fixed 定位修复
5. 调度器 NaN durationSec 致实例永不结束 — 参数有限性校验修复
6. 局部旋转误判举手 — 改用世界坐标勘探（手 y > 头 y）
