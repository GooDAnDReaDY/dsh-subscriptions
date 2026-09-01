# 📦 @goodandready/dsh-subscriptions

<div align="center">

<h3>DeepSeek Harness 个人 AI 订阅桥接、多账号池轮换与零泄漏 OAuth 插件</h3>

<p align="center">
  <a href="https://www.npmjs.com/package/@goodandready/dsh-subscriptions"><img src="https://img.shields.io/npm/v/@goodandready/dsh-subscriptions.svg?style=for-the-badge&color=6366f1&labelColor=1e1b4b" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-10b981.svg?style=for-the-badge&color=10b981&labelColor=064e3b" alt="license"></a>
  <a href="https://github.com/topics/dsh-plugin"><img src="https://img.shields.io/badge/DSH-Plugin-8b5cf6.svg?style=for-the-badge&labelColor=2e1065" alt="DSH Plugin"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node-20%2B-f59e0b.svg?style=for-the-badge&labelColor=451a03" alt="Node version"></a>
</p>

<p align="center">
  <a href="https://goodandready.app/"><img src="https://img.shields.io/badge/作者全部项目-goodandready.app-ff4500.svg?style=for-the-badge&logo=rocket&logoColor=white&labelColor=1a1a2e" alt="作者全部项目"></a>
</p>

<p align="center">
  <a href="README.md"><b>🇬🇧 English</b></a> •
  <a href="README.ru.md"><b>🇷🇺 Русский</b></a> •
  <a href="README.zh.md"><b>🇨🇳 中文说明</b></a>
</p>

</div>

---

## ⚡ 插件概览

**`dsh-subscriptions`** 将您现有的付费个人 AI 订阅无缝接入 **DeepSeek Harness**，作为第一类模型服务商。

