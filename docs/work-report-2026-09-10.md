# 工作报告 · 动作指导书与受限在线生成通路（2026-09-10）

执行依据：`docs/Pliette_Spine_Motion_Guide_Development_Spec_v1.0.md`（模型专属动作指导书 + 受限实时参数生成）
分支 main · 提交 `2dd5b0b`（M0–M4 工程，51 文件）+ `51d64db`（真实 LLM 首轮实测，15 文件）
测试 **94/94 通过**（新增 39）· typecheck 干净 · 10 分钟浸泡通过

---

## 一、今日目标与总体结果

在已定案的"LLM 只做 Select + 原动画切片"路线上，按新 Spec 增量开放**受限在线 Author 通路**：LLM 只能在角色档案登记的 controlId 与实测标定域内生成有限关键帧，由程序负责验证、编译、调度、播放——不裸生成、不重写渲染器。

| 里程碑 | 状态 | 一句话结果 |
| --- | --- | --- |
| M0 基线 | ✅ | 55/55 基线 + 复用映射表，未重建项目 |
| M1 主角色指导书 | ✅ | 拉菲档案 v2：8 开放控制，89 步探针+速率挖掘全部出证 |
| M2 候选通路与验证 | ✅ | 协议 V1.1 + 七步验证 + 14 错误码 + AuthorBroker |
| M3 受限在线与实验 | ✅ | Mock 全链路 + Lab 面板 + **真实 LLM 首轮实测**（60% 接纳） |
| M4 第二骨架 | ✅（机制级） | spineboy 档案 + 跨角色隔离测试（世界坐标机器证据） |

**核心结论（如实）**：管线全部落地且真实 LLM 已能创作通过验证的新动作；但被接纳候选**中位延迟 ~4.5s，远超 Spec 11.4 的 p95 ≤2000ms 门槛**——在线 Author 保持关闭，Select/切片层不受影响。

## 二、完成的工作

### 1. 控制档案体系（M1a）

- 新增 `src/rig/controlProfile.ts`：档案身份（assetDigest/参考姿态 digest/坐标约定）、控制定义（mapsTo 唯一映射/域/速率/写集依赖/证据引用）、有限规则类型；**确定性 profileDigest**（canonical JSON + FNV-1a64）；严格解析（未知字段拒绝、写集冲突拒绝、verified 必须引用证据）。
- 拉菲档案 `characters/lafei_8.rig-profile.json`（rev2，digest `fnv1a64-ebdddc81287bc754`）：7 个运动控制 + `face.eyes.pair` 眼睛配对组合控制（open/blink/squeeze/dizzy/sleepy/wink，登记映射表展开为左右眼子曲线）；6 规则、12 证据。
- 旧 RigProfile 保留为绑定层，controlId→role+property 唯一映射，**没有第二套播放器**。

### 2. 标定与指导书（M1b/M1c）

探针全部走官方运行时（headless Edge + 确定性冻结帧），关键实测结论（均有截图/数据入档）：

- **屏幕左右归属实测**：hand_R=屏幕右臂（+为抬臂前伸，+90 手入脸区）、hand_L=屏幕左臂（+为外侧平举）——左右非对称，禁止取反镜像。
- **基础层全覆盖**：全部 20 段原动画写满全部关键骨与双眼附件 → 叠加必然是"满权重绝对接管+混出交还"语义。
- **头身分离反例**：torso.bob 超过 ±0.02H 头身分离（−0.08H 明显脱节，反例图入档）→ 域收窄 verified ±0.01H。
- **速率标定不拍脑袋**：从原动画逐帧挖掘动画师稳态节奏（head 200 / raise 550 / torso 100 °/s）；识别并剔除 stand@15.3s 的 10546°/s 时间线阶跃伪影。
- **眼睛图鉴**：8 组配对截图目视识别（blink=弯月笑眼、dizzy=螺旋、wink=单侧闭眼等）；L3/R3 与 L4/R4 不可辨/不可见→不开放。
- Guide Builder（`scripts/build-guides.mts`）：单一档案源生成 `docs/motion-guides/{common,lafei_8,spineboy}.md`，GENERATED 标记，手改无效。

### 3. 协议、验证与调度（M2）

- **MotionDraft V1.1**：motion/unsupported/needs_context 判别联合响应（身份回显校验、未知字段拒绝）；请求包含 availableControls、mandatoryRules（依赖闭包确定性装配）、预算。
- **七步验证管线**（Spec 9.1）：结构→身份→控制能力→数值/时间线/预算→规则解释器（6 种确定性解释器，不执行任何表达式代码）→官方编译→隔离实例轨迹采样（真实合成值+速率复核）。
- **AuthorBroker**：每角色单飞、截止从提交计时、离散状态版本陈旧性（连续状态不判过时）、requestId 幂等、原子"检查+取权"提交、局部取消。14 个最低错误码全量落地。
- 测试新增 39 项：档案 13、作者管线 20、跨角色 6。

### 4. 在线通路与实验（M3）

- Lab「Author 在线通路」面板：请求上下文查看 / Mock 在线生成 / 候选导入→验证→播放，浏览器内全链路跑通。
- A/B/C runner（`scripts/run-abc.mts`）：Mock run1 验证框架与统计（20/20）；浸泡脚本 10 分钟 77.9 万请求通过——**并抓到两处无界 Set 泄漏当场修复**（幂等备忘录与播放记录 FIFO 上限 8192）。
- 真实 LLM 接入：本机 `MIMO_API_KEY` 环境变量（mimo-v2.5，OpenAI 兼容端点）；`config/llm.local.json`（gitignored）只存端点/模型/环境变量名，**密钥全程不落盘**。

