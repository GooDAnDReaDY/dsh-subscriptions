#!/usr/bin/env bash
# deploy.sh — штатная точка деплоя @goodandready/dsh-subscriptions.
#
# Единственный поддерживаемый способ доставки — опубликованная неизменяемая
# npm-версия пакета, устанавливаемая штатным DSH-механизмом в указанный
# профиль. Релиз-кандидаты из непубликованных коммитов проходят приёмку на
# изолированном test server как временный .tgz (см. AGENTS.md / docs/) —
# этот скрипт для этого не предназначен: file:-ссылки, пути к исходникам и
# worktree-каталоги здесь запрещены и не используются.
#
# Использование:
#   ./deploy.sh <profile> [version]
#     profile — имя DSH-профиля (например, web)
#     version — опубликованная версия; по умолчанию берётся из package.json
#
# Переменные окружения:
#   DSH_BIN      — команда вызова DSH CLI (по умолчанию: dsh из PATH);
#                  для установки из каталога dsh можно указать
#                  "node <path-to-dsh>/lib/bin.js"
#   DSH_WEB_URL  — локальный адрес web-интерфейса профиля для post-deploy
#                  проверок (по умолчанию: http://127.0.0.1:3080)
#
# Скрипт не содержит секретов и принудительных режимов: --force запрещён
# политикой проекта; фактический запуск выполняется только с явного
# подтверждения владельца (см. AGENTS.md).

set -euo pipefail

PROFILE="${1:?usage: deploy.sh <profile> [version]}"
VERSION="${2:-}"
NAME="@goodandready/dsh-subscriptions"
REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
DSH_BIN="${DSH_BIN:-dsh}"
DSH_WEB_URL="${DSH_WEB_URL:-http://127.0.0.1:3080}"

if [ -z "$VERSION" ]; then
  VERSION="$(node -p "require('$REPO_ROOT/package.json').version")"
fi

echo "==> target: $NAME@$VERSION -> DSH profile '$PROFILE'"
command -v ${DSH_BIN%% *} >/dev/null 2>&1 || [ "${DSH_BIN%% *}" = "node" ] || {
  echo "ERROR: DSH CLI not found; set DSH_BIN (например: DSH_BIN='node /path/to/dsh/lib/bin.js')" >&2
  exit 1
}

echo "==> pre-deploy: проверка ссылки на worktree/file: в профиле запрещена политикой; установка пойдёт из registry"

echo "==> remove предыдущей установки (если была)"
$DSH_BIN plugin --profile "$PROFILE" remove "$NAME" || echo "    (плагин не был установлен)"

echo "==> add точной версии $VERSION"
$DSH_BIN plugin --profile "$PROFILE" add "$NAME@$VERSION"

echo "==> post-deploy: плагин в сборке web-профиля"
CHECKS_FAIL=0
if curl -fsS "$DSH_WEB_URL/" | grep -qF "$NAME"; then
  echo "    OK: $NAME присутствует в index web-интерфейса"
else
  echo "    FAIL: $NAME не найден в $DSH_WEB_URL/ — проверьте профиль и порт" >&2
  CHECKS_FAIL=1
fi

CLIENT_JS="$DSH_WEB_URL/plugins/$NAME/client.js"
CODE="$(curl -s -o /dev/null -w '%{http_code}' "$CLIENT_JS" || true)"
if [ "$CODE" = "200" ]; then
  echo "    OK: client.js отвечает 200"
else
  echo "    FAIL: client.js ответил $CODE — имя пакета разошлось с loader id?" >&2
  CHECKS_FAIL=1
fi

if [ "$CHECKS_FAIL" != "0" ]; then
  echo "ERROR: post-deploy проверки не прошли; установка выполнена, но требует разбора." >&2
  exit 1
fi
echo "OK: $NAME@$VERSION установлен в профиль '$PROFILE'."
echo "    Напоминание: если это production — владелец предварительно дал явное 'ок' на deploy."
