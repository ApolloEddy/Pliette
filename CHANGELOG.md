# 更新日志（Changelog）

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased] - 2026-09-15

MotionLibrary 动作精调夜班：候选动作逐条视觉验收 + 不存在的动作由受限 Author 通路创作。

### 视觉精调（9 条种子全部定稿）

- 精调循环基建：Lab `phases=` 相位序列一次导航采集（确定性逐帧回放+预热渲染+落盘中间件）、
  `overlay` URL 支持混入/混出、3D 视图 `freecam=1` 自由相机多角度验证
- 逐条窗口定稿：wave [4900,7300]→[5850,6900]（剪死准备段、避开基础层弯倾区）、
  raise_hand →[12900,14500]（补齐抬-保持-落）、dizzy →[400,1750]（头近中位混出回神）、
  pump →[3000,4400]、point →[100,800]；happy/shy/idle_fidget/touch_table 确认原窗口
- 3D 纸片视图（默认机位+拖拽斜视角）复核关键动作

### 播放层缺陷修复

- **附件混出残留**：Spine 3.6 `attachmentThreshold=0` 使附件时间线在混合期被整体跳过——
  overlay 的螺旋眼/眯眼等附件在混出后永久残留。修复：混出起点前一帧（最后满权重帧）
  追加 setup 附件恢复键并丢弃其后原始键（`overlay.ts#withAttachmentRestore`）

### 新增动作（+25 条 candidate，manifest 现计 34 条）

- **P0 扩展族 6 条**（勘探 face 骨 arotation 曲线+附件键位表后原动画切片）：
  head.shake/normal（dance）、reaction.sleepy/small 与 head.lower/small（stand 低头弯倾段，
  源内自带完整过渡）、life.blink/paired（normal 双眨键）、face.eyes_squeeze/paired
  （touch 纯 face 通道）、life.idle/default（stand 全段 native_clip，可循环）
- **受限 Author 创作 17 条**（在 10 个已验证控制域内手写 V1.1 曲线，agent_offline）：
  contact.chin_rest/both（双手捧脸，4 轮视觉迭代定稿）、cheek_touch、scratch_head、
  gesture.beckon、stop、present、hands_reset、life.breathe/subtle（可循环）、
  life.shift_weight/left·right、body.lean/screen_left·right、body.sway/gentle（可循环）、
  reaction.celebrate/small（挥拳+眯眼）、face.eyes_close/paired、head.tilt/gentle×2
- **head.nod V1→V1.1 转换**：数据驱动映射（mapsTo/compositeEntries 反查）+ 显式 retime
  （bezier→smooth 超速 209.6°/s，放慢 1.25×→168°/s），七步管线重验证零失败
- **routine.greet 配方**：挥手+点头组合，子动作冻结修订、通道不相交、mixIn/mixOut=0

### 验证与工具

- 全部草稿经七步管线全量重验证（新增测试循环：编译+隔离采样）；171/171 测试通过
- 勘探工具方法入库：face 骨 arotation/位移增量曲线 + 附件键位表 → 候选窗口 → 相位截图
- 实测记录：左臂 raise 符号语义（正=内收/负=外展，与直觉相反）；stand[7.55,12.1]
  为低头弯倾段（头部窗口禁区/素材源）
- 隐私清理：截图脚本本地临时路径改为环境变量覆盖

### 未完成（如实声明）

- candidate→approved 提升（轨迹+视觉三证据齐备后才进可播放投影）
- rolling/真实首帧延迟实测；托腮 both 变体受左臂验证域 ±45 限制（域扩展标定后可上调）；
  比心/拇指/OK/比耶需手指骨骼（rig 无手指，维持缺口）；保持型切片需 alpha 渐升驱动（infra TODO）

## [Unreleased] - 2026-09-14

MotionLibrary 重构：统一动作选择与生成入口（Spec：`docs/Pliette_MotionLibrary_Spec_v1.0/`，M0–M5）。

### 修复（M0，对应 2026-09-10 审查报告 F1–F3/F4/F6）