### 5. 第二骨架跨角色验证（M4）

spineboy（官方示例，机制验证非产品角色）：18 步探针出证，3 控制开放。跨角色隔离有机器证据：

- 两角色 controlId 集合完全不相交；错角色候选一律 UNKNOWN_CONTROL 拒绝。
- 同一"挥手"意图：拉菲 `arm.right.raise`（verified −40~+60，550°/s）vs spineboy `arm.front.raise`（verified −30~+60，500°/s）——**数值不可照搬**（测试断言）。
- 头身拓扑差异的世界坐标证据：spineboy hip 旋转带动头部（>10 单位）；拉菲 body 旋转 face 不动（<0.5 单位）。

## 三、真实 LLM 首轮实测（关键数据）

模型 mimo-v2.5（reasoning_effort=none，max_tokens=1536），10 请求 × A/B 各 2 次，C 复用 B 输出：

| 指标 | 结果 |
| --- | --- |
| A / B / C 通过并接纳 | 各 **12/20（60%）** |
| 被接纳候选延迟 | 2338~7737ms，**中位 ~4.5s** |
| 截止超时 | 2500ms 时 58% 超时 → 按 Spec 8.4 记录后调 8000ms，仍有 5/60 超时 |
| 真实 LLM 作品 | `public/motions/llm_nod.json`、`llm_lean_blink.json`（点头+眨眼组合，翻译正确、截图核验角色完好） |

实测过程中程序与协议各自暴露并修复的真问题：

1. mimo 默认开思考（8–13s）→ 客户端透传 `reasoning_effort:"none"`；
2. 模型输出带 markdown 围栏 → 客户端剥离；
3. 我的系统提示缺回显要求与规范示例（模型自造 schema，0% 通过）→ 补全后 0%→60%；
4. 剩余失败是**真实首轮质量问题**（时长 0.12s 出预算、幅度 60>45、速率 262>200°/s、偶发自造字段），校验层全部如实拒绝——程序边界真实生效。

## 四、延迟痛点的估算分析（未实验，基于公开数据）

门槛 p95 ≤2000ms；实测延迟 ≈ 固定开销（排队+TTFT，1~3s 且方差大）+ 解码（~110 tok/s × ~500 tokens）。

| 方案 | 公开输出速度 | 估算典型延迟 | p95 ≤2s？ |
| --- | --- | --- | --- |
| MiMo-V2.5-Pro UltraSpeed | 1000~1200 tok/s | 1~1.8s | **存疑**（排队方差未解） |
| DeepSeek V4.1（公测） | 实测 328~507 tok/s | 1.5~2.5s | 压线（须锁思考档位） |

结论：换模型解决"慢到不可用"，但**单靠换模型不稳过 p95**。建议组合拳（按性价比）：① 压缩输出 schema（500→200 tokens，解码砍 60%，普通速度模型都可能压线）；② 双 provider 竞速对冲排队尾部；③ 架构上以预生成覆盖大部分请求（当前动作播放窗内生成下一段），只有突发请求吃实时延迟。两模型均已具备验证条件（mimo 密钥在环境变量；deepseek-v4-flash 已在 codex provider profile），跑一轮真实对照约 40 次调用。

## 五、交付物索引

| 类别 | 位置 |
| --- | --- |
| 档案源 | `characters/lafei_8.rig-profile.json`、`characters/spineboy.rig-profile.json` |
| 指导书（生成物） | `docs/motion-guides/{common,lafei_8,spineboy}.md` |
| 核心代码 | `src/rig/controlProfile.ts`、`src/motion/author/`（9 个模块） |
| 标定证据 | `experiments/rig-calibration/{lafei_8,spineboy}/`（截图在 `experiments/media/`，本地不入库） |
| 实验记录 | `experiments/motion-guide/{run1,run-llm-mimo-8s}/`（含真实 LLM 原始输出） |
| LLM 创作草稿 | `public/motions/llm_nod.json`、`llm_lean_blink.json` |
| 录像 | `experiments/media/motion-guide/01_*_probe.mp4`、`04_online_generation_mock.mp4` |
| 脚本 | `scripts/{check-profile,build-guides,probe-controls,probe-spineboy,run-abc,soak-author,llm-qualitative}.mts` 等 14 个 |
| 详细报告 | `docs/motion-guides/implementation-report.md`（Spec 13.2 全部问答） |

## 六、未完成项与下一步

| 项 | 状态 | 说明 |
| --- | --- | --- |
| 视觉通过率人工评分 / 实际执行成功率 | 未做 | 需看画面评分流程；当前 60% 是校验通过率（代理指标） |
| 11.4 在线门槛 | **未达标** | 延迟中位 4.5s ≫ 2s；达标前在线 Author 关闭 |
| 低延迟模型验证 | 待做 | 按第四节估算选型后跑真实对照（~40 调用/轮） |
| 02/03 号录像（A/B 对照、组合与中断） | 未录 | 依赖视觉评分流程一并补齐 |
| 能力缺口 | 如实声明 | 口型、背面视图、接触类（托腮等）、独立手指——unsupported，不伪造 |
