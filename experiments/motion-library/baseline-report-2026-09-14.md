# MotionLibrary 重构基线报告（2026-09-14）

基线提交：`5c1461d5`（2026-09-10）。本轮实现提交：`9776733`(M0) → `2426141`(M1) → `b6f9950`(M2) → `1d5a2c3`(M3/M4) → `acd17d8`(M5)。

## 测试结果（本轮实测，非引用 README 数字）

| 套件 | 结果 |
|---|---|
| `npm test`（vitest，14 文件） | **167 通过 / 0 失败 / 2 跳过**（跳过项依赖未随仓库交付的拉菲资产，本机资产在场时实跑） |
| `npm run typecheck` | 通过 |
| `npm run build`（vite 生产构建） | 通过（chunk 体积警告与既有基线一致） |

新增套件：m0-fixes（10）、motion-library（26）、m2-select-scheduler（12）、m3-coordinator（19）、m5-seed-manifest（6）。

## M0–M5 完成项与复用映射

| 阶段 | 交付 | 说明 |
|---|---|---|
| M0 | F1/F2/F3 修复 + 回归 | 指导片段从档案派生；Broker 请求身份隔离；采样逐轴/H 单位/混出。F4/F6 在 M5 随 Lab 接线完成 |
| M1 | contracts/catalog/index/selector/legacyAdapter | Ajv 形状 + 确定性语义校验；110/154 目录校验通过；逻辑键精确索引；空库可启动 |
| M2 | 异步 Select + 多写集调度 | RulePlan/LlmPlan 适配器（可取消、一次纠错、明确失败）；CompositeIntent 原子取权（通道+资源） |
| M3 | 预算档案/AuthorTask/PreparedMotion/Broker 五相/PlanCoordinator | legacy/interaction/continuation 单一来源；生成完成≠播放；生成截止不影响播放资格 |
| M4 | bufferedSequence/rolling 框架 | 30s 总预算；连续 ready 前缀（V10）；RTF 准入 p95≤0.7 且 <1，失败入分母；L95+J 阈值 |
| M5 | 种子迁移 + Lab F4/F6 | 9 条种子 candidate 入册（写集从真实 timeline 派生，digest 复算一致）；离线导入重授权 |

## 未完成 / 未验收（如实清单）

1. **真实首帧延迟（T_action_start）未测**：需要浏览器/宿主端录像与单调时钟埋点；本轮无付费模型调用。
2. **rolling 实测准入未取得**：RtfTracker 是机制实现，8+ 样本的 p95 与 15s 序列验收（V12/V13）待真实 provider 与录像。
3. **种子全部 candidate**：轨迹采样与视觉验收待本机执行（流程见 production-plan §3）；可播放投影当前为 0 条 approved 是如实状态。
4. **llm_nod / llm_lean_blink 未入册**：内部 V1 格式，转换+重验证后登记。
5. **Lab 对话层未切换到 planAdapter**：新异步通路（RulePlan/LlmPlan + Selector）已交付并测试，Lab 聊天仍走旧同步事件映射（兼容层保留）；切换属接线工作，无新逻辑。
6. **实验口径修复（旧 F5）**：run-abc.mts 的完整重做未在本轮范围；新链路的日志/指标字段（§12.1 时间点）已在 PreparedMotion/Broker 携带 readyAt/playbackDeadline，逐阶段计量待接入。

## 环境事实

- 拉菲资产本地在场（public/assets-local/，gitignored）：种子写集派生与 manifest 校验测试在本机实跑。
- 未产生任何付费 API 调用；LlmPlanAdapter 经注入 fetch 的确定性测试验证（172→167 计数含全部回归）。
