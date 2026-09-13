# Task Plan — Issue #313: EN/ZH Bilingual Localization & Account Health Check

## Goals
1. Remove all hardcoded Russian text from `lib/client.js` (`INSTRUCTIONS` and any UI labels) to adhere strictly to DSH plugin standards.
2. Provide full English (`en`) and Simplified Chinese (`zh`) instructions and UI dictionaries.
3. Register `zh` locale dictionary in `ctx.locale.register('dsh-subscriptions', 'zh', zhDict)`.
4. Add per-account quick health check button in the vendor account cards (`/dsh-subscriptions/smoke` supporting specific slot/account index).
5. Comprehensive tests and 0-lint verification.
6. Documentation updates (DESIGN.md, README.md, README.ru.md, README.zh.md).

## Phases
- [ ] Phase 1: Clean Russian hardcode, convert `INSTRUCTIONS` to `stepsEn` and `stepsZh`.
- [ ] Phase 2: Build and register complete `zh` locale dictionary in `lib/client.js`.
- [ ] Phase 3: Enhance `/dsh-subscriptions/smoke` route and UI to allow testing individual accounts.
- [ ] Phase 4: Unit tests for Chinese locale registration and account smoke ping.
- [ ] Phase 5: Verification, docs update, PR and release v0.6.8.
