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

### 5. 🔐 Вход без браузера: loopback и device-код (`v0.4.9`)
* **Автоматический loopback-callback (`autoLoopback`, включён по умолчанию)**: если redirect_uri вендора — loopback-адрес (Codex `:1455`, Grok `:56121`), плагин сам поднимает временный локальный HTTP-сервер и ловит callback без ручной вставки ссылки. Ручная вставка остаётся как запасной путь.
* **Вход по коду устройства (Codex)**: на полностью headless-машинах нажмите **Device login** в карточке аккаунта Codex: плагин запросит короткий код на `auth.openai.com`, вы открываете `https://auth.openai.com/codex/device` с любого устройства, вводите код — плагин сам завершает стандартный PKCE-обмен.
* **Классические варианты на месте**: redirect на origin веб-интерфейса (`useWebCallback`) и ручная вставка адреса/кода доступны как раньше.

### 6. 🌍 Индивидуальный HTTP/SOCKS-прокси на аккаунт (`v0.4.9`)
* **Прокси на слот (`proxyUrl`)**: каждый аккаунт принимает свой адрес `http://`, `https://`, `socks5://[user:pass@]host:port`. Через него идут все запросы аккаунта — обновление токенов, проверки вендора, запросы моделей. Пусто = прямое соединение.
* **Проверка в один клик**: кнопка **Check proxy** в карточке аккаунта делает реальный запрос к базовому URL вендора через прокси и показывает задержку или причину отказа.
* **Тайминги в истории**: каждая запись истории запросов теперь содержит длительность (`ms`) — удобно сравнивать прямое соединение и прокси.

### 7. 🕶️ Режим приватности и диагностический отчёт (`v0.4.9`)
* **Маскирование (`privacyMask`)**: один тумблер в карточке настроек скрывает персональные данные во всём интерфейсе: email отображается как `j***n@example.com` (списки аккаунтов, статусы, результаты проверок). Маскирование выполняется на сервере — личные данные не утекут и через ответы API; сами данные аккаунтов при этом не перезаписываются. Задумано для демонстраций экрана и стримов.
* **Анонимизированный диагностический отчёт**: блок **Generate diagnostics report**: один клик — отчёт (версии плагина/рантайма, ОС, счётчики здоровья по вендорам, агрегаты HTTP-статусов, последние ошибки ≥400 с таймингами, не-секретные настройки) скачан и скопирован в буфер. Токены, email, имена учётных записей и адреса прокси исключены (покрыто тестами).
* **Готово для issue**: рядом ссылка на трекер задач — баг-репорт это «сгенерировать → вставить → отправить».

### 8. 🔌 HTTP API (добавлено в `v0.4.9`)
| Маршрут | Метод | Назначение |
|---|---|---|
| `/dsh-subscriptions/diagnostics` | GET | Анонимизированный диагностический отчёт (без секретов, токенов и адресов прокси) |
| `/dsh-subscriptions/proxy-check` | POST | Проверка задержки прокси слота через базовый URL вендора |
| `/dsh-subscriptions/oauth/device/start` | POST | Начать вход Codex по коду устройства (возвращает код и адрес подтверждения) |
| `/dsh-subscriptions/oauth/device/poll` | POST | Опрос статуса авторизации по коду устройства |

---

### 9. 🦛 Локальный шлюз Ollama и бесшовный фолбэк (`v0.4.17`)
* **Нативный провайдер (`ollama`)**: если локальный Ollama доступен по `ollamaBaseUrl` (по умолчанию `http://127.0.0.1:11434`), он появляется в нативном селекторе моделей DSH с моделями из `/api/tags`. Ключ не нужен.
* **Бесшовный фолбэк (`ollamaFallback`, включён по умолчанию)**: когда все аккаунты провайдера исчерпаны (или недоступны) и ещё ничего не выведено, чат продолжается на локальной модели (`ollamaFallbackModel`, либо первая из `/api/tags`). Фолбэк пишется в журнал и в историю запросов как `kind: fallback`.
* **Бесплатный ($0) аварийный путь**: работает без интернета и без квот — удобно для офлайн-демо.

### 10. ⚡ Effort, Verbosity и Fast Mode (`v0.4.17`)
* **Уровень рассуждений (Effort)**: модели Codex объявляют поддерживаемые уровни из живого каталога; нативный селектор валидирует выбор, и выбранный уровень передаётся как `reasoning.effort` в протокол `/responses`. Grok передаёт effort со своей каталог-осознанной фильтрацией.
* **Детализация (`codexVerbosity`)**: `low` / `medium` / `high` передаётся как `text.verbosity` для reasoning-моделей Codex. Пусто = дефолт протокола.
* **Fast Mode (`codexFastMode`)**: c каждым Codex-запросом передаётся `service_tier: priority` (платный скоростной тир 1.5x). В чипе активной подписки при включённом режиме отображается `⚡`.

### 11. 🚦 Кулдауны по семействам и фильтрация моделей (`v0.4.17`)
* **Reasoning vs Standard**: 429 на reasoning-модели (claude `*thinking*`, grok `*reasoning*`, все codex-модели) охлаждает только семейство reasoning этого аккаунта — standard-модели того же аккаунта продолжают работать. Legacy-кулдауны (от старых версий) по-прежнему блокируют весь аккаунт до истечения.
* **Скрыть устаревшие модели (`hideDeprecatedModels`)**: убирает из нативного селектора id с `test`/`preview`/`dev`/`alpha`/`beta`/`legacy` (действует и на живые каталоги, и на статичный фолбэк).

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
  autoLoopback: true        # v0.4.9: автоматически ловить loopback-callback
  privacyMask: false        # v0.4.9: маскировать email и учётные записи в UI
  ollamaBaseUrl: http://127.0.0.1:11434  # v0.4.17: локальный шлюз Ollama
  ollamaFallback: true      # v0.4.17: бесшовный фолбэк при исчерпании всех аккаунтов
  ollamaFallbackModel: ''   # v0.4.17: например qwen2.5-coder; пусто = первая модель из /api/tags
  hideDeprecatedModels: false # v0.4.17: фильтровать test/preview/beta/legacy id моделей
  codexVerbosity: ''        # v0.4.17: low | medium | high (text.verbosity)
  codexFastMode: false      # v0.4.17: service_tier priority (скоростной тир 1.5x)
  # Поля слота (v0.4.9): expiresAt (ms), proxyUrl (http/https/socks5://)
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