- **F1 角色知识污染**：指导片段全部由当前档案+当前控制子集派生（坐标约定/规则闭包/组合控制说明），删除硬编码拉菲结论；spineboy 请求不再出现拉菲专属说明
- **F2 请求身份**：Broker 替换旧请求后完整登记新请求；迟到旧响应按请求身份清理，不再删除新请求记录；重复/在途 requestId 拒绝且不影响在途请求
- **F3 采样漏检**：轨迹速率逐轴比较（修复纯 Y 轴恒漏检）；位移按档案标定身高换算 H 单位，未标定拒绝（HEIGHT_UNCALIBRATED）；composite 按 compositeOf 精确展开；可选混出窗口纳入速率检查
- **F4 Lab 播放**：Author 候选改走 scheduler 多写集原子取权 + GestureLayer 通道轨道局部叠加（不再 track 0 整体预览）；mixIn 经 TrackEntry.mixDuration 落实；取消按实例定位且核对轨道归属；自然结束释放句柄；离散状态版本随资产加载递增
- **F6 离线导入**：显式重授权流程（新执行身份 + 内容全量重验证），在线回显校验保持严格

### 新增

- **契约与索引**：`schemas/motion-contracts.schema.json` + `src/motion/library/`（contracts/catalog/index/selector/validate/legacyAdapter/digest）——MotionPlan/MotionCatalog/MotionManifest/MotionEntry 四契约、确定性语义校验（时间窗/参数交集/配方结构/别名唯一）、逻辑键 `action|variant|segment` 精确索引与 rigRef 兼容过滤、preferred→修订降序→稳定 ID 的确定性选取、热更新整表原子替换
- **Selector 路由**：HIT_READY / MISS_ASSET / MISS_SEGMENT / MISS_CUSTOM / UNSUPPORTED_CAPABILITY / RIG_MISMATCH / INVALID_REFERENCE / SEMANTIC_CONFLICT / STALE_CATALOG；命中库增量 Author 调用数为 0
- **异步语义规划**（`src/dialogue/planAdapter.ts`）：RulePlanAdapter（离线确定性）+ LlmPlanAdapter（能力卡系统提示、程序填充协议信封、一次有界纠错轮、AbortSignal 取消、明确失败不静默回退）
- **多写集原子调度**：`submitComposite` 通道+资源要么全拿要么不拿；实例携带 channels/writes/resources；资源占用账本；tick 按实例去重计时
- **命名预算档案**：legacy / interaction（soft 2000 / hard 8000）/ continuation（3–5s）单一来源；BUFFERED_SEQUENCE_BUDGET（30s 总准备）；生成截止与播放时效分离
- **PreparedMotion + PlanCoordinator**：§8.2 字段集、时间轴归一（有效占用=mixIn+content/rate+mixOut）；buffered/bufferedSequence/rolling 三模式、连续 ready 前缀（V10）、按序提交、取消隔离迟到结果、actorEpoch 失效（V11）
- **rolling 准入**：RtfTracker——单元 RTF p95≤0.7 且 RTF_total<1、失败入分母、L95+J 启播阈值；无实测证据默认 buffered
- **种子迁移**：`scripts/build-seed-manifest.mjs` + `public/motion-library/models/lafei_8/front/manifest.json`——旧 9 条手势迁移为 candidate 条目（写集从真实源动画 timeline 派生、档案摘要复算、contentDigest SHA-256 实算）；llm_nod/llm_lean_blink 为内部 V1 草稿待转换，未入册
- **目录备案**：`public/motion-library/catalog.json`（110 动作族/154 变体，全部 planned）+ [docs/motion-library/production-plan.md](docs/motion-library/production-plan.md)

### 测试与记录

- 全量 **167/167 通过**（新增 m0-fixes 10、motion-library 26、m2-select-scheduler 12、m3-coordinator 19、m5-seed-manifest 6）
- 基线报告与未验收清单：`experiments/motion-library/baseline-report-2026-09-14.md`（真实首帧延迟、rolling 实测、种子视觉验收待本机执行）

## [Unreleased] - 2026-09-10

动作指导书与受限在线参数生成（Spec：`docs/Pliette_Spine_Motion_Guide_Development_Spec_v1.0.md`）。

### 新增

