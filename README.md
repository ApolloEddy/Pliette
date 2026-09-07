<div align="center">

<img src="assets/pliette-logo-app-wordmark-white-1254.png" alt="Pliette 纸栖" width="280" />

**Pliette（纸栖）** — 喜欢的角色住在有空间感的桌面场景里：能看见你、听你说话，根据情境自然地说话和行动。

Spine 纸片角色 · 参数化动作 · 有限 3D 场景 · 可替换的角色 / 场景 / AI 后端

</div>

---

## 项目状态

当前按 [Spec v1.0](docs/Pliette_Spec_v1.0.md) 推进至 **P0（真实资产与基线播放器）完成、P1 基础设施就绪**：

- ✅ 官方 spine-ts **3.6** 运行时 vendored 并锁定哈希（目标角色 lafei_8 为 3.6.52 导出）
- ✅ Motion Lab：资产导入检查、原动画播放（播放/暂停/逐帧/速度/循环）、骨骼调试、透明背景验收、骨骼探针
- ✅ 3D 场景：Three.js 纸片演员（透明 PMA 画布 → CanvasTexture → 双面平面）、地面参考线、基础家具遮挡
- ✅ MotionDraft Schema + Ajv 校验 + **匹配版本的官方 Timeline 编译器**（经官方运行时采样验证，含 0°→−72°→0° 线性示例）
- ✅ 调度器种子：通道占用、幂等提交、auto 换手、抢占、局部取消、过期
- ⏳ 等待拉菲 `lafei_8.zip` 放入 `assets-local/` 后执行真实资产接入验收（[asset-report](docs/asset-report.md) 第 4 节清单）

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
