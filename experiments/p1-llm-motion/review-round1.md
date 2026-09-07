# P1 六项候选 · 评审与修订记录（第 1 轮，2026-09-07）

评审人：开发 Agent（GLM-5.3）· 依据：headless 确定性截图（`experiments/media/p1/`）· 量表：Spec 15.1（0-5 分四维：协调/节奏/轮廓/风格，无硬失败）

## 汇总表

| 动作 | 模式 | 帧位置 | 协调 | 节奏 | 轮廓 | 风格 | 硬失败 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| idle_subtle_c1 | Author | t=1.2s（呼吸顶点） | 4 | 4 | 5 | 4 | 无 | 通过 |
| nod_c1 | Author | t=0.28s（点头最低） | 4 | 3 | 4 | 4 | 无 | 通过，修订1轮 |
| wave_right_primitive_c1 | **Tune** | t=0.6s（挥动中段） | 4 | 4 | 4 | 4 | 无 | 通过，修订1轮 |
| point_right_c1 | Author | t=0.65s（前伸保持） | 4 | 3 | 4 | 4 | 无 | 通过 |
| lean_listen_c1 | Author | t=0.8s（倾身保持） | 4 | 3 | 4 | 4 | 无 | 通过 |
| shrink_shy_c1 | Author | t=0.9s（收缩保持） | 4 | 3 | 4 | 5 | 无 | 通过 |

节奏维度基于曲线设计评估；视频逐帧复核后更新（见视频管线 pending 项）。

## 各项观察

- **idle_subtle**：呼吸上浮（body translate 0.008H）+ 头部 2.5° 缓摆，顶点帧轮廓自然，头发/猫耳随动正常。对照原资源 stand 待机成立。
- **nod**：face +12° 表现为低头+轻微右倾复合，点头意图可读。修订点：躯干 0 联动略显"头部独立运动"，拟加 body 1.5° 跟随提升协调（candidate-02）。
- **wave（Tune 首次参数 liftDeg=30/wagDeg=18/cycles=2/tempo=1.0）**：整臂抬起 30° 达成，蛋糕盘仍持于手（握持视觉未破坏）。修订点：±18° 指尖摆动在 30° 抬臂位的视觉幅度偏小，拟 wagDeg 18→24、tempo 1.0→1.15（candidate-02，仅参数变化，符合 Tune 语义）。
- **point**：hand_R +38° 整臂前伸 + 指尖 -6°，指向姿态明确，保持段 stepped 稳定。
- **lean**：body +7° 侧倾 + face -3° 反代偿，头部世界角度基本保持。**表达学限制记录**：正面 2D 视图下"前倾"只能表现为侧倾或纵向压缩，这是几何事实，不以调参掩盖（Spec 2.4 精神）；"倾听"语义靠小幅+头部代偿传达，成立。
- **shrink**：躯干 5°+低头 10°+双臂 -12° 内收的 composite 协调良好，收缩感明确，无穿身。

## 修订计划（第 1 轮，≤3 轮内）

1. wave → candidate-02（Tune）：`wagDeg 18→24, tempo 1.0→1.15`，其余不变。原始 candidate-01 保留。
2. nod → candidate-02（Author）：新增 body.root rotate 1.5° 跟随曲线（0.28s 峰值同步），头部幅度不变。原始保留。
3. lean 的表达限制不做参数修订（非参数问题）。

## 一次生成合格率（本轮，Agent 自评口径）

6/6 首次输出达到"可预览、无硬失败、意图可读"；按 Spec 15.1 入库门槛（均分≥4、单项≥3）衡量：idle/wave/shrink 达标，nod/point/lean 节奏维度 3 分待视频复核后定。**注意**：Agent 自评不等于用户主观认可（Spec 15.1），录像供用户直接观看。

## 第 1 轮修订结果（2026-09-07 补记）

- **wave_right_primitive_c2**（Tune）：wagDeg 18→24、tempo 1.0→1.15。修订帧（t=0.56s）挥动张开明显大于 c1，保持段时间 1.6→1.391s。评审：轮廓 4→5，节奏 4→5。期间测试发现并修复 Primitive 的 durationSec 舍入 bug（末帧超界被校验拒绝——校验器按设计工作）。
- **nod_c2**（Author）：躯干 1.5° 跟随。修订帧（t=0.28s）头-躯干联动自然，"头部独立运动"感消除。评审：协调 4→5。
- 两项修订截图：`experiments/media/p1/p1-wave-c2.png`、`p1-nod-c2.png`（源文件名 p1-*-c2）。原始 candidate-01 未动。
- 修订历史：wave c2 曾因上述舍入 bug 重新生成一次（bug 修复非动作修订，参数未变）。

## 视频证据

`experiments/media/p1/<motion>.mp4`（8 段：6 首次输出 + 2 修订，每段 2 个周期 @15fps，离线逐帧确定性渲染 + 画面标注 ID/版本/时间）。离线逐帧用于质量对照，非实时帧率证据（Spec 15.3）。合成脚本：`scripts/capture-p1-video.sh`。
