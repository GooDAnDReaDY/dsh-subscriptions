# 📦 @goodandready/dsh-subscriptions

<div align="center">

<h3>Мост персональных подписок на ИИ, ротация пула аккаунтов и безопасный OAuth без утечки токенов для DeepSeek Harness</h3>

<p align="center">
  <a href="https://www.npmjs.com/package/@goodandready/dsh-subscriptions"><img src="https://img.shields.io/npm/v/@goodandready/dsh-subscriptions.svg?style=for-the-badge&color=6366f1&labelColor=1e1b4b" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-10b981.svg?style=for-the-badge&color=10b981&labelColor=064e3b" alt="license"></a>
  <a href="https://github.com/topics/dsh-plugin"><img src="https://img.shields.io/badge/DSH-Plugin-8b5cf6.svg?style=for-the-badge&labelColor=2e1065" alt="DSH Plugin"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node-20%2B-f59e0b.svg?style=for-the-badge&labelColor=451a03" alt="Node version"></a>
</p>

<p align="center">
  <a href="https://goodandready.app/"><img src="https://img.shields.io/badge/Все_проекты_автора-goodandready.app-ff4500.svg?style=for-the-badge&logo=rocket&logoColor=white&labelColor=1a1a2e" alt="Все проекты автора"></a>
</p>

<p align="center">
  <a href="README.md"><b>🇬🇧 English</b></a> •
  <a href="README.ru.md"><b>🇷🇺 Русский</b></a> •
  <a href="README.zh.md"><b>🇨🇳 中文说明</b></a>
</p>

</div>

---

## ⚡ Обзор

**`dsh-subscriptions`** подключает ваши платные персональные подписки на нейросети напрямую в **DeepSeek Harness** в качестве полноценных LLM-провайдеров.

