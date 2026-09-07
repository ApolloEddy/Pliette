# Vendor：官方 spine-ts 3.6 运行时

- 上游仓库：`EsotericSoftware/spine-runtimes`，标签 **3.6.53**（与目标资产 lafei_8 的导出版本 3.6.52 同为 3.6 major.minor）
- 获取日期：2026-09-07
- 获取方式：`https://cdn.jsdelivr.net/gh/EsotericSoftware/spine-runtimes@3.6.53/spine-ts/build/<file>`（raw.githubusercontent 同标签核对）
- 许可：Spine Runtimes Software License（个人/内部使用；集成进可分发产品需要有效 Spine 许可）。全文见本目录 `LICENSE`。本目录仅本地使用，不随公开分发打包。

## 文件与哈希（SHA-256）

| 文件 | 来源 | SHA-256 |
| --- | --- | --- |
| `spine-core.js` | spine-ts/build/spine-core.js @3.6.53 | `8e93b04052f1960a81f66e79be881141fdb5e6b8e3b19cfba069da2056d36b42` |
| `spine-webgl.js` | spine-ts/build/spine-webgl.js @3.6.53 | `2883daee81ae60b25f6205b83feb82b76812bf63cfdf0886f04f390b12891794` |
| `spine-core.d.ts` | spine-ts/build/spine-core.d.ts @3.6.53 | `e34f9a7d3578ffb720db58f5b5225f3a62e0623e6fefda83416a43c2e826dd37` |
| `spine-webgl.d.ts` | spine-ts/build/spine-webgl.d.ts @3.6.53 | `c973082d515b5b3c4469656cd4c4774ed174e8d89ba29bb3705ee633db7e1292` |

以上为未修改的官方构建产物。

## ESM 包装

`spine-core-esm.js` 与 `spine-webgl-esm.js` 是本仓库生成的薄包装：把官方 IIFE 放入函数作用域并导出 `spine` 命名空间，官方内容未被修改。

- `spine-webgl-esm.js` 以核心命名空间作为 IIFE 实参注入（官方文件内多处 `var spine;` 在函数作用域内提升为同一绑定，不会覆盖核心对象）。
- 3.6 构建的运行时类分布：核心类在 `spine` 顶层；WebGL 后端类在 `spine.webgl` 子命名空间（如 `spine.webgl.SceneRenderer`、`spine.webgl.GLTexture`）；`spine.TextureAtlas` 在顶层。`.d.ts` 为扁平声明，渲染层代码对 `spine.webgl.*` 使用局部类型 any 收敛。
- 模块图：`spine-webgl-esm.js` 导入 `spine-core-esm.js`，两者共享同一命名空间对象；`import { spine } from "spine"` 与 `from "spine-webgl"` 得到同一实例（别名配置见 `vite.config.ts`）。

## 官方示例资产

`public/examples/` 下的 spineboy / goblins / stretchyman 取自同一标签的 `examples/<角色>/export/`（raw.githubusercontent.com/EsotericSoftware/spine-runtimes/3.6.53/...），导出 JSON 内嵌版本为 **3.6.32**（major.minor 与运行时 3.6 匹配）。各示例的 `license.txt` 已随附。这些资产用于验证播放器管线，与"用户角色可用"分开报告（Spec 4.1）。
