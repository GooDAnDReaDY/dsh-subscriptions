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

## 📦 安装指南

```bash
dsh plugin --profile web add @goodandready/dsh-subscriptions
```

---

## 📄 开源协议

MIT © [GooDAnDReaDY](https://github.com/GooDAnDReaDY)
