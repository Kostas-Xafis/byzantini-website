# Copilot Instructions for Byzantini-Website

> **Source of truth:** `AGENTS.md` at the repo root is the canonical AI
> guidance file (read by Codex, Cursor, Claude Code, Zed, Windsurf, ...).
> This file is the GitHub Copilot mirror — keep it in sync with `AGENTS.md`.

## Runtime + app shape
- Use Bun everywhere (`bun run ...`, `bun test ...`), not npm/yarn.
- Main web app: Astro 7 + Solid + Tailwind 4 on Cloudflare Workers
  (`astro.config.mjs`, `wrangler.jsonc`); dev port is 4321.
- API entrypoint is the catch-all route `src/pages/api/[...slug].ts`
  (maps slug + HTTP method to route metadata).

## API architecture (project-critical)
- Routes are `APIServer` instances in `lib/api/routes/<group>.ts` exporting a
  `xxxRoutes` object (`new APIServer({method, path, schema?, responseSchema?,
  multipart?, rawBlob?}, [authenticateMiddleware], handler)`); validation is
  Zod (`astro/zod`, `lib/api/schemas.ts`).
- `lib/api/routes/index.ts` imports all groups and builds `API`/`APIEndpoints`
  + `APIArgs`/`APIResponse`; `lib/routes/index.client.ts` re-exports them.
- Entry: `src/pages/api/[...slug].ts` → `APIServer.handle(request, "/api")`;
  envelope `{ data } | { message } | { error }` with real HTTP statuses.
- `useAPI` from `lib/hooks/useAPI.astro.ts` (server: in-process dispatch) or
  `lib/hooks/useAPI.solid.ts` (browser); keys look like `Authentication.userLogin`.

## Middleware, validation, and responses
- Use `handlerResult(...)` for handler returns/errors (`lib/api/routes/APIServer.ts`);
  it runs the 1-arg form inside the D1 transaction shim, maps a string result to
  `{ message }` and anything else to `{ data }`.
- Middleware is attached per route via the `APIServer` middleware array
  (`authenticateMiddleware` from `lib/api/routes/middleware/authenticate.ts`).
- Validation is Zod, declared on the route instance (`schema` for requests,
  `responseSchema` for the `{ data }` payload).

## Pupil register (Μαθητολόγιο)
- Person data lives in `pupils` (identity, keyed by ΑΜ) + `pupil_enrollments`
  (one row per pupil / year / music type / instrument); the legacy
  `registrations` table was dropped. See `docs/PUPILS_MIGRATION.md`.
- `pupils.am` is an INTEGER and NULL for review cases (`orphan_code` `000-Ο1`…,
  `split_from_am` `111-Σ1`…); `registration_url` on the pupil is permanent.
- Routes are `Pupils.*`; enrollment listings return the JOINED row
  (`z_JoinedEnrollments`) which keeps the old `registrations` wire shape (with
  `am` as a string) for the admin table and the PDF/Excel exports.
- Newsletter routes are `EmailSubscriptions.*` but deliberately keep their
  public paths (`/registrations/email-*`) — they are inside sent emails.

## Database + transactions
- Access DB through `executeQuery(...)` / `executeTransaction(...)`
  (`lib/utils.server.ts`) and `getDb`/`dbExec` (`lib/db.ts`); the D1 binding
  comes from `cloudflare:workers` env.
- SQL supports `???` placeholder expansion (`questionMarks` in `lib/db.ts`).
- **D1 has no interactive transactions** — `executeTransaction` runs
  statements immediately (no rollback); refactor rollback-sensitive flows to
  `db.batch(...)` — see `docs/MIGRATION_SPEC.md`.
- Schema changes go through `migrations/` (`wrangler d1 migrations apply
  DB --local`), never ad-hoc DDL.
- Query logging is built-in (`query_logs` writes from `lib/db.ts`); avoid
  bypassing wrappers.

## Env, storage, and external services
- Server-side env comes from `cloudflare:workers` (`lib/env/runtime.ts`
  bridge + `Env.env`, which merges `import.meta.env` with the runtime env).
  **Site dev values live in `.env`** (gitignored, auto-loaded by Bun/Vite:
  SECRET, GOOGLE_*, tokens, TURSO_*); production runtime
  secrets are Cloudflare secrets. The site has **no `.dev.vars`**; the
  pure-wrangler services keep theirs (wrangler dev reads secrets only from
  `.dev.vars`). Non-prefixed `.env.production` keys are never inlined.
- Client `VITE_`/`PUBLIC_` vars come from Vite-native `.env` files
  (gitignored).