Вместо поминутной оплаты дорогих API-ключей для повседневных задач агента, плагин позволяет авторизовать ваши существующие веб-подписки через безопасный протокол OAuth PKCE. Поддерживаются **пулы из нескольких аккаунтов** с автоматической ротацией при исчерпании лимитов, **упреждающее переключение квот** и **внутрипроцессный сервис Cordis (`ctx.subscriptions`)**, который питает соседние плагины (например, [`dsh-image-gen`](https://github.com/GooDAnDReaDY/dsh-image-gen) и [`dsh-grok-xsearch`](https://github.com/GooDAnDReaDY/dsh-grok-xsearch)) без утечки токенов в сеть.

```mermaid
graph LR
    subgraph DSHCore [Сессия диалога DeepSeek Harness]
        Agent[🤖 Выполнение задач агентом] --> Router{Маршрутизатор провайдеров}
    end

    subgraph SubscriptionsCore [Ядро dsh-subscriptions]
        Router --> Pool{Пул аккаунтов вендора}
        Pool -->|Аккаунт 1| Acc1[👤 Основной аккаунт: Активен]
        Pool -->|Аккаунт 2| Acc2[👤 Второй аккаунт: Ожидание]
        Pool -->|Аккаунт 3| Acc3[👤 Запасной аккаунт: Cooldown]
        Acc1 -->|HTTP 429 / Превышение квоты| Rotate[Умный ротатор квот и задержек]
        Rotate -->|Перенаправление трафика| Acc2
    end

    subgraph VendorBridges [4 Адаптера вендоров]
        Acc1 --> B1[Бэкенд ChatGPT / Codex]
        Acc1 --> B2[Протокол Claude Pro / Max]
        Acc1 --> B3[Подписки xAI / Grok]
        Acc1 --> B4[Google Cloud Code Assist / Antigravity]
    end

    subgraph EcosystemBridge [Сервис Cordis: ctx.subscriptions]
        Pool --> ImgGen[dsh-image-gen: Бесплатная генерация картинок]
        Pool --> XSearch[dsh-grok-xsearch: Поиск в X Twitter]
    end

    style DSHCore fill:#1e1e2e,stroke:#89b4fa,stroke-width:2px,color:#cdd6f4
    style SubscriptionsCore fill:#181825,stroke:#cba6f7,stroke-width:2px,color:#cdd6f4
    style VendorBridges fill:#11111b,stroke:#a6e3a1,stroke-width:2px,color:#cdd6f4
    style EcosystemBridge fill:#181825,stroke:#f38ba8,stroke-width:2px,color:#cdd6f4
```

---

## ✨ Ключевые возможности

### 1. 🌐 4 Поддерживаемых встроенных вендора подписок

| Ключ вендора | Тариф подписки | Протокол и возможности |
|---|---|---|
| `codex` | ChatGPT Plus / Pro | Стриминг Codex, вызов инструментов и генерация картинок (`/backend-api/codex/...`) |
| `claude` | Claude Pro / Max | Нативный протокол Claude Messages, трекинг расхода (`/v1/messages`, `/api/oauth/...`) |
| `grok` | xAI / X Premium | Ответы с рассуждениями, проверка баланса и поиск в соцсети |
| `antigravity` | Google Cloud Code Assist | Движок Antigravity (`/v1/loadCodeAssist`, `/v1/streamGenerateContent`) |

*Также поддерживается регистрация кастомных вендоров через фабрику профилей `createVendorFromProfile`.*

---

### 2. 🔄 Ротация аккаунтов и защита от лимитов (`rotate.js`, `ratelimit.js`)
* **Пулы из нескольких аккаунтов**: привязка нескольких аккаунтов на вендора (`CODEX_OAUTH_1`, `CODEX_OAUTH_2`...).
* **Автоматическое переключение при 429**: при превышении лимита запросов трафик мгновенно переключается на следующий свободный аккаунт.
* **Упреждающее переключение квот (`switchAtRemaining`)**: смена аккаунта до падения в ошибку, если окно сброса близко.
* **Динамический расчёт Cooldown**: парсинг заголовков `Retry-After`, `x-ratelimit-reset`, дат ISO и миллисекундных меток с автоматическим возвратом остывших аккаунтов в строй.

---

### 3. 🔒 Безопасность и авторизация на headless-серверах
* **Нулевая утечка токенов**: токен OAuth **никогда** не отдаётся в браузер или через публичный HTTP API. В интерфейсе видны только статус, имя и остаток квоты.
* **Хранилище хоста**: токены шифруются в `$DSH_HOME/.credentials.yaml`.
* **Вход без браузера (SSH / Remote)**: если сервер запущен удалённо, авторизацию можно завершить, просто вставив итоговый redirect URL или authorization code в карточку аккаунта.
* **Фоновое продление токенов**: плагин автоматически обновляет токены до истечения их срока действия.

---

### 4. 🧩 Внутрипроцессный сервис Cordis (`ctx.subscriptions`)
Другие плагины могут использовать подключенные подписки напрямую в памяти:
```javascript
// Пример вызова из dsh-image-gen:
const res = await ctx.subscriptions.request('codex', '/backend-api/codex/images/generations', {
  method: 'POST',
  body: JSON.stringify({ prompt: 'Cyberpunk landscape', size: '1024x1024' }),
})
```
* **Нулевой оверхед**: прямое общение без лишних HTTP-запросов.
* **Белый список путей (`ALLOWLIST`)**: строгий контроль вызываемых эндпоинтов для защиты от SSRF.

---

## 📦 Быстрая установка

```bash
dsh plugin --profile web add @goodandready/dsh-subscriptions
```

---

## ⚙️ Пример конфигурации (`settings.yaml`)

```yaml
dsh-subscriptions:
  switchAtRemaining: 1
  cooldownMs: 60000
  accounts:
    codex:
      - ref: CODEX_OAUTH_1
        label: "Рабочий Pro-аккаунт"
      - ref: CODEX_OAUTH_2
        label: "Личный Plus-аккаунт"
    claude:
      - ref: CLAUDE_OAUTH_1
        label: "Claude Max"
    grok:
      - ref: GROK_OAUTH_1
        label: "X Premium"
```

---

## 📄 Лицензия

MIT © [GooDAnDReaDY](https://github.com/GooDAnDReaDY)
