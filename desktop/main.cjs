/**
 * Pliette Electron 宿主（Spec 13.1 desktop/ · P4 桌面常驻）。
 * 安全基线（Spec P4 / Electron Security）：
 *  - nodeIntegration 关闭、contextIsolation 开启、sandbox 开启
 *  - 渲染器与系统能力之间只经过 preload 暴露的有限、白名单接口
 *  - LLM 密钥保留在宿主侧（后续经受控 IPC 注入渲染器，不写入前端资源）
 */
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");

const isDev = process.argv.includes("--dev") || !!process.env.PLIETTE_DEV;

// 截图验证模式在部分 GPU 环境会 UnknownVizError，该路径下用软件渲染（仅验证用途）
if (process.argv.some((a) => a.startsWith("--screenshot"))) {
  app.disableHardwareAcceleration();
}

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    backgroundColor: "#0b0d12",
    title: "Pliette 纸栖",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  if (isDev) {
    win.loadURL("http://localhost:5174/?asset=lafei_8&auto=1");
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"), { hash: "/" });
  }
  // 防止页面里 window.open 逃逸
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  // 开发辅助：--screenshot=path 在 14s 后截取页面并退出（验证桌面宿主渲染闭环）
  const shotArg = process.argv.find((a) => a.startsWith("--screenshot"));
  if (shotArg) {
    const target = shotArg.split("=").slice(1).join("=");
    setTimeout(async () => {
      try {
        const image = await win.webContents.capturePage();
        require("node:fs").writeFileSync(target, image.toPNG());
        console.log("[pliette] screenshot saved:", target);
      } catch (e) {
        console.error("[pliette] capture failed:", e);
      }
      app.quit();
    }, 14000);
  }
}

// 受控 IPC 示例：只暴露只读宿主信息（后续 LLM 密钥经此通道按需注入，不落盘到前端）
ipcMain.handle("pliette:hostInfo", () => ({
  platform: process.platform,
  electron: process.versions.electron,
  llmConfigured: false,
}));

app.whenReady().then(() => {
  createWindow();
  console.log("[pliette] window created, dev =", isDev);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  app.quit();
});
