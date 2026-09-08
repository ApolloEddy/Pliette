# config/ · 本地私有配置（不入库）

此目录存放宿主/LLM 的本地私有配置。所有 `.local.json` 已被 .gitignore 忽略，密钥永不入库（Spec P4）。

## llm.local.json（等用户配置后启用 LlmSelectAdapter）

```json
{
  "provider": "openai 兼容 / 具体厂商待定",
  "endpoint": "https://...",
  "apiKey": "sk-...",
  "model": "..."
}
```

配置由宿主（Electron 主进程/本地服务）读取后经受控通道注入渲染器；纯浏览器 Lab 下暂以规则版 Select 运行（离线可用）。

## 待用户决策清单（2026-09-08）

1. LLM 接入方式：厂商/端点/密钥/模型（填入上面文件即可切换 rule-select → llm-select）
2. TTS 服务：是否已有 LiveTalker 服务？否则由我先选一个本地 TTS（如 Edge-TTS/VITS）接 SpeechAdapter
3. Electron 正式验收：当前环境 capturePage 有 UnknownVizError（v44 已知问题），窗口本身运行正常；透明置顶等按 Spec 需实机验证
