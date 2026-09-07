/** Pliette Motion Lab 入口：资产导入 → 基线播放 → 探针/绑定 → Draft 校验/编译/预览 → 调度演示。 */
import "./lab/ui.js";
import { SPINE_RUNTIME_VERSION } from "./version.js";

document.getElementById("runtime-info")!.textContent = `spine-ts ${SPINE_RUNTIME_VERSION}（vendor 锁定）`;

// 全局错误兜底：运行时异常显示在 Lab 日志面板，避免静默失败（健壮性要求）
window.addEventListener("error", (e) => {
  const el = document.getElementById("log");
  if (el) {
    const line = document.createElement("div");
    line.className = "bad";
    line.textContent = `[全局错误] ${e.message} @ ${e.filename?.split("/").pop() ?? "?"}:${e.lineno}`;
    el.appendChild(line);
    el.scrollTop = el.scrollHeight;
  }
});
window.addEventListener("unhandledrejection", (e) => {
  const el = document.getElementById("log");
  if (el) {
    const line = document.createElement("div");
    line.className = "bad";
    line.textContent = `[未处理的 Promise 拒绝] ${String((e.reason as Error)?.message ?? e.reason)}`;
    el.appendChild(line);
    el.scrollTop = el.scrollHeight;
  }
});
