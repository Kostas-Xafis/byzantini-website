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

> The Pages → Workers and Turso → D1 migration is complete; its plans, runbooks
> and tooling live in git history only. The facts it established that still
> matter are under **Platform gotchas** below. Open improvements are tracked in
> `docs/IMPROVEMENTS.md`.

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
  config in `wrangler.jsonc`; manual deploys via `bun run cf deploy`
  (CI/Pages integration is retired).
- Env: server-side runtime values via `cloudflare:workers` env (bindings + CF
  secrets/vars in prod) merged with `import.meta.env`; **dev values live in
  Vite-native `.env`** (gitignored — Bun/Vite auto-load it, `getEnv()` merges
  both views). The site no longer uses `.dev.vars` (deleted 2026-09; pure-
  wrangler services still do — wrangler dev reads secrets only from their
  `.dev.vars`). `.env.production` holds prod mirrors; only `VITE_`/`PUBLIC_`
  are inlined client-side.
- TS config: `tsconfig.json` extends `astro/tsconfigs/strict`, no emit;
  runtime types from generated `worker-configuration.d.ts` (`bun run types`).
  `include` covers `lib`, `src`, `types` and `scripts` (the old `scritps` typo
  meant `scripts/` was never typechecked).

## Command reference (use Bun)

Core loop:

| Task | Command | Notes |
| --- | --- | --- |
| Install | `bun install` · `bun run services:install` | real lockfile is `bun.lock`; the workers keep their own `bun.lock` (not workspaces) |
| Dev server | `bun run dev` | Astro dev, port **4321** |
| Build | `bun run build` | production build |
| Types | `bun run types` | regenerate `worker-configuration.d.ts` after `wrangler.jsonc` changes |
| Typecheck | `bun run typecheck` | TypeScript 7 native `tsc --noEmit` (~2 s; fast gate for every change) · `bun run typecheck:ts6` runs the same check on TS 6 (~10 s) |
| Astro check | `bun run astro-check` | `astro check` (slower, more rules; 15 pre-existing errors) |
| Full gate | `bun run check` | contract drift check + typecheck + tests |
| Unit tests | `bun test tests/unit` | no dev server needed |
| API contract | `bun run api:contract` · `--check` | regenerate / verify `lib/api/contract.ts` |
| Bundle guard | `bun run check:bundle` | after `bun run build`: no server code in `dist/client` |
| Worker gates | `bun run services:typecheck` · `bun run services:test` | both workers' typechecks; the pdfWorker's golden-PDF suite and the emailWorker's offline campaign suite (never sends) |
| Tests | `bun run test` | site suite (`tests/` only); needs the dev server (the sysusers suite also needs the emails worker running locally — `createRegisterLink` sends the invite; the pdf suite needs the PDF worker started **before** the dev server); env from tests/.env.test, 10s per test timeout |
| Format | `bun run format` | prettier (tabs, width 160) over source dirs — see note below |
| Format check | `bun run format:check` | fails on the existing repo; use on files you touch only |

Database tooling (wrangler D1 commands — local dev database is the miniflare
SQLite at `.wrangler/state/v3/d1`):

| Task | Command | Notes |
| --- | --- | --- |
| Query dev DB | `bun run db:query -- "SELECT 1"` | `wrangler d1 execute DB --local` |
| Query remote DB | `bun run db:query:prod -- "..."` | production D1 |
| Recent query logs | `bun run db:logs` | |
| Export prod DB | `bun run db:replicate` | `wrangler d1 export` (remote) |
| Reset dev DB | `bun run db:reset` | wipes local D1, rebuilds it from `dbSnapshots/dev-snapshot.sql`, then applies any pending migrations |
| Apply migrations | `bunx wrangler d1 migrations apply DB --local` | fresh checkouts after `bun install` |
| Clean test fixtures | `bun run dev:clean` | removes the rows `bun run test` writes to the local dev DB (test pupils, their enrollments, `pupils.test.*` subscriptions) and re-derives `total_enrollments`; **applies** (the script alone, `bun scripts/cleanDevTestData.ts`, is a dry run). The pupils/fees suites already delete their own pupils and pick test ΑΜs with `uniqueTestAm()` (`tests/localDb.ts`) |
| Fees backfill | `bun run fees:backfill` · `-- --apply` | pins the 2026-2027 fee catalog on that year's enrollments and computes their fees (`scripts/feesBackfill.ts`, docs/FEES.md §4); dry run + per-pupil report by default; `--remote` targets production — never as routine work |

