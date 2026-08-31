# Migration Plan — Byzantini-Website → Astro 7 + Cloudflare Workers + D1

Branch: `Workers` · Status: **awaiting sign-off** · Companion reference project: `~/Projects/Isokratis` (already on the target architecture)

---

## 1. Context & findings

### Current state (verified)

| Layer | Today | Target |
|---|---|---|
| Astro | 5.18.0 (`output` implied server) | 7.x |
| Adapter | `@astrojs/cloudflare` 12.6.13 → `dist/_worker.js/index.js` | 14.x → `dist/server/entry.mjs` + `dist/client/` |
| Deploy | Cloudflare **Pages** project `byzantini-website`, per-commit git builds, `wrangler pages deploy` for `local-test` | **Workers** via manual `wrangler deploy` (user choice; CI can come later) |
| Config | `wrangler.toml` (no static assets section) | `wrangler.jsonc` + `assets` (Workers Static Assets) |
| DB | libSQL/Turso prod (`TURSO_DB_URL`/`TURSO_DB_TOKEN`), local SQLite snapshot in dev, `CONNECTOR` switching, `???` preprocessing, libSQL interactive transactions | **D1** binding `DB`, `migrations/` folder, `db.batch()` / D1 sessions (no interactive tx), same `???` preprocessing kept |
| Storage | R2 prod (`S3_BUCKET`), S3-compatible dev endpoint via AWS SDK | R2 binding direct; local R2 simulation in dev (AWS SDK dropped) |
| Server env | `Env` singleton + `ctx.locals.runtime.env` + `loadEnvVars.ts` Vite `define` | `import { env } from "cloudflare:workers"` (server) + `import.meta.env.VITE_/PUBLIC_` (client); `wrangler.jsonc` `vars` + `.dev.vars` secrets |
| Types | `@cloudflare/workers-types` | `wrangler types` → generated `worker-configuration.d.ts` |
| API layer | Paired `*.client.ts` (valibot) / `*.server.ts` (deepCopy + func), `matchRoute`, envelope `{res:{type}}`, `useAPI` hooks | Isokratis-style `APIClient` + `APIServer` classes, Zod (`astro/zod`), typed responses + status codes, `ServerCookies`, `useAPI` kept as the public component API |
| Styling | Tailwind 3 (`@astrojs/tailwind`) | Tailwind 4 (`@tailwindcss/vite`) — required, `@astrojs/tailwind` is deprecated & unsupported on Astro 7 |
| TS | 6.0.3 | 7.0.2 (as in Isokratis) |
| Aux services | Docker: PDF worker, image compression worker, email service | Keep as external HTTP services until a later port phase (user chose to plan the port too) |

### Isokratis = the reference architecture
Mirrors to copy: `wrangler.jsonc` (jsonc + assets + D1/KV bindings + envs), `migrations/NNNN_*.sql` + `wrangler d1 migrations apply`, `src/lib/d1.ts` (`initD1`/`d1()`), `APIClient`/`APIServer` + middleware + `ServerCookies`, `cli` `scripts/cf.ts` wrapper, generated `worker-configuration.d.ts`, dev script with `MINIFLARE_WORKERD_PATH=./node_modules/@cloudflare/workerd-linux-64/bin/workerd`.

### Decisions taken (user, 2026-08)
- Deploy: **manual `wrangler deploy`** (no CI for now).
- Scope: **infra + D1 swap AND API layer modernization** (full Isokratis-style API), API port as a separate phase after the baseline is verified.
- Aux services: **plan to port** (PDF/image/email) into Workers in a later phase.
- Environments: **prod + preview** (separate D1/R2 for preview).
- Data: **full copy at cutover**, Turso kept as read-only rollback anchor.

### Execution strategy (approved 2026-08)
- Decision-dense phases (1–3, 6, 7) are executed directly by the coordinating agent; mechanically
  repetitive bulk (route-group ports in Phase 4, docs/cleanup in Phase 9, research inventory in
  Phase 8) is delegated via subagents/workflows.
- **`docs/MIGRATION_SPEC.md` is the canonical handoff document** — every delegate reads it; the
  coordinator reviews every diff; delegates must end with `bun run typecheck` green.
