# 更新日志（Changelog）

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

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