- **ControlProfile 控制档案**（`src/rig/controlProfile.ts`）：档案身份（modelId/profileRevision/assetDigest/参考姿态 digest/坐标约定）、控制定义（语义/输入/绑定/mapsTo 唯一映射/域/速率/写集依赖/行为/证据）、有限规则类型、确定性摘要（canonical JSON + FNV-1a64）；严格解析（未知字段拒绝、写集冲突拒绝、verified 必须引用证据）
- **拉菲档案 v2**（`characters/lafei_8.rig-profile.json`，8 开放控制/6 规则/12 证据）：89 步 ±探针、原动画速率挖掘、眼睛配对图鉴、头身分离反例全部出证；屏幕左右归属实测（hand_R=屏幕右臂、hand_L=屏幕左臂、左右非对称禁止镜像）
- **组合控制**：`face.eyes.pair` 枚举映射表（open/blink/squeeze/dizzy/sleepy/wink），左右眼成对切换，单眼写入被 requiresCapability 规则拒绝
- **MotionDraft V1.1 协议**（`src/motion/author/`）：请求包（availableControls/mandatoryRules 依赖闭包/guideExcerpts/预算）+ 响应判别联合（motion/unsupported/needs_context，身份回显校验，未知字段拒绝）；controlId → 内部 role+property 唯一映射与 composite 展开；smooth=固定有界缓动映射
- **验证管线**（Spec 9.1 七步）：结构/身份 → 控制能力 → 数值/时间线/预算/缓动 → 规则解释器（range/rateLimit/requiresVariant/exclusiveWrite/requiresCapability/contactDependency 六种确定性解释器）→ 官方编译 → 隔离实例轨迹采样（真实合成值+速率）；Spec 10.2 十四个最低错误码全量落地
- **AuthorBroker**：每角色单飞、截止从提交计时、离散状态版本陈旧性检查（连续状态不判过时）、requestId 幂等（有界备忘录）、原子"检查+取权"提交、局部取消与播放释放；浸泡发现的无界 Set 泄漏已修复（FIFO 上限 8192）
- **Author 客户端**：LlmAuthorClient（OpenAI 兼容，deadline AbortController/32KiB 上限/截断即失败/不落密钥）+ MockAuthorClient（确定性域内模板，管线工程验收）+ 候选文件导入
- **Lab Author 面板**：请求上下文查看、Mock 在线生成（校验→提交→播放全链路可视化）、候选导入验证播放
- **第二骨架 spineboy**（官方示例，机制验证）：静态提取+3 控制探针+速率挖掘出证；档案/绑定注册/指导书；跨角色隔离测试（controlId 集合不相交、同意图参数不同、头身拓扑世界坐标机器证据：spineboy 头随躯干 vs 拉菲兄弟不随动）
- **Guide Builder**（`scripts/build-guides.mts`）：单一档案源生成 `docs/motion-guides/{common,lafei_8,spineboy}.md`（GENERATED 标记，人工编辑不改程序边界）
- **测试**：39 项新增（档案 13/作者管线 20/跨角色 6），全量 94/94
- **录像**：`experiments/media/motion-guide/`（拉菲/spineboy 探针、在线生成 Mock 流程演示；本地不入库）

### 实测（2026-09-10 追加）

- **真实 LLM 首轮 A/B/C**（mimo-v2.5，密钥从环境变量读取不落盘）：A/B/C 各 12/20（60%）校验通过并接纳；失败原因真实多样（超 8s 截止 5 次、时长/幅度/速率超界、偶发自造字段）；被接纳候选中位延迟 ~4.5s。**11.4 在线门槛未达标（p95 ≤2000ms），在线 Author 保持关闭**。原始输出与统计：`experiments/motion-guide/run-llm-mimo-8s/`；`public/motions/llm_nod.json` 等为 LLM 创作的可播放草稿。

### 未完成（如实声明）

- 视觉通过率人工评分、实际执行成功率、A≥B 的统计显著性：样本小（n=20/组）且未做看画面评分
- 口型、背面视图、接触类（托腮等）、独立手指：能力缺失，如实 unsupported

## [0.1.0] - 2026-09-08

