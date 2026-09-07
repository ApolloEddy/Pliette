<div align="center">

<img src="assets/pliette-logo-app-wordmark-white-1254.png" alt="Pliette 纸栖" width="280" />

**Pliette（纸栖）** — 喜欢的角色住在有空间感的桌面场景里：能看见你、听你说话，根据情境自然地说话和行动。

Spine 纸片角色 · 参数化动作 · 有限 3D 场景 · 可替换的角色 / 场景 / AI 后端

</div>

---

## 项目状态

当前按 [Spec v1.0](docs/Pliette_Spec_v1.0.md) 推进至 **P0 完成验收、P1 实验进行中**：

- ✅ **P0 真实资产验收完成**：拉菲 lafei_8 在官方运行时正确播放（平面/3D 双模式目视），结构核对与 D.2 逐项一致，H 标定 heightUnits=335，正反面判定为仅正面（`_left` 为朝左变体），face ±6° 探针方向确认
- ✅ 官方 spine-ts **3.6** 运行时 vendored 并锁定哈希；skel→JSON 用现成工具（wang606 converter，哈希记录在案）
- ✅ Motion Lab：资产导入检查、原动画播放、骨骼调试、透明验收、骨骼探针、Motion Composer、调度演示、录像
- ✅ 3D 场景：Three.js 纸片演员（透明 PMA 画布 → CanvasTexture → 双面平面）、35° 主镜头房间
- ✅ MotionDraft Schema + Ajv 校验 + **匹配版本的官方 Timeline 编译器**（实测 rotate=setup 相对偏移语义）
- 🔄 **P1 六项动作实验**：Tune（wave 固定 Primitive）+ Author（其余五项）首次输出完成并全部通过初审（无硬失败），1 轮修订后 wave/nod 提升，逐帧视频证据合成中（`experiments/p1-llm-motion/`）
- ⏳ P2 参数库/并行中断、P3 房间交互、P4 对话桌面按阶段依赖推进

## 快速开始

```bash
npm install
npm run dev      # Motion Lab（浏览器打开）
npm run test     # 40 项规则测试（Schema / 官方运行时采样 / 调度）
npm run build    # 生产构建
```

验证播放管线无需任何外部资产：内置官方示例（spineboy / goblins / stretchyman，3.6 导出，随仓库附带其许可文件）。
拉菲资产就位后解压到 `assets-local/lafei_8/`（`lafei_8.json`、`lafei_8.atlas.txt`、`lafei_8.png`），在 Lab 角色下拉中选择即可；`assets-local/` 默认不入库。

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