Aux services (separate Cloudflare Workers in `services/`, **part of this
repository** since 2026-10 — the old `Byz-PdfWorker` / `Automated-Mails-Byz`
repos are retired; pdfWorker kept its history, emailWorker came in as a
snapshot). Each has its own `package.json`/`bun.lock`/`wrangler.jsonc` and
deploys on its own — run wrangler from inside the folder with
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
`bun run cf deploy` (build + `wrangler deploy --config dist/server/wrangler.json`)
or `bun run cf deploy:preview`. Deployed worker names are adapter-suffixed —
`byzantini-website-production` / `byzantini-website-preview` (the bare
`byzantini-website` has no worker); target those for `wrangler secret`/`tail`.

## API architecture (project-critical, preserve the pattern)

- Routes are **instances** of `APIServer` (Isokratis-style) in
  `lib/api/routes/<group>.ts` — each exports a `xxxRoutes` object with the
  route keys (`Books.get`, `Authentication.userLogin`, ...) the app uses.
  Contracts live on the instance: `{ method, path, schema?, responseSchema?, multipart?, rawBlob? }`.
  `APIRoute` (`lib/api/routes/APIRoute.ts`) is the base class (contract,
  registry, path matching); `APIServer` adds handler, middleware and dispatch.
- Central registry: `lib/api/routes/index.ts` imports every group (which
  registers the routes) and exposes `routeGroups`, `routeEntries()`,
  `getRoute(name)`. It is **server-only** — never import `@lib/api/routes`
  from browser code.
- **Client contract (generated):** `lib/api/contract.ts` = `APIEndpoints`
  (`endpoint → { method, path, multipart, rawBlob }`), written by
  `bun run api:contract` from the registry — **regenerate it after adding,
  removing or re-pathing a route**. `lib/api/types.ts` derives
  `APIEndpointNames`/`APIArgs`/`APIResponse` with `import type` only (never
  add a value import there) and holds the compile-time drift check
  (`ContractInSync`); `tests/unit/apiContract.test.ts` and `bun run check`
  (`api:contract --check`) catch the rest. `lib/routes/index.client.ts` is the
  stable browser import path (`API`, `APIEndpoints`, types).
- `src/pages/api/[...slug].ts` is the single API entrypoint:
  `APIServer.handle(request, "/api")` — route match, middleware (auth, rate
  limit — runs **before** body validation, so anonymous callers get 401, not a
  validation report), Zod validation (JSON or multipart-with-coercion),
  handler, response validation, all inside one try/catch.
- Path params arrive percent-decoded; `[name:number]` params are numbers (a
  non-decimal segment does not match → 404). `body` is `z.output` of the
  route's schema (`unknown` without one — declare a schema to read a body).
- **Errors:** every `/api` response is a JSON envelope
  `{ data } | { message } | { error, details? }`. Handlers throw `APIError`
  (`lib/api/routes/APIError.ts`: `badRequest` 400, `forbidden` 403,
  `notFound` 404, `conflict` 409, `gone` 410) for expected failures — its
  message is public (Greek, no SQL). Anything else is `console.error`-logged
  and the caller gets the route's `handlerResult` message or "Σφάλμα
  διακομιστή" with 500. Unknown path → 404, wrong method → 405 (`Allow`),
  invalid body → 400 with treeified `details` (the registration form maps them
  to fields).
