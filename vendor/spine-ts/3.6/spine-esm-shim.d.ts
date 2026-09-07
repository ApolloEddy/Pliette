/// <reference path="./spine-core.d.ts" />
/// <reference path="./spine-webgl.d.ts" />

/**
 * 官方 3.6 d.ts 以全局命名空间 `spine` 声明（`declare module spine {}`，无引号）。
 * 运行时值来自 vendor 的 ESM 包装（spine-core-esm.js / spine-webgl-esm.js，导出名为 spine）。
 * 本 shim 把全局命名空间的完整类型桥接到 ESM 模块名上。
 */

declare module "spine-webgl" {
  export import spine36 = spine;
}

declare module "spine" {
  export import spine36 = spine;
}
