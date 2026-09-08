<div align="center">

<img src="assets/pliette-logo-app-wordmark-white-1254.png" alt="Pliette 纸栖" width="260" />

**Pliette（纸栖）** — 让喜欢的 Spine 纸片角色住在桌面 3D 房间里：
能看见你、听你说话，根据情境实时地说话和做动作。

Spine 3.6 官方运行时 · 通道切片动作架构 · Three.js 3D 场景 · Apache-2.0

[快速开始](#快速开始) · [架构](#架构) · [动作管线](#动作管线为什么这样做) · [路线图](#路线图) · [许可证](#许可证)

</div>

---

## 这是什么

Pliette 是一个桌面 AI 伴侣的技术原型：你喜欢的角色生活在一个有空间感的房间场景里，
能听你说话、根据情境自然地做动作和说话，动作可以中途打断、切换、叠加。

它解决的核心问题是：**如何让 2D 骨骼角色拥有"活"的实时动作，而质量不依赖任何生成模型。**

我们的结论（经两轮对照实验验证）：动作质量存在于专业美术数据中，不存在于参数里。
因此 Pliette 的动作管线 = **官方美术动画的自动勘探切片 + 身体通道叠加 + 行为层编排**，
LLM 只负责它可靠的部分——听懂语境、选择行为、填写有界参数。详细论证见
[docs/decision-motion-pipeline.md](docs/decision-motion-pipeline.md) 与
[docs/research-realtime-motion.md](docs/research-realtime-motion.md)。

## 快速开始

要求：Node.js ≥ 18，npm。

```bash
git clone <repo-url> pliette && cd pliette
npm install

npm run dev          # 浏览器打开 Motion Lab（推荐先看 ?asset=lafei_8&auto=1）
npm test             # 55 项测试
npm run build        # 生产构建
npm run desktop:dev  # Electron 桌面窗口
```

> 本仓库**不包含任何游戏角色资产**。管线开箱即用地支持官方示例角色
> （Spineboy / Goblins / Stretchyman，已随仓库附带其许可文件）。
> 如果你有自己的 Spine 3.6 角色，参考 [public/examples/](public/examples/) 的
> 目录结构放入 `assets/Model/` 并在 `src/lab/ui.ts` 注册即可（详见 [docs/asset-report.md](docs/asset-report.md)）。

### Motion Lab 确定性参数速查

| 参数 | 作用 |
| --- | --- |
| `?asset=lafei_8&auto=1` | 加载角色并进入自动待机行为（随机手势 + 自动眨眼） |
| `?asset=lafei_8hd` | 超分 3x 贴图版 |
| `?anim=walk&freezeAt=2` | 指定基础动画并冻结到该秒（逐帧检查） |
| `?gesture=wave&hand=auto&cancelAt=2.2` | 经调度器播放手势库动作，可脚本化取消 |
| `?overlay=stand:rightArm:4.9:7.3` | 任意原动画 × 身体通道 × 时间窗切片叠加 |
| `?scenario=a08` / `?scenario=touch` | 走向椅子坐下 / 触碰矮桌（含接触误差实测） |
| `?eyes=eye_4_1,eye_4_2` | 眼部附件变体探针 |
| `?event=greet` | 对话事件配方（Select 层） |
| `?bench=1&benchSec=6` | 实时性能基准（CDP 计时） |

## 架构

| 模块 | 职责 |
| --- | --- |
| `src/assets/` | 官方运行时加载器（版本锁定校验）、AssetInspector、atlas 坐标缩放（支持超分贴图） |
| `src/rig/` | RigProfile 语义绑定（局部 Fk / IK 目标 / Slot 状态）、探针 |
| `src/motion/authoring/` | MotionDraft 契约与固定 Primitive（Tune 模式） |
| `src/motion/compiler/` | Ajv 校验、Draft→3.6 Timeline 编译、官方运行时采样验证 |
| `src/motion/library/` | **通道切片叠加（overlay）与手势库**——本项目动作管线的核心 |
| `src/motion/parameters/` | 参数注册表、StyleProfile、Preset 与动作目录 |
| `src/motion/runtime/` | 调度器（七通道、幂等、冲突、auto 换手、局部取消）、切片播放层 |
| `src/render/` · `src/scene/` | Spine 透明画布 → CanvasTexture → 双面纸片；35° 主镜头房间 |
| `src/dialogue/` · `src/speech/` | 对话 Select 层（规则版 / LLM 版同接口）、语音适配器（音频时钟） |
| `src/lab/` | Motion Lab 界面、确定性场景回放、录像 |
| `vendor/spine-ts/3.6/` | 官方 spine-ts 构建（ESM 薄包装，内容零修改，哈希锁定） |
| `desktop/` | Electron 宿主（安全基线） |

## 动作管线（为什么这样做）

我们用两轮对照实验证明：**LLM 直接生成骨骼关键帧在 Q 版 2D 角色上达不到可接受质量**
（多部位协调、缓动性格、幅度语义都无法从文本先验推出），而**专业美术数据的切片复用零迭代达标**。
因此 Pliette 的动作管线是：

```
官方美术动画（质量源头）
   → 世界坐标勘探（自动发现举手/低头/稳定接触等语义片段）
   → 通道过滤 + 时间窗切片（overlay）
   → 轨道叠加 + 官方混合（手势接管，可取消可交还）
行为目标 ─→ 调度器（幂等/冲突/auto 换手）─↑
对话文本 ─→ Select 层（事件配方）──────↑
```

LLM（或任何决策器）只站在最上层选择与编排，永远不生成骨骼数据。
完整的实验数据、失败模式分析与路线对比见
[docs/decision-motion-pipeline.md](docs/decision-motion-pipeline.md) 和
[docs/research-realtime-motion.md](docs/research-realtime-motion.md)。

## 验收状态

Spec 关键用例对齐表见 [docs/acceptance-checklist.md](docs/acceptance-checklist.md)：

| 用例 | 结果 |
| --- | --- |
| A03 手势三相位中断 | ✅ 视频 `a03_interrupt_*.mp4` |
| A04 走路+挥手+取消 | ✅ 视频 `a04_walk_wave_cancel.mp4` |
| A05 双手独立 | ✅ 机制出证（拾取/放下链延后） |
| A06 auto 换手 | ✅ 调度器测试 |
| A08 走向椅子坐下 | ✅ 视频 `a08_scenario.mp4` |
| 接触误差 ≤0.02H | ✅ 实测 max=0.0027H（`touch_table.mp4`） |
| A01/A09 背面相关 | ⚠️ 首个角色仅正面，限制展示朝向 |
| A10 语音取消 / A07 说话 | 🔶 Mock 层已通，真实 TTS 待接入 |

## 路线图

- [ ] 动作图（Motion Graph）：自动切分 + 图遍历，产出无限不重复的专业动作流（[研究笔记](docs/research-realtime-motion.md)）
- [ ] 程序化生命层：呼吸不规则化、发/裙弹簧物理（先测与烤入动画的冲突）
- [ ] A05 拾取/放下完整链（slotState + 桌面 sprite）
- [ ] 接触误差推广到更多锚点
- [ ] P4：真实 LLM / TTS 接入（接口已就绪）、透明置顶与多显示器验证
- [ ] 目标机（GPU / Electron / 1080p）正式性能验收

## 许可证

本项目原创代码以 [Apache-2.0](LICENSE) 提供。

第三方组件各自保留原许可（详见 [NOTICE](NOTICE)）：
- **Spine 运行时**（vendor/spine-ts/3.6/）遵循 Spine Runtimes Software License——
  在自己的产品中使用需遵守 Esoteric Software 的条款（通常需要有效的 Spine 编辑器许可）；
- `public/examples/` 内的演示角色资产版权归 Esoteric Software，随附其许可文件；
- **任何第三方游戏角色资产不在本仓库中**，使用本项目接入自有角色时请自行确认授权。

## 致谢

- [Esoteric Software](https://esotericsoftware.com) —— Spine 及其公开运行时与示例资产
- [wang606/SpineSkeletonDataConverter](https://github.com/wang606/SpineSkeletonDataConverter) —— 3.6 skel→JSON 转换
- [Three.js](https://threejs.org) · [Vite](https://vitejs.dev) · [Ajv](https://ajv.js.org) 开源社区