- Callers: frontmatter uses `useAPI(endpoint, req, Astro)` from
  `lib/hooks/useAPI.server.ts` — dispatches **in-process** (no self-fetch —
  Cloudflare error 1042, see Platform gotchas). Browser code uses `apiCall`
  (`lib/hooks/apiCall.ts`), `useAPIClient` or `createAPIResource`; they share
  the codec in `lib/api/transport.ts` and throw `APIRequestError` (`status`,
  `details`) — a network failure stays fetch's `TypeError`.
- `bun run check:bundle` (after `bun run build`) fails if server-only markers
  (SQL, `cloudflare:workers`, env names) reach `dist/client`.
- Validation uses **Zod** (`astro/zod`) — schemas in `lib/api/schemas.ts`;
  entity types in `types/entities.ts` are `z.infer`s of them (type-only).

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
  refactored to `db.batch(...)` or made idempotent (D1 sessions expose no
  commit/rollback either — never emulate rollback).
- Prefer SQL parameterization; never interpolate user input into SQL strings.
- Schema changes go through `migrations/NNNN_*.sql` +
  `wrangler d1 migrations apply DB --local` (never ad-hoc DDL in route code).

## Platform gotchas (verified — do not re-research)

- **Cloudflare error 1042**: a Worker that `fetch`es its own origin fails on the
  real edge (works in miniflare). Server-side code must dispatch API calls
  in-process (`lib/hooks/useAPI.server.ts` → `APIServer.handle`), never
  `fetch(origin + "/api/...")`.
- **D1 has no transactions** (no interactive transactions, sessions have no
  commit/rollback): atomic multi-statement flows use `db.batch([...])`.
- **`@astrojs/cloudflare` v14**: no `locals.runtime.env` (`Runtime` is
  `{ cfContext }`); server env comes from `cloudflare:workers` through the
  guarded bridge `lib/env/runtime.ts` (guarded because `bun test` runs outside
  workerd). The build emits `dist/server/entry.mjs` + `dist/server/wrangler.json`
  and **wipes `dist/server/`**, so derived deploy configs (preview) must be
  generated after the build (`scripts/cf.ts` does).
- **Wrangler persistence is config-relative**: with `--config dist/server/wrangler.json`
  local state lands in `dist/server/.wrangler` unless `--persist-to .wrangler/state`
  is passed (`scripts/cf.ts` passes it).
