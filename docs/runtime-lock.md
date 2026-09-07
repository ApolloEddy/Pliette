# Runtime Lock · 依赖锁定记录

更新：2026-09-07。详细来源与哈希见 [vendor/spine-ts/3.6/PROVENANCE.md](../vendor/spine-ts/3.6/PROVENANCE.md)。

## 官方 Spine 运行时（vendored）

| 项 | 值 |
| --- | --- |
| 上游 | EsotericSoftware/spine-runtimes，标签 **3.6.53** |
| 文件 | spine-ts/build/{spine-core.js, spine-webgl.js, 对应 .d.ts, .js.map} |
| 获取 | cdn.jsdelivr.net（raw.githubusercontent 同标签核对）；2026-09-07 |
| 修改 | 仅加 ESM 包装（函数作用域包裹 + `export`），官方内容零修改 |
| 许可 | Spine Runtimes Software License（个人/内部使用；分发需有效 Spine 许可），原文随附 |

**为什么锁定 3.6**：首个角色 lafei_8 导出版本 3.6.52；导出数据与运行时必须匹配 major.minor（Spec 3.1）。不使用 4.x 运行时加载该资源。

**为什么必须 vendor**：3.6 时代官方未发布 npm 包（@esotericsoftware/* 自 4.0 起），且 3.8 才加入二进制读取——3.6 Web 运行时只能读 JSON。

**包装注意**：3.6 构建中核心类在 `spine` 顶层，WebGL 后端类在 `spine.webgl` 子命名空间（如 `spine.webgl.SceneRenderer`），`spine.TextureAtlas` 在顶层；`.d.ts` 为全局命名空间声明，经 `spine-esm-shim.d.ts` 桥接为模块类型（`import { spine36 as spine } from "spine-webgl"`）。

## 其他依赖

| 包 | 版本 | 用途 |
| --- | --- | --- |
| three | ^0.178.0 | 3D 场景、纸片 CanvasTexture |
| ajv | ^8.17.x | MotionDraft Schema 校验 |
| vite / vitest / typescript | ^6 / ^3 / ~5.8 | 构建 / 测试 / 类型 |
| @types/three、@types/node | 匹配 | 类型 |

## 第三方本地工具

| 工具 | 用途 | 获取 | 哈希（SHA-256） |
| --- | --- | --- | --- |
| SpineSkeletonDataConverter v3.8（wang606，C++ 预编译） | lafei_8.skel → 3.6.52 JSON 一次性转换 | [releases/v3.8](https://github.com/wang606/SpineSkeletonDataConverter/releases/tag/v3.8)（经 gh-proxy 下载） | `b2ca82e46f1f4ca463abf0ccfab32e3c01eb0dd89fc7289b6478f728ca8ed68a` |

许可 PolyForm Noncommercial 1.0.0：仅本地使用，不随项目分发；仓库不保存该二进制（`tools/spine-converter/` 已 gitignore）。转换产物 JSON 的哈希记录在 `characters/lafei_8.character.json`。

## 网络环境备注（开发机）

- github.com / api.github.com 直连不可用；`raw.githubusercontent.com` 与 `cdn.jsdelivr.net` 可用；`gh-proxy.com` 可代理 GitHub API 目录列表。
- npm registry 使用 npmmirror（项目 `.npmrc`）。
- 官方示例资产 3.6 导出已从仓库标签直接抓取并存入 `public/examples/`（含各示例 license.txt），不依赖运行时外链。

## 采样语义实测记录（3.6.53）

见 [asset-report.md](asset-report.md) 第 3 节：RotateTimeline 值为 setup 相对偏移（`bone.rotation += amount`）；CurveTimeline 每段 19 槽、标签 0/1/2；`setCurve(帧索引, 归一化控制点)`。相关断言在 tests/compiler.test.ts。
