# 更新日志（Changelog）

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

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

### 未完成（如实声明）

- **LLM 实测未做**：无 API 密钥（`config/llm.local.json` 待配置）。Spec 11.3 指标与 11.4 在线开放门槛未判定，在线 Author 不应对外启用；A/B/C run1 为管线工程验收（Mock），不构成指导书收益证据
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
