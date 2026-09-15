# Findings: Stability Overhaul & One-Click Updater

1. **Updater Security**:
   - The updater endpoint `/dsh-subscriptions/update` enforces local loopback verification (`isLoopback`) and checks the `x-dsh-plugin-update` header or same-origin browser contexts to reject any cross-origin attack vectors.
   - Single-flight locking prevents concurrent execution of `dsh plugin add`.
2. **Network Timeouts**:
   - External provider API calls can hang indefinitely without timeout signals. Adding `AbortSignal.timeout(15_000)` in `lib/routes/status.js` protects the harness against unresponsive provider endpoints.
3. **Locale Separation**:
   - Zero Cyrillic in `lib/client.js`. Russian translations are tracked externally in `goodandready/dsh-russian-lang` via issue #207.
4. **Pack Size & Manifest**:
   - `npm pack --dry-run` confirms package size is ~128 KiB with 71 files, strictly omitting tests and development planning files.
