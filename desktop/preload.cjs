/**
 * Pliette preload：唯一允许进入渲染器的桥。
 * 只暴露只读宿主信息；不暴露任何文件系统 / shell / 远程能力。
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pliette", {
  hostInfo: () => ipcRenderer.invoke("pliette:hostInfo"),
});
