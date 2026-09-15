# Task Plan — Issue #315: Stability Overhaul & One-Click Updater

## Goals
1. Implement host-side One-Click Updater component (`lib/updater.js`) mounted on `/dsh-subscriptions/update`.
2. Integrate updater UI badge and action button into Web UI settings card (`lib/client.js`).
3. Add full English and Simplified Chinese localization for all updater keys; register i18n issue in `goodandready/dsh-russian-lang`.
4. Add 15-second network timeout protection (`AbortSignal.timeout`) on provider checks and refreshes.
5. Deduplicate `snap.windows` threshold notification block in `lib/accounts.js`.
6. Harden local loopback routes (`/subscriptions`, `/update`) using canonical `isLoopback` supporting IPv4 and IPv6 (`::1`).
7. Make `/check` payload parsing tolerant (`provider`/`vendor`, `index`/`accountIndex`).
8. Add automated tests covering updater, timeout, deduplication, and loopback checks.
9. Update `docs/design/DESIGN.md`, `README.md`, `README.ru.md`, `README.zh.md`.

## Execution Steps
- [x] Create Gitea Issue #315 and dedicated worktree.
- [ ] Implement `lib/updater.js` with ESM exports, semver comparison, status/installExact.
- [ ] Mount updater route in `lib/routes.js` and harden `isLoopback`.
- [ ] Deduplicate `snap.windows` in `lib/accounts.js`.
- [ ] Add `AbortSignal.timeout(15_000)` and payload tolerance in `lib/routes/status.js`.
- [ ] Add updater UI and EN/ZH dictionaries in `lib/client.js`.
- [ ] Create Gitea issue in `goodandready/dsh-russian-lang` for updater strings.
- [ ] Implement tests in `test/updater.test.mjs`.
- [ ] Run test suite (`pnpm test`) and ESLint.
- [ ] Update documentation (`DESIGN.md`, `README*.md`).
