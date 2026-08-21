# dsh-subscriptions

Publishable DSH plugin. Scoped name `@goodandready/dsh-subscriptions` must match
in `package.json`, `cordis.patch.yml` -> `name:`, and `lib/client.js` loader id.

- Develop in this repository (Gitea `goodandready/dsh-subscriptions`).
- Git: `git-cursor`. No infra paths, IPs, or secrets in the tree.
- Spec: `docs/architecture/2026-08-20-dsh-subscriptions-design.md`
- Plan: `docs/plans/2026-08-20-dsh-subscriptions.md`
- Tests: `npm test`. After `file:` installs, remove then add so pnpm copies files.
- v1 has no tools and does not call `dsh-key-rotation`.
- OAuth client ids in Config defaults are vendor-public CLI values, overridable.
