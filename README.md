# Byzantini Website 🎼

A full-stack music school platform built with Astro + Solid and deployed on Cloudflare Pages/Workers.

This repository contains:
- The public website and admin interface
- A typed internal API with route contracts and middleware
- Database tooling for querying and snapshot replication
- Utility services for PDF generation and image compression

## Tech Stack 🛠️

- Runtime: Bun
- Typing: TypeScript 6 (`astro/tsconfigs/strict`, no `baseUrl`)
- Frontend: Astro 5, SolidJS, Tailwind CSS
- API: Astro catch-all route (`src/pages/api/[...slug].ts`) with typed endpoint metadata
- Validation: Valibot
- Database: libSQL/Turso (production) + local SQLite snapshot workflow
- Storage: Cloudflare R2 in production, S3-compatible endpoint in development
- Deploy target: Cloudflare Pages + Workers adapter (`@astrojs/cloudflare`)

## Project Structure

```txt
src/
  pages/                 Astro pages (includes API catch-all route)
  components/            UI components
  layouts/               Page layouts
lib/
  routes/                API contracts and server implementations
  hooks/                 App hooks (including useAPI)
  middleware/            API middleware (validation, auth pipeline)
  db.ts                  DB connection + query preprocessing + logging
  utils.server.ts        Wrappers (executeQuery, execTryCatch, etc.)
  bucket/                Storage abstraction (R2/S3-compatible)
  images.ts              Cloudflare Images binding helpers (thumbnails)
services/
  pdfWorker/             Cloudflare Worker `byzantini-website-pdf-gen` (PDF rendering)
  emailWorker/           Cloudflare Worker `byzantini-website-emails` (transactional emails)
dbSnapshots/
  dev-snapshot.sql       Local dev DB seed (used by `bun run db:reset`)
tests/
  api/                   API tests
  testHelpers.ts         Test API helper
```

## Architecture Overview 🧭

### 1) Route Contracts + Implementations

API endpoints are defined in pairs under `lib/routes/`:
- `*.client.ts`: endpoint path, method, and validation contract
- `*.server.ts`: server logic by attaching `route.func`

Central assembly:
- `lib/routes/index.client.ts`: builds `API` and `APIEndpoints`
- `lib/routes/index.server.ts`: builds `APIRaw`, injects middleware, and exports `matchRoute(...)`

### 2) Request Routing

`src/pages/api/[...slug].ts` is the single API entrypoint.
It:
- Matches URL slug + HTTP method to a route via `matchRoute(...)`
- Loads runtime env through `Env.setEnv(ctx)`
- Executes route middleware (auth/validation)
- Executes the final handler and wraps JSON responses

### 3) Middleware + Validation

Middleware is attached automatically from endpoint flags:
- `authentication: true` -> auth middleware
- `validation: schema` -> Valibot request validation
- `multipart: true` -> multipart-aware parsing

### 4) Database Access Pattern

Use helpers from `lib/utils.server.ts`:
- `executeQuery(...)` for queries
- `executeTransaction(...)` for explicit transactions
- `execTryCatch(...)` for consistent endpoint result wrapping

DB access in `lib/db.ts` uses the Cloudflare D1 binding (`DB`):
- Production: remote D1 (`byzantini-db`); development: local miniflare SQLite (`.wrangler/state/v3/d1`)
- Supports `???` placeholder expansion for variable-length SQL args
- Writes query logs into `query_logs`

### 5) Client API Consumption

Use `useAPI(...)` from `lib/hooks/useAPI.astro.ts`.
Endpoint keys are strongly typed and follow the format:
- `Authentication.userLogin`
- `Registrations.someAction`

## Prerequisites

- Bun installed
- Cloudflare account (for deployment, D1/R2/Images bindings)
- Access to required environment variables

## Environment Variables 🔐

Environment files:
- `.dev.vars` for the local dev runtime (bindings, vars, secrets)
- `.env` / `.env.production` for Vite (client-visible `VITE_*`/`PUBLIC_*` only)

Important variables (from `types/env.ts`):

```env
SECRET=
GOOGLE_MAPS_KEY=

PDF_SERVICE_AUTH_TOKEN=        # shared with the pdfWorker's SERVICE_AUTH_TOKEN (Authorization: Bearer on binding calls)

AUTOMATED_EMAILS_SERVICE_AUTH_TOKEN=   # shared with the emailWorker's SERVICE_AUTH_TOKEN (sent in the send body)

SAFE_BACKUP_SNAPSHOT=
BACKUP_SNAPSHOT_LOCATION=
DEV_SNAPSHOT_LOCATION=
LATEST_MIGRATION_FILE=
PROJECT_ABSOLUTE_PATH=

TEST_EMAIL=
TEST_PASSWORD=
VITE_URL=
```

