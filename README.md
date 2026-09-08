<div align="center">

<img src="assets/pliette-logo-app-wordmark-white-1254.png" alt="Pliette 纸栖" width="280" />

**Pliette（纸栖）** — 喜欢的角色住在有空间感的桌面场景里：能看见你、听你说话，根据情境自然地说话和行动。

Spine 纸片角色 · 参数化动作 · 有限 3D 场景 · 可替换的角色 / 场景 / AI 后端

</div>

---

## 项目状态

当前按 [Spec v1.0](docs/Pliette_Spec_v1.0.md) 推进至 **P0/P1 完成、P2/P3 核心机制落地**：

- ✅ **P0 真实资产验收完成**：拉菲 lafei_8 在官方运行时正确播放（平面/3D 双模式目视），结构核对与 D.2 逐项一致，H 标定 heightUnits=335，正反面判定为仅正面
- ✅ 官方 spine-ts **3.6** 运行时 vendored 并锁定哈希；skel→JSON 用现成工具（wang606 converter）
- ✅ **P1 路线结论**：LLM 手写关键帧经用户验收否决（实验记录保留）；转向**原动画切片复用**——20 段官方美术动画按身体通道过滤、时间窗切片、叠加合成，质量天然达标（review-round3-overlay-route）
- ✅ **P2 核心出证**：手势库（wave/dizzy/happy/shy/pump/point）经调度器提交（幂等/冲突/auto 换手/局部取消）；**A03 三相位中断、A04 走路+挥手+取消** 视频验收通过
- ✅ **P3 核心出证**：**A08 走向椅子坐下**（姿态状态机 stand/walk/sit + 刹停落座 + 相机跟随）；行走速度标定 0.115 H/s
- ✅ 表情调制：自动眨眼（eye_2 附件，随机 2.2-5.6s，与表情叠加互斥避让）；`?auto=1` 自动待机行为演示
- ✅ 实时性能：完整渲染路径软件渲染下 168 FPS / p95=4.3ms（[perf-baseline](docs/perf-baseline.md)）
- ⏳ 待做：触碰桌边接触误差（P3 后半）、对话/语音接入（P4）、Electron 桌面宿主（P4）

## Motion Lab 参数速查

| 参数 | 作用 |
| --- | --- |
| `?asset=lafei_8` / `lafei_8hd` | 原始分辨率 / 超分 3x 贴图 |
| `?anim=walk&freezeAt=2` | 指定基础动画并冻结到该秒（确定性截图） |
| `?gesture=wave&hand=auto&freezeAt=1&cancelAt=2.2` | 经调度器播放手势库动作，可脚本化取消（A03/A04） |
| `?overlay=stand:rightArm:4.9:7.3&freezeAt=2` | 任意原动画 × 通道 × 时间窗切片叠加 |
| `?scenario=a08&freezeAt=4.5` | A08 场景确定性回放（实时演示则省略 freezeAt） |
| `?eyes=eye_4_1,eye_4_2` | 强制眼部附件变体（表情探针） |
| `?event=greet` | 对话事件配方（greet/praise/pet/scare/tease/question/ambient） |
| `?auto=1` | 自动待机行为：随机手势切片 + 自动眨眼 |
| `?bench=1&benchSec=6` | 实时性能基准（CDP 计时） |

## 快速开始

```bash
npm install
npm run dev      # Motion Lab（浏览器打开）
npm run test     # 40 项规则测试（Schema / 官方运行时采样 / 调度）
npm run build    # 生产构建
```

验证播放管线无需任何外部资产：内置官方示例（spineboy / goblins / stretchyman，3.6 导出，随仓库附带其许可文件）。
拉菲资产位于 `assets/Model/lafei_8/`（不入库），Lab 已可直接选择（含超分 3x 条目）。

Lab 支持确定性视角参数：`?view=flat&anim=walk&probe=6`（平面基线 + 指定动画 + 头部探针）。

## 目录

| 路径 | 内容 |
| --- | --- |
| `src/assets/` | 官方运行时加载器与 AssetInspector |
| `src/rig/` | RigProfile 语义绑定（lafei_8 候选绑定预录于 `src/rig/rigProfile.ts`） |
| `src/motion/authoring/` | MotionDraft 数据契约与模板 |
| `src/motion/compiler/` | Ajv 校验、Draft→3.6 Timeline 编译、官方运行时采样 |
| `src/motion/parameters/` | 参数注册表、StyleProfile、Preset 与动作目录 |
| `src/motion/runtime/` | 调度器（通道/幂等/取消）与 GestureLayer（固定轨道） |
| `src/render/` · `src/scene/` | Spine 画布、纸片演员；three.js 房间与相机 |
| `src/lab/` | Motion Lab 界面与录像器 |
| `vendor/spine-ts/3.6/` | 官方运行时构建（ESM 包装 + PROVENANCE 哈希记录） |
| `public/examples/` | 官方示例资产（管线验证用） |
| `characters/` | 角色清单（lafei_8 候选） |
| `assets-local/` | 用户原始资产（gitignore） |
| `schemas/` `tests/` `docs/` `experiments/` | 契约、验证、决策记录、实验记录 |

## 关键设计约束（摘自 Spec）

- 原角色保真是前置条件：关闭全部新参数时必须恢复原资源形态；接入失败不用动作参数掩盖。
- 动作播放使用与资源版本匹配的官方运行时；本项目自研的是动作语义、参数管理、编排与产品逻辑。
- LLM 先验证「为真实骨架生成数值动作参数」的质量（Tune → Author → Select 三模式），P0–P3 不把未审阅长 Timeline 接入对话播放。
- 原始资产本地保存，不自动打包进公开仓库。

详见 [docs/Pliette_Spec_v1.0.md](docs/Pliette_Spec_v1.0.md) · [docs/asset-report.md](docs/asset-report.md) · [docs/runtime-lock.md](docs/runtime-lock.md)
