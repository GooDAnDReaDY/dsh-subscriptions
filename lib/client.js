window.__ModuleLoader__.load({
  id: '@goodandready/dsh-subscriptions',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    const React = require('react')
    const createPortal = (function () {
      try { return require('react-dom').createPortal } catch { return null }
    })()

    // Модульный переводчик: доступен всем подпискам компонентов и хелперам.
    let t = (key) => key
    const setT = (fn) => { t = fn }

    const CSS =
    '.dsub-card{list-style:none;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;transition:border-color .16s,background .16s}' +
    '.dsub-card:hover{border-color:var(--dsw-alias-label-dimmed)}' +
    '.dsub-cardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}' +
    '.dsub-header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}' +
    '.dsub-header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}' +
    '.dsub-headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}' +
    '.dsub-name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}' +
    '.dsub-description{color:var(--dsw-alias-label-secondary);font-size:13px}' +
    '.dsub-chev{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}' +
    '.dsub-chevOpen{transform:rotate(180deg)}' +
    '.dsub-body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:12px}' +
    '.dsub-block{margin-top:10px}' +
    '.dsub-row{display:flex;align-items:center;gap:8px;margin-top:8px}' +
    '.dsub-h{font-size:13.5px;font-weight:600;color:var(--dsw-alias-label-primary)}' +
    '.dsub-sub{font-size:12px;color:var(--dsw-alias-label-secondary)}' +
    '.dsub-dim{font-size:11.5px;color:var(--dsw-alias-label-tertiary)}' +
    '.dsub-mini{appearance:none;font:inherit;font-size:12px;cursor:pointer;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:3px 8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);transition:all .15s}' +
    '.dsub-mini:hover{background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-label-dimmed)}' +
    '.dsub-ok{font-size:12px;color:var(--dsw-alias-state-success-primary)}' +
    '.dsub-bad{font-size:12px;color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere;word-break:break-word;max-width:100%}' +
    '.dsub-hint{overflow-wrap:anywhere;word-break:break-word;max-width:100%}' +
    '.dsub-btn{appearance:none;font:inherit;cursor:pointer;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:5px 12px;font-size:12.5px;font-weight:500;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);transition:all .15s}' +
    '.dsub-btn:hover{background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-label-dimmed)}' +
    '.dsub-inp{height:30px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-radius:6px;padding:0 8px;font-size:12px;min-width:180px}' +
    '.dsub-inp:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}' +
    '.dsub-box{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:10px;margin-top:8px;background:var(--dsw-alias-bg-layer-2)}' +
    '.dsub-cooldown{display:inline-block;padding:2px 6px;border-radius:4px;background:var(--dsw-alias-state-warning-primary);color:#000;font-size:11px;font-weight:600}' +
    '.dsub-bar{position:relative;height:6px;border-radius:3px;background:var(--dsw-alias-bg-layer-1);overflow:hidden;flex:1;min-width:80px}' +
    '.dsub-barFill{height:100%;border-radius:3px;background:var(--dsw-alias-state-success-primary);transition:width .2s}' +
    '.dsub-barWarn .dsub-barFill{background:var(--dsw-alias-state-warning-primary)}' +
    '.dsub-barFull .dsub-barFill{background:var(--dsw-alias-state-error-primary)}' +
    '.dsub-barRow{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-secondary)}' +
    '.dsub-manual{display:flex;flex-direction:column;gap:6px;margin-top:4px;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l2)}' +
    '.dsub-verify{font-size:12px;color:var(--dsw-alias-state-warning-primary)}' +
    '.dsub-verify a{color:var(--dsw-alias-brand-primary)}' +
    '.dsub-pill{display:inline-flex;align-items:center;gap:7px;height:28px;padding:0 11px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:12px;font-weight:600;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.15),inset 0 1px 0 rgba(255,255,255,.06);transition:all .16s ease;user-select:none}' +
    '.dsub-pill:hover{background:var(--dsw-alias-bg-layer-3);border-color:var(--dsw-alias-label-tertiary);transform:translateY(-1px);box-shadow:0 3px 8px rgba(0,0,0,.25),inset 0 1px 0 rgba(255,255,255,.1)}' +
    '.dsub-pill:active{transform:translateY(0)}' +
    '.dsub-pillTag{padding:1px 5px;border-radius:4px;font-size:10.5px;font-weight:700;letter-spacing:.02em;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary)}' +
    '.dsub-led{width:7px;height:7px;border-radius:50%;flex:none;transition:all .2s ease}' +
    '.dsub-ledOk{background:var(--dsw-alias-state-success-primary,#10b981);box-shadow:0 0 6px rgba(16,185,129,.7)}' +
    '.dsub-ledWarn{background:var(--dsw-alias-state-warning-primary,#f59e0b);box-shadow:0 0 6px rgba(245,158,11,.7)}' +
    '.dsub-ledBad{background:var(--dsw-alias-state-error-primary,#ef4444);box-shadow:0 0 6px rgba(239,68,68,.7)}' +
    '.dsub-ledOff{background:var(--dsw-alias-label-tertiary,#6b7280)}' +
    '.dsub-modalWrap{position:fixed;inset:0;z-index:10020;display:grid;place-items:center;background:rgba(0,0,0,.65);backdrop-filter:blur(10px);animation:dsubFadeIn .16s ease-out}' +
    '.dsub-modal{width:min(520px,94vw);max-height:min(85vh,720px);overflow-y:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:16px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);box-shadow:0 24px 64px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.07);padding:20px;animation:dsubScaleIn .18s cubic-bezier(.16,1,.3,1)}' +
    '@keyframes dsubFadeIn{from{opacity:0}to{opacity:1}}' +
    '@keyframes dsubScaleIn{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}' +
    '.dsub-modalHead{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-bottom:14px;border-bottom:1px solid var(--dsw-alias-border-l2)}' +
    '.dsub-modalTitleWrap{display:flex;align-items:center;gap:10px}' +
    '.dsub-modalIcon{width:30px;height:30px;border-radius:8px;background:var(--dsw-alias-bg-layer-1);display:grid;place-items:center;color:var(--dsw-alias-brand-primary);font-size:14px}' +
    '.dsub-modalBadge{font-size:11px;font-weight:600;padding:2px 7px;border-radius:10px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary)}' +
    '.dsub-heroCard{margin-top:14px;padding:14px 16px;border-radius:12px;background:linear-gradient(135deg,var(--dsw-alias-bg-layer-2) 0%,var(--dsw-alias-bg-layer-3) 100%);border:1px solid var(--dsw-alias-border-l1);box-shadow:inset 0 1px 0 rgba(255,255,255,.05)}' +
    '.dsub-heroHead{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}' +
    '.dsub-heroTitle{font-size:14px;font-weight:700;display:flex;align-items:center;gap:6px}' +
    '.dsub-heroModel{font-size:11.5px;color:var(--dsw-alias-label-secondary);font-family:ui-monospace,monospace}' +
    '.dsub-heroBars{display:flex;flex-direction:column;gap:8px;margin-top:10px}' +
    '.dsub-barLabelRow{display:flex;justify-content:space-between;font-size:11.5px;color:var(--dsw-alias-label-secondary);margin-bottom:3px}' +
    '.dsub-barTrack{height:6px;border-radius:3px;background:var(--dsw-alias-bg-layer-1);overflow:hidden}' +
    '.dsub-barFillGrad{height:100%;border-radius:3px;transition:width .3s ease}' +
    '.dsub-poolTitle{margin-top:16px;margin-bottom:8px;font-size:11.5px;font-weight:700;color:var(--dsw-alias-label-secondary);text-transform:uppercase;letter-spacing:.05em}' +
    '.dsub-accountCard{display:flex;align-items:center;gap:12px;padding:10px 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-2);margin-top:6px;transition:border-color .15s,background .15s}' +
    '.dsub-accountCard:hover{background:var(--dsw-alias-bg-layer-3);border-color:var(--dsw-alias-label-tertiary)}' +
    '.dsub-brandBadge{width:32px;height:32px;border-radius:8px;display:grid;place-items:center;font-size:12px;font-weight:700;flex-shrink:0}' +
    '.dsub-brandCodex{background:rgba(16,185,129,.15);color:#10b981;border:1px solid rgba(16,185,129,.3)}' +
    '.dsub-brandClaude{background:rgba(245,158,11,.15);color:#f59e0b;border:1px solid rgba(245,158,11,.3)}' +
    '.dsub-brandGrok{background:rgba(168,85,247,.15);color:#c084fc;border:1px solid rgba(168,85,247,.3)}' +
    '.dsub-brandAgy{background:rgba(59,130,246,.15);color:#60a5fa;border:1px solid rgba(59,130,246,.3)}' +
    '.dsub-brandOllama{background:rgba(107,114,128,.15);color:#9ca3af;border:1px solid rgba(107,114,128,.3)}' +
    '.dsub-brandKimi{background:rgba(236,72,153,.15);color:#f472b6;border:1px solid rgba(236,72,153,.3)}' +
    '.dsub-brandGlm{background:rgba(20,184,166,.15);color:#2dd4bf;border:1px solid rgba(20,184,166,.3)}' +
    '.dsub-planBadge{display:inline-flex;align-items:center;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;background:rgba(99,102,241,.15);color:#818cf8;border:1px solid rgba(99,102,241,.3);margin-left:6px}' +
    
    '.dsub-accInfo{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}' +
    '.dsub-accNameRow{display:flex;align-items:center;justify-content:space-between;gap:8px}' +
    '.dsub-accName{font-size:13px;font-weight:600}' +
    '.dsub-accStatusTag{font-size:10.5px;font-weight:600;padding:1px 6px;border-radius:4px}' +
    '.dsub-statusOk{background:rgba(16,185,129,.15);color:#34d399}' +
    '.dsub-statusWarn{background:rgba(245,158,11,.15);color:#fbbf24}' +
    '.dsub-statusBad{background:rgba(239,68,68,.15);color:#f87171}' +
    '.dsub-statusOff{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-tertiary)}' +
    '.dsub-modalFoot{display:flex;align-items:center;justify-content:space-between;margin-top:16px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l2)}' +
    '.dsub-btnPrimary{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:8px;font-size:12px;font-weight:600;background:var(--dsw-alias-brand-primary,#3b82f6);color:#fff;border:0;cursor:pointer;transition:opacity .15s}' +
    '.dsub-btnPrimary:hover{opacity:.9}' +
    '.dsub-btnSec{display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:7px;font-size:11.5px;font-weight:500;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l2);cursor:pointer;text-decoration:none;transition:all .15s}' +
    '.dsub-btnSec:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-tertiary)}' +
    '.dsub-cq{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary);padding:0 6px}' +
    '.dsub-cqBar{position:relative;width:40px;height:5px;border-radius:3px;background:var(--dsw-alias-bg-layer-1);overflow:hidden}' +
    '.dsub-cqBarFill{height:100%;border-radius:3px;background:var(--dsw-alias-state-success-primary)}' +
    '.dsub-cqBarWarn .dsub-cqBarFill{background:var(--dsw-alias-state-warning-primary)}' +
    '.dsub-cqBarFull .dsub-cqBarFill{background:var(--dsw-alias-state-error-primary)}' +
    '.dsub-cqB{font-variant-numeric:tabular-nums;font-weight:600;color:var(--dsw-alias-label-primary)}' +
    '.dsub-diag{font:11px/1.5 ui-monospace,SFMono-Regular,monospace;max-height:260px;overflow:auto;white-space:pre-wrap;word-break:break-word;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:10px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}'

const cssId = 'dsh-subscriptions/settings.module.css'
    if (typeof document !== 'undefined' && !document.querySelector('style[data-plugin-css="' + cssId + '"]')) {
      const tag = document.createElement('style')
      tag.textContent = CSS
      tag.setAttribute('data-plugin', 'dsh-subscriptions')
      tag.dataset.pluginCss = cssId
      document.head.appendChild(tag)
    }

    // Строки карточки живут в реестре локалей: так их переводит отдельный
    // пакет, не трогая код этого плагина. Английский — язык по умолчанию,
    // на него же приходится откат, если перевода нет.
    const NS = 'dsh-subscriptions'
    const en = {
      'notConnected': 'Not connected',
      'verifyAccount': 'Verify account',
      'coolingDown': 'Cooling down',
      'usageFull': 'Usage 100%',
      'connected': 'Connected',
      'title': 'Subscriptions',
      'cardIntro': 'Subscription accounts, rotation and limits.',
      'show': 'Show',
      'hide': 'Hide',
      'intro': 'Log in with a consumer subscription. Tokens stay on the host credentials store. The browser never reads them back. After Connect, if the provider lands on localhost or a vendor page, paste the redirected URL or the code here.',
      'useOrigin': 'Use this Web UI origin as OAuth redirect_uri',
      'useOriginHint': 'Leave off unless you registered your own OAuth client for this origin. Vendor CLI clients usually require their published redirect URI plus the paste step.',
      'privacyMask': 'Mask emails and account identifiers',
      'privacyMaskHint': 'For demos and screen sharing: emails show as j***n@example.com.',
      'resetCredits': 'Reset credits',
      'resetCreditsHint': 'ChatGPT reset cards: shows how many are available. Consuming one is a deliberate action with a 5s confirmation.',
      'resetAvailable': 'Reset attempts available',
      'resetExpires': 'earliest expires',
      'resetAck': 'I understand one attempt will be consumed',
      'resetWait': 'confirm enabled in',
      'resetReady': 'ready',
      'resetGo': 'Reset now',
      'resetBusy': 'resetting…',
      'resetDone': 'quota reset',
      'resetNothing': 'server says nothing needs a reset (no attempt consumed)',
      'resetNoCredit': 'no usable credit (not consumed)',
      'resetRedeemed': 'already redeemed earlier',
      'diagGenerate': 'Generate diagnostics report',
      'diagCopy': 'Copy report',
      'diagIssues': 'Open issue tracker',
      'diagHint': 'The report has no tokens, emails, proxy addresses or personal data.',
      'subsPill': 'SUBS',
      'subsModalTitle': 'Subscription Hub',
      'subsActiveHero': 'Active Subscription',
      'subsPoolTitle': 'Provider Accounts',
      'subsRefresh': 'Refresh',
      'subsOpenSettings': 'All Settings →',
      'subsFastMode': 'Fast Mode 1.5x',
      'subsHealthy': 'Healthy',
      'subsFree': 'free',
      'subsUsed': 'used',
      'subsModalClose': 'Close',
      'subsLogged': 'connected',
      'subsNotLogged': 'not connected',
      'subsCooldown': 'cooldown',
      'subsOpenSettings': 'Open settings',
      'hudTitle': 'Subscription balance',
      'settingsLoading': 'Loading settings…',
      'settingsUnavailable': 'Settings are unavailable',
      'settingsRetry': 'Retry',
      'hudHint': 'drag · edge docks · click refresh',
      'fcCalibrating': 'calibrating…',
      'fcIdle': 'no usage',
      'fcHours': 'h',
      'fcMinutes': 'm',
      'reconnect': 'Reconnect',
      'connect': 'Connect',
      'disconnect': 'Disconnect',
      'removeSlot': 'Remove slot',
      'pastePlaceholder': 'Paste redirected URL or code',
      'submitCode': 'Submit code',
      'proxyPlaceholder': 'Per-account proxy (http://, https://, socks5://) - optional',
      'proxyCheck': 'Check proxy',
      'proxyOk': 'proxy ok',
      'proxyFail': 'proxy fail',
      'deviceLogin': 'Device login',
      'deviceHint': 'Headless: open the link, enter the code, keep this tab open.',
      'deviceCopy': 'Copy code',
      'devicePending': 'Waiting for confirmation',
      'deviceAuthorized': 'Signed in',
      'deviceExpired': 'Expired - start again',
      'verifyPrefix': 'Google requires one-time account verification. ',
      'verifyLink': 'Open verification link',
      'verifySuffix': ' then reconnect.',
      'addAccount': '+ Add account',
      'save': 'Save',
      'saved': 'Saved',
      'loading': 'Loading\u2026',
      'accountLabel': 'Account',
      'plan': 'Plan',
      'storedAs': 'Stored as',
      'switchLabel': 'Provider',
      'chipActive': 'Subscriptions',
'expiryLabel': 'expires',
      'slashLogin': 'Login to a subscription provider',
      'slashLogout': 'Log out a subscription provider',
      'slashStatus': 'Subscription status',
      'none': 'none',
      'forecast': '≈',
      'resetLabel': 'reset',
      'check': 'Check',
      'checking': 'Checking…',
      'importToken': 'Import',
      'importTokenPlace': 'Paste an existing token',
      'importLocalCli': 'Import from local CLI',
      'importLocalSuccess': 'Imported from local CLI!',
      'reconnectRequired': 'Reconnect required',
      'manualTitle': 'If the browser did not come back',
      'windowPrimary': 'Primary window',
      'windowSecondary': 'Secondary window',
    }
    const ru = {
      'check': 'Проверить',
      'checking': 'Проверяю…',
      'importToken': 'Внести',
      'importTokenPlace': 'Вставить уже готовый токен',
      'importLocalCli': 'Импортировать из локального CLI',
      'importLocalSuccess': 'Импортировано из локального CLI!',
      'reconnectRequired': 'Нужно переподключить',
      'manualTitle': 'Если браузер не вернулся сам',
      'windowPrimary': 'Основное окно',
      'windowSecondary': 'Дополнительное окно',
      'notConnected': 'Не подключено',
      'verifyAccount': 'Требуется проверка',
      'coolingDown': 'Пауза после лимита',
      'usageFull': 'Лимит исчерпан',
      'connected': 'Подключено',
      'title': 'Подписки',
      'cardIntro': 'Аккаунты подписок, ротация и лимиты.',
      'show': 'Показать',
      'hide': 'Скрыть',
      'intro': 'Вход по обычной пользовательской подписке. Токены остаются в хранилище учётных данных харнесса, браузер их обратно не читает. Если после «Подключить» провайдер увёл на localhost или на свою страницу, вставьте сюда адрес перехода или код.',
      'useOrigin': 'Использовать адрес этого веб-интерфейса как redirect_uri',
      'useOriginHint': 'Включайте, только если зарегистрировали собственного клиента OAuth на этот адрес. Штатным консольным клиентам провайдеров нужен их опубликованный адрес возврата и вставка кода вручную.',
      'privacyMask': 'Маскировать email и учётные записи',
      'privacyMaskHint': 'Для демонстрации экрана: email отображается как j***n@example.com.',
      'resetCredits': 'Карты сброса',
      'resetCreditsHint': 'Карты сброса квоты ChatGPT: показывает, сколько доступно. Списание одной карты — осознанное действие с 5-секундным подтверждением.',
      'resetAvailable': 'Доступно попыток сброса',
      'resetExpires': 'ближайшая истекает',
      'resetAck': 'Я понимаю, что будет списана 1 попытка',
      'resetWait': 'кнопка активна через',
      'resetReady': 'готово',
      'resetGo': 'Сбросить',
      'resetBusy': 'сбрасываю…',
      'resetDone': 'квота сброшена',
      'resetNothing': 'сервер сообщает: сброс не нужен (попытка не списана)',
      'resetNoCredit': 'нет пригодной карты (не списано)',
      'resetRedeemed': 'эта карта уже использована ранее',
      'diagGenerate': 'Сгенерировать диагностический отчёт',
      'diagCopy': 'Скопировать отчёт',
      'diagIssues': 'Открыть трекер задач',
      'diagHint': 'В отчёте нет токенов, email, адресов прокси и персональных данных.',
      'subsPill': 'SUBS',
      'subsModalTitle': 'Консоль подписок',
      'subsActiveHero': 'Активная подписка',
      'subsPoolTitle': 'Пул аккаунтов',
      'subsRefresh': 'Обновить',
      'subsOpenSettings': 'Все настройки →',
      'subsFastMode': 'Режим Fast 1.5x',
      'subsHealthy': 'Исправен',
      'subsFree': 'свободно',
      'subsUsed': 'израсходовано',
      'subsModalClose': 'Закрыть',
      'subsLogged': 'подключен',
      'subsNotLogged': 'не подключен',
      'subsCooldown': 'кулдаун',
      'subsOpenSettings': 'Открыть настройки',
      'hudTitle': 'Остаток подписки',
      'settingsLoading': 'Загрузка настроек…',
      'settingsUnavailable': 'Настройки недоступны',
      'settingsRetry': 'Повторить',
      'hudHint': 'перетащи · прилипает к краям · клик — обновить',
      'fcCalibrating': 'калибровка…',
      'fcIdle': 'нет расхода',
      'fcHours': 'ч',
      'fcMinutes': 'мин',
      'reconnect': 'Переподключить',
      'connect': 'Подключить',
      'disconnect': 'Отключить',
      'removeSlot': 'Убрать место',
      'pastePlaceholder': 'Адрес перехода или код',
      'submitCode': 'Отправить код',
      'proxyPlaceholder': 'Прокси аккаунта (http://, https://, socks5://) - необязательно',
      'proxyCheck': 'Проверить прокси',
      'proxyOk': 'прокси ок',
      'proxyFail': 'прокси недоступен',
      'deviceLogin': 'Вход по коду',
      'deviceHint': 'Headless: откройте ссылку, введите код, держите вкладку открытой.',
      'deviceCopy': 'Скопировать код',
      'devicePending': 'Ожидание подтверждения',
      'deviceAuthorized': 'Вход выполнен',
      'deviceExpired': 'Истёк - начните заново',
      'verifyPrefix': 'Google требует однократной проверки аккаунта. ',
      'verifyLink': 'Открыть страницу проверки',
      'verifySuffix': ' затем подключитесь заново.',
      'addAccount': '+ Добавить аккаунт',
      'save': 'Сохранить',
      'saved': 'Сохранено',
      'loading': 'Загрузка…',
      'accountLabel': 'Аккаунт',
      'plan': 'Тариф',
      'storedAs': 'Хранится как',
      'switchLabel': 'Провайдер',
      'chipActive': 'Подписки',
'expiryLabel': 'окончание',
      'slashLogin': 'Вход в провайдера подписки',
      'slashLogout': 'Выйти из провайдера подписки',
      'slashStatus': 'Статус подписок',
      'none': 'нет',
      'forecast': '≈',
    }

    // #51: live countdown to the quota window reset (account.quota.resetAt).
                function cleanErrorMessage(raw) {
      if (!raw) return ''
      var text = typeof raw === 'string' ? raw : (raw.message || String(raw))
      text = text.trim()
      if (text.charAt(0) === '{' && text.charAt(text.length - 1) === '}') {
        try {
          var parsed = JSON.parse(text)
          if (parsed.error && parsed.error.message) text = parsed.error.message
          else if (parsed.message) text = parsed.message
          else if (parsed.code) text = parsed.code
        } catch (e) {}
      }
      var firstLine = text.split('\n')[0].trim()
      if (firstLine.length > 160) return firstLine.slice(0, 157) + '...'
      return firstLine
    }

    function normalizePlanBadge(provider, plan) {
      if (!plan && provider !== 'kimi' && provider !== 'glm') return null
      var p = String(plan || '').toLowerCase().replace(/[^a-z0-9]/g, '')
      var label = plan
      if (provider === 'codex') {
        if (p.indexOf('pro20') >= 0 || p === 'pro') label = 'Pro 20x'
        else if (p.indexOf('pro5') >= 0 || p.indexOf('prolite') >= 0) label = 'Pro 5x'
        else if (p.indexOf('team') >= 0) label = 'Team'
        else if (p.indexOf('plus') >= 0) label = 'Plus'
        else if (p.indexOf('enterp') >= 0) label = 'Enterprise'
      } else if (provider === 'grok') {
        if (p.indexOf('super') >= 0) label = 'SuperGrok'
        else if (p.indexOf('plus') >= 0) label = 'X Premium+'
        else if (p.indexOf('premium') >= 0) label = 'X Premium'
      } else if (provider === 'antigravity') {
        if (p.indexOf('ultra') >= 0) label = 'Ultra'
        else if (p.indexOf('pro') >= 0) label = 'Pro'
      } else if (provider === 'kimi') {
        label = 'Coding Plan'
      } else if (provider === 'glm') {
        label = '150% Boost'
      }
      return label ? React.createElement('span', { className: 'dsub-planBadge' }, label) : null
    }

    function formatRelativeReset(resetAt, lang, now) {
      if (!resetAt || !Number.isFinite(resetAt) || resetAt <= 0) return ''
      var delta = resetAt - (now || Date.now())
      var isRu = lang !== 'en'
      if (delta <= 0) return isRu ? 'только что' : 'just now'
      var totalMinutes = Math.max(1, Math.round(delta / 60000))
      var days = Math.floor(totalMinutes / 1440)
      var hours = Math.floor((totalMinutes % 1440) / 60)
      var minutes = totalMinutes % 60
      var bits = []
      if (days) bits.push(days + (isRu ? ' дн' : 'd'))
      if (hours) bits.push(hours + (isRu ? ' ч' : 'h'))
      if (minutes || !bits.length) bits.push(minutes + (isRu ? ' мин' : 'm'))
      return (isRu ? 'через ' : 'in ') + bits.join(' ')
    }

    function ResetCountdown(props) {
      const [now, setNow] = React.useState(Date.now())
      React.useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(id)
      }, [])
      const ms = (props.resetAt || 0) - now
      if (ms <= 0) return null
      const total = Math.floor(ms / 1000)
      if (total > 3600) {
        return React.createElement('span', { className: 'dsub-sub', style: { fontVariantNumeric: 'tabular-nums' } },
          t('resetLabel') + ' ' + formatRelativeReset(props.resetAt, t('lang'), now))
      }
      const m = Math.floor(total / 60)
      const sec = total % 60
      const pad = (n) => String(n).padStart(2, '0')
      return React.createElement('span', { className: 'dsub-sub', style: { fontVariantNumeric: 'tabular-nums' } },
        t('resetLabel') + ' ' + pad(m) + ':' + pad(sec))
    }

    function badgeFor(account, t) {
      if (!account || !account.configured) return t('notConnected')
      if (account.validationUrl) return t('verifyAccount')
      if (account.cooldownUntil && account.cooldownUntil > Date.now()) return t('coolingDown')
      if (account.usagePercent != null && account.usagePercent >= 100) return t('usageFull')
      return t('connected')
    }

    // Карточка во вкладке «Плагины» рисует свой заголовок и сворачивание:
    // ядро даёт только рамку списка.
        // Ядровый значок раскрытия. Без защищённого require вместо IconChevronDownOutline14 может упасть вся клиентская половина.
    let ChevronIcon = null
    try {
      const primitives = require('@deepseek-ai/dsh-client-ui-primitives')
      ChevronIcon = primitives && primitives.IconChevronDownOutline14
    } catch (noPrimitives) {
      ChevronIcon = null
    }
    function FallbackChevron(props) {
      return React.createElement('svg', { className: props.className, width: 14, height: 14, viewBox: '0 0 14 14', fill: 'none' },
        React.createElement('path', { d: 'M3.5 5.25L7 8.75l3.5-3.5', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
      )
    }
    const Chevron = ChevronIcon || FallbackChevron



    function SubsSection(props) {
      // Переводчик приходит от слота, потому что в его записи указан locale.
      const t = (props && props.t) || ((key) => key)
      const [draft, setDraft] = React.useState(null)
      const [accounts, setAccounts] = React.useState([])
      const [providers, setProviders] = React.useState([])
      const [paste, setPaste] = React.useState({})
      const [device, setDevice] = React.useState({})  // #90 key -> {state,userCode,authUrl,intervalMs,status}
      const [proxyRes, setProxyRes] = React.useState({})  // #88 key -> {ok,latencyMs,error}
      const [diag, setDiag] = React.useState('')
      const [reset, setReset] = React.useState({})  // #85 key -> challenge state
      const [, setResetTick] = React.useState(0)
      React.useEffect(() => {
        const anyPending = Object.values(reset).some((r) => r && r.phase === 'confirm' && !r.result)
        if (!anyPending) return undefined
        const id = setInterval(() => setResetTick((n) => n + 1), 1000)
        return () => clearInterval(id)
      }, [reset])

      // #85: reset credits challenge flow (prepare -> 5s cooldown + ack -> consume).
      const resetPrepare = async (provider, index, key) => {
        setReset((m) => Object.assign({}, m, { [key]: { phase: 'loading' } }))
        try {
          const res = await fetch('/dsh-subscriptions/reset-credits/prepare', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider, index }),
          })
          const d = await res.json()
          if (!d || !d.ok) throw new Error((d && d.error && d.error.message) || 'prepare failed')
          setReset((m) => Object.assign({}, m, { [key]: {
            phase: 'confirm',
            challengeId: d.challengeId,
            availableCount: d.availableCount,
            readyAt: d.readyAt,
            expiresAt: d.expiresAt,
            creditExpiresAt: d.creditExpiresAt || null,
          } }))
        } catch (e) {
          setReset((m) => Object.assign({}, m, { [key]: { phase: 'idle', error: String(e && e.message || e) } }))
        }
      }
      const resetConsume = async (key) => {
        const st = reset[key]
        if (!st || st.phase !== 'confirm' || !st.ack || Date.now() < st.readyAt || st.busy) return
        setReset((m) => Object.assign({}, m, { [key]: Object.assign({}, st, { busy: true }) }))
        try {
          const res = await fetch('/dsh-subscriptions/reset-credits/consume', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ challengeId: st.challengeId, acknowledged: true }),
          })
          const d = await res.json()
          if (!d || !d.ok) throw new Error((d && d.error && d.error.message) || 'consume failed')
          const code = d.result && d.result.code
          setReset((m) => Object.assign({}, m, { [key]: Object.assign({}, st, { busy: false, result: code, windowsReset: (d.result && d.result.windowsReset) || [] }) }))
          reload().catch(() => {})
        } catch (e) {
          setReset((m) => Object.assign({}, m, { [key]: Object.assign({}, st, { busy: false, error: String(e && e.message || e) }) }))
        }
      }
      // #99: one click - fetch the anonymized report and copy it to the clipboard.
      const genDiag = () => {
        fetch('/dsh-subscriptions/diagnostics', { cache: 'no-store' })
          .then((r) => r.json())
          .then((d) => {
            const txt = d && d.ok ? JSON.stringify(d.report, null, 2) : ('error: ' + ((d && d.error && d.error.message) || 'unknown'))
            setDiag(txt)
            try { navigator.clipboard.writeText(txt) } catch {}
          })
          .catch((e) => setDiag('error: ' + String(e && e.message || e)))
      }
      const [checkRes, setCheckRes] = React.useState({})
      const [checking, setChecking] = React.useState({})
      const [saved, setSaved] = React.useState(false)
      const [tokenDraft, setTokenDraft] = React.useState({})
      const [err, setErr] = React.useState('')

      const applyPayload = (data) => {
        setDraft(JSON.parse(JSON.stringify((data && data.config) || {})))
        setAccounts((data && data.accounts) || [])
        setProviders((data && data.providers) || [])
      }

      const reload = () => fetch('/dsh-subscriptions/config', { cache: 'no-store' })
        .then((res) => res.json())
        .then(applyPayload)

      React.useEffect(() => {
        let alive = true
        reload().catch((e) => { if (alive) setErr(String(e && e.message ? e.message : e)) })
        return () => { alive = false }
      }, [])

      // #90: poll device login while any slot is in 'pending' state.
      React.useEffect(() => {
        const pendingKeys = Object.entries(device).filter(([, d]) => d && d.status === 'pending')
        if (!pendingKeys.length) return
        const timers = pendingKeys.map(([key, d]) => setInterval(() => {
          devicePollOnce(key.split(':')[0], Number(key.split(':')[1]))
        }, d.intervalMs || 5000))
        return () => timers.forEach(clearInterval)
      })

      // #81: settings snapshot status - never render phantom inputs before the
      // config snapshot arrives, and offer a retry when the store is unavailable.
      if (!draft) {
        return React.createElement('div', { className: 'dsub-wrap' },
          React.createElement('div', { className: 'dsub-row' },
            React.createElement('span', { className: 'dsub-sub' }, err ? t('settingsUnavailable') : t('settingsLoading')),
            err ? React.createElement('button', {
              type: 'button', className: 'dsub-mini',
              onClick: () => { setErr(''); reload().catch((e) => setErr(String(e && e.message || e))) },
            }, t('settingsRetry')) : null,
          ),
          err ? React.createElement('div', { className: 'dsub-bad' }, err) : null,
        )
      }

      const slots = Array.isArray(draft.slots) ? draft.slots : []
      const setSlots = (next) => setDraft((d) => Object.assign({}, d, { slots: next }))
      const accountOf = (provider, index) => accounts.find((a) => a.provider === provider && a.index === index) || {}

      const save = async () => {
        setErr(''); setSaved(false)
        const res = await fetch('/dsh-subscriptions/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(draft),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error((data.error && data.error.message) || ('HTTP ' + res.status))
        applyPayload(data)
        setSaved(true); setTimeout(() => setSaved(false), 2000)
      }

      const connect = async (provider, index) => {
        setErr('')
        const res = await fetch('/dsh-subscriptions/oauth/start?provider=' + encodeURIComponent(provider) + '&index=' + encodeURIComponent(index), { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error((data.error && data.error.message) || ('HTTP ' + res.status))
        if (data.url) window.open(data.url, '_blank', 'noopener')
      }

      // #90: device-code login (headless). Server mints user_code; we show it,
      // open the verification page, and poll until authorized.
      const deviceStartLogin = async (provider, index) => {
        const key = provider + ':' + index
        setErr('')
        const res = await fetch('/dsh-subscriptions/oauth/device/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, index }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error((data.error && data.error.message) || ('HTTP ' + res.status))
        setDevice((m) => Object.assign({}, m, { [key]: { state: data.state, userCode: data.userCode, authUrl: data.authUrl, intervalMs: data.intervalMs || 5000, status: 'pending' } }))
      }

      const devicePollOnce = async (provider, index) => {
        const key = provider + ':' + index
        const d = device[key]
        if (!d || !d.state) return
        const res = await fetch('/dsh-subscriptions/oauth/device/poll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: d.state }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setDevice((m) => Object.assign({}, m, { [key]: Object.assign({}, d, { status: 'expired' }) }))
          return
        }
        if (data.status === 'authorized') {
          setDevice((m) => Object.assign({}, m, { [key]: Object.assign({}, d, { status: 'authorized' }) }))
          reload().catch(() => {})
          return
        }
        if (data.status === 'expired') {
          setDevice((m) => Object.assign({}, m, { [key]: Object.assign({}, d, { status: 'expired' }) }))
        }
      }

      const complete = async (provider, index) => {
        setErr('')
        const key = provider + ':' + index
        const url = paste[key] || ''
        const res = await fetch('/dsh-subscriptions/oauth/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: provider, index: index, url: url }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error((data.error && data.error.message) || ('HTTP ' + res.status))
        setAccounts(data.accounts || [])
        setPaste((p) => Object.assign({}, p, { [key]: '' }))
      }

      // #88: проверить прокси аккаунта реальным запросом с замером задержки.
      const doProxyCheck = async (provider, index) => {
        const key = provider + ':' + index
        setChecking((c) => Object.assign({}, c, { ['proxy:' + key]: true }))
        setErr('')
        try {
          const res = await fetch('/dsh-subscriptions/proxy-check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider, index }),
          })
          const data = await res.json().catch(() => ({}))
          setProxyRes((m) => Object.assign({}, m, { [key]: data }))
        } catch (e) { setErr(cleanErrorMessage(e.message || e)) }
        setChecking((c) => Object.assign({}, c, { ['proxy:' + key]: false }))
      }


      const doCheck = async (provider, index) => {
        const key = provider + ':' + index
        setChecking((c) => Object.assign({}, c, { [key]: true }))
        setErr('')
        try {
          const res = await fetch('/dsh-subscriptions/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider, index }),
          })
          const data = await res.json().catch(() => ({}))
          setCheckRes((m) => Object.assign({}, m, { [key]: data }))
          if (data && data.quota) {
            setAccounts((prev) => prev.map((a) => a.provider===provider && a.index===index ? Object.assign({}, a, { quota: data.quota }) : a))
          }
        } catch (e) { setErr(cleanErrorMessage(e.message || e)) }
        setChecking((c) => Object.assign({}, c, { [key]: false }))
      }

      const logout = async (provider, index) => {
        setErr('')
        const res = await fetch('/dsh-subscriptions/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: provider, index: index }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error((data.error && data.error.message) || ('HTTP ' + res.status))
        setAccounts(data.accounts || [])
      }

            const importLocalCli = async (provider, index) => {
        setErr('')
        const res = await fetch('/dsh-subscriptions/import-local', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, index }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error((data.error && data.error.message) || ('HTTP ' + res.status))
        await load()
        setInfo(t('importLocalSuccess'))
      }

      const importToken = async (provider, index) => {
        setErr('')
        const tok = (tokenDraft[provider + ':' + index] || '').trim()
        if (!tok) return
        const res = await fetch('/dsh-subscriptions/import-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, index, refreshToken: tok }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error((data.error && data.error.message) || ('HTTP ' + res.status))
        setAccounts(data.accounts || [])
        setTokenDraft((d) => Object.assign({}, d, { [provider + ':' + index]: '' }))
      }

      const addSlot = (provider) => {
        const used = slots.filter((s) => s.provider === provider).map((s) => s.index)
        let index = 1
        while (used.indexOf(index) >= 0) index++
        setSlots(slots.concat([{ provider: provider, index: index, label: '' }]))
      }

      const names = providers.length ? providers : [
        { id: 'codex', name: 'ChatGPT Codex' },
        { id: 'claude', name: 'Claude' },
        { id: 'grok', name: 'Grok' },
        { id: 'antigravity', name: 'Antigravity' },
      ]

      return React.createElement('div', { className: 'dsub-wrap' },
        React.createElement('div', { className: 'dsub-block' },
          React.createElement('div', { className: 'dsub-h' }, t('title')),
          React.createElement('div', { className: 'dsub-sub' },
            t('intro')),
          React.createElement('label', { className: 'dsub-row' },
            React.createElement('input', {
              type: 'checkbox',
              checked: !!draft.useWebCallback,
              onChange: (e) => setDraft((d) => Object.assign({}, d, { useWebCallback: e.target.checked })),
            }),
            React.createElement('span', null, t('useOrigin')),
          ),
          React.createElement('div', { className: 'dsub-sub' },
            t('useOriginHint')),
          React.createElement('label', { className: 'dsub-row' },
            React.createElement('input', {
              type: 'checkbox',
              checked: !!draft.privacyMask,
              onChange: (e) => setDraft((d) => Object.assign({}, d, { privacyMask: e.target.checked })),
            }),
            React.createElement('span', null, t('privacyMask')),
          ),
          React.createElement('div', { className: 'dsub-sub' },
            t('privacyMaskHint')),
        ),
        React.createElement('div', { className: 'dsub-block' },
          React.createElement('div', { className: 'dsub-row' },
            React.createElement('button', { type: 'button', className: 'dsub-mini', onClick: genDiag }, t('diagGenerate')),
            React.createElement('a', { href: 'https://github.com/GooDAnDReaDY/dsh-subscriptions/issues', target: '_blank', rel: 'noopener noreferrer', className: 'dsub-mini' }, t('diagIssues')),
          ),
          React.createElement('div', { className: 'dsub-sub' }, t('diagHint')),
          diag ? React.createElement('div', { className: 'dsub-row' },
            React.createElement('button', {
              type: 'button', className: 'dsub-mini',
              onClick: () => { try { navigator.clipboard.writeText(diag) } catch {} },
            }, t('diagCopy')),
            React.createElement('pre', { className: 'dsub-diag' }, diag),
          ) : null,
        ),
        names.map((prov) => {
          const rows = slots
            .map((slot, i) => ({ slot: slot, i: i }))
            .filter((row) => row.slot.provider === prov.id)
          return React.createElement('div', { className: 'dsub-block', key: prov.id },
            React.createElement('div', { className: 'dsub-h' }, prov.name),
            rows.map((row) => {
              const account = accountOf(row.slot.provider, row.slot.index)
              const key = row.slot.provider + ':' + row.slot.index
              const on = !!account.configured
              return React.createElement('div', { className: 'dsub-card', key: key },
                React.createElement('div', { className: 'dsub-row' },
                  React.createElement('input', {
                    className: 'dsub-grow',
                    value: row.slot.label || '',
                    placeholder: account.label || (t('accountLabel') + ' ' + row.slot.index),
                    onChange: (e) => {
                      const next = slots.slice()
                      next[row.i] = Object.assign({}, next[row.i], { label: e.target.value })
                      setSlots(next)
                    },
                  }),
                  React.createElement('span', { className: 'dsub-badge' + (account.validationUrl ? ' dsub-badge-warn' : (on ? ' dsub-badge-on' : '')) }, badgeFor(account, t)),
                  normalizePlanBadge(row.slot.provider, account.plan || (account.quota && account.quota.plan)),
                  React.createElement('button', {
                    type: 'button', className: 'dsub-mini',
                    onClick: () => connect(row.slot.provider, row.slot.index).catch((e) => setErr(cleanErrorMessage(e.message || e))),
                  }, on ? t('reconnect') : t('connect')),
                  (row.slot.provider === 'codex' ? React.createElement('button', {
                    type: 'button', className: 'dsub-mini',
                    onClick: () => deviceStartLogin(row.slot.provider, row.slot.index).catch((e) => setErr(cleanErrorMessage(e.message || e))),
                  }, t('deviceLogin')) : null),
                  React.createElement('button', {
                    type: 'button', className: 'dsub-mini',
                    disabled: !on,
                    onClick: () => logout(row.slot.provider, row.slot.index).catch((e) => setErr(cleanErrorMessage(e.message || e))),
                  }, t('disconnect')),
                  React.createElement('button', {
                    type: 'button', className: 'dsub-mini',
                    disabled: checking[key],
                    onClick: () => doCheck(row.slot.provider, row.slot.index).catch((e) => setErr(cleanErrorMessage(e.message || e))),
                  }, checking[key] ? t('checking') : t('check')),
                  React.createElement('button', {
                    type: 'button', className: 'dsub-mini', title: t('removeSlot'),
                    onClick: () => {
                      const slot = row.slot
                      Promise.resolve(on ? logout(slot.provider, slot.index) : null)
                        .then(() => setSlots(slots.filter((_, k) => k !== row.i)))
                        .catch((e) => setErr(cleanErrorMessage(e.message || e)))
                    },
                  }, '\u00d7'),
                ),
                React.createElement('div', { className: 'dsub-manual' },
                  React.createElement('span', { className: 'dsub-sub' }, t('manualTitle')),
                React.createElement('div', { className: 'dsub-row' },
                  React.createElement('input', {
                    className: 'dsub-grow',
                    value: paste[key] || '',
                    placeholder: t('pastePlaceholder'),
                    onChange: (e) => setPaste((p) => Object.assign({}, p, { [key]: e.target.value })),
                  }),
                  React.createElement('button', {
                    type: 'button', className: 'dsub-mini',
                    onClick: () => complete(row.slot.provider, row.slot.index).catch((e) => setErr(cleanErrorMessage(e.message || e))),
                  }, t('submitCode')),
                ),
                React.createElement('div', { className: 'dsub-row' },
                  React.createElement('input', {
                    className: 'dsub-grow',
                    value: tokenDraft[key] || '',
                    placeholder: t('importTokenPlace'),
                    onChange: (e) => setTokenDraft((d) => Object.assign({}, d, { [key]: e.target.value })),
                  }),
                  React.createElement('button', {
                    type: 'button', className: 'dsub-mini',
                    onClick: () => importToken(row.slot.provider, row.slot.index).catch((e) => setErr(cleanErrorMessage(e.message || e))),
                  }, t('importToken')),
                  React.createElement('button', {
                    type: 'button', className: 'dsub-mini',
                    title: t('importLocalCli'),
                    onClick: () => importLocalCli(row.slot.provider, row.slot.index).catch((e) => setErr(cleanErrorMessage(e.message || e))),
                  }, '📥 CLI'),
                ),
                React.createElement('div', { className: 'dsub-row' },
                  React.createElement('input', {
                    className: 'dsub-grow',
                    value: row.slot.proxyUrl || '',
                    placeholder: t('proxyPlaceholder'),
                    onChange: (e) => {
                      const next = slots.slice()
                      next[row.i] = Object.assign({}, next[row.i], { proxyUrl: e.target.value })
                      setSlots(next)
                    },
                  }),
                  React.createElement('button', {
                    type: 'button', className: 'dsub-mini',
                    disabled: checking['proxy:' + key],
                    onClick: () => doProxyCheck(row.slot.provider, row.slot.index).catch((e) => setErr(cleanErrorMessage(e.message || e))),
                  }, checking['proxy:' + key] ? '\u2026' : t('proxyCheck')),
                ),
                (function(){
                  var r = proxyRes[key]
                  if (!r) return null
                  var txt = r.ok ? (t('proxyOk') + ' ' + r.latencyMs + 'ms' + (r.viaProxy ? '' : ' (direct)')) : (t('proxyFail') + ': ' + ((r.error && r.error.message) || ''))
                  return React.createElement('div', { className: r.ok ? 'dsub-ok' : 'dsub-bad' }, txt)
                })(),
                ),
                (function devicePanel(){
                  var d = device[key]
                  if (!d) return null
                  var txt = d.status === 'authorized' ? t('deviceAuthorized') : (d.status === 'expired' ? t('deviceExpired') : t('devicePending'))
                  var cls = d.status === 'authorized' ? 'dsub-ok' : (d.status === 'expired' ? 'dsub-bad' : 'dsub-verify')
                  return React.createElement('div', { className: 'dsub-verify' },
                    React.createElement('div', { className: cls }, txt),
                    d.status === 'pending' ? React.createElement(React.Fragment, null,
                      React.createElement('div', { style: { fontSize: '2em', fontWeight: 700, letterSpacing: '0.15em', margin: '4px 0' } }, d.userCode),
                      React.createElement('div', { className: 'dsub-row' },
                        React.createElement('button', {
                          type: 'button', className: 'dsub-mini',
                          onClick: () => { try { navigator.clipboard.writeText(d.userCode) } catch {} },
                        }, t('deviceCopy')),
                        React.createElement('a', { href: d.authUrl, target: '_blank', rel: 'noopener noreferrer', className: 'dsub-mini' }, t('verifyLink')),
                      ),
                      React.createElement('div', { className: 'dsub-sub' }, t('deviceHint')),
                    ) : null,
                  )
                })(),
                (row.slot.provider === 'codex' && on ? (function resetPanel(){
                  var st = reset[key] || { phase: 'idle' }
                  var now = Date.now()
                  function resultText(code) {
                    if (code === 'reset') return t('resetDone')
                    if (code === 'nothing_to_reset') return t('resetNothing')
                    if (code === 'no_credit') return t('resetNoCredit')
                    if (code === 'already_redeemed') return t('resetRedeemed')
                    return code
                  }
                  if (st.phase !== 'confirm') {
                    return React.createElement('div', { className: 'dsub-row' },
                      React.createElement('button', {
                        type: 'button', className: 'dsub-mini',
                        onClick: () => resetPrepare(row.slot.provider, row.slot.index, key).catch((e) => setErr(String(e && e.message || e))),
                      }, st.phase === 'loading' ? '\u2026' : t('resetCredits')),
                      React.createElement('div', { className: 'dsub-sub' }, t('resetCreditsHint')),
                    )
                  }
                  var ready = now >= st.readyAt
                  var secs = Math.max(0, Math.ceil((st.readyAt - now) / 1000))
                  return React.createElement('div', { className: 'dsub-verify' },
                    React.createElement('div', null,
                      t('resetAvailable') + ': ' + st.availableCount +
                      (st.creditExpiresAt ? (' · ' + t('resetExpires') + ' ' + new Date(st.creditExpiresAt).toLocaleString()) : '')
                    ),
                    React.createElement('label', { className: 'dsub-row' },
                      React.createElement('input', {
                        type: 'checkbox',
                        checked: !!st.ack,
                        onChange: (e) => setReset((m) => Object.assign({}, m, { [key]: Object.assign({}, st, { ack: e.target.checked }) })),
                      }),
                      React.createElement('span', null, t('resetAck')),
                    ),
                    React.createElement('div', { className: 'dsub-row' },
                      React.createElement('button', {
                        type: 'button', className: 'dsub-mini',
                        disabled: !st.ack || !ready || !!st.busy,
                        onClick: () => resetConsume(key).catch((e) => setErr(String(e && e.message || e))),
                      }, st.busy ? t('resetBusy') : (ready ? t('resetGo') : (t('resetWait') + ' ' + secs + 's'))),
                      !ready && !st.busy ? React.createElement('span', { className: 'dsub-sub' }, t('resetWait') + ' ' + secs + 's') : null,
                      st.ack && ready ? React.createElement('span', { className: 'dsub-ok' }, t('resetReady')) : null,
                    ),
                    st.result ? React.createElement('div', { className: 'dsub-ok' }, resultText(st.result)) : null,
                    st.error ? React.createElement('div', { className: 'dsub-bad' }, st.error) : null,
                  )
                })() : null),
                account.accountNotice ? React.createElement('div', { className: 'dsub-verify' }, account.accountNotice) : null,
                account.refreshError ? React.createElement('div', { className: 'dsub-bad' }, t('reconnectRequired') + ': ' + account.refreshError) : null,
                (function(){ var r=checkRes[key]; if(!r) return null; var txt=r.ok ? ('ok ' + (r.email||'')) : ('fail ' + (r.error && r.error.message || '')); var cls=r.ok ? 'dsub-ok' : 'dsub-bad'; var q=r.quota; if(q && q.remaining!=null) txt += ' quota:'+q.remaining+(q.limit!=null?'/'+q.limit:''); return React.createElement('div', {className: cls}, txt) })(),
                account.validationUrl ? React.createElement('div', { className: 'dsub-verify' },
                  t('verifyPrefix'),
                  React.createElement('a', { href: account.validationUrl, target: '_blank', rel: 'noopener noreferrer' }, t('verifyLink')),
                  t('verifySuffix'),
                ) : null,
(function(){
                  var parts=[]
                  var wins=account.usage
                  function bar(label,pct){
                    var cls='dsub-bar'+(pct>=100?' dsub-barFull':(pct>=70?' dsub-barWarn':''))
                    return React.createElement('div',{className:'dsub-barRow',key:label},
                      React.createElement('span',null,label),
                      React.createElement('div',{className:cls},
                        React.createElement('div',{className:'dsub-barFill',style:{width:Math.min(100,Math.max(0,pct))+'%'}})
                      ),
                      React.createElement('span',null,Math.round(pct)+'%'),
                    )
                  }
                  // Имя окна приходит от провайдера внутренним: primary_window.
                  // Известные переводим, незнакомое хотя бы причёсываем, чтобы
                  // в карточке не оставалось подчёркиваний из чужого протокола.
                  function windowLabel(w){
                    var id=String((w&&w.id)||'')
                    var given=w&&(w.ru||w.en)
                    if(given&&given!==id)return given
                    if(id==='primary_window')return t('windowPrimary')
                    if(id==='secondary_window')return t('windowSecondary')
                    if(!id)return t('quota')
                    return id.replace(/_/g,' ')
                  }
                  if(Array.isArray(wins)&&wins.length){
                    wins.forEach(function(w){
                      if(w&&w.usedPercent!=null)parts.push(bar(windowLabel(w),w.usedPercent))
                    })
                  }
                  var q=account.quota
                  if(q&&q.usedPercent!=null)parts.push(bar(t('quota'),q.usedPercent))
                  if(q&&q.resetAt)parts.push(React.createElement(ResetCountdown,{key:'reset',resetAt:q.resetAt}))
                  if(!wins&&!q&&account.usagePercent!=null)parts.push(bar(t('quota'),account.usagePercent))
                  var at=(q&&q.measuredAt)||(account.usageAt||0)
                  if(at){var m=Math.round((Date.now()-at)/60000);if(m>=1)parts.push(React.createElement('span',{className:'dsub-sub',key:'ago'},m+'m'))}
                  if(Array.isArray(wins)&&wins.length&&account.requests){
                    var w0=wins[0]
                    if(w0&&w0.usedPercent!=null&&w0.usedPercent<100){
                      var remaining=100-w0.usedPercent
                      var est=Math.floor(remaining/(w0.usedPercent/account.requests))
                      if(est>0)parts.push(React.createElement('span',{className:'dsub-sub',key:'fc'},t('forecast')+' '+est+' ('+windowLabel(w0)+')'))
                    }
                  }
                  if(!parts.length)return null
                  return React.createElement('div',{className:'dsub-block'},parts)
                })(),

                                account.paidTierName ? React.createElement('span', { className: 'dsub-sub' }, t('plan') + ': ' + account.paidTierName) : null,
                account.ref ? React.createElement('span', { className: 'dsub-sub' }, t('storedAs') + ' ' + account.ref) : null,
              )
            }),
            React.createElement('button', {
              type: 'button', className: 'dsub-mini',
              onClick: () => addSlot(prov.id),
            }, t('addAccount')),
          )
        }),
        React.createElement('div', { className: 'dsub-foot' },
          React.createElement('button', {
            type: 'button', className: 'dsub-save',
            onClick: () => save().catch((e) => setErr(cleanErrorMessage(e.message || e))),
          }, t('save')),
          saved ? React.createElement('span', { className: 'dsub-ok' }, t('saved')) : null,
          err ? React.createElement('span', { className: 'dsub-bad' }, err) : null,
        ),
      )
    }

    // Карточка во вкладке «Плагины» — как карточки bash/agent-loop/web-search:
    // заголовок с именем, описанием и шевроном, сворачивание, каёмка.
    function PluginCard(props) {
      const t = (props && props.t) || ((key) => key)
      const [open, setOpen] = React.useState(false)
      return React.createElement('li', {
        className: 'dsub-card' + (open ? ' dsub-cardOpen' : ''),
      },
        React.createElement('button', {
          type: 'button',
          className: 'dsub-header',
          onClick: () => setOpen(!open),
          'aria-expanded': open,
        },
          React.createElement('div', { className: 'dsub-headText' },
            React.createElement('div', { className: 'dsub-name' }, t('title')),
            React.createElement('div', { className: 'dsub-description' }, t('cardIntro')),
          ),
          React.createElement(Chevron, { className: 'dsub-chev' + (open ? ' dsub-chevOpen' : '') }),
        ),
        open ? React.createElement('div', { className: 'dsub-body' },
          React.createElement(SubsSection, props),
        ) : null,
      )
    }

    function registerSettings(ctx) {
      // Язык может принести не только плагин: словарные пакеты объявляют
      // русский для чужих пространств. Ядро на повторное объявление той же
      // пары «пространство + язык» бросает исключение, и незащищённый вызов
      // уносил с собой весь плагин — в интерфейсе это выглядело как «Failed to
      // load plugins» с перечнем ни в чём не повинных соседей.
      //
      // Поэтому каждый язык объявляется отдельно и по-хорошему: заняли до нас —
      // уступаем, свой английский при этом всё равно встаёт на место.
      const addLocale = (locale, dictionary) => {
        try {
          return ctx.locale.register(NS, locale, dictionary)
        } catch (alreadyTaken) {
          return () => {}
        }
      }
      ctx.effect(() => {
        const undo = [addLocale('en', en), addLocale('ru', ru)]
        return () => { for (const off of undo) off() }
      }, 'dsh-subscriptions: словари')
      // Подписи вне компонента берут переводчик, привязанный к namespace.
      setT(ctx.locale.bind(NS))
      // Штатное место — вкладка «Плагины»: карточка со своим заголовком и
      // сворачиванием вместо строки в боковом списке. Ключ регистрации обязан
      // равняться пространству настроек, иначе вкладка молча не покажет слот.
      let moved = false
      try {
        moved = !!ctx.slots.inject('settings.plugin.item', () => ctx.slots.register(
          {
            name: 'settings.plugin.item',
            key: NS,
            locale: NS,
            inject: () => ({ ctx: ctx }),
          },
          PluginCard,
        ))
      } catch { moved = false }
      if (moved) return
      // Запасной путь для сборок без settings.plugin.item: прежний раздел,
      // чтобы настройки не пропали.
      ctx.slots.inject('settings.section', () => ctx.slots.register(
        {
          name: 'settings.section',
          id: '@goodandready/dsh-subscriptions',
          order: 28,
          // locale в записи слота — то, из-за чего компонент получает props.t.
          locale: NS,
          label: () => t('title'),
          inject: () => ({ ctx: ctx }),
        },
        SubsSection,
      ))
    }

    // Горячий переключатель провайдера в строке композера: клик циклично
    // меняет активного провайдера подписки для следующего запроса.
    let activeIdx = 0
    let labelEl = null
    const ORDER = ['codex', 'claude', 'grok', 'antigravity']

    async function refreshLoggedIn() {
      try {
        const res = await fetch('/dsh-subscriptions/status', { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))
        const loggedIn = (data && data.loggedIn) || {}
        const usage = (data && data.usagePercent) || {}
        const logged = ORDER.filter((p) => loggedIn[p])
        const maxUsage = logged.reduce((m, p) => Math.max(m, usage[p] || 0), 0)
        return {
          logged,
          usage: maxUsage,
          expiresAt: (data && data.expiresAt) || {},
          labels: (data && data.labels) || {},
          expiryNotifyDays: (data && data.expiryNotifyDays) || 7,
          composerQuota: (data && data.composerQuota) || 'off',
          active: (data && data.active) || null,
        }
      } catch { return { logged: [], usage: 0, expiresAt: {}, labels: {}, expiryNotifyDays: 7, fastMode: false, composerQuota: 'off', active: null } }
    }

    // #84: компактный индикатор квоты активной подписки в области ввода.
    // Прогноз (runway) считается по скользящему окну сэмплов /status.
    const fcSamples = { windows: {} }

    function fcObserve(key, remaining, now) {
      const windows = fcSamples.windows
      const prev = windows[key]
      const samples = (prev && prev.samples) || []
      const last = samples[samples.length - 1]
      if (!last || (now > last.at && (Math.abs(remaining - last.pct) >= 0.1 || now - last.at >= 15 * 60 * 1000))) {
        samples.push({ at: now, pct: remaining })
      }
      windows[key] = { samples: samples.filter((x) => x.at >= now - 24 * 60 * 60 * 1000).slice(-192) }
    }

    function fcEstimate(key, remaining, now) {
      const rec = fcSamples.windows[key]
      if (!rec) return { status: 'calibrating' }
      const samples = rec.samples
      if (samples.length < 3) return { status: 'calibrating' }
      const first = samples[0]
      const last = samples[samples.length - 1]
      const span = last.at - first.at
      const consumed = first.pct - last.pct
      if (span < 30 * 60 * 1000 || consumed < 1) return { status: 'calibrating' }
      const t0 = first.at
      let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0
      for (const x of samples) {
        const wx = (x.at - t0) / 3600000
        const wy = first.pct - x.pct
        const w = Math.exp((x.at - last.at) / (6 * 3600000))
        sw += w; sx += w * wx; sy += w * wy; sxx += w * wx * wx; sxy += w * wx * wy
      }
      const den = sw * sxx - sx * sx
      const pace = den > 0 ? (sw * sxy - sx * sy) / den : 0
      if (!Number.isFinite(pace) || pace < 0.02) return { status: 'idle' }
      return { status: 'ready', runwaySeconds: Math.round((remaining / pace) * 3600) }
    }

    function ComposerQuota(props) {
      const t = (props && props.t) || ((k) => k)
      const [state, setState] = React.useState({ mode: 'off', active: null })
      React.useEffect(() => {
        let alive = true
        const pull = () => {
          refreshLoggedIn().then((r) => {
            if (!alive) return
            const mode = r.composerQuota || 'off'
            const a = r.active
            if (mode !== 'off' && a && a.provider && a.provider !== 'ollama' && a.usagePercent != null) {
              const remaining = Math.max(0, 100 - a.usagePercent)
              const key = 'subs:' + a.provider
              fcObserve(key, remaining, Date.now())
              const est = fcEstimate(key, remaining, Date.now())
              setState({ mode, active: a, remaining, est })
            } else {
              setState({ mode, active: a, remaining: null, est: null })
            }
          }).catch(() => {})
        }
        pull()
        const id = setInterval(pull, 60 * 1000)
        return () => { alive = false; clearInterval(id) }
      }, [])
      if (state.mode === 'off' || !state.active || state.remaining == null) return null
      const cls = state.remaining <= 10 ? ' dsub-cqBarFull' : (state.remaining <= 30 ? ' dsub-cqBarWarn' : '')
      var value = null
      if (state.mode === 'percent') {
        value = React.createElement('span', { className: 'dsub-cqB' }, Math.round(state.remaining) + '%')
      } else if (state.mode === 'bar') {
        value = React.createElement('span', { className: 'dsub-cqBar' + cls },
          React.createElement('span', { className: 'dsub-cqBarFill', style: { width: Math.min(100, Math.max(0, state.remaining)) + '%' } }))
      } else if (state.mode === 'forecast') {
        var est = state.est
        if (!est || est.status === 'calibrating') value = React.createElement('span', { className: 'dsub-cqB' }, t('fcCalibrating'))
        else if (est.status === 'idle') value = React.createElement('span', { className: 'dsub-cqB' }, t('fcIdle'))
        else {
          var secs = est.runwaySeconds || 0
          var txt = secs >= 3600 ? ('~' + (Math.round((secs / 3600) * 10) / 10) + t('fcHours')) : ('~' + Math.max(1, Math.round(secs / 60)) + t('fcMinutes'))
          value = React.createElement('span', { className: 'dsub-cqB' }, txt)
        }
      } else return null
      return React.createElement('span', { className: 'dsub-cq', title: t('forecast') + ' · ' + state.active.provider }, value)
    }

    // #83: пилл SUBS(N) в шапке сессии со светодиодом здоровья пула и
    // модальной консолью аккаунтов (закрытие: крестик, Escape, клик мимо).
    function brandBadge(prov) {
      const p = String(prov || '').toLowerCase()
      if (p.includes('codex') || p.includes('chatgpt') || p.includes('openai')) return { label: 'OpenAI', cls: 'dsub-brandCodex', icon: '⚡' }
      if (p.includes('claude') || p.includes('anthropic')) return { label: 'Claude', cls: 'dsub-brandClaude', icon: '✳' }
      if (p.includes('grok') || p.includes('xai')) return { label: 'Grok', cls: 'dsub-brandGrok', icon: '✦' }
      if (p.includes('antigravity') || p.includes('google') || p.includes('gemini')) return { label: 'AGY', cls: 'dsub-brandAgy', icon: '◆' }
      if (p.includes('kimi')) return { label: 'Kimi', cls: 'dsub-brandKimi', icon: '🌙' }
      if (p.includes('glm') || p.includes('zcode')) return { label: 'GLM', cls: 'dsub-brandGlm', icon: '⚡' }
      if (p.includes('ollama')) return { label: 'Ollama', cls: 'dsub-brandOllama', icon: '🦙' }
      return { label: (p.charAt(0).toUpperCase() || 'P'), cls: 'dsub-brandCodex', icon: '●' }
    }

    function SubsPill(props) {
      const t = (props && props.t) || ((k) => k)
      const [state, setState] = React.useState({ logged: [], usage: 0, accounts: [], open: false, active: null, loading: false })

      const pull = () => {
        setState((s) => Object.assign({}, s, { loading: true }))
        refreshLoggedIn().then((r) => {
          const logged = r.logged || []
          fetch('/dsh-subscriptions/config', { cache: 'no-store' })
            .then((res) => res.json())
            .then((cfg) => {
              setState((s) => Object.assign({}, s, { logged, usage: r.usage, accounts: (cfg && cfg.accounts) || [], active: r.active, loading: false }))
            })
            .catch(() => {
              setState((s) => Object.assign({}, s, { logged, usage: r.usage, accounts: [], active: r.active, loading: false }))
            })
        }).catch(() => {
          setState((s) => Object.assign({}, s, { loading: false }))
        })
      }

      React.useEffect(() => {
        pull()
        const id = setInterval(pull, 25 * 1000)
        return () => clearInterval(id)
      }, [])

      React.useEffect(() => {
        if (!state.open) return undefined
        const onKey = (e) => { if (e.key === 'Escape') setState((s) => Object.assign({}, s, { open: false })) }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [state.open])

      const n = state.logged.length
      const total = state.accounts.length || n
      const led = n === 0 ? 'dsub-ledOff' : (state.usage >= 90 ? 'dsub-ledBad' : (state.usage >= 50 ? 'dsub-ledWarn' : 'dsub-ledOk'))
      const now = Date.now()

      // Header Pill Label
      let pillText = t('subsPill') + ' (' + n + ')'
      if (state.active) {
        const a = state.active
        const wins = Array.isArray(a.windows) ? a.windows : []
        const winStr = wins.map((w) => (w.label || w.id) + ' ' + Math.round(w.usedPercent) + '%').join(' ')
        const provName = a.provider ? (a.provider.charAt(0).toUpperCase() + a.provider.slice(1)) : ''
        pillText = (a.provider === 'codex' && a.fastMode ? '⚡ ' : '') + provName + (winStr ? ' · ' + winStr : (a.usagePercent != null ? ' · ' + Math.round(a.usagePercent) + '%' : ''))
      }

      // Active Hero Card Renderer
      const renderActiveHero = () => {
        if (!state.active) return null
        const a = state.active
        const b = brandBadge(a.provider)
        const wins = Array.isArray(a.windows) ? a.windows : []
        const primaryWin = wins.find((w) => (w.label || w.id) === '5h') || wins[0]
        const secWin = wins.find((w) => (w.label || w.id) === '7d') || wins[1]
        const primPct = primaryWin && primaryWin.usedPercent != null ? Math.round(primaryWin.usedPercent) : (a.usagePercent != null ? Math.round(a.usagePercent) : 0)
        const secPct = secWin && secWin.usedPercent != null ? Math.round(secWin.usedPercent) : null

        return React.createElement('div', { className: 'dsub-heroCard' },
          React.createElement('div', { className: 'dsub-heroHead' },
            React.createElement('div', { className: 'dsub-heroTitle' },
              React.createElement('span', { className: 'dsub-brandBadge ' + b.cls, style: { width: 24, height: 24, fontSize: 11 } }, b.icon),
              React.createElement('span', null, (a.provider ? a.provider.toUpperCase() : 'LLM') + (a.index ? ' #' + a.index : '')),
              a.fastMode ? React.createElement('span', { className: 'dsub-pillTag', style: { background: 'rgba(245,158,11,.15)', color: '#fbbf24' } }, '⚡ FAST 1.5x') : null,
            ),
            React.createElement('span', { className: 'dsub-heroModel' }, a.model || 'active model'),
          ),
          React.createElement('div', { className: 'dsub-heroBars' },
            React.createElement('div', null,
              React.createElement('div', { className: 'dsub-barLabelRow' },
                React.createElement('span', { style: { fontWeight: 600 } }, ((primaryWin && primaryWin.label) ? primaryWin.label + ' window' : t('subs5hWindow')) + (primaryWin && primaryWin.resetAt ? ' (' + formatRelativeReset(primaryWin.resetAt, t('lang'), now) + ')' : '')),
                React.createElement('span', { style: { fontVariantNumeric: 'tabular-nums', fontWeight: 600 } }, primPct + '% ' + t('subsUsed') + ' (' + (100 - primPct) + '% ' + t('subsFree') + ')'),
              ),
              React.createElement('div', { className: 'dsub-barTrack' },
                React.createElement('div', {
                  className: 'dsub-barFillGrad',
                  style: {
                    width: Math.min(100, Math.max(0, primPct)) + '%',
                    background: primPct >= 90 ? 'var(--dsw-alias-state-error-primary,#ef4444)' : (primPct >= 50 ? 'var(--dsw-alias-state-warning-primary,#f59e0b)' : 'var(--dsw-alias-state-success-primary,#10b981)'),
                  },
                }),
              ),
            ),
            secWin ? React.createElement('div', null,
              React.createElement('div', { className: 'dsub-barLabelRow' },
                React.createElement('span', null, (secWin.label || '7d') + ' window'),
                React.createElement('span', { style: { fontVariantNumeric: 'tabular-nums' } }, secPct + '%'),
              ),
              React.createElement('div', { className: 'dsub-barTrack' },
                React.createElement('div', {
                  className: 'dsub-barFillGrad',
                  style: {
                    width: Math.min(100, Math.max(0, secPct)) + '%',
                    background: secPct >= 90 ? '#ef4444' : (secPct >= 50 ? '#f59e0b' : '#3b82f6'),
                  },
                }),
              ),
            ) : null,
          ),
        )
      }

      // Accounts list
      const rows = state.accounts.map((a, i) => {
        const isLogged = state.logged.includes(a.provider)
        const cooled = a.cooldownUntil && a.cooldownUntil > now
        const pct = a.usagePercent != null ? Math.round(a.usagePercent) : null
        const b = brandBadge(a.provider)
        const isActiveThis = state.active && state.active.provider === a.provider && state.active.index === a.index

        let statusClass = 'dsub-statusOff'
        let statusText = t('subsNotLogged')
        if (cooled) {
          statusClass = 'dsub-statusWarn'
          statusText = t('subsCooldown')
        } else if (isLogged) {
          if (pct >= 90) { statusClass = 'dsub-statusBad'; statusText = '90%+ ' + t('subsUsed') }
          else if (pct >= 50) { statusClass = 'dsub-statusWarn'; statusText = pct + '% ' + t('subsUsed') }
          else { statusClass = 'dsub-statusOk'; statusText = (pct != null ? pct + '% · ' : '') + t('subsLogged') }
        }

        return React.createElement('div', { className: 'dsub-accountCard', key: i },
          React.createElement('div', { className: 'dsub-brandBadge ' + b.cls }, b.icon),
          React.createElement('div', { className: 'dsub-accInfo' },
            React.createElement('div', { className: 'dsub-accNameRow' },
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
                React.createElement('span', { className: 'dsub-accName' }, a.provider.toUpperCase() + (a.index ? ' #' + a.index : '')),
                isActiveThis ? React.createElement('span', { className: 'dsub-pillTag', style: { background: 'rgba(16,185,129,.15)', color: '#34d399' } }, 'ACTIVE') : null,
                a.proxy ? React.createElement('span', { className: 'dsub-dim', title: a.proxy }, '🌐 proxy') : null,
              ),
              React.createElement('span', { className: 'dsub-accStatusTag ' + statusClass }, statusText),
            ),
            (isLogged && pct != null) ? React.createElement('div', { className: 'dsub-barTrack', style: { marginTop: 4, height: 4 } },
              React.createElement('div', {
                className: 'dsub-barFillGrad',
                style: {
                  width: Math.min(100, Math.max(0, pct)) + '%',
                  background: pct >= 90 ? '#ef4444' : (pct >= 50 ? '#f59e0b' : '#10b981'),
                },
              }),
            ) : null,
          ),
        )
      })

      return React.createElement(React.Fragment, null,
        React.createElement('button', {
          type: 'button',
          className: 'dsub-pill',
          'aria-expanded': state.open ? 'true' : 'false',
          title: t('subsPill') + ': ' + (n > 0 ? (n + ' ' + t('connected')) : t('notConnected')),
          onClick: () => setState((s) => Object.assign({}, s, { open: !s.open })),
        },
          React.createElement('span', { className: 'dsub-led ' + led }),
          React.createElement('span', null, pillText),
          React.createElement('span', { style: { fontSize: 9, opacity: 0.6, marginLeft: 2 } }, '▼'),
        ),
        state.open ? React.createElement('div', {
          className: 'dsub-modalWrap',
          onClick: (e) => { if (e.target === e.currentTarget) setState((s) => Object.assign({}, s, { open: false })) },
        },
          React.createElement('div', { className: 'dsub-modal', role: 'dialog', 'aria-label': t('subsModalTitle') },
            React.createElement('div', { className: 'dsub-modalHead' },
              React.createElement('div', { className: 'dsub-modalTitleWrap' },
                React.createElement('div', { className: 'dsub-modalIcon' }, '⚡'),
                React.createElement('div', null,
                  React.createElement('div', { style: { fontWeight: 700, fontSize: 15 } }, t('subsModalTitle')),
                  React.createElement('div', { className: 'dsub-dim' }, n + ' of ' + total + ' ' + t('connected')),
                ),
              ),
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
                React.createElement('button', {
                  type: 'button',
                  className: 'dsub-mini',
                  title: t('subsRefresh'),
                  onClick: () => pull(),
                }, state.loading ? '…' : '🔄'),
                React.createElement('button', {
                  type: 'button',
                  className: 'dsub-mini',
                  onClick: () => setState((s) => Object.assign({}, s, { open: false })),
                }, '✕'),
              ),
            ),
            renderActiveHero(),
            React.createElement('div', { className: 'dsub-poolTitle' }, t('subsPoolTitle')),
            rows.length ? rows : React.createElement('div', { className: 'dsub-sub', style: { padding: '12px 0' } }, t('subsNotLogged')),
            React.createElement('div', { className: 'dsub-modalFoot' },
              React.createElement('span', { className: 'dsub-dim' }, 'DSH Subscriptions'),
              React.createElement('a', {
                className: 'dsub-btnSec',
                href: '#',
                onClick: (e) => {
                  e.preventDefault()
                  setState((s) => Object.assign({}, s, { open: false }))
                  try {
                    const btn = Array.from(document.querySelectorAll('button')).find((b) => (b.textContent || '').includes(t('title')))
                    if (btn) btn.click()
                  } catch {}
                },
              }, t('subsOpenSettings')),
            ),
          ),
        ) : null,
      )
    }

    function registerSubsPill(ctx) {
      ctx.effect(() => {
        ctx.slots.inject('conversation.session.header.actions', () =>
          ctx.slots.register(
            {
              name: 'conversation.session.header.actions',
              id: 'dsh-subscriptions-subs-pill',
              order: 15,
              locale: NS,
            },
            (props) => React.createElement(SubsPill, { t }),
          ),
        )
      }, 'dsh-subscriptions: subs pill')
    }

    function registerComposerQuota(ctx) {
      ctx.effect(() => {
        ctx.slots.inject('conversation.input.right', () =>
          ctx.slots.register(
            {
              name: 'conversation.input.right',
              id: 'dsh-subscriptions-composer-quota',
              order: 5,
              locale: NS,
            },
            (props) => React.createElement(ComposerQuota, { t }),
          ),
        )
      }, 'dsh-subscriptions: composer quota')
    }

    function registerSlashCommands(ctx) {
      ctx.effect(() => {
        const triggers = ctx.get('inputTriggers')
        if (!triggers) return () => {}
        const providerMatch = new RegExp('^(' + ORDER.join('|') + ')$')
        const run = (cmd, line) => {
          const args = (line.trim().replace(/^\/\S+\s*/, '')).split(/\s+/).filter(Boolean)
          const prov = args[0]
          if (cmd === 'logout') {
            if (!prov || !providerMatch.test(prov)) return
            fetch('/dsh-subscriptions/logout', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ provider: prov, index: 1 }),
            }).catch(() => {})
            return
          }
          if (cmd === 'status' || (cmd === 'login' && prov === 'status')) { refreshLoggedIn().catch(() => {}); return }
          // login <provider>
          if (!prov || !providerMatch.test(prov)) return
          fetch('/dsh-subscriptions/oauth/start?provider=' + encodeURIComponent(prov) + '&index=1', { cache: 'no-store' })
            .then((r) => r.json()).then((data) => {
              if (data && data.url) window.open(data.url, '_blank', 'noopener')
            }).catch(() => {})
        }
        const line = (line) => line.trim()
        const sources = [
          { name: 'login', description: t('slashLogin') },
          { name: 'logout', description: t('slashLogout') },
        ]
        const disposers = sources.map((src) =>
          triggers.registerSource({
            trigger: '/',
            name: src.name,
            order: 40,
            description: src.description,
            candidates: (_s, req) => {
              if (req.position !== 'leading') return Promise.resolve([])
              const q = req.query.trim().toLowerCase()
              const name = src.name
              if (q !== '' && !name.startsWith(q)) return Promise.resolve([])
              return Promise.resolve([{ name, description: src.description }])
            },
            matchEnter: (_session, l) => {
              const t2 = line(l)
              const tok = t2.split(/\s+/)[0]
              if (tok !== '/' + src.name) return Promise.resolve(undefined)
              // '/login status' surfaces the connected providers as composer text.
              if (src.name === 'login' && /\bstatus\b/.test(t2)) {
                return refreshLoggedIn().then((logged) =>
                  ({ text: 'Connected: ' + (logged.length ? logged.join(', ') : 'none') }))
              }
              run(src.name, t2)
              return Promise.resolve('handled')
            },
          }),
        )
        return () => { for (const off of disposers) off() }
      }, 'dsh-subscriptions: slash commands')
    }

    exports.inject = ['slots', 'locale', 'sessions']
    exports.apply = function apply(ctx) {
      setT(ctx.locale.bind(NS))
      registerSettings(ctx)
      registerSubsPill(ctx)
      registerComposerQuota(ctx)
      registerSlashCommands(ctx)
    }
    return module.exports
  },
})
