# Progress: Stability Overhaul & One-Click Updater

## Completed
- [x] Gitea Issue #315 created and labeled.
- [x] Worktree `.worktrees/feat-stability-updater-and-hardening` created.
- [x] Host-side updater implemented in `lib/updater.js`.
- [x] Canonical `isLoopback` added to `lib/http.js` supporting IPv4, IPv6 (`::1`, `[::1]`) and hostnames.
- [x] Integrated updater route at `/dsh-subscriptions/update` in `lib/routes.js`.
- [x] Network timeouts: `AbortSignal.timeout(15_000)` added to probeFetch in `lib/routes/status.js`.
- [x] Parameter tolerance: `provider || vendor` and `index || accountIndex` supported in `/check`.
- [x] Accounts deduplication: duplicate `snap.windows` threshold loop removed from `lib/accounts.js`.
- [x] UI update badge and one-click update button added to settings header bar in `lib/client.js`.
- [x] 100% bilingual locale dictionary additions in `const en` and `const zh` (0 Cyrillic characters in `lib/client.js`).
- [x] Gitea issue #207 registered in `goodandready/dsh-russian-lang` for updater keys delta.
- [x] Unit tests in `test/updater.test.mjs` (7 test cases covering semver parsing, comparison, loopback, security, status, and routes).
- [x] Quality gates passed: all 378 tests pass, ESLint clean (0 errors, 0 warnings), pack size ~128 KiB (< 256 KiB limit).
- [x] Documentation updated: `docs/design/DESIGN.md`, `README.md`, `README.ru.md`, `README.zh.md`.

## Next Steps
- Commit changes via `/home/vadim/.ssh/bin/git-antigravity`.
- Push branch `feat/stability-updater-and-hardening` to Gitea.
- Open PR referencing #315 and squash-merge into `main`.
- Fast-forward root repository, cleanup worktree.
- Release v0.6.9 (bump `package.json`, commit, tag, push to Gitea and GitHub, GitHub release, npm publish).
- Deploy to `/home/vadim/.dsh/profiles/web` and restart `dsh-web.service`.
- Update `goodandready.app` showcase.
- Close Gitea issue #315 with 5-point report.
