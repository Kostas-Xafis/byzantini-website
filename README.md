# Byzantini Website 🎼

A full-stack music school platform built with Astro + Solid and deployed on Cloudflare Pages/Workers.

This repository contains:
- The public website and admin interface
- A typed internal API with route contracts and middleware
- Database tooling for querying and snapshot replication
- Utility services for PDF generation and image compression

## Tech Stack 🛠️

- Runtime: Bun
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
services/
  pdfWorker/             PDF rendering worker service
  imageCompression/      Image compression worker service
getData/
  query.ts               DB query CLI
  replicate.ts           Snapshot replication helper
dbSnapshots/
  migrations/            SQL migrations
  sqlite/                SQLite-related files
tests/
  api/                   API tests
  testHelpers.ts         Test API helper + endpoint/function hash cache
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

DB connector behavior in `lib/db.ts`:
- Production: Turso/libSQL (`TURSO_DB_URL`, `TURSO_DB_TOKEN`)
- Development: local SQLite file (`DEV_DB_ABSOLUTE_LOCATION`)
- Supports `???` placeholder expansion for variable-length SQL args
- Writes query logs into `query_logs`

### 5) Client API Consumption

Use `useAPI(...)` from `lib/hooks/useAPI.astro.ts`.
Endpoint keys are strongly typed and follow the format:
- `Authentication.userLogin`
- `Registrations.someAction`

## Prerequisites

- Bun installed
- Cloudflare account (for deployment/R2 bindings)
- Access to required environment variables
- Local SQLite snapshot (for development connector mode)

## Environment Variables 🔐

Environment files:
- `.dev.vars.development` for local development
- `.dev.vars` for production-like local operations and CLI utilities

Important variables (from `types/envVars.ts`):

```env
CONNECTOR=sqlite-dev              # sqlite-dev or sqlite-prod
TURSO_DB_URL=
TURSO_DB_TOKEN=
DEV_DB_ABSOLUTE_LOCATION=
SECRET=
GOOGLE_MAPS_KEY=

S3_ENDPOINT=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_BUCKET_NAME=
S3_DEV_BUCKET_NAME=

VITE_PDF_SERVICE_URL=
VITE_IMG_COMPRESSION_SERVICE_URL=

AUTOMATED_EMAILS_SERVICE_URL=
AUTOMATED_EMAILS_SERVICE_AUTH_TOKEN=

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

- `bun run dev`: Start Astro dev server
- `bun run start`: Start with `CLOUDFLARE_ENV=development`
- `bun run build`: Build for production
- `bun run bun-build`: Build via `bunx --bun astro build`
- `bun run preview`: Preview using Wrangler Pages (`dist`)
- `bun run build-preview`: Build then preview
- `bun run deploy:test`: Build and deploy to Cloudflare Pages preview branch `local-test`
- `bun run logs:test`: Tail logs for preview deployment branch `local-test`

### Tests

- `bun run test`: Run test suite with `tests/.env.test`
- `bun run test-force`: Run tests with forced cache invalidation env
- `bun run tests`: Run each `*.test.ts` with test env
- `bun run tests-force`: Run each `*.test.ts` with forced env

### Database tooling

- `bun run query --dev --q "SELECT ..."`: Query development DB
- `bun run query --prod --q "SELECT ..."`: Query production DB
- `bun run db:query --dev --q "..."`: Shortcut for query script
- `bun run db:query:prod --q "..."`: Production query shortcut
- `bun run db:logs`: Query recent `query_logs`
- `bun run db:replicate`: Generate/refresh SQLite snapshot artifacts

### Worker services (local Docker)

- `bun run docker:pdf`: Build/run PDF worker image
- `bun run docker:img`: Build/run image compression worker image
- `bun run docker:build`: Build both worker images
- `bun run docker:run`: Run both worker containers
- `bun run docker:logs`: Tail logs for both containers

## Testing Notes ✅

- Tests use `tests/testHelpers.ts` and `useTestAPI(...)`.
- Endpoint/function hashes are cached in `.cache/tests.json` to skip unchanged tests.
- `TEST_EMAIL` and `TEST_PASSWORD` are required for auth-related helper flows.

## Data and Snapshot Workflow

`getData/query.ts` supports:
- Single query execution (`--q`)
- SQL file execution (`--f`)
- JSON output (`--json`, `--json-out`)
- Excel output (`--excel`)
- Timed/silent execution (`--time`, `--silent`)

`getData/replicate.ts` supports:
- Exporting production SQLite schema/data
- Writing dated snapshots (`snap-YY-MM-DD.sql`)
- Refreshing local `dbSnapshots/latest.db`

## Storage and File Handling

`lib/bucket/index.ts` exposes `Bucket` abstraction:
- Production: Cloudflare R2 via `S3_BUCKET` binding
- Development: S3-compatible API client (endpoint + keys from env)

Common operations:
- `Bucket.list(...)`
- `Bucket.get(...)`
- `Bucket.put(...)`
- `Bucket.delete(...)`
- `Bucket.move(...)`

## PDF and Image Services 📄🖼️

### PDF worker

- Client integration in `lib/pdf.client.ts`
- Sends requests to `VITE_PDF_SERVICE_URL`
- Uses `Authorization: Bearer <session_id>`
- Supports single and bulk PDF generation/printing/download

### Image compression worker

- Local service under `services/imageCompression`
- Used through `VITE_IMG_COMPRESSION_SERVICE_URL`

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
- DB connection errors: verify `CONNECTOR` and corresponding DB env vars.
- Missing bucket access: verify R2 binding in Cloudflare and S3-compatible creds for local mode.

## Security Notes 🔒

- Keep `.dev.vars*` and credentials out of version control.
- Do not store production secrets in source files.
- Rotate any credentials that may have been committed historically.