- Owner (super-admin) email belongs in `@env/ownerEmail` (`OWNER_EMAIL`,
  `isOwnerEmail(...)`), backed by `VITE_OWNER_EMAIL` (inlined into client AND
  server bundles; hardcoded fallback in the module). Owner-only UI (global
  search, query-logs link, user deletion) must go through this module.
- Storage abstraction is `Bucket` (`lib/bucket/index.ts`): always the
  Cloudflare R2 binding `S3_BUCKET` — real R2 in production, miniflare-emulated
  locally (`.wrangler/state/v3/r2`, wiped+seeded from prod by
  `bun run replicate:bucket`; restart the dev server afterwards). No
  `bucket:serve` / HTTP store anymore.
- **Worker↔worker calls use service bindings, never HTTP URLs.** The site's
  `wrangler.jsonc` declares `EMAIL_SERVICE` (`byzantini-website-emails`) and
  `PDF_SERVICE` (`byzantini-website-pdf-gen`) at top level and under each
  named environment; handlers reach them as `Fetcher`s via the handler `env`
  (see `lib/api/routes/emailService.ts` and `lib/api/routes/pdf.ts`). Local
  `astro dev` resolves them to the workers' own `wrangler dev` sessions
  (cross-command service bindings).
- PDF generation is delegated to the Cloudflare Worker
  `byzantini-website-pdf-gen` (`services/pdfWorker`, templates+font bundled);
  `lib/pdf.client.ts` posts to the site's `Pdf.generate` route
  (`POST /api/pdf`, session-cookie auth), which proxies through the
  `PDF_SERVICE` binding with `Authorization: Bearer <PDF_SERVICE_AUTH_TOKEN>`
  (must match the worker's `SERVICE_AUTH_TOKEN` secret). The browser never
  calls the worker URL; no `VITE_PDF_SERVICE_URL`.
- Transactional emails go to the Cloudflare Worker `byzantini-website-emails`
  (`services/emailWorker` — the whole `email/` stack moved there; MailerSend
  REST API; secrets `MAILERSEND_API_KEY` + `SERVICE_AUTH_TOKEN`); the site
  calls it through the `EMAIL_SERVICE` binding with
  `AUTOMATED_EMAILS_SERVICE_AUTH_TOKEN` in the body **in every environment** —
  the dry-run decision lives in the worker (`decideDryRun`: `DRY_RUN` →
  `ENVIRONMENT` → missing API key → no `CF-Connecting-IP`), so a local
  `wrangler dev` request renders + logs the email and never sends. The worker
  reads its
  per-send templates from its own `BUCKET` R2 binding (`html_templates/<name>`,
  no `SITE_URL` HTTP fetch). The campaign CLI (`bun run campaign`) reads
  recipients from Cloudflare D1 via spawned `wrangler d1 execute --remote`
  (`src/db.ts` — uses the existing `wrangler login`, no API token/server).
- Aux workers: run wrangler from inside the `services/*` folder with
  `--config wrangler.jsonc` and WITHOUT `--bun` (the Bun runtime wedges
  wrangler dev; `--config` avoids the repo's `.wrangler/deploy` conflict).
- Shared-secret rotation: `bun run worker-secrets` (root
  `scripts/workerSecrets.ts`) sets/rotates the two matching site↔worker token
  pairs on the deployed workers (`wrangler login` required; values never
  printed) and mirrors them into the local env files (site `.env`/
  `.env.production`, the services' `.dev.vars`, emailWorker
  `.env.development`/`.env.production`).

## Workflows and conventions
- Core commands: `bun run dev`, `bun run build`,
  `bun run types`, `bun run test`, `bun run db:query -- "..."`,
  `bun run db:reset` (then re-apply migrations — the snapshot does not carry
  them), `bun run typecheck`, `bun run check`.
- Database maintenance helpers: `bun run dev:clean` removes the rows the API
  suite writes to the local dev DB; `bun run pupils:migrate` (dry run) /
  `pupils:migrate:apply` is the `registrations` → `pupils` + `pupil_enrollments`
  backfill.
- Tests use API helpers in `tests/testHelpers.ts` (`useTestAPI(...)`); env comes
  from `tests/.env.test`, 10s per-test timeout; they need the dev server (and,
  for the sysusers suite, which sends the invite email, the emails worker
  running locally on 8788).
- Preserve existing Greek user-facing messages and labels when editing related
  flows.
- Keep TS path aliases from `tsconfig.json` (`@routes/*`, `@utilities/*`,
  `@hooks/*`, `@env/*`, etc.).
- Extend existing route groups/utilities instead of introducing a new
  transport or API plumbing layer.

> Migration in progress on branch `Workers` — see `docs/MIGRATION_SPEC.md`
> and `MIGRATION_PLAN.md` for the plan and do-not-re-research facts.
