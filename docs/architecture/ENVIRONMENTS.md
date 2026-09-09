# Byzantini — Per-Environment Data & Service Map

> Companion to [`ARCHITECTURE.md`](./ARCHITECTURE.md). Snapshot taken after the
> service-bindings migration (worker↔worker HTTP removed) and the env-file
> consolidation (root `.dev.vars` deleted, dev values in `.env`). When the
> architecture moves, update this file together with `ARCHITECTURE.md` and
> regenerate `visualize.html`.
>
> Bottom line: **local dev stays local** (local SQLite, local bucket store,
> local R2 simulation, dry-run emails); **deployed environments are the only
> places with real side effects**, and the aux workers (`byzantini-website-
> emails`, `byzantini-website-pdf-gen`) are **shared single instances** — the
> preview site's DB/bucket are its own, but its emails/PDFs run on the
> production service instances.

## 0 · TL;DR

| | Local dev (`bun run dev`) | Preview worker | Production worker |
| --- | --- | --- | --- |
| Config | top-level `wrangler.jsonc` (bindings emulated) | `env.preview` → `byzantini-website-preview` | `env.production` → `byzantini-website-production` |
| Database (D1) | local SQLite `.wrangler/state/v3/d1` | `byzantini-db-preview` | `byzantini-db` |
| File storage (R2) | same binding, emulated locally `.wrangler/state/v3/r2` (seeded by `replicate:bucket`) | `byzantini-bucket-dev` | `byzantini-bucket` |
| Thumbnails | IMAGES binding, locally simulated | IMAGES (Cloudflare) | IMAGES (Cloudflare) |
| Email/PDF workers | local `wrangler dev` twins (:8787/:8788) | deployed shared workers | deployed shared workers |
| Email side effects | **none** (gated + `DRY_RUN` + dummy MailerSend key) | **real sends** (prod email worker) | **real sends** |
| Runtime secrets | `.env` dev values on the machine | CF secrets (same token pairs as prod) | CF secrets |

## 1 · Local development (your machine)

```
Browser ──► astro dev :4321      (workerd via the Vite plugin; top-level wrangler.jsonc)
              │
              ├─ DB binding      → LOCAL SQLite (.wrangler/state/v3/d1)
              ├─ IMAGES binding  → locally simulated images worker
              ├─ R2 (Bucket)     → SAME S3_BUCKET binding as prod, emulated locally
              │                    (.wrangler/state/v3/r2 — wiped + seeded from prod
              │                     by `bun run replicate:bucket`, like the D1 step)
              ├─ Env values      → .env (Bun/Vite auto-load → import.meta.env → Env.env)
              │                    [no .dev.vars, no CF secrets]
              │
              ├─ PDF_SERVICE binding ──► pdfWorker  `wrangler dev` :8787 (cross-command)
              │                           · templates + font: its OWN bundled assets/
              │                           · SERVICE_AUTH_TOKEN from pdfWorker/.dev.vars
              │                             == PDF_SERVICE_AUTH_TOKEN in the site .env
              │
              └─ EMAIL_SERVICE binding ─► emailWorker `wrangler dev` :8788
                                          · BUCKET → its OWN local miniflare R2
                                            (seeded once with `templates:build --dev`
                                             → POST 127.0.0.1:8788 → local R2)
                                          · DRY_RUN=true + dummy MAILERSEND_API_KEY
                                            → sends are LOGGED, never reach MailerSend
```

Rules of local dev:

- **Registration emails never fire** (`isProduction()` is false under `astro dev`).
- **Admin invites DO fire** (`SysUsers.createRegisterLink` is not prod-gated) — but they land in the local email worker's `[dry-run]` log.
- **Neither aux worker has a D1 binding** — the only D1 access anywhere is the site worker (local SQLite here) and the CLI (below). Local workers never touch the prod DB.
- **No `bucket:serve`** — the retired local HTTP store is gone; the site's dev storage is the R2 binding emulation, so every context (API, file proxy, tests over HTTP) uses the same binding code path as production. `bucket/latest/` survives only as a download cache/mirror + dated-archive source; the archive lives in `bucket/YY-MM-DD/`.
- Astro Sessions are disabled (`session: false` in `astro.config.mjs`), so
  `@astrojs/cloudflare` no longer auto-adds the `SESSION` KV binding anywhere —
  auth is cookie + `sys_users` in D1, and no KV namespace is used.
- Data privacy: `replicate:*` deliberately copies production rows/objects into local files (`dbSnapshots/`, `bucket/`). Treat those local copies as sensitive.

## 2 · The CLI lane (dev machine → Cloudflare) — the only prod-touching paths

All worker↔worker traffic is bindings, but the local CLI still reaches Cloudflare **explicitly, per command**:

| Command | Goes to | Effect |
| --- | --- | --- |
| `templates:build --dev` | local email worker `:8788` (`EMAIL_WORKER_URL` from emailWorker `.env.development`) | seeds the LOCAL R2 template store |
| `templates:build --prod` | **deployed** email worker (`EMAIL_WORKER_URL` from emailWorker `.env.production`) | publishes templates into **prod R2** `html_templates/` |
| `campaign --db dev` | preview D1 via `wrangler d1 execute --remote` (your login) | reads recipients; refuses real sends |
| `campaign --send --db prod` | prod D1 + MailerSend SDK | real emails; `MAILERSEND_API_KEY` loaded only from emailWorker `.env.production` |
| `db:query:prod`, `db:replicate`, `replicate:*` | prod D1/R2 (your login) | read-only pulls into local snapshots/mirror |
| `worker-secrets` | deployed workers (`production` + `preview` envs by default) | secret rotation + local file mirroring |
| `deploy` | Cloudflare | the only way code ships |
| `exportTurso` | legacy Turso DB (`TURSO_DB_*` in `.env`, kept until final cutover) | one-off data export |
| `bun run test` | the LOCAL dev server + local email worker | full API suite; sysusers suite logs invites as dry-runs |