首个公开版本。P0～P3 阶段验收满足，P4 部分落地。

### 新增

- **资产管线**：Spine 3.6 二进制 → 同版本 JSON 转换工具链（第三方转换器，本地）；官方 spine-ts 3.6.53 运行时 vendored 并锁定 SHA-256；世界坐标勘探器（手势片段 / 稳定接触窗口 / 行走步幅自动标定）
- **资产检查器**：导入即生成 AssetReport（骨骼层级 / Slot / 皮肤附件类型 / IK / 动画 Timeline 分布 / 图集页），支持 Markdown 与 JSON 导出
- **基线播放器（Motion Lab）**：原动画播放 / 暂停 / 逐帧 / 变速 / 循环、骨骼调试视图、透明背景验收色板、骨骼探针（±10°）、3D 纸片演员与平面基线双视图
- **3D 场景**：Three.js 纸片演员（透明 PMA 画布 → CanvasTexture → 双面平面）、Q 版比例家具（桌椅矮桌）、产品主镜头（35°）与有限视差跟随
- **MotionDraft 管线**：JSON Schema（Ajv）校验 + 匹配版本的官方 Timeline 编译器 + 官方运行时数值采样验证（rotate 值为 setup 相对偏移语义实测固定）
- **参数集模块**：参数注册表（类型/单位/有效域/影响属性/updatePolicy）、StyleProfile 有界映射、MotionPreset 与动作目录
- **调度器**：七通道固定轨道布局、幂等提交、auto 换手、抢占与局部取消、过期意图、通道占用快照
- **手势库与切片叠加**：原动画世界坐标勘探 → 语义片段（挥手/头晕/开心/害羞/庆祝/指向/触碰）→ 通道过滤 + 时间窗切片叠加，结束自动混合交还
- **表情调制**：自动眨眼（face 通道附件调制，随机间隔，与头部表情叠加互斥避让）
- **接触交互**：触碰矮桌场景，稳定接触段误差实测 max=0.0027H（验收门槛 0.02H）
- **姿态切换**：standing ↔ walking ↔ seated 状态机（sit 末帧保持），A08 全程场景（走向椅子坐下）
- **对话 Select 层**：RuleSelectAdapter（离线规则）+ LlmSelectAdapter 接口骨架（等密钥配置），事件配方映射（greet/praise/pet/scare/tease/question/drink）
- **语音适配器**：MockTts（音频时钟驱动说话状态、可打断），说话气泡 UI
- **Electron 桌面宿主**：安全基线（contextIsolation / sandbox / 无 nodeIntegration），`npm run desktop:dev` 一键启动
- **验证工具链**：确定性逐帧出证管线（多组采集脚本）、CDP 实时性能基准（scripts/bench-realtime.mjs）、30 分钟浸泡测试（scripts/soak-test.mjs）
- **测试**：55 项 Vitest（Schema 拒绝规则 / 官方运行时采样断言 / 调度器幂等冲突取消压力 / 通道过滤 / 手势域检查）

### 性能

- 完整渲染路径（Spine 求解 + 纹理上传 + 3D 场景）在 headless 软件渲染下 168 FPS，帧间隔 p95 = 4.3ms（验收门槛 20 ms）
- 30 分钟持续运行堆内存零增长
- 超分 3x 贴图接入无性能损失

### 修复

- 3.6 运行时 RotateTimeline 值为 setup 相对偏移——编译器早期版本双倍偏移，已由采样测试固定
- 确定性回放循环缺少 state.update 导致叠加切片停留在源动画首帧
- 实验室预览切换轨道时的开头混合抖动（预览前清空轨道）
- 调度器对非有限数值参数的拒绝（NaN durationSec 曾导致实例永不结束）
- 采集脚本的 dev server 陈旧代码预检与 CJK 字体标注

### 变更

- 动作生成路线定案：放弃 LLM 实时生成关键帧，改为原动画切片复用 + LLM 行为选择（见 docs/decision-motion-pipeline.md）

### 移除

- 实验室旧版"调度演示"面板（由行为库面板替代）

[0.1.0]: https://example.com/pliette/releases/tag/v0.1.0
