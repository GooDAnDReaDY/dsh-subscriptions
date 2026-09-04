#!/usr/bin/env bash
set -euo pipefail

echo "=== DeepSeek Harness Subscriptions 1-Line Installer ==="

# Check Node.js version
if ! command -v node &>/dev/null; then
  echo "Error: Node.js is required but not installed." >&2
  exit 1
fi

NODE_MAJOR=$(node -v | cut -d'.' -f1 | tr -d 'v')
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Error: Node.js 18+ required (detected $(node -v))." >&2
  exit 1
fi

PROFILE_DIR="${HOME}/.dsh/profiles/web"
if [ ! -d "$PROFILE_DIR" ]; then
  echo "Error: Profile directory $PROFILE_DIR not found." >&2
  exit 1
fi

echo "Installing latest @goodandready/dsh-subscriptions..."
cd "$PROFILE_DIR"
pnpm add @goodandready/dsh-subscriptions@latest

echo "Restarting dsh-web..."
sudo systemctl restart dsh-web
sleep 2

if systemctl is-active --quiet dsh-web; then
  echo "SUCCESS: dsh-subscriptions installed and dsh-web is active!"
else
  echo "WARNING: dsh-web restart failed, check 'journalctl -u dsh-web -n 50'"
fi