## 3 · Preview worker (`env.preview`)

```
Site preview:  DB = byzantini-db-preview · R2 = byzantini-bucket-dev · own static assets
               CF secrets: same shared token pairs as production
               EMAIL_SERVICE / PDF_SERVICE bindings ──► THE SAME deployed aux workers as prod
```

⚠️ **Preview is data-isolated but side-effect-shared.** Its DB and file bucket
are its own, but:

- invites and registration emails triggered on the preview site are **real
  MailerSend sends** through the production email worker (any deployed build
  has `MODE=production`, so `isProduction()` is true);
- the email worker reads per-send templates from its **fixed prod R2 binding**
  (`byzantini-bucket`) — there is no preview template set.

This matches the pre-bindings behaviour; it is not a sandbox for email.

## 4 · Production worker (`env.production`)

```
Browser ──► site worker (DB byzantini-db · R2 byzantini-bucket · IMAGES)
             · runtime secrets = CF secrets (SECRET, GOOGLE_*, token pairs)
               — .env.production holds only mirrors; non-VITE keys are never inlined
             │
             ├─ POST /api/pdf (session cookie) → PDF_SERVICE binding (Bearer secret)
             │       → pdfWorker (bundled assets) → PDF bytes back to the browser
             │
             └─ Registrations.post · SysUsers.createRegisterLink
                     → EMAIL_SERVICE binding (shared token in the body)
                     → emailWorker → template read from ITS OWN R2 binding
                       (prod bucket html_templates/<name>) → real MailerSend send
```

The aux workers have **no route back to any site**: all `<SITE_URL>` HTTP
fetches were removed (PDF session back-call and per-send template fetches).
They answer binding calls, read their own R2/bundled assets and call
MailerSend. Their public workers.dev URLs still exist but are inert behind the
token check (pdfWorker) / serve the CLI template publish (emailWorker
`POST /html-templates`).

## 5 · The shared aux workers (single instances for every environment)

| | pdfWorker `byzantini-website-pdf-gen` | emailWorker `byzantini-website-emails` |
| --- | --- | --- |
| Data | none (templates+font bundled at deploy) | R2 `byzantini-bucket`: reads `html_templates/<name>` per send + `POST /html-templates` publish |
| Secrets | `SERVICE_AUTH_TOKEN` (CF) ↔ site `PDF_SERVICE_AUTH_TOKEN` | `SERVICE_AUTH_TOKEN` + `MAILERSEND_API_KEY` (CF); site side `AUTOMATED_EMAILS_SERVICE_AUTH_TOKEN` |
| Local dev twin | `wrangler dev` :8787; token in `services/pdfWorker/.dev.vars` | `wrangler dev` :8788 (`DRY_RUN`); token in `services/emailWorker/.dev.vars` |
| Public URL | gated by bearer token; nothing calls it | `POST /` token-gated; `POST /html-templates` used by the CLI |
| Outbound | none | MailerSend REST only |

## 6 · Shared tokens — where each value lives

| Token | Local dev | Deployed (CF secrets) | Files auto-mirrored by `worker-secrets` |
| --- | --- | --- | --- |
| Site side | `.env` (dev value) | `PDF_SERVICE_AUTH_TOKEN`, `AUTOMATED_EMAILS_SERVICE_AUTH_TOKEN` on every site worker | `.env`, `.env.production` |
| pdfWorker | `services/pdfWorker/.dev.vars` | `SERVICE_AUTH_TOKEN` | `.dev.vars`, `.env.production` |
| emailWorker | `.dev.vars` + `.env.development` (CLI) | `SERVICE_AUTH_TOKEN` | `.dev.vars`, `.env.development`, `.env.production` |

Pairs must match side-to-side per environment. After a `worker-secrets` run
everything (CF + every mirrored file) holds one fresh value per pair; until
then local dev keeps its own dev values, which are internally consistent.
Values are never printed by the tooling.

## 7 · Isolation guarantees

**"Local stays local" is enforced by:**

- D1 → local SQLite file; R2 → local HTTP store / local miniflare R2;
- `DRY_RUN=true` + dummy `MAILERSEND_API_KEY` on the local email worker;
- registration emails prod-gated; invite emails only reach the dry-run logger;
- no CF credentials in any env file (prod runtime secrets are CF-only);
- `wrangler dev` sessions never talk to the Cloudflare API (local mode).

**"Prod is handled accurately" because the only prod writers are:**

1. the deployed site + aux workers, authenticated with CF secrets, and
2. your explicit CLI commands from §2 — each of which targets prod only when
   it is told to (`--prod`, `--db prod`, `--send`, `--env production`, deploy).

There is no automatic or ambient path from local dev into production data,
and no path from production into your machine.

## 8 · Quick verification commands

```bash
# local is local: the dev DB file is a sqlite file, not a network call
bun run db:query -- "SELECT COUNT(*) FROM sys_users"

# local email worker logs instead of sending (look for [dry-run] lines)
# in the emailWorker wrangler dev terminal (or services/emailWorker logs)

# which secrets exist where (names only; requires wrangler login)
bun run worker-secrets --list
bunx wrangler secret list --config wrangler.jsonc --env production
bunx wrangler secret list --config services/pdfWorker/wrangler.jsonc

# which templates target lands where
grep '^EMAIL_WORKER_URL' services/emailWorker/.env.development services/emailWorker/.env.production
```