- The worktree/branch is shared: no parallel agents editing overlapping files; fan-out only with
  disjoint file ownership (e.g., route groups).
- `~/Projects/Isokratis` is the read-only reference for the target architecture.
- Progress is tracked via the in-session goal; the repo (branch + docs) is the durable memory.

### Phase 1 amendments (as executed)
- `typescript` stays pinned **6.0.3** — `@astrojs/check@0.9.10` peers `typescript ^5||^6`;
  TS 7 evaluation is deferred to after Phase 4 (separate mini-task).
- Tailwind 4 entry is **`src/styles/global.css`** (created; imported once in
  `src/components/headers/Links.astro`, which every layout renders). Before Phase 1 there was no
  source CSS at all — `@astrojs/tailwind` auto-injected its own — so the `@theme` tokens were
  migrated from `tailwind.config.cjs` (removed). `@custom-variant dark (&:where(.dark, .dark *))`
  preserves class-based dark mode. Container-query variants migrated to `@min-[…]/nav` syntax
  (they had no `@container/nav` declaration — inert in v3, kept inert for parity).
- `bun.lockb` removed; `packageManager: bun@1.4.0` added.
- `wrangler` moved from dependencies → devDependencies.

---

## 2. Pre-flight inventory (do this before touching anything)

- [ ] `bun run check` baseline green on `main` (typecheck + tests) — record result.
- [ ] `wrangler login` (or confirm existing auth) — needed for D1 create / types / deploy.
- [ ] Fresh prod backup: `bun run db:replicate` (or `db:query:prod` to confirm prod connectivity) → keep the generated SQL **out of the repo** (gitignored area) as the data source of truth. Label with date.
- [ ] List all env vars (names only — NEVER print values): `AUTOMATED_EMAILS_*`, `GOOGLE_*`, `S3_*`, `SECRET`, `CONTACT_INFO`, `VITE_*`, test vars → decide destination per var (wrangler `vars` vs `secret` vs client-exposed).
- [ ] Inventory where each server-env var is read (`grep Env.env`) and which client vars are used (`VITE_`).
- [ ] Note current prod URLs/bindings: Pages project `byzantini-website`, custom domain `musicschool-metamorfosi.gr`, R2 `byzantini-bucket` (+ preview `bucket-dev`).

---

## 3. Phases

