# Findings — Issue #313

- `lib/client.js` currently has `INSTRUCTIONS` with `stepsRu` and `stepsEn`. Russian text should be replaced with `stepsZh` (Chinese).
- Russian translation must be decoupled so that foreign translation plugins (`dsh-russian-lang`) provide it via `locale.register`.
- `addLocale` currently only registers `en`. We will register both `en` and `zh`.
