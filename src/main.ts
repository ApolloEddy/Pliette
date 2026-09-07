/** Pliette Motion Lab 入口：资产导入 → 基线播放 → 探针/绑定 → Draft 校验/编译/预览 → 调度演示。 */
import "./lab/ui.js";
import { SPINE_RUNTIME_VERSION } from "./version.js";

document.getElementById("runtime-info")!.textContent = `spine-ts ${SPINE_RUNTIME_VERSION}（vendor 锁定）`;