Notes:
- In production builds, only variables prefixed with `VITE_` or `PUBLIC_` are exposed to client code.
- Runtime env is accessed through `Env.env` / `Env.setEnv(ctx)`.
- The retired service URLs (`VITE_PDF_SERVICE_URL`, `AUTOMATED_EMAILS_SERVICE_URL`)
  are gone — the workers are reached through the `PDF_SERVICE` / `EMAIL_SERVICE`
  service bindings declared in `wrangler.jsonc`.

## Install

```bash
bun install
```

## Run Locally 🚀

### Main app (development)

```bash
bun run dev
```

### Build + preview (Cloudflare Pages style)

```bash
bun run build
bun run preview
```

### Combined build + preview

```bash
bun run build-preview
```

## Scripts Reference 📜

### App and deployment

- `bun run dev`: Start Astro dev server (port 4321) + local bucket server
- `bun run start`: Alias for `dev`
- `bun run build`: Production build (`CLOUDFLARE_ENV=production astro build`)
- Deploy (manual): `bun run build`, then `wrangler deploy --config dist/server/wrangler.json`
- `bun run types`: Regenerate `worker-configuration.d.ts` from `wrangler.jsonc`
- `bun run typecheck` / `astro-check` / `check`: Static gates

### Tests

- `bun run test`: Full API test suite (env from `tests/.env.test`; needs dev
  server + `bucket:serve`; the sysusers suite also needs the emails worker
  running locally — `wrangler dev` on 8788 — because `createRegisterLink`
  sends the invite email)

### Database tooling (wrangler D1)

- `bun run db:query -- "SELECT ..."`: Query the local dev D1
- `bun run db:query:prod -- "..."`: Query the remote production D1
- `bun run db:logs`: Recent `query_logs` rows
- `bun run db:replicate`: Export remote D1 to `dbSnapshots/` (wrangler d1 export)
- `bun run db:reset`: Wipe local D1 and rebuild from `dbSnapshots/dev-snapshot.sql`

### Data replication (dev mirrors prod)

- `bun run replicate:all` / `replicate:db` / `replicate:bucket`: pull remote D1 + R2 into the local dev stores (`scripts/replicate.ts`)

### Aux workers (local)

Each `services/*` worker runs in its own terminal with its own config — from
inside the folder: `bunx wrangler dev --config wrangler.jsonc` (pdfWorker
:8787, emailWorker :8788). Astro dev resolves the site's `EMAIL_SERVICE` /
`PDF_SERVICE` service bindings to those sessions automatically
(cross-command service bindings); start them whenever you exercise PDF
printing/downloads or admin invites/registration emails.

## Testing Notes ✅

- Tests live in `tests/api/*.test.ts` and use `tests/testHelpers.ts` (`useTestAPI`, `expectBody`, `getJson`) against the dev API server at `VITE_URL` (from `tests/.env.test`).
- `TEST_EMAIL` and `TEST_PASSWORD` are required.

## Data and Snapshot Workflow

`scripts/replicate.ts` (also `bun run replicate:*`) mirrors production into dev:
- DB: `wrangler d1 export` (remote) → `dbSnapshots/dev-snapshot.sql` → replays into the local D1 store
- Bucket: downloads the production R2 objects into `bucket/latest/` (resumable, mirror semantics), then snapshots to `bucket/YY-MM-DD/`

`bun run db:reset` rebuilds the local dev D1 from `dbSnapshots/dev-snapshot.sql`.

## Storage and File Handling

`lib/bucket/index.ts` exposes the `Bucket` abstraction:
- Production: Cloudflare R2 via the `S3_BUCKET` binding
- Development: local HTTP store (`bun run bucket:serve` → `bucket/latest/`)

Common operations:
- `Bucket.list(...)`
- `Bucket.get(...)`
- `Bucket.put(...)`
- `Bucket.delete(...)`
- `Bucket.move(...)`

## PDF and Image Services 📄🖼️

### PDF worker

- Cloudflare Worker **`byzantini-website-pdf-gen`** (`services/pdfWorker`,
  `pdf-lib` + `@pdf-lib/fontkit`; templates + Greek font bundled as assets)
- Client integration in `lib/pdf.client.ts` — posts to the site's own
  `POST /api/pdf` route (`Pdf.generate`, session-cookie authenticated), which
  proxies through the **`PDF_SERVICE` service binding**; the worker requires
  `Authorization: Bearer <PDF_SERVICE_AUTH_TOKEN>` (matches the worker's
  `SERVICE_AUTH_TOKEN` secret). No browser→worker URL, no session back-call.
