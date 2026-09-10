# AGENTS.md — AI Co-Development Guide

This is the canonical instruction file for AI coding agents (Codex, Cursor,
Claude Code, Zed, Windsurf, Gemini, GitHub Copilot, ...) working on
**Byzantini-Website**. Read it fully before making changes.

- `CLAUDE.md` is a symlink to this file (Claude Code compatibility).
- `.github/copilot-instructions.md` is a summarized mirror for GitHub Copilot;
  keep it in sync when this file changes meaningfully.

## What this project is

A full-stack music school platform (website + admin panel, Greek language UI)
for the Byzantine music school of Metamorfosi. Astro + Solid frontend on
Cloudflare Workers (static assets), with a typed internal API, Cloudflare D1
database, R2 storage, the Cloudflare Images binding (announcement thumbnails,
`lib/images.ts`) and two aux Cloudflare Workers reached through **service
bindings**: `byzantini-website-emails` (`services/emailWorker`) and
`byzantini-website-pdf-gen` (`services/pdfWorker`).

> Migration in progress on branch `Workers` — see `docs/MIGRATION_SPEC.md` and
> `MIGRATION_PLAN.md` for the plan and the do-not-re-research facts.

## Stack (do not change without a good reason)

- Runtime & package manager: **Bun** — never use `npm`/`yarn`/`pnpm`.
- Frontend: Astro 7.2.9 + SolidJS + Tailwind 4; dev port is 4321.
- API: `src/pages/api/[...slug].ts` catch-all → `APIServer.handle` (Isokratis-style
  route instances, see the API architecture section below).
- Validation: Zod (`astro/zod`); schemas in `lib/api/schemas.ts`.
- Database: Cloudflare D1 (binding `DB`, `cloudflare:workers` env) — see
  `lib/db.ts`; schema in `migrations/` (`wrangler d1 migrations apply`).
- Storage: Cloudflare R2 (`S3_BUCKET` binding) in production; in dev the SAME
  binding is emulated locally by miniflare (persisted under
  `.wrangler/state/v3/r2`, wiped+seeded from prod by `bun run replicate:bucket`
  — see `lib/bucket/index.ts`). The retired dev HTTP store (`bucket:serve`,
  `scripts/bucketServer.ts`) is gone; the R2 binding works in dev like D1's
  does.
- Deploy: `@astrojs/cloudflare` adapter → `dist/server/entry.mjs` + `dist/client/`;
  config in `wrangler.jsonc`; manual deploys via `wrangler deploy`
  (deploy plumbing lands in Phase 6; CI/Pages integration is retired).
- Env: server-side runtime values via `cloudflare:workers` env (bindings + CF
  secrets/vars in prod) merged with `import.meta.env`; **dev values live in
  Vite-native `.env`** (gitignored — Bun/Vite auto-load it, `Env.env` merges
  both views). The site no longer uses `.dev.vars` (deleted 2026-09; pure-
  wrangler services still do — wrangler dev reads secrets only from their
  `.dev.vars`). `.env.production` holds prod mirrors; only `VITE_`/`PUBLIC_`
  are inlined client-side.
- TS config: `tsconfig.json` extends `astro/tsconfigs/strict`, no emit;
  runtime types from generated `worker-configuration.d.ts` (`bun run types`).

## Command reference (use Bun)

Core loop:

| Task | Command | Notes |
| --- | --- | --- |
| Install | `bun install` | real lockfile is `bun.lock` |
| Dev server | `bun run dev` | Astro dev, port **4321** |
| Dev server (alt) | `bun run start` | alias for `dev` |
| Build | `bun run build` | production build |
| Types | `bun run types` | regenerate `worker-configuration.d.ts` after `wrangler.jsonc` changes |
| Typecheck | `bun run typecheck` | `tsc --noEmit` (fast gate for every change) |
| Astro check | `bun run astro-check` | `astro check` (slower, more rules; 4 pre-existing errors) |
| Full gate | `bun run check` | typecheck + tests |
| Tests | `bun run test` | full suite; needs the dev server (the sysusers suite also needs the emails worker running locally — `createRegisterLink` sends the invite); env from tests/.env.test, 10s per test timeout |
| Format | `bun run format` | prettier (tabs, width 100) over source dirs — see note below |
| Format check | `bun run format:check` | fails on the existing repo; use on files you touch only |

