# 动作指导书实施清单（M0 基线 · Spec：Pliette_Spine_Motion_Guide_Development_Spec_v1.0）

日期：2026-09-10 · 状态：M0 完成，M1–M4 按本清单推进

## 0. 基线事实（M0 验证记录）

- 测试基线：`npm test` 55/55 通过（registry/scheduler/overlay/draft-schema/compiler/p1-motion）；`npm run typecheck` 通过。
- 主角色 lafei_8（Spine 3.6.52 导出，官方 3.6.53 运行时加载）原动画播放已有真实录像证据：
  `experiments/media/p1/overlay-*.mp4`（挥手/晕眼/摸头/低头/指向切片叠加）、A03/A04/A05/A08 用例视频、
  `docs/acceptance-checklist.md`。本轮探针与 A/B 录像补充新证据，不重录基线。
- 资产状态：正面视图 `status: verified`（超分 3x 贴图零代价）；背面素材缺失（`characters/lafei_8.character.json`）；
  官方示例 spineboy/goblins/stretchyman（3.6 导出，含 license.txt）在 `public/examples/`，可作 M4 第二骨架
  （类型=官方样例，限制需注明，Spec 5.3）。

## 1. 现有类型 → 新 Spec 需求的复用映射表

| Spec 需求 | 现有实现 | 处置 |
| --- | --- | --- |
| 角色档案身份/证据/digest | `src/rig/rigProfile.ts`（RigProfile：候选绑定，无身份字段） | **扩展**：新增 `src/rig/controlProfile.ts`（身份/控制/规则/证据 + profileDigest），旧 RigProfile 保留为绑定层 |
| controlId → 旧 role+property 唯一映射 | MotionDraft v1 用 `role + property` | **保留内部格式**；控制定义携带 `mapsTo: {role, property}`（Spec 8.2） |
| 严格校验 | `src/motion/compiler/validate.ts`（Ajv + 业务规则） | **扩展**：新增 V1.1 响应/草稿校验（判别联合、未知字段拒绝、身份回显）+ 规则解释器 |
| 官方编译 | `src/motion/compiler/compile.ts`（→ 3.6 Timeline） | **复用**，V1.1 先翻译为内部 Draft 再编译 |
| 轨迹采样检查 | 无（仅单点采样测试） | **新增**：隔离 Skeleton 实例上按播放步长采样（spine-core 无需 WebGL，tests/helpers.ts 已验证路径） |
| 调度/占用/幂等 | `src/motion/runtime/scheduler.ts` + `gestureLayer.ts` | **扩展**：作者请求单飞、离散状态版本、迟到/取消响应丢弃 |
| 通道切片/接管语义 | `src/motion/library/overlay.ts`（3.6.53 实证：满权重绝对接管） | **复用**为入场/退出机制参考与通道过滤实现 |
| 上下文装配 | 无 | **新增** `src/motion/author/context.ts`（请求包 + 依赖闭包必带规则） |
| Guide Builder | 无 | **新增** `scripts/build-guides.mts`（单一来源 → common.md + `<modelId>.md`） |
| 在线受限接入 | `src/dialogue/adapter.ts`（Select 层，LlmSelectAdapter 等密钥） | **新增** Author 客户端（deadline 2500ms/取消/32KiB 上限/截断即失败）+ 候选导入；Select 层不动 |
| 诊断码 | 旧 Diagnostic（自由 code） | **映射**到 Spec 10.2 最低错误码集合 |
| 采集/录像 | `scripts/*.mjs|mts`（headless Edge + 原生 CDP、`?capture=1` 确定性采集） | **复用**做探针与 A/B 录像 |

## 2. 已知阻塞（不等待，按 Spec 0.5 / 11.2 处理）

1. **在线 LLM 无密钥**：`config/` 仅有 README，无 `llm.local.json`。→ Author 客户端按接口实现；
   管线验收用候选文件导入 + 确定性 Mock；A/B/C 实验框架与统计落地，**LLM 实测标记未测**。
2. **背面素材缺失**：视图限定 front；跨视图请求按 `UNSUPPORTED_VIEW` 拒绝。
3. **嘴部独立能力缺失**：无独立 mouth 附件 → 口型类能力记 `unsupported`，不伪造。

## 3. 实施顺序（每步有完成标准，先测试后接线）

| 步骤 | 交付 | 完成标准 |
| --- | --- | --- |
| M1a 控制档案 | `src/rig/controlProfile.ts` + `characters/lafei_8.rig-profile.json` | digest 确定性（同输入同输出、任一字段变动必变）；未知字段拒绝；闭包计算有测试 |
| M1b 标定 | `scripts/probe/` + `experiments/rig-calibration/lafei_8/` | 每个开放控制器有 ±探针数值证据 + 截图复核；范围/符号/速率来自实测 |
| M1c 指导书 | `scripts/build-guides.mts` → `docs/motion-guides/{common,lafei_8}.md` | 可重复构建；源定义改动重建后三产物（md/校验配置/LLM 片段）同步 |
| M2 协议与验证 | `src/motion/author/{protocol,context,validateV11,translate,sample,guard}.ts` + schema | Spec 9.1 七步验证顺序全部有测试；14 个最低错误码可达 |
| M3 在线通路 | `src/motion/author/client.ts`（LLM+Mock）+ Lab 接入 + `experiments/motion-guide/` | 候选导入→校验→编译→播放全链路本地跑通；超时/取消/迟到/重复用例通过；10 分钟交替浸泡 |
| M4 第二骨架 | `characters/spineboy.rig-profile.json` + 指导书 | 错角色/错档案拒绝；spineboy 缺失自由度准确关闭；同一意图两角色参数不同且有证据 |
| 收尾 | 12.1 测试矩阵 + 4 段录像 + `implementation-report.md` | 报告回答 Spec 13.2 全部问题，未完成项如实列出 |

## 4. 资产与隐私边界（沿用项目约定）

- `assets/Model/`、`public/assets-local/`、探针截图与录像（`experiments/media/`）不入库；
  证据 JSON（数值/结论/媒体路径）与角色元数据入库，先例：`characters/lafei_8.character.json`。
- 资产摘要 `assetDigest` 由 `scripts/compute-asset-digest.mjs` 对实际服务文件计算（SHA-256），记录进档案源。
