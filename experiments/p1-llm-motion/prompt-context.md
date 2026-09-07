# P1 · LLM 动作参数实验 · 输入包与协议

日期：2026-09-07 · 模式：Tune（wave）+ Author（其余五项）· 产出方：开发 Agent（GLM-5.3）

按 Spec 2.2 / 6.2，此处记录提供給 LLM 的输入包内容；候选与评审按动作分目录存档。

## 输入包（六项共用部分）

- **资源检查报告**：`experiments/p0-lafei/lafei_8.asset-report.md`（79 骨骼 / 42 Slot / 20 动画 / 仅正面 / 无 mouth slot）
- **RigProfile**：`lafei_8.front.v1`（`src/rig/rigProfile.ts`），heightUnits=335，脚底 y≈-2.4
- **可用角色绑定**（局部轴方向说明，Spec 6.2：不只给名称）：

| 角色 | 骨骼 | 局部轴事实 |
| --- | --- | --- |
| body.root | body | setup rotation = **-90°**（非直立 0°）；正 rotate = 上身向屏幕右倾（实测探针）；bob 用 translate y（Y 向上） |
| head.main | face | setup rotation = 90°；**正 rotate = 头部向屏幕右倾**（face ±6° 探针目视确认，2026-09-07） |
| arm.upper.left / right | hand_L / hand_R | body 直接子节点，旋转带动全臂链；方向探针本轮补充 |
| arm.left / right | hand_L3 / hand_R3 | 指尖段，挥手摆动用 |
| leg.ik.left / right | leg_L / leg_R | IK 目标（mix=1），本批实验不驱动 |

- **数值范围**：rotate 角度制相对参考姿态；translate 用 H 比例（[xH, yH]）；ease 仅 linear/stepped/有界 Bézier；每曲线 3-8 关键帧（Spec 6.3）
- **验收环境**：官方 spine-ts 3.6.53 运行时；编译器实测语义（rotate=setup 相对偏移，`docs/asset-report.md` §3）

## 六项动作目的（Spec 2.3）

1. idle_subtle 轻微待机 —— 2.4s 呼吸起伏 + 头部极缓摆动，对照原资源 stand
2. nod 点头 —— 0.8s 单次点头，12° 幅度
3. wave 单手小幅挥手（**Tune**）—— 固定 wavePrimitive（liftDeg/wagDeg/cycles/tempo），LLM 只出数值
4. point 指向 —— 右臂前伸保持 ~0.6s 后回收
5. lean 倾身倾听 —— 躯干前倾 7° 保持，头部 -3° 反代偿
6. shrink 害羞收缩 —— composite：躯干 5° + 头低 10° + 双臂 -12° 内收

## 协议（每项）

- `candidate-01.json`：**首次输出，永不修改**（provenance 已内嵌）
- 修订版 `candidate-02.json`/`candidate-03.json`：每轮可视化反馈（headless 截图 + Agent 评审）后产出，≤3 轮（Spec 2.3）
- `review.md`：Agent 初审评分（0-5 四维：协调/节奏/轮廓/风格，Spec 15.1）+ 硬失败检查 + 修订理由
- 截图：`experiments/media/p1/<动作>-c<轮>-<t>s.png`（?motion=&poseAt= 确定性帧）

## 明确不计入成功率的情形（Spec 6.5 / 2.2）

- 选择原资源动画（stand/walk 等）不算 LLM 创作
- 人工重制后的结果单独标记，不冒充一次生成质量