Database tooling (wrangler D1 commands — local dev database is the miniflare
SQLite at `.wrangler/state/v3/d1`):

| Task | Command | Notes |
| --- | --- | --- |
| Query dev DB | `bun run db:query -- "SELECT 1"` | `wrangler d1 execute DB --local` |
| Query remote DB | `bun run db:query:prod -- "..."` | requires the remote database (Phase 6) |
| Recent query logs | `bun run db:logs` | |
| Export prod DB | `bun run db:replicate` | `wrangler d1 export` (remote) |
| Reset dev DB | `bun run db:reset` | wipes local D1 and rebuilds from `dbSnapshots/dev-snapshot.sql`; **does not re-run migrations** — follow with `bunx wrangler d1 migrations apply DB --local` |
| Apply migrations | `bunx wrangler d1 migrations apply DB --local` | fresh checkouts after `bun install` |
| Clean test fixtures | `bun run dev:clean` | removes the rows `bun run test` writes to the local dev DB (test pupils, their enrollments, `pupils.test.*` subscriptions) and re-derives `total_enrollments`; dry-run by default |
| Pupil backfill | `bun run pupils:migrate` / `pupils:migrate:apply` | the one-time `registrations` → `pupils` + `pupil_enrollments` migration; dry-run by default, `--db prod --yes-prod` for production; see `docs/PUPILS_MIGRATION.md` |