- **Cross-site form check** (Astro's `security.checkOrigin` rule, now applied by
  `src/middleware.ts` so Apple's callback can be exempted) rejects form/multipart
  POSTs without an `Origin` header (403) — `tests/testHelpers.ts` sends `Origin: VITE_URL`.
- Running `bun run build` while `bun run dev` is up repoints
  `.wrangler/deploy/config.json` at `dist/server`; restart the dev server after.
- `bun run astro-check` reports 15 pre-existing errors (Links shareImage alt,
  8 DOM-append errors in `AnnouncementsPreview.astro`, spoudastiria
  `LocationRow.priority`, anakoinoseis `PageAnnouncement`/`key` prop/`Element.src`).
  Compare the error list, not just the count, when you touch `.astro` files.
- Reference architecture: `~/Projects/Isokratis` (read-only — never edit it).

## Pupil register (Μαθητολόγιο)

The person data that used to live on `registrations` is split into two tables
(migration `0002_pupils.sql`); the legacy `registrations` table was dropped in
`0003_drop_registrations.sql`. Name/phone/ΑΜ normalisation lives in
`lib/pupils/normalize.ts` (unit-tested in `tests/unit/`).

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
- **Fees (Δίδακτρα, docs/FEES.md)**: «Υπό Κατάταξη» is the `evaluation`
  status (`class_year = ''` until placement; display via `classYearLabel`
  in `lib/classYears.ts`), not a class year. Prices come from the versioned
  `fee_catalogs` (settings) + `fee_catalog_rules` (price rules with
  precedence, migration 0007; `fee_catalogs.data` is legacy, never read) —
  routes `FeeCatalog.*`; each enrollment pins the catalog
  active at registration (`fee_catalog_id`). The pure calculation is
  `lib/fees` (client-safe); `lib/fees/recalculate.server.ts` recalculates a
  pupil-year after every enrollment write (`Pupils.post/enroll/
  updateEnrollment/deleteEnrollments`) — never write `total_payment` of a
  pinned enrollment by hand except as a manual price (`fee_manual`).
- The secretaries resolve the remaining review cases in the admin
  Μαθητολόγιο page (the «Μόνο προς έλεγχο» filter + «Σημείωση ελέγχου»;
  deep link `/admin/pupils?review=1`); `bun run dev:clean` removes the
  fixtures the API suite writes to the local dev DB.
- **«Αρχική» dashboard** (`TotalsTable.solid.tsx`): «Χρειάζονται προσοχή»
  tiles from `Pupils.dashboardSummary` (`GET /pupils/dashboard/<since>`, one
  statement): pupils to review, unpaid fees of the current school year
  (`payment_amount < total_payment`), public-form enrollments after `since`.
  `since` is the admin's previous visit, remembered per device in
  `localStorage` (`admin-dashboard-visits`; a new visit starts after 30 min
  away, the first one counts the last 7 days).

## Admin authentication (sign-in, sessions, providers)

Migration `0008_auth_identities_sessions.sql`; code in `lib/auth/` (server-only
except `oauth.client.ts`) and `lib/api/routes/authentication.ts`.

- **Sessions** (`lib/auth/sessions.ts`): one `sys_user_sessions` row per
  device; the HttpOnly `session_id` cookie holds a random token and the table
  stores only its **SHA-256** (`id`). Signing in on a second device never
  signs the first out; logout ends only the current device. A per-isolate
  cache (60 s) keeps lookups cheap — a revoked session dies everywhere within
  that window. `sys_users` no longer has `session_id`/`session_exp_date`;
  routes get the admin with `currentSession(cookies)` (`middleware/authenticate.ts`),
  never by querying a session column.
- **Passwords** (`lib/auth/passwords.ts`): PBKDF2-SHA256, format
  `pbkdf2$<iterations>$<salt>$<hash>` (workerd caps iterations at 100 000).
  Legacy `<sha256>:<salt>` hashes (SHA-256 over password + `SECRET` + salt)
  still verify and are re-hashed on the next sign-in — **do not rotate
  `SECRET` until every admin has signed in once** after 0008, or their legacy
  hashes stop verifying. `password = ''` means "no password"
  (provider-only admin). New passwords: ≥ 8 chars (`z_NewPassword`).
- **Providers** (`lib/auth/providers.ts`, on `arctic`): Google, Apple,
  Microsoft — each enabled only when its env vars are set (`types/env.ts`).
  Accounts are matched on `sys_user_identities (provider, subject)`, never on
  the email the provider reports (Microsoft's `email` is unverified; Apple may
  give a private-relay address). The only email match left is the one-time
  adoption of **pre-0008 Google admins** (`sys_users.google_email_match = 1`,
  verified Google email); connecting or disconnecting Google clears it.
- **OAuth flow**: `Authentication.oauthStart` (`intent`: `login` | `signup`
  with an invite `link` | `link` = connect to the signed-in admin) sets the
  HMAC-signed `oauth_flow` cookie (`lib/auth/oauthFlow.ts`; carries state,
  PKCE verifier, admin id, redirect) → provider →
  `src/pages/oauth2callback/[...provider].astro` (`/oauth2callback` for
  Google — the URI registered in Google Cloud — `/oauth2callback/<id>` for the
  others) → in-process `Authentication.oauthCallback` (`dispatchAPI` in
  `useAPI.server.ts` forwards its `Set-Cookie`). The page continues with a
  script, not a 302: the session cookie is `SameSite=Strict` and would not be
  sent on a redirect chain that started on the provider's site. Apple returns
  with a **cross-site form POST**, so Astro's `security.checkOrigin` is off and
  `src/middleware.ts` (`lib/utilities/originCheck.ts`) applies the same rule
  with that one path exempted; Apple's flow cookie is `SameSite=None; Secure`.
- **«Ο λογαριασμός μου»** (`/admin/account`, `AccountPage.solid.tsx`): connect /
  disconnect providers (the last way in cannot be removed), set or change the
  password (only the new one, twice — the current password is never asked or
  shown, by owner decision), list and sign out devices. A password change signs out every other device. The signed-in admin
  in the UI comes from `Authentication.me` (`src/components/admin/currentUser.ts`),
  not `localStorage` (the old `sys_user` key is removed on sight).
- **Ended sessions** (`lib/auth/sessionExpiry.client.ts`): any 401 in the
  dashboard (`apiCall`, `lib/pdf.client.ts`) and a re-check whenever the tab
  becomes visible again (`AdminLayout`) send the admin to
  `/login?redirect_url=…&expired=1` («Η συνεδρία σας έληξε»), and back to the
  same page after signing in. `admin/[...slug].astro` adds `expired=1` when a
  stale cookie is present.
- **«Ξεχάσατε τον κωδικό;»** (`/login/forgot` → email →
  `/login/reset/<token>`): `Authentication.requestPasswordReset` (same answer
  whether or not the email is an admin; rate-limited), `validatePasswordReset`,
  `resetPassword` (one-time: `DELETE … RETURNING`; signs every device out and
  this one in). Links last 1 hour; `sys_user_password_resets` stores only the
  token's SHA-256 (0008). Email template `sysuser_password_reset.html`
  (`services/emailWorker/render/emails/SysuserPasswordReset.tsx`) — **publish it
  with `bun run templates:build --prod` before deploying**, or reset emails fail
  (the page still answers the generic message; the error is logged).
- **Admin invites** (`SysUsers.createRegisterLink`, «Διαχειριστές»): a 24-hour
  link bound to the invited email, used up on signup. `sys_user_register_links`
  (recreated in 0008) stores only the link's **SHA-256** (`id`) plus `email`,
  `invited_by`, `created_at`, `expires_at`; one pending invite per email (a new
  invite replaces the old link). «Εκκρεμείς προσκλήσεις» under the admins table
  (shown only while some exist): `SysUsers.getInvites` (unexpired, never the
  link), `resendInvite` (new link + another 24 h; the old link dies) and
  `revokeInvite` (by email) — open to every admin, like inviting. Invites sent
  before 0008 are dropped by the migration: re-send them after deploying.
- **Roles** (`lib/auth/roles.ts`, client-safe; `sys_users.role` in 0008):
  `sysadmin` (the maintainer) · `owner` (the school's owner) · `secretary`
  (the secretariat). `PERMISSIONS` lists the only restricted features —
  `queryLogs` (sysadmin), `feeCatalog`, `activityLog` and `deleteAdmins` (sysadmin + owner),
  `manageRoles` (sysadmin); **everything else is open to every signed-in
  admin**. Routes enforce them with `requirePermission("…")` after
  `authenticateMiddleware`; the UI reads `Authentication.me().permissions` to
  hide what an admin cannot use (`restricted(...)` in `AdminRouter` for typed
  URLs). Every new account (invite, password or provider signup) is a
  `secretary`; roles change only through `SysUsers.setRole` (sysadmin, never
  one's own role). Only a sysadmin may delete a sysadmin and at least one
  always remains. The role is cached with the session (60 s per isolate).
  To add a restricted feature: a `PERMISSIONS` entry + `requirePermission` on
  its routes + a `permissions.<name>` check in the UI.
- **Activity log** («Ιστορικό ενεργειών», `/admin/activity`, sysadmin + owner):
  `APIServer.afterWrite` (installed by the registry, which also sets each
  route's `endpoint` key) calls `lib/activity/record.server.ts` after every
  successful non-GET request; only endpoints listed in
  `lib/activity/labels.ts` (`ACTIVITY_LABELS`, Greek labels) by a signed-in
  admin are written to `sys_activity` (0008) with the admin's email, the label
  and a short target summary (ids, a title/name — never passwords or whole
  bodies). Rows are kept 2 years. **Adding a route that changes data? Add it
  to `ACTIVITY_LABELS`** (`tests/unit/activity.test.ts` checks every entry is
  a real non-GET route). Routes: `Activity.list` (cursor + admin/category
  filters), `Activity.admins`. `query_logs` stays the raw SQL trace (sysadmin).
- **Provider setup** (secrets in `.env` for dev, `wrangler secret put` for
  production; redirect URIs `https://<host>/oauth2callback[/<id>]`):
  `GOOGLE_CLIENT_ID/SECRET`; `APPLE_CLIENT_ID` (Services ID), `APPLE_TEAM_ID`,
  `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (the `.p8` PEM; Apple needs a paid
  developer account and does not accept `localhost` redirect URIs);
  `MICROSOFT_CLIENT_ID/SECRET` (+ optional `MICROSOFT_TENANT`, default
  `common`).

## Env, storage and external services

- Server-side env comes from the `cloudflare:workers` env module
  (`lib/env/runtime.ts` bridge) — never ad-hoc globals. Vars and secrets are
  read with `getEnv()` (`lib/env/env.ts`): `import.meta.env` merged **once**
  (memoised, frozen) with the runtime env, runtime wins, values are **not
  coerced** (strings stay strings). Bindings (`DB`, `S3_BUCKET`,
  `EMAIL_SERVICE`, ...) come from `runtimeEnv` / the handler `env`. **Site dev values live in `.env`** (gitignored, auto-loaded by
  Bun/Vite): `SECRET`, `GOOGLE_CLIENT_ID/SECRET` (+ optional `APPLE_*`,
  `MICROSOFT_*` — see Admin authentication), `GOOGLE_MAPS_KEY`,
  `AUTOMATED_EMAILS_SERVICE_AUTH_TOKEN`, `PDF_SERVICE_AUTH_TOKEN`.
  The public-route rate limiter (`lib/api/routes/middleware/rateLimit.ts`) skips
  loopback clients, so local dev and `bun run test` are never throttled; set
  `RATE_LIMIT_LOCAL=1` in `.env` only when testing the limiter itself.
  Production runtime secrets stay **Cloudflare secrets** (`wrangler secret
  put`, never in files). The site has **no `.dev.vars`**; pure-wrangler
  services (pdfWorker/emailWorker dev) still keep theirs.
- `VITE_`/`PUBLIC_` client vars come from Vite-native `.env` files
  (gitignored; `.env` for dev, `.env.production` for builds). `.env.production`
  also mirrors the prod token pairs for archival/recovery — only
  `VITE_`/`PUBLIC_` keys are ever inlined client-side; non-prefixed keys are
  NOT inlined into the worker (runtime reads them from the CF secret).
- Who may do what is decided by **roles** (`sys_users.role`, see Admin
  authentication), never by comparing emails. The old `@env/ownerEmail` /
  `VITE_OWNER_EMAIL` is gone (the variable may stay in `.env`; nothing reads it).
- Storage goes through `Bucket` (`lib/bucket/index.ts`) — always the R2
  binding `S3_BUCKET`: real R2 in production, miniflare-emulated locally
  (`.wrangler/state/v3/r2`). Dev data comes from `bun run replicate:bucket`,
  which wipes the local store and seeds it from production (D1-style) plus a
  `bucket/YY-MM-DD/` archive; restart the dev server after replicating.
  Never access the binding directly in route code. `Bucket` methods are
  context-free (`Bucket.put(data, key, type)`); `list` paginates past 1000
  keys; `move` copies first, deletes the source only after, keeps the source's
  metadata and is a no-op onto the same key.
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

- TypeScript: **two pinned compilers**. `typescript` 6.0.3 stays the package
  every tool imports (`@astrojs/check` → `bun run astro-check`, editors'
  tsserver), because TS 7 ships no classic JS API. `typescript7`
  (`npm:typescript@7.0.2`, the Go-native compiler) only runs the CLI checks:
  `bun run typecheck` and the workers' `typecheck`/`typecheck:cli` call
  `node_modules/typescript7/bin/tsc` **by path** (both packages declare a
  `tsc` bin; `node_modules/.bin/tsc` is TS 6). Each worker has its own
  `typescript7` devDependency. Config extends `astro/tsconfigs/strict`, `noEmit`;
  keep it TS 7-valid (no `baseUrl`, relative `paths`). Keep path aliases from `tsconfig.json`
  (`@routes/*` → `lib/routes/*`, `@utilities/*`, `@hooks/*`, `@env/*`,
  `@bucket/*`, `@lib/*`, `@_types/*`, `@components/*`, `@layouts/*`,
  `@pages/*`). `baseUrl` is gone (deprecated in TS 6, non-functional in TS 7)
  — `paths` targets are relative (`./lib/...`). Prefer `@utilities/*`/`@lib/*`
  over relative imports inside `lib/`.

### TypeScript 6/7 gotchas (do not "fix" these back)

- `types/helpers.ts` `IsAny` uses the function-variance form; the classic
  `0 extends 1 & T ? true : false` mis-evaluates when `T` is a generic
  parameter instantiated with `any` under TS 6 and silently breaks every
  `EndpointRoute<any, any>` / `AnyEndpoint` check (mass error cascade).
- Solid ref variables use definite assignment (`let el!: HTMLDivElement`)
  because TS 6 narrows closure captures; a `let x: T | undefined = undefined`
  ref becomes `never` inside `onMount` callbacks.
- `astro` no longer exports `ComponentInstance` (Astro 5) — use
  `astroHTML.JSX.Element` (see `src/components/other/Popup.astro`).
- Formatting: tabs, print width 160, `bracketSameLine` (`.prettierrc`);
  `.editorconfig` requires tab indentation and UTF-8. **Caveat:** the existing
  codebase is not fully prettier-formatted and `src/pages/kathigites/index.astro`
  currently fails the astro prettier plugin's parser (`< />` empty tag) — do
  NOT run `bun run format` repo-wide as part of a change; instead format only
  the files you touch (`bunx prettier --write <files>`).
- **Always do a format pass before committing**: run prettier on the files
  the commit changes, e.g.
  `bunx prettier --write $(git diff --cached --name-only --diff-filter=ACMR -- '*.ts' '*.tsx' '*.astro' '*.mjs' '*.css' '*.json')`,
  then re-stage them. Markdown docs are not prettier-formatted — leave them
  out. Skip a file only if prettier can't parse it (e.g.
  `src/pages/kathigites/index.astro`) and say so.
- Do not touch `dist/`, `.astro/`, `.cache/`, `.wrangler/` — generated.
- User-facing text is Greek — preserve existing Greek labels and wording; add
  Greek for new UI strings, do not translate existing ones.
- Solid components use `.solid.tsx`, Astro components use `.astro`.
- **Dashboard colours are tokens** (`src/styles/global.css` `@theme`, dark values
  in the `.dark` block below it): `bg-page`, `bg-surface`, `bg-surface-muted`,
  `bg-surface-sunken`, `text-ink`, `text-ink-muted`, `border-line`, `bg-brand` /
  `text-brand` / `text-brand-ink` / `bg-brand-hover`, `bg-accent-soft`. Use them
  in admin UI instead of `bg-white dark:bg-dark`-style pairs or new hex values.
  The panel pages (`Panel.solid.tsx`) and the shared table (`table/*`,
  `SearchTable`, `Modal`) are on them; `AdminLayout`'s legacy
  `html.dark .bg-white` patch now resolves to `--color-surface`, so components
  not migrated yet still match — migrate them as you touch them.

## Tests

- Test files: `tests/api/*.test.ts` (need the dev server) and
  `tests/unit/*.test.ts` (no server); helpers in `tests/testHelpers.ts`
  (`useTestAPI(...)`, `testEnv`) and `tests/rawAPI.ts` (anonymous raw requests
  for 401/404/405/malformed-input tests). Response-shape assertions are zod:
  `expectBody(json, schema)` takes the schemas from `lib/api/schemas.ts`
  (test-local `z.object(...)` only for narrower shapes).
- Tests require `tests/.env.test` (`VITE_URL`, `TEST_EMAIL`, `TEST_PASSWORD`)
  and a running dev API server; run `bun run test` after touching an API
  endpoint.
- `TEST_EMAIL` / `TEST_PASSWORD` come from the test env files — never hardcode
  them.
- **PDF golden hashes**: the PDF worker's output is a pure function of the
  request (no metadata timestamps; the printed school year comes from
  `registration_year`), so each dummy fixture in
  `services/pdfWorker/tests/fixtures/registrations.ts` has one exact SHA-256 in
  `fixtures/golden.json`. `services/pdfWorker/tests/pdf.test.ts` checks it
  in-process (no wrangler); `tests/api/pdf.test.ts` checks the same hashes
  through `/api/pdf` → `PDF_SERVICE` → the local worker. Both also assert the
  PDF is filled (parseable, page count, embedded DidactGothic, size floor), so
  a blank or truncated PDF fails. After an **intended** change to the PDF
  layout, templates, font or pdf-lib version: `cd services/pdfWorker && bun run
  test:update-golden`, inspect `tests/__output__/*.pdf` (gitignored), then
  commit the new `golden.json`. Never update the golden to silence a failure
  you have not looked at.

## Adding a new API endpoint (checklist)

1. Add the route to the group file in `lib/api/routes/<group>.ts`:
   `new APIServer({ method, path, schema?, responseSchema?, multipart?, rawBlob? }, [authenticateMiddleware?], handler)`
   (zod schema — reuse/extend `lib/api/schemas.ts`; Greek messages; throw
   `APIError` for expected failures).
2. Export it from the group's `xxxRoutes` object — the registry and the
   `APIArgs`/`APIResponse` types update automatically.
3. Run `bun run api:contract` to regenerate the client contract
   (`lib/api/contract.ts`) — `typecheck` fails until you do.
4. Call it with `apiCall("Group.endpoint", payload)` in browser code or
   `useAPI("Group.endpoint", payload, Astro)` (`useAPI.server.ts`) in frontmatter.
5. Add tests under `tests/api/` and run `bun run test`.

## Do / Don't

- DO: extend existing route groups and utilities instead of adding new
  transport/API layers; use `handlerResult` for handler error handling and
  `APIError` for expected failures (never return raw DB error text).
- DO: run `bun run typecheck` before declaring a change done; run targeted
  tests for API changes.
- DO: keep diffs minimal and focused; don't reformat unrelated files.
- DO: run a prettier format pass on the changed files before every commit.
- DON'T: run any `wrangler deploy`/`d1 ... --remote` command as part
  of routine work or to "verify" a change (deploys require real credentials).
- DON'T: use `npm`/`npx`/`yarn`; use `bun`/`bunx`.
- DON'T: restart or rewrite parts of the architecture that work (database
  layer, route assembly, bucket abstraction) without an explicit request.
- DON'T: commit generated files, env files, snapshots, `bucket/`,
  `dbSnapshots/`, `notAssets/`, `public/images`, `email/` — they are
  gitignored on purpose.