- Supports single and bulk PDF generation/printing/download
- Deploy: `cd services/pdfWorker && bunx wrangler deploy --config wrangler.jsonc`

### Email worker

- Cloudflare Worker **`byzantini-website-emails`** (`services/emailWorker`,
  MailerSend REST API — the `mailersend` npm package can't run on workerd)
- Same `POST /` contract as the retired mail server: `{ authToken, to,
  subject, htmlTemplateName, templateData }`; templates are read from the
  worker's own `BUCKET` R2 binding (`html_templates/<name>`) — the same keys
  its `POST /html-templates` publish writes
- Called by the site (server-side) through the **`EMAIL_SERVICE`** service
  binding (still sending `AUTOMATED_EMAILS_SERVICE_AUTH_TOKEN` in the body);
  worker secrets: `MAILERSEND_API_KEY`, `SERVICE_AUTH_TOKEN`
- The whole former `email/` stack lives here: campaign CLI (`bun run campaign`,
  recipients from **Cloudflare D1** via `wrangler d1 execute` — uses the
  wrangler login, no API token: `byzantini-db` / `byzantini-db-preview`),
  React-email `render/`, html/text templates
- Template publishing goes through the worker's R2 binding
  (`POST /html-templates`; `templates:build --prod`) — no AWS SDK/S3 keys
- Deploy: `cd services/emailWorker && bunx wrangler deploy --config wrangler.jsonc`

### Image compression

- Native Cloudflare Images binding (`IMAGES`, declared in `wrangler.jsonc`)
- Helpers in `lib/images.ts` (`compressImageForThumb`)
- `Announcements.postImage` generates `thumb_*` variants in-process — the
  deleted `services/imageCompression` Docker/Cloud Run service is no longer called

## Deployment ☁️

This project is configured for Cloudflare Pages/Workers:
- Wrangler config in `wrangler.toml`
- Main worker output at `dist/_worker.js/index.js`
- R2 binding: `S3_BUCKET`
- Compatibility flags include `nodejs_compat`

Typical release path:
1. Set production env values/secrets in Cloudflare.
2. Run `bun run build`.
3. Deploy `dist` with Wrangler/Pages pipeline.

## Development Conventions

- Use Bun commands (`bun run ...`, `bun test ...`) throughout.
- Keep API contract/implementation split in `lib/routes`.
- Reuse wrappers in `lib/utils.server.ts` for consistent response/error behavior.
- Preserve TS path aliases from `tsconfig.json` (`@routes/*`, `@utilities/*`, `@hooks/*`, etc.).
- Prefer extending existing route groups/utilities over adding parallel transport layers.

## Adding a New API Endpoint (Quick Guide)

1. Add route contract in a `*.client.ts` route group with validation and flags.
2. Clone/add implementation in corresponding `*.server.ts` and set `route.func`.
3. Ensure route group is exported via `lib/routes/index.client.ts` and `lib/routes/index.server.ts`.
4. Call from app using `useAPI("Group.endpointName", payload)`.
5. Add/update tests under `tests/api` and run `bun run test`.

## Troubleshooting

- Route not found: verify path/method in contract and endpoint registration in route indexes.
- Validation failures: confirm request shape matches Valibot schema.
- Unauthorized responses: confirm session cookie/token and `authentication` flag behavior.
- DB connection errors: verify the D1 binding (`DB` in `wrangler.jsonc`) and local dev state (`.wrangler/state/v3/d1`).
- Missing bucket access: verify the R2 binding in Cloudflare; in dev, ensure `bun run bucket:serve` is running.

## AI-Assisted Development 🤖

- `AGENTS.md` (repo root) is the canonical guidance file for AI coding agents
  (Codex, Cursor, Claude Code, Zed, Windsurf, GitHub Copilot, ...).
- `CLAUDE.md` is a symlink to `AGENTS.md` for Claude Code compatibility.
- `.github/copilot-instructions.md` is the GitHub Copilot mirror of the same
  guidance — keep it in sync with `AGENTS.md`.
- Fast verification gates: `bun run typecheck`, `bun run test` (or
  `bun run check` for typecheck + tests). Note: the existing codebase is not
  fully prettier-formatted, so format only the files you touch.

## Security Notes 🔒

- Keep `.dev.vars*` and credentials out of version control.
- Do not store production secrets in source files.
- Rotate any credentials that may have been committed historically.