Aux services (separate Cloudflare Workers in `services/`; each has its own
`package.json`/`wrangler.jsonc` — run wrangler from inside the folder with
`--config wrangler.jsonc` and **without** the `--bun` flag — the Bun runtime
wedges wrangler dev). **Both are reached via service bindings** declared in the
site's `wrangler.jsonc` (`EMAIL_SERVICE`, `PDF_SERVICE` — top level AND under
`env.production`/`env.preview`, since bindings are not inherited by named
environments); local `astro dev` resolves them to the `wrangler dev` sessions
automatically (cross-command service bindings — start a worker when you
exercise its feature). No service URLs anywhere:
- **PDF** `byzantini-website-pdf-gen` (`services/pdfWorker`): `bunx wrangler dev --config wrangler.jsonc` (port 8787) / `bunx wrangler deploy --config wrangler.jsonc`. Templates+font bundled in `assets/`; the browser never calls it — `lib/pdf.client.ts` posts to the site's `Pdf.generate` route (`POST /api/pdf`, session-cookie auth), which proxies through the `PDF_SERVICE` binding with `Authorization: Bearer <PDF_SERVICE_AUTH_TOKEN>` (site secret; must match the worker's `SERVICE_AUTH_TOKEN` secret). No referer/session back-call, no `IS_DEV`.
- **Emails** `byzantini-website-emails` (`services/emailWorker` — the whole `email/` stack moved here, incl. the campaign CLI): `bunx wrangler dev --config wrangler.jsonc` (port 8788) / `bunx wrangler deploy --config wrangler.jsonc`. **The site calls this worker in EVERY environment** (registration confirmations + sysuser invites): the dry-run decision lives in the worker (`decideDryRun` in `src/index.ts`), not behind an `isProduction()` gate on the site, so local dev exercises the real send path instead of skipping it. A local `wrangler dev` request **never sends** — `decideDryRun` checks `DRY_RUN` (explicit override), then `ENVIRONMENT`, then a missing `MAILERSEND_API_KEY`, then the absence of `CF-Connecting-IP` (not an edge request), and anything local renders the email, logs `[dry-run:<reason>]` with a masked recipient, and returns 200. Transactional sends go via MailerSend REST (the `mailersend` npm package is gaxios-based and cannot run on workerd); the site calls it through the `EMAIL_SERVICE` binding with the `AUTOMATED_EMAILS_SERVICE_AUTH_TOKEN` in the body (must match the worker's `SERVICE_AUTH_TOKEN` secret); per-send templates are read from the worker's own `BUCKET` R2 binding (`html_templates/<name>`, same keys `POST /html-templates` writes — no `<SITE_URL>` HTTP fetch). `POST /html-templates` publishes built templates (`byzantini-bucket`; `templates:build --prod/--dev` calls it — no AWS SDK/S3 credentials anywhere; `templates:build --dev` also seeds the local worker's R2 for dev sends). The campaign CLI (`bun run campaign`) reads recipients from **Cloudflare D1** through `wrangler d1 execute --remote` (`src/db.ts` — spawned per query, uses the existing `wrangler login`, **no API token / no server**): `--db prod` ⇒ `byzantini-db`, default `dev` ⇒ `byzantini-db-preview`.

Shared-secret bootstrap/rotation: `bun run worker-secrets` (`scripts/workerSecrets.ts`) — sets the two matching site↔worker pairs on the deployed workers (defaults: pdfWorker/emailWorker + site envs `production`,`preview`; `--help` for flags) and **mirrors the values into the local env files** (site `.env`/`.env.production`, the services' `.dev.vars`, emailWorker `.env.development`/`.env.production`), so dev, `wrangler dev` and `templates:build` pick the new tokens automatically. Requires `wrangler login`; values are generated locally, never passed as argv and never printed.

Deploy (manual, requires Cloudflare credentials — do NOT run casually, not in tests):
`bun run build` then `wrangler deploy --config dist/server/wrangler.json`
(precise deploy command confirmed in Phase 6; old `deploy:test`/`logs:test` are gone).

## API architecture (project-critical, preserve the pattern)

- Routes are **instances** of `APIServer` (Isokratis-style) in
  `lib/api/routes/<group>.ts` — each exports a `xxxRoutes` object with the
  route keys (`Books.get`, `Authentication.userLogin`, ...) the app uses.
  Contracts live on the instance: `{ method, path, schema?, responseSchema?, multipart?, rawBlob? }`.
- Central registry: `lib/api/routes/index.ts` imports every group (which
  registers the routes) and builds the app-facing compat maps +
  types: `API`, `APIEndpoints`, `APIEndpointNames`, `APIArgs`, `APIResponse`.
  `lib/routes/index.client.ts` re-exports them (stable import path).
- `src/pages/api/[...slug].ts` is the single API entrypoint:
  `APIServer.handle(request, "/api")` — dispatch, Zod validation (JSON or
  multipart-with-coercion), auth middleware, typed responses.
- Middleware: `authenticateMiddleware` (session cookie, `lib/api/routes/middleware`) —
  attach per route via the middleware array.
- Server-side `useAPI` (`lib/hooks/useAPI.astro.ts`) dispatches **in-process**
  (no self-fetch — see docs/MIGRATION_SPEC.md, error 1042); the Solid version
  (`lib/hooks/useAPI.solid.ts`) fetches from the browser. Response envelope:
  `{ data } | { message } | { error }` with proper HTTP statuses.
- Validation uses **Zod** (`astro/zod`) — schemas in `lib/api/schemas.ts`.
- Adding an endpoint: add to the group file (`new APIServer(...)`) — the maps
  and types update automatically; add tests under `tests/api/`.

## Database access rules

- Use the wrappers in `lib/utils.server.ts`: `executeQuery(...)`,
  `executeTransaction(...)` — do not create ad-hoc DB calls. They handle the D1
  binding, `???` placeholder expansion and `query_logs` logging. Low-level
  access is `dbExec`/`getDb` in `lib/db.ts`.
- Multiple-value SQL uses `???` placeholders (expanded by
  `questionMarks` in `lib/db.ts`).
- Multi-step writes use the transaction callback pattern — see
  `lib/api/routes/pupils.ts` (`Pupils.post`, the public registration flow:
  find-or-create the pupil, append the enrollment, upsert the subscription) for
  the canonical example.
- **D1 has no interactive transactions**: `executeTransaction` executes
  statements immediately (no rollback). Rollback-sensitive flows must be
  refactored to `db.batch(...)` or made idempotent — see `docs/MIGRATION_SPEC.md`.
- Prefer SQL parameterization; never interpolate user input into SQL strings.
- Schema changes go through `migrations/NNNN_*.sql` +
  `wrangler d1 migrations apply DB --local` (never ad-hoc DDL in route code).

## Pupil register (Μαθητολόγιο)

The person data that used to live on `registrations` is split into two tables
(migration `0002_pupils.sql`); the legacy `registrations` table was dropped in
`0003_drop_registrations.sql`. Full plan + data-cleansing rules:
`docs/PUPILS_MIGRATION.md`.

- `pupils` — identity, one row per person, keyed by ΑΜ (Αριθμός Μητρώου, an
  INTEGER). `am` is NULL for the two review cases: true orphans (no ΑΜ at all →
  `orphan_code` `000-Ο1`…) and rows split off a shared ΑΜ (`split_from_am` →
  `111-Σ1`…). `needs_review` marks the ~62 rows the secretaries must resolve.
  `registration_url` lives here and is permanent (the links already emailed to
  students keep working).
- `pupil_enrollments` — history, one row per pupil / school year / music type /
  instrument. `class_id` is the music type (0 Βυζαντινή, 1 Παραδοσιακή,
  2 Ευρωπαϊκή); `source` records whether the row came from `migration`, the
  public `form` or an `admin`.
- `total_enrollments` replaces the old `total_registrations` counter (counts
  enrollment rows, re-derivable from the table).
- Routes: `Pupils.*` (`lib/api/routes/pupils.ts`). The enrollment listing routes
  return the **joined** row (`z_JoinedEnrollments`) — a superset of the old
  `registrations` row, so the admin table, the Excel/PDF exports and the PDF
  worker keep their shape. `am` is a STRING there ('706', or the orphan code).
- Newsletter routes live in `EmailSubscriptions.*`
  (`lib/api/routes/emailSubscriptions.ts`) but keep their public paths
  (`/registrations/email-*`) — those URLs are inside already-sent emails.
- The public form (`RegistrationForm.solid.tsx`) is a three-step flow: pick a
  music type → identify (ΑΜ + ΑΜΚΑ via `Pupils.getByAm`, or "new student" with
  `ΑΜ = 000`) → the form. The identification happens ONCE; switching department
  afterwards must not send the user back through it.
- Cleansing/backfill tooling: `bun run pupils:migrate` (dry run) /
  `pupils:migrate:apply`, `--db prod --yes-prod` for production.
  `bun run dev:clean` removes the fixtures the API suite writes to the local
  dev DB.

## Env, storage and external services

- Server-side env comes from the `cloudflare:workers` env module
  (`lib/env/runtime.ts` bridge, `Env.env` for the merged view) — never ad-hoc
  globals. The merged view = `import.meta.env` + the runtime env (bindings,
  vars/secrets). **Site dev values live in `.env`** (gitignored, auto-loaded by
  Bun/Vite): `SECRET`, `GOOGLE_CLIENT_ID/SECRET`, `GOOGLE_MAPS_KEY`,
  `AUTOMATED_EMAILS_SERVICE_AUTH_TOKEN`, `PDF_SERVICE_AUTH_TOKEN`,
  `TURSO_DB_URL/TOKEN` (kept until the final cutover).
  Production runtime secrets stay **Cloudflare secrets** (`wrangler secret
  put`, never in files). The site has **no `.dev.vars`**; pure-wrangler
  services (pdfWorker/emailWorker dev) still keep theirs.
- `VITE_`/`PUBLIC_` client vars come from Vite-native `.env` files
  (gitignored; `.env` for dev, `.env.production` for builds). `.env.production`
  also mirrors the prod token pairs for archival/recovery — only
  `VITE_`/`PUBLIC_` keys are ever inlined client-side; non-prefixed keys are
  NOT inlined into the worker (runtime reads them from the CF secret).
- Owner (super-admin) email: use `@env/ownerEmail` (`OWNER_EMAIL`,
  `isOwnerEmail(...)`) — backed by `VITE_OWNER_EMAIL` (same var inlines into
  client AND server bundles; hardcoded fallback in the module) and set in
  `.env`/`.env.production`. Never hardcode the owner email in features;
  owner-only UI (global search, query-logs link, user deletion) goes through
  this module.
- Storage goes through `Bucket` (`lib/bucket/index.ts`) — always the R2
  binding `S3_BUCKET`: real R2 in production, miniflare-emulated locally
  (`.wrangler/state/v3/r2`). Dev data comes from `bun run replicate:bucket`,
  which wipes the local store and seeds it from production (D1-style) plus a
  `bucket/YY-MM-DD/` archive; restart the dev server after replicating.
  Never access the binding directly in route code.
- **Worker↔worker calls go through service bindings, never HTTP URLs**: the
  site's `wrangler.jsonc` declares `EMAIL_SERVICE` (`byzantini-website-emails`)
  and `PDF_SERVICE` (`byzantini-website-pdf-gen`) at top level and under each
  named environment. Handlers reach them via the handler `env` (runtimeEnv)
  as `Fetcher`s: `lib/api/routes/emailService.ts` (`sendAutomatedEmail`) and
  `lib/api/routes/pdf.ts` (`Pdf.generate`, proxies `POST /api/pdf` to the PDF
  worker). Local secrets: `AUTOMATED_EMAILS_SERVICE_AUTH_TOKEN` (emails worker
  body token) and `PDF_SERVICE_AUTH_TOKEN` (PDF worker bearer token) — each
  must match the corresponding worker's `SERVICE_AUTH_TOKEN`. Do not reintroduce
  service URLs or shared-token secrets in code.
- PDF generation is delegated to the Cloudflare Worker `byzantini-website-pdf-gen`
  (`services/pdfWorker`; templates+font bundled in its assets). The browser
  client `lib/pdf.client.ts` posts to the site's `Pdf.generate` route
  (`POST /api/pdf`, session-cookie authenticated), which proxies through the
  `PDF_SERVICE` binding with `Authorization: Bearer <PDF_SERVICE_AUTH_TOKEN>`.
  The old Docker/Cloud Run service and direct browser→worker URL are retired
  and must not be referenced.
- Image thumbnails (announcements) are generated in-process on the Cloudflare
  Images binding (`IMAGES` in `wrangler.jsonc`) via `lib/images.ts`
  (`compressImageForThumb`) — the old `services/imageCompression`
  Docker/Cloud Run service is deleted and must not be referenced.

## Secrets policy (hard rules)

- `.dev.vars`, `.env`, `.env.production`, `tests/.env.test`,
  `email/credentials.json` and any `**/.env*` are gitignored and must NEVER
  be: committed, copied into source files, or have their values printed into
  diffs/logs/chats.
- Never write real credentials or tokens into code, tests or docs. Use env
  vars / placeholders.
- If you see a credential that was committed historically, flag it for the
  owner to rotate — do not "fix" it silently in the same commit.

## Coding conventions

- TypeScript: TypeScript 6.0.3 (pin in `package.json`), config extends
  `astro/tsconfigs/strict`, `noEmit`. Keep path aliases from `tsconfig.json`
  (`@routes/*` → `lib/routes/*`, `@utilities/*`, `@hooks/*`, `@env/*`,
  `@bucket/*`, `@lib/*`, `@_types/*`, `@components/*`, `@layouts/*`,
  `@pages/*`). `baseUrl` is gone (deprecated in TS 6, non-functional in TS 7)
  — `paths` targets are relative (`./lib/...`). Prefer `@utilities/*`/`@lib/*`
  over relative imports inside `lib/`.

### TypeScript 6 gotchas (do not "fix" these back)

- `types/helpers.ts` `IsAny` uses the function-variance form; the classic
  `0 extends 1 & T ? true : false` mis-evaluates when `T` is a generic
  parameter instantiated with `any` under TS 6 and silently breaks every
  `EndpointRoute<any, any>` / `AnyEndpoint` check (mass error cascade).
- Solid ref variables use definite assignment (`let el!: HTMLDivElement`)
  because TS 6 narrows closure captures; a `let x: T | undefined = undefined`
  ref becomes `never` inside `onMount` callbacks.
- `astro` no longer exports `ComponentInstance` (Astro 5) — use
  `astroHTML.JSX.Element` (see `src/components/other/Popup.astro`).
- Formatting: tabs, print width 100, `bracketSameLine` (`.prettierrc`);
  `.editorconfig` requires tab indentation and UTF-8. **Caveat:** the existing
  codebase is not fully prettier-formatted and `src/pages/kathigites/index.astro`
  currently fails the astro prettier plugin's parser (`< />` empty tag) — do
  NOT run `bun run format` repo-wide as part of a change; instead format only
  the files you touch (`bunx prettier --write <files>`).
- Do not touch `dist/`, `.astro/`, `.cache/`, `.wrangler/` — generated.
- User-facing text is Greek — preserve existing Greek labels and wording; add
  Greek for new UI strings, do not translate existing ones.
- Solid components use `.solid.tsx`, Astro components use `.astro`.

## Tests

- Test files: `tests/api/*.test.ts`; helpers in `tests/testHelpers.ts`
  (`useTestAPI(...)`).
- Tests require `tests/.env.test` (`VITE_URL`, `TEST_EMAIL`, `TEST_PASSWORD`)
  and a running dev API server; run `bun run test` after touching an API
  endpoint.
- `TEST_EMAIL` / `TEST_PASSWORD` come from the test env files — never hardcode
  them.

## Adding a new API endpoint (checklist)

1. Add the route to the group file in `lib/api/routes/<group>.ts`:
   `new APIServer({ method, path, schema?, responseSchema?, multipart?, rawBlob? }, [authenticateMiddleware?], handler)`
   (zod schema — reuse/extend `lib/api/schemas.ts`; Greek messages).
2. Export it from the group's `xxxRoutes` object — the registry, `API`/`APIEndpoints`
   maps and `APIArgs`/`APIResponse` types update automatically.
3. Call it from the app with `useAPI("Group.endpoint", payload)`.
4. Add tests under `tests/api/` and run `bun run test`.

## Do / Don't

- DO: extend existing route groups and utilities instead of adding new
  transport/API layers; use `handlerResult` for handler error handling.
- DO: run `bun run typecheck` before declaring a change done; run targeted
  tests for API changes.
- DO: keep diffs minimal and focused; don't reformat unrelated files.
- DON'T: run any `wrangler deploy`/`d1 ... --remote` command as part
  of routine work or to "verify" a change (deploys require real credentials).
- DON'T: use `npm`/`npx`/`yarn`; use `bun`/`bunx`.
- DON'T: restart or rewrite parts of the architecture that work (database
  layer, route assembly, bucket abstraction) without an explicit request.
- DON'T: commit generated files, env files, snapshots, `bucket/`,
  `dbSnapshots/`, `notAssets/`, `public/images`, `email/` — they are
  gitignored on purpose.
