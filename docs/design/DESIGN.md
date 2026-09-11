# DESIGN.md — @goodandready/dsh-subscriptions

## Product / Purpose
- Назначение: подключить оплаченные персональные AI-подписки (ChatGPT Codex,
  Claude, Grok, Antigravity, Kimi, GLM, Cursor, Kiro, Copilot, Qwen, ERNIE,
  Spark, JetBrains, Perplexity, Replit, Cody) к DeepSeek Harness как LLM-
  провайдеров по OAuth/PKCE, device flow или токену; мультиаккаунтная ротация
  с превентивным переключением квот.
- Аудитория: пользователи DSH с личными подписками вендоров.
- Статус: опубликован в npm (`@goodandready/dsh-subscriptions`), активная
  разработка (0.5.x).

## User Surfaces
- Web/UI: одна карточка в «Настройки → Плагины → Настройки плагинов»
  (слот `settings.plugin.item`, ключ = пространство настроек
  `dsh-subscriptions`). Боковой раздел `settings.section` полностью удалён
  (issue #282) — плагин живёт строго внутри вкладки «Настройки плагинов» и не
  засоряет боковое меню ядра.
- Карточка: свёрнута по умолчанию; заголовок-кнопка с `aria-expanded`,
  ядровый шеврон `IconChevronDownOutline14` с SVG-fallback; внутри — карточки
  аккаунтов по вендорам, статусы, квоты, кнопки OAuth-входа, диагностика.
- OAuth-потоки: web-PKCE с ручным вставлением redirect URL; автоматический
  loopback-колбэк (`autoLoopback`) для вендоров с loopback redirect;
  Device Flow (Codex, Copilot, Kimi) для безголовых машин.
- HTTP API (маршруты `kind: exact` префикс `/dsh-subscriptions/`):
  `GET /diagnostics` (анонимизированный отчёт без секретов), `POST
  /proxy-check`, `POST /oauth/device/start`, `POST /oauth/device/poll`.
- CLI: отсутствует (установка через `dsh plugin add`).
- Документация: README.md / README.ru.md / README.zh.md, `docs/architecture/`,
  `docs/plans/`, настоящий контракт.
- Инструменты модели: нет (v1 сознательно без tools).

## Visual Direction
- Атмосфера: нативный вид ядра DSH; карточка повторяет геометрию карточек
  ядра («Консоль», «Цикл агента»): скругление 12px, шапка 14x16, заголовок
  15px/600, пояснение 13px.
- Цвета: только переменные темы `--dsw-alias-*` (state/success/warning/error,
  label-primary/secondary/tertiary, bg-layer-1/2/3, border-l2). Полупрозрачные
  подложки и рамки статусов строятся из переменных состояния через
  `color-mix(in srgb, var(--dsw-alias-state-*) N%, transparent)` (issue #268,
  Changed in 0.6.x).
- Осознанные исключения (2026-09-09, issue #268): (1) брендовые бейджи
  вендоров `.dsub-brand*` используют фиксированные фирменные цвета вендоров
  (green=Codex, amber=Claude, purple=Grok, blue=Antigravity, gray=Ollama,
  pink=Kimi, teal=GLM, indigo=плановые бейджи) — фирменный цвет не адаптируется
  под тему по определению; (2) тени и modal-scrim остаются чёрными rgba —
  общепринятая практика для теней в обеих темах. Условие пересмотра: появление
  вендорных акцентных переменных в теме ядра.
- Не копировать: чужие бренды, иконки вендоров, сторонние UI-киты.

## Foundations
- Классы: только с префиксом `dsub-`; стили одним тегом `<style>`,
  помеченным `data-plugin` / `data-plugin-css` и `data-dsh-plugin`
  (стабильный идентификатор `dsh-subscriptions`) для защиты от очистки
  соседними плагинами.
- Типографика: системная ядра; моноширинный блок диагностики 11px.
- Состояния формы: статус снимка настроек важнее значения —
  `loading` (ответа хоста нет), `unavailable` (пространство неизвестно,
  форма не сохраняема), `ready`  (writable). При `unavailable` карточка
  показывает состояние, а не рабочую пустую форму.
- Accessibility: раскрытие карточки — кнопка с `aria-expanded`; клавиатурный
  ввод эквивалентен мыши; маска приватности `privacyMask` скрывает email
  во всём UI (для стримов и демонстраций).

## Components And States
- Карточка вендора: список аккаунтов, статус (активен/cool-down/rate-limit),
  квота/окна использования, действия (вход, обновление, удаление, прокси).
- Вход: PKCE-URL/код, loopback-автоприём, Device Flow (код + ссылка + поллинг).
- Ошибки: человекочитаемые; `vendor 401` не маскируется под «неверный API
  ключ»; 429 → RATE_LIMIT с расчётом окна (Retry-After, x-ratelimit-reset).
- Loading / empty / success: скелет до `ready`; пустой список аккаунтов
  с призывом к OAuth-входу; успешное сохранение — без разрушения состояния
  формы; неудачи записи полей собираются и показываются поимённо.

## Components And States
- Статус аккаунта в карточке (2026-09-10, #303): connected / cooling down (с указанием охлаждённых семейств моделей, если охлаждение family-scoped) / quarantined (с причиной: VERIFY отображается локализованной подписью, прочие причины — каноническим английским кодом) / not connected / usage thresholds.
- Доступность (2026-09-10, #303): статус-тег аккаунта — live-region (role=status, aria-live=polite), модалка аккаунтов объявляет role=dialog + aria-modal; Escape и клик вне закрывают.

## User Flows
- Первый вход вендора: раскрыть карточку → выбрать вендора → OAuth/device
  flow → аккаунт появляется в пуле → модели вендора в нативном пикере DSH.
- Исчерпание квоты: 429/порог → авто-ротация на следующий аккаунт или
  fallback на локальный Ollama (`ollamaFallback`) → событие в истории.
- Диагностика: «Сгенерировать отчёт» → анонимизированный отчёт в буфер
  обмена → вставить в issue трекер.

## Do / Don't
- Do: новые настройки — только через `Config` + пространство
  `dsh-subscriptions`; пользовательские строки — только locale-ключи
  (исходный язык английский, `ctx.locale.register` один раз);
  тесты на каждый новый протокол/парсер — без сети и без харнесса.
- Don't: не хранить ключи в настройках (только имена credential-ссылок);
  не заводить отдельный боковой раздел без явной просьбы владельца; не
  дублировать русский перевод в плагине (его даёт translation-плагин);
  не перехватывать чужие маршруты (только свои `kind: exact`).

## Locked Design Decisions
- 2026-09-10 — группировка настроек карточки по пользовательским задачам и focus-менеджмент диалога согласованы владельцем, но вынесены в отдельную итерацию (#303): перестройка ~200 строк JSX без риска для стабильности UI требует отдельного прохода с визуальной приёмкой. Условие пересмотра — следующая UI-итерация.
- 2026-08-20 — плагин без tools модели, только провайдеры + сервис
  `ctx.subscriptions` для соседних плагинов; пересмотр — отдельное решение
  владельца.
- 2026-08-20 — ключи вендоров только через сервис учётных данных DSH;
  clientSecret выведен из схемы настроек (issue #252).
- 2026-09-04 — карточка настроек в `settings.plugin.item` (#244).
- 2026-09-10 — удаление fallback `settings.section` (issue #282): плагин регистрирует
  только карточку `settings.plugin.item`; собственный пункт верхнего уровня в плоском
  списке ядра ликвидирован.
- 2026-09-10 — аудит 30 полей схемы настроек (issue #282): все настраиваемые пользователем
  поля выведены в UI карточки; низкоуровневые override-поля документированы как YAML/config-only.
- 2026-09-09 — локальный контракт (#273; Changed in 0.6.1): исходный язык плагина — только английский; русский во время работы предоставляет отдельный плагин русификации. Встроенный `ru`-словарь реестра и его регистрация удалены (были дублем того, что даёт плагин русификации); захардкоженные русские строки в ошибках маршрутов и логах переведены на английский. Осознанные исключения (структурный per-language контент, недоступный плагину русификации): INSTRUCTIONS.stepsRu в ui/locale-data.js, RELATIVE_UNITS.ru в relative-time.js, пары {ru,en} в usage.js, isRu-условные строки в ui/bits.js и ui/subs-section.js. Условие пересмотра: если плагин русификации научится переводить нерегистровый контент.
- 2026-09-08 — приватность по умолчанию: токены никогда не покидают сервер
  (проксирование через `ctx.subscriptions.request`), маскирование —
  серверное, до отдачи в UI.


## Settings Schema Audit & Coverage (#282)

Полная инспекция всех 30 полей схемы (`lib/config-schema.js`):

| # | Поле схемы | Тип | Где настраивается | Назначение / Обоснование |
|---|------------|-----|-------------------|--------------------------|
| 1 | `slots` | array | UI (Карточки аккаунтов) | Список настроенных слотов провайдеров и учётных записей. |
| 2 | `useWebCallback` | boolean | UI (Чекбокс) | Использовать текущий Web UI origin как redirect_uri для OAuth. |
| 3 | `privacyMask` | boolean | UI (Чекбокс) | Маскирование email и идентификаторов в UI для демонстраций. |
| 4 | `autoLoopback` | boolean | UI (Чекбокс) | Автоматический перехват токена на локальном loopback-порту. |
| 5 | `hideDeprecatedModels` | boolean | UI (Чекбокс) | Скрытие устаревших моделей вендоров в интерфейсе. |
| 6 | `composerQuota` | string (enum) | UI (Выпадающий список) | Отображение индикатора квоты в composer (`off`, `percent`, `bar`, `forecast`). |
| 7 | `expiryNotifyDays` | number | UI (Числовое поле) | Порог предупреждения об истечении подписки в днях (0 — выкл). |
| 8 | `codexFastMode` | boolean | UI (Чекбокс) | Ускоренный режим 1.5x для моделей OpenAI Codex. |
| 9 | `codexVerbosity` | string (enum) | UI (Выпадающий список) | Детализация стриминга Codex (`default`, `low`, `medium`, `high`). |
| 10 | `ollamaFallback` | boolean | UI (Чекбокс) | Включение резервного переключения на локальный Ollama при исчерпании квот. |
| 11 | `ollamaBaseUrl` | string | UI (Текстовое поле) | URL локального сервера Ollama (`http://localhost:11434`). |
| 12 | `ollamaFallbackModel` | string | UI (Текстовое поле) | Имя fallback-модели в Ollama (`llama3:latest`). |
| 13 | `cooldownMs` | number | UI (Числовое поле в деталях) | Время паузы аккаунта при сбоях/429 (в минутах в UI). |
| 14 | `probeIntervalMin` | number | UI (Числовое поле в деталях) | Интервал фоновой проверки здоровья и баланса квот (в минутах). |
| 15 | `notifyLimits` | boolean | UI (Чекбокс в деталях) | Уведомления при достижении лимитов использования. |
| 16 | `switchAtRemaining` | number | YAML/config-only | Низкоуровневый порог переключения аккаунтов по квоте (дефолт: 0.05). Регулируется инфраструктурно. |
| 17 | `refreshAheadMs` | number | YAML/config-only | Упреждающее время обновления токенов до их истечения (дефолт: 5 мин). Внутренний тайминг OAuth. |
| 18 | `refreshRetryMs` | number | YAML/config-only | Пауза перед повторной попыткой обновления токена при сбое (дефолт: 30 с). Внутренний тайминг. |
| 19 | `codexClientId` | string | YAML/config-only | Переопределение OAuth Client ID для Codex. Требуется только при собственной регистрации приложения. |
| 20 | `codexRedirectUri` | string | YAML/config-only | Переопределение redirect_uri для Codex OAuth. |
| 21 | `codexBaseUrl` | string | YAML/config-only | Переопределение endpoint API Codex (для enterprise/mock proxy). |
| 22 | `claudeClientId` | string | YAML/config-only | Переопределение OAuth Client ID для Claude. |
| 23 | `claudeRedirectUri` | string | YAML/config-only | Переопределение redirect_uri для Claude OAuth. |
| 24 | `grokClientId` | string | YAML/config-only | Переопределение OAuth Client ID для Grok. |
| 25 | `grokRedirectUri` | string | YAML/config-only | Переопределение redirect_uri для Grok OAuth. |
| 26 | `grokBaseUrl` | string | YAML/config-only | Переопределение базового URL для Grok API. |
| 27 | `grokClientVersion`| string | YAML/config-only | Версия клиента для телеметрии Grok. Регулируется версионированием плагина. |
| 28 | `antigravityClientId` | string | YAML/config-only | Переопределение OAuth Client ID для Antigravity. |
| 29 | `antigravityRedirectUri` | string | YAML/config-only | Переопределение redirect_uri для Antigravity OAuth. |
| 30 | `customVendors` | array | YAML/config-only | Декларация нестандартных vendor-адаптеров через конфигурационный файл DSH. |