无需为日常智能体任务支付昂贵的 API 按量计费。本插件支持标准 OAuth PKCE 鉴权、**单服务商多账号池动态轮换**（遭遇 429 限流时自动秒切可用账号）、**前置配额平滑切换**，并通过**进程内 Cordis 服务 (`ctx.subscriptions`)** 赋能 [`dsh-image-gen`](https://github.com/GooDAnDReaDY/dsh-image-gen) 与 [`dsh-grok-xsearch`](https://github.com/GooDAnDReaDY/dsh-grok-xsearch) 等插件，实现 Token 零网络泄漏。

```mermaid
graph LR
    subgraph DSHCore [DeepSeek Harness 对话流]
        Agent[🤖 智能体任务执行] --> Router{服务商路由器}
    end

    subgraph SubscriptionsCore [dsh-subscriptions 调度核心]
        Router --> Pool{多账号负载池}
        Pool -->|账号 1| Acc1[👤 主账号: 活跃中]
        Pool -->|账号 2| Acc2[👤 副账号: 待命中]
        Pool -->|账号 3| Acc3[👤 备用账号: 冷却中]
        Acc1 -->|HTTP 429 / 配额耗尽| Rotate[智能配额与冷却轮换器]
        Rotate -->|流量平滑切换| Acc2
    end

    subgraph VendorBridges [4 大服务商桥接适配]
        Acc1 --> B1[ChatGPT / Codex 后端]
        Acc1 --> B2[Claude Pro / Max 协议]
        Acc1 --> B3[xAI / Grok 订阅]
        Acc1 --> B4[Google Cloud Code Assist / Antigravity]
    end

    subgraph EcosystemBridge [Cordis 进程内共享: ctx.subscriptions]
        Pool --> ImgGen[dsh-image-gen: 订阅零成本生图]
        Pool --> XSearch[dsh-grok-xsearch: X 社交搜索]
    end

    style DSHCore fill:#1e1e2e,stroke:#89b4fa,stroke-width:2px,color:#cdd6f4
    style SubscriptionsCore fill:#181825,stroke:#cba6f7,stroke-width:2px,color:#cdd6f4
    style VendorBridges fill:#11111b,stroke:#a6e3a1,stroke-width:2px,color:#cdd6f4
    style EcosystemBridge fill:#181825,stroke:#f38ba8,stroke-width:2px,color:#cdd6f4
```

---

## ✨ 核心功能

### 支持的内置订阅供应商
| 供应商 | 订阅级别 | 协议 |
|---|---|---|
| `codex` | ChatGPT Plus / Pro | 流式响应、工具调用、图像生成 |
| `claude` | Claude Pro / Max | 原生 Messages 协议、用量跟踪 |
| `grok` | xAI / X Premium | 实时推理、计费检查 |
| `antigravity` | Google Cloud Code Assist | 流式生成 |

### 多账号轮换与限流保护
* 每个供应商可挂多个账号（如 `CODEX_OAUTH_1`、`CODEX_OAUTH_2`）。
* 遇到 429/配额耗尽自动切换到下一个健康账号；支持按剩余量提前切换和动态冷却恢复。

### 安全与无头登录
* OAuth 令牌绝不通过 HTTP API 返回，也不在 Web 界面渲染；仅存放于宿主加密凭据存储。
* **回环自动回调 (`autoLoopback`，`v0.4.9`)**：供应商重定向为回环地址（如 Codex `:1455`）时，插件自动启动临时本地服务器接收回调，无需手动粘贴链接。
* **设备码登录（Codex，`v0.4.9`）**：完全无浏览器的主机上，点击 **Device login**，在任意设备打开 `https://auth.openai.com/codex/device` 输入短码即可完成 PKCE 授权。

### 账号级代理（`v0.4.9`）
* 每个账号可配置独立代理（`http://`、`https://`、`socks5://`）；令牌刷新、供应商检查、模型请求均走该代理。
* 账号卡片内的 **Check proxy** 按钮一键检测代理延迟。

### 本地 Ollama 网关与无缝回退（`v0.4.17`）
* **原生 provider (`ollama`)**：本地 Ollama 可达时（`ollamaBaseUrl`，默认 `http://127.0.0.1:11434`），自动出现在 DSH 原生模型选择器中（模型来自 `/api/tags`），无需密钥。
* **无缝配额回退 (`ollamaFallback`，默认开启)**：某供应商的所有账号耗尽或不可达且尚未输出任何内容时，对话自动切换到本地模型（`ollamaFallbackModel` 或 `/api/tags` 第一个模型），并记录到请求历史（`kind: fallback`）。
* 免费（$0）应急通道：无网络、无配额也能用。

### Effort、Verbosity 与 Fast Mode（`v0.4.17`）
* **推理力度 (Effort)**：Codex 模型从实时目录上报支持的力度等级，原生选择器校验后以 `reasoning.effort` 传入 `/responses` 协议；Grok 按自身目录过滤转发。
* **详略程度 (`codexVerbosity`)**：`low`/`medium`/`high` 以 `text.verbosity` 传给 Codex 推理模型；留空为协议默认。
* **Fast Mode (`codexFastMode`)**：每次 Codex 请求携带 `service_tier: priority`（1.5x 速度计费档）；启用时活动订阅芯片显示 `⚡`。

### 按模型家族的冷却与模型过滤（`v0.4.17`）
* **Reasoning 与 Standard 分离**：推理模型（claude `*thinking*`、grok `*reasoning*`、全部 codex 模型）触发 429 时，只冷却该账号的 reasoning 家族——同账号的 standard 模型立即可用；旧版冷却仍按整账号生效。
* **隐藏过时模型 (`hideDeprecatedModels`)**：从原生选择器中过滤 `test`/`preview`/`dev`/`alpha`/`beta`/`legacy` 模型 id（同时作用于实时目录与静态回退）。

### 隐私模式与诊断报告（`v0.4.9`）
* **`privacyMask`**：一个开关即可在整个界面隐藏个人数据（邮箱显示为 `j***n@example.com`），服务端遮蔽，适合屏幕共享。
* **匿名诊断报告**：设置卡片内一键生成（插件/运行时版本、系统、各供应商健康状态、HTTP 状态聚合、最近错误与耗时、非敏感配置）并自动复制到剪贴板；令牌、邮箱、凭据名与代理地址严格排除。
* 同区块提供问题追踪器链接，便于提交 issue。

---

## 📦 安装指南

```bash
dsh plugin --profile web add @goodandready/dsh-subscriptions
```

---

## 📄 开源协议

MIT © [GooDAnDReaDY](https://github.com/GooDAnDReaDY)