### Phase 1 — Dependency baseline (Astro 7 stack)
**✅ DONE — commit `b2bbd4f` on `Workers`.** Deviations (documented in `docs/MIGRATION_SPEC.md`):
TS 7 deferred (`@astrojs/check` peers ^5||^6); `wrangler.toml→jsonc` pulled forward (the v14
build validates the wrangler config); dev bucket replaced with `scripts/bucketServer.ts`
(AWS SDK can't load in the workerd dev runtime); `services/imageCompression/.env` port fixed
to 4323; test client sends `Origin` (Astro 6+ CSRF). Test matrix: 7/9 API files green
(books, instruments, locations, payments, registrations, sysusers, teachers);
announcements #3/#4 and payoffs/wholesalers failures verified pre-existing
(old-stack comparison: identical or worse).
Steps:
1. Bump in `package.json`: `astro@7.x`, `@astrojs/cloudflare@14.x`, `@astrojs/solid-js@7.x`, `@astrojs/sitemap` latest, `wrangler` latest 4.x, `typescript@7.0.2`, `@astrojs/check` latest.
2. Tailwind: remove `@astrojs/tailwind`, `tailwindcss@3` + `tailwind.config.cjs`; add `tailwindcss@4`, `@tailwindcss/vite`; rewrite global CSS to `@import "tailwindcss"` + `@theme` tokens (copy theme values from `tailwind.config.cjs`; check `@tailwindcss/container-queries` v4 plugin).
3. `bun install`, iterate `bun run typecheck` against Astro 6/7 upgrade guides (docs.astro.build/guides/upgrade-to/v6/, /v7/ — read them at implementation time).
4. `astro.config.mjs`: remove `CF_PAGES_BRANCH/CF_PAGES_URL` logic (fixed `site`), remove `@astrojs/tailwind`, keep `solidJs()`, `sitemap`; adapter: `cloudflare()` (verify v14 platformProxy auto-detection; keep explicit `platformProxy` only if required).
5. Remove `bun.lockb` (empty Pages-only artifact) — Pages is no longer the deploy target.
6. Checkpoint: `bun run typecheck`, `bun run astro-check`, `bun run build` compiles; visual smoke of a page.

### Phase 2 — Worker foundation (wrangler.jsonc + static assets + runtime)
**✅ DONE — commit `9cbe710`.** Env consolidated: `VITE_*` → Vite-native `.env`
(+ `.env.production`), server vars/secrets → wrangler `.dev.vars`;
`loadEnvVars` retired; `wrangler types --include-runtime=false` →
`worker-configuration.d.ts` (ambient runtime globals clash with Astro's
`APIContext`, so only explicit `@cloudflare/workers-types` type imports remain);
Pages-era scripts removed.
1. New `wrangler.jsonc` (model: Isokratis):
   - `name: byzantini-website`, `main` from adapter output, `compatibility_date` ~today, `compatibility_flags: ["nodejs_compat"]` (verify whether the old `global_fetch_strictly_public` / `disable_nodejs_process_v2` flags are still needed — likely not on a modern date).
   - `assets: { directory: "./dist", binding: "ASSETS" }` (confirm exact `not_found_handling` for the SPA-ish admin routes — Isokratis uses `single-page-application`; Byzantini has real 404s, verify behavior).
   - `d1_databases`: `{ binding: "DB", database_name: "byzantini-db", database_id: "<id>", migrations_dir: "migrations" }` (id from `wrangler d1 create`).
   - `r2_buckets`: `{ binding: "S3_BUCKET", bucket_name: "byzantini-bucket" }`.
   - `observability: { enabled: true }`.
   - `env.production` + `env.preview` (preview overrides R2/D1 to preview resources).
2. Delete `wrangler.toml`; `bunx wrangler types` → commit/`gitignore` policy decided (Isokratis ignores `worker-*.d.ts`, generation is cheap; recommend same + reference it from `src/env.d.ts`).
3. Env plumbing:
   - Server: `import { env } from "cloudflare:workers"`; replace `Env` singleton & `ctx.locals.runtime.env` reads (keep a very thin read-only `Env` shim in tests only).
   - `loadEnvVars.ts` retired: client-visible `VITE_*` via Vite-native `.env` files (`.env` / `.env.development`); server vars via `wrangler.jsonc` `vars`; secrets via `.dev.vars` (dev) + `wrangler secret put` (remote).
   - `types/env.ts` rewritten from generated `worker-configuration.d.ts` (Env type) — delete manual runtime truth.
4. Dev scripts: `dev`/`start` set `MINIFLARE_WORKERD_PATH=./node_modules/@cloudflare/workerd-linux-64/bin/workerd` (Isokratis pattern; only needed on Bun).
5. Checkpoint: `bun run dev` boots with local D1 binding visible; `bun run typecheck` green.

### Phase 3 — D1 database layer (core change)
**✅ DONE (core) — commit `9cbe710`.** `migrations/0001_initial_schema.sql`
(21 tables from the dev snapshot; data imported locally — 14 announcements,
1314 registrations). `lib/db.ts` targets the D1 binding (`getDb`/`dbExec`,
`???` expansion + `ExecReturn` shape preserved); `executeTransaction` executes
immediately — **no rollback** (D1 has no interactive transactions). Schema
backup route ported to D1; fs-based `revert`/`migrate` routes retired; `getData/`
tooling retired; `db:*` scripts → wrangler d1 equivalents. **Open (Phase 4/6):**
audit & convert transaction flows (registrations, payments, payoffs, sysusers,
announcements) to `batch()`; remote D1 creation + id pinning.
1. Generate `migrations/0001_*.sql` from the Phase-0 prod export (schema only): strip `PRAGMA journal_mode=WAL`, keep all 21 tables (`announcements`, `books`, `class_type`, `email_subscriptions`, `instruments`, `locations`, `payments`, `query_logs`, `school_payoffs`, `sys_users`, `teacher_classes`, `teacher_instruments`, `teacher_locations`, `teachers`, `total_payments`, `total_registrations`, `total_school_payoffs`, `wholesalers`, `sys_user_register_links`, `announcement_images`, `registrations`). Validate D1 SQLite compatibility of each construct (AUTOINCREMENT, UNIQUE, defaults — all standard; verify during implementation).
2. Rewrite `lib/db.ts` → D1:
   - Remove `@libsql/client`, TURSO vars, `CONNECTOR`, file: URLs, dev-vs-prod connection switching, `WrappedConnection`/`TxConn`.
   - `executeQuery`: `db.prepare(sql).bind(...args)`; SELECT → `.all()` rows; writes → `.run()` (`meta.last_row_id` → insertId, `meta.changes` → rowsAffected). Preserve the exact `ExecReturn` shape so route code doesn't change.
   - Keep `???` → `?, ?, …` preprocessing and `objectToArrayFromQuery` untouched (hundreds of call sites depend on it).
   - `executeTransaction` (the hard part — D1 has **no interactive transactions**):
     - Classify every transaction flow (audit `execTryCatch` `func.length === 1` usages in the 15 route groups).
     - Flow A (static statement sequence, no intermediate reads): refactor to `INSERT OR IGNORE`/`ON CONFLICT` where needed → one `db.batch([...])` (atomic). Canonical example: `registrations.post` (INSERT registration + UPDATE total + INSERT/IGNORE email subscription; email send stays outside the batch).
     - Flow B (intermediate reads/writes): `db.withSession("first-primary")` for sequential consistency + `execTryCatch` error wrapping; document the loss of rollback (partial-write risk is acceptable + mitigated by idempotent statements).
   - `query_logs`: best-effort `db.prepare(...).run()` after the fact (no separate connection anymore).
3. Tooling → Isokratis-style `scripts/cf.ts` (wrapped as `bun run cf …`) with: `dev`, `deploy`, `deploy:preview`, `types`, `tail`, `d1:create`, `d1:migrate:local`, `d1:migrate:deploy`, `d1:wipe`, `d1:query[:local]`. Replace `db:query`, `db:query:prod`, `db:logs`, `db:reset` (local = `d1:wipe` + migrations), retire `db:replicate` (source becomes the D1 itself; export via `wrangler d1 export`).
4. `getData/query.ts` + `getData/replicate.ts` retired (replaced by `wrangler d1 execute/export`); `dbSnapshots/` no longer used.
5. Local dev DB: `.wrangler/state` (miniflare) — `bun run cf d1:migrate:local` on fresh clone; no committed `.db`.
6. Checkpoint: all existing API tests green against `astro dev` + local D1; `bun run test`.

### Phase 4 — API layer modernization (Isokratis style; post-baseline)
**✅ DONE (core) — on `Workers`.** New Isokratis-style layer in `lib/api/`:
`APIClient` + `APIServer` (zod validation, typed responses, `handlerResult`),
`ServerCookies`, auth middleware, `lib/api/schemas.ts` (zod ports, Greek messages
preserved), 14 ported route groups (`lib/api/routes/<group>.ts`, multiple-fan-out
workflow), compat re-export (`lib/routes/index.client.ts`), new API entrypoint,
`useAPI` hooks rewired to the `{data}|{message}|{error}` envelope (components
unchanged — same `API`/`APIEndpoints` keys). Old `lib/routes/*` still present
(pending cleanup in Phase 9). Test suite: **9/10 files green** (books, payments,
wholesalers, registrations incl. tx+PDF+email, teachers, locations, instruments,
payoffs, sysusers); announcements #3/#4 (large-binary multipart) fail in DEV due
to a workerd-vite dev-relay limitation that mangles big binary parts — the same
tests failed on the old stack; verify via the production path (`wrangler dev` of
the built worker / deploy) in Phase 6.
1. Add `lib/api/` (or `lib/routes/` rework): port `APIClient` (typed `call`, `findRoute`, param patterns `[id:number]`) and `APIServer` (handler + middleware stack, typed validation with `astro/zod` Zod, response-schema validation, `HTTP` constants, `ServerCookies`).
2. Port the 15 route groups one at a time (Books, Authentication, Payments, Payoffs, Wholesalers, Teachers, Locations, Instruments, SysUsers, QueryLogs, Registrations, Announcements, Schema, SettingsBackup, Replication-where-still-needed): client contract (zod schema) + server handler; keep Greek error messages.
3. Middleware: auth (`authentication` equivalent) + request validation + multipart; adopt Isokratis's `AdminKeyMiddleware`-style separation only if needed.
4. `useAPI` (astro + solid): reimplement on top of `APIClient.call` — **same public signature** so components don't churn; the unwrap (`{data}/{message}` / errors) moves into the hook; server now returns typed JSON + real HTTP statuses (drop the `{res:{type}}` envelope).
5. Retire the `/schema/backup|revert|migrate` routes + `silentImport`/`fs` usage (impossible under Workers; `wrangler d1 migrations` is the replacement). Keep the ones that are still useful as pure-D1 operations.
6. Tests: keep endpoint integration tests (dev server + local D1); add Isokratis-style unit tests for `APIClient`/`APIServer` (matching, validation, middleware, typed responses).
7. Checkpoint: full `bun run check` green; admin panel flows manually verified.

### Phase 5 — Bucket / R2 cleanup
**✅ DONE — on `Workers`.** Dev store = `scripts/bucketServer.ts` (Phase 1); prod = R2
binding (Phase 1). Remaining cleanup done: `@aws-sdk/client-s3` removed, `S3_*` env vars +
types pruned, fs-based `replication` routes retired (incompatible with the Workers runtime —
not ported to the new API).
1. `lib/bucket/index.ts`: drop AWS SDK + S3 dev endpoint (`S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_DEV_BUCKET_NAME`, `DEV_BUCKET_LOCATION`, `S3_BUCKET_NAME`); use `env.S3_BUCKET` directly (R2 API; adapt `get` body stream ↔ ArrayBuffer); verify `src/pages/[...slug].ts` proxy + admin image uploads.
2. Dev: wrangler/miniflare local R2 (no Docker S3 server). Remove `@aws-sdk/client-s3` dep.
3. Checkpoint: upload/list/get/delete round-trip in dev + tests.

### Phase 6 — Preview + production deploy wiring (manual deploys)
**PREPARED — on `Workers`** (needs your `wrangler login` to finish resource creation):
`scripts/cf.ts` command wrapper (`bun run cf`), `wrangler.jsonc` env.production/preview
scaffolds, `docs/PHASE6_DEPLOY.md` runbook. Deploy path verified with
`wrangler deploy --config dist/server/wrangler.json --dry-run` (~253 kB gzip; bindings land
once real D1/R2 ids are pinned — noted caveat about generated config dropping `env.*`).
1. Create preview resources: `wrangler d1 create byzantini-db-preview`, preview R2 bucket (or reuse `bucket-dev`), preview worker env config.
2. Deploy command (confirm exact form from Astro docs at implementation time — the v14 adapter emits `dist/server/wrangler.json`; likely `wrangler deploy --config dist/server/wrangler.json` or equivalent); wrap in `bun run cf deploy` / `deploy:preview`.
3. `bun run cf deploy:preview` → smoke-test on the preview hostname (`byzantini-website.preview.workers.dev`).
4. Secrets checklist: `wrangler secret put` each (SECRET, GOOGLE_CLIENT_ID/SECRET, AUTOMATED_EMAILS_*, CONTACT_INFO…) for BOTH envs.
5. Custom domain: add `musicschool-metamorfosi.gr` to the production Worker (custom_domains) — do NOT cut over until Phase 7.

### Phase 7 — Data cutover (the only "downtime-ish" moment)
1. Freeze window: pick a low-traffic slot (before the mid-September 'Αγιασμός/registrations rush).
2. Create prod D1 (`wrangler d1 create byzantini-db`), `bun run cf d1:migrate:deploy` (schema).
3. Import data: `wrangler d1 execute byzantini-db --remote --file <fresh-turso-export.sql>` (split if it exceeds D1 statement/file limits).
4. Verify: row counts per table vs Turso export; spot checks (latest announcements, registrations totals, teachers, sys_users login).
5. Deploy production Worker; switch the custom domain (DNS/flip in dashboard); keep Pages project + Turso **read-only** as immediate rollback.
6. Watch: `bun run cf tail`, D1 errors dashboard, query_logs, registrations flow E2E.
7. After 2 weeks clean: archive Pages project (remove git integration/hooks), stop Turso, rotate any no-longer-needed secrets, remove R2/Pages-specific preview bindings.

### Phase 8 — Aux services port (post-cutover, separate mini-plan)
1. Inventory: what `services/pdfWorker`, `services/imageCompression`, `email/` actually do (deps, runtime).
2. PDF: likely Cloudflare Containers or a browser-rendering-based approach (research at that phase).
3. Image compression: Workers-native image library (e.g., `@napi-rs/image`-class libs — verify workerd compat at that phase) or `cloudflare:images`/Image Resizing where applicable.
4. Email: Cloudflare Email Service (sending) + keep templates (they're React-rendered — port renderer to the worker or prerender at deploy).
5. Cut over `VITE_PDF_SERVICE_URL`, `VITE_IMG_COMPRESSION_SERVICE_URL`, `AUTOMATED_EMAILS_*` to the new endpoints; decommission Docker.

### Phase 9 — Cleanup, docs, commit hygiene
- Remove dead deps (`@libsql/client`, `@aws-sdk/client-s3` after Phase 5, `@astrojs/tailwind`, old TS pin notes), prune `vite` ignore list, `wrangler.toml`.
- Update `AGENTS.md` (+ `.github/copilot-instructions.md` mirror): stack versions, `bun run cf` command table, D1 rules (D1 batch vs sessions, no interactive tx), env rules (`cloudflare:workers` + `.dev.vars`), deploy section.
- Update `README`/`QUICKSTART`; note `.gitignore` deltas (`dbSnapshots`, `getData` if retired, `bun.lockb` removal, `worker-*.d.ts`).
- Squash/clean history on `Workers` if needed; merge only after cutover verified.

---

## 4. Risk register (highest first)

| Risk | Impact | Mitigation |
|---|---|---|
| D1 has no interactive transactions | Existing tx flows lose rollback | Audit all `execTryCatch(1-arg)` flows; refactor to `batch()` where possible; session pattern otherwise; idempotent statements; tests |
| D1 behavioral differences (placeholders, NULL, int sizing, limits: rows/query, batch statement cap) | Silent data bugs | Validate SQL subset against D1 docs at implementation; compare results dev vs old snapshot; same `???”` expansion semantics (bind array, not object) |
| Astro 6→7 breaking changes + Solid adapter | Build/type failures | Read upgrade guides; pin versions; keep ASTRO_CHECK green each phase |
| Tailwind 3→4 visual drift | UI regressions | Port theme tokens faithfully; screenshot key pages before/after (web-perf/screens at that phase) |
| Env/secrets plumbing error | 500s in prod (or secret leak) | Inventory → destination checklist; never print values; verify dev+preview before prod |
| Cutover window | Registrations season | Schedule before Sep 15 rush; full copy + parallel verification; rollback = DNS flip (Pages kept 2 weeks) |
| `query_logs` write overhead under D1 | Added latency/upstream errors | Keep best-effort/fire-and-forget; consider sampling |
| `schema` management routes rely on `fs`/eval | Impossible on Workers | Retire in Phase 4; migrations folder is the new source of truth |

## 5. Open questions / confirmations (non-blocking)
- TypeScript 7.0.2 OK (Isokratis uses it; Byzantini pins 6.0.3 with documented TS6 gotchas — TS7 may change some type behaviors)?
- Retiring `/schema/backup|revert|migrate` admin routes in Phase 4 — confirm they're dev-only glue.
- `bun.lockb` removal OK (it existed only for Pages' Bun detection)?
- Keep Astro port 3000; worker deploy gets its own hostname — prefer `byzantini-website.workers.dev` preview style?

---

*Authored on branch `Workers`. All steps above respect the AGENTS.md rules (Bun-only, no secrets in repo, no generated files committed, Greek UI preserved).*
