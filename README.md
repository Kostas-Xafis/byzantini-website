# Byzantini Website 🎼

The website and admin panel of the Byzantine music school of Metamorfosi (Greek-language UI): public pages,
the online registration form, and an admin panel for the pupil register (Μαθητολόγιο), teachers, books,
payments, announcements and settings.

It runs as a single Cloudflare Worker (Astro SSR + static assets) backed by Cloudflare D1 (database),
R2 (files) and the Images binding (thumbnails), plus two auxiliary Workers in `services/` reached through
service bindings: PDF generation and transactional emails.

> **Working on the code (human or AI)?** [`AGENTS.md`](AGENTS.md) is the canonical, detailed guide —
> commands, conventions, platform gotchas and hard rules. This README is the overview.
> Known problems and planned work are tracked in [`docs/IMPROVEMENTS.md`](docs/IMPROVEMENTS.md).

## Tech stack 🛠️

| Area | Choice |
| --- | --- |
| Runtime & package manager | **Bun** (never npm/yarn/pnpm) |
| Frontend | Astro 7 + SolidJS islands + Tailwind 4 |
| API | One catch-all Astro route → typed `APIServer` route instances, Zod validation (`astro/zod`) |
| Database | Cloudflare D1 (`DB` binding); schema in `migrations/` |
| Storage | Cloudflare R2 (`S3_BUCKET` binding), emulated locally by miniflare in dev |
| Images | Cloudflare Images binding (`IMAGES`) for announcement thumbnails |
| Aux workers | `byzantini-website-pdf-gen` (`services/pdfWorker`), `byzantini-website-emails` (`services/emailWorker`) |
| Deploy | `@astrojs/cloudflare` adapter → Workers, manual `bun run cf deploy` |
| Language | TypeScript 7 native compiler for `bun run typecheck`; TypeScript 6 for tooling that needs its JS API (`astro check`, editors) |

## Repository layout

```txt
src/
  pages/               Astro pages; api/[...slug].ts is the single API entrypoint; [...slug].ts serves R2 files
  components/          Astro + Solid (`*.solid.tsx`) components; admin/ is the admin panel
  layouts/             Page layouts
lib/
  api/routes/          API route groups (one file per group), APIServer, middleware
  api/schemas.ts       Zod request/response schemas
  hooks/               API callers: server in-process caller, browser transport, Solid resources
  routes/index.client.ts  Stable client import path for the API contract + types
  db.ts, utils.server.ts  D1 access (executeQuery / executeTransaction, `???` expansion, query logs)
  env/                 Runtime/env access (`cloudflare:workers` bridge), owner email
  bucket/              R2 storage abstraction (`Bucket`)
  pupils/              Pupil-register helpers (name/phone/ΑΜ normalisation, school years)
migrations/            D1 schema migrations (wrangler d1 migrations)
services/
  pdfWorker/           PDF generation worker (own package.json / wrangler.jsonc)
  emailWorker/         Transactional email worker + campaign CLI (own package.json / wrangler.jsonc)
scripts/               Deploy (cf.ts), data replication, worker secrets, dev cleanup
tests/
  api/                 API tests (need the dev server)
  unit/                Unit tests (no server)
types/                 Shared TypeScript types
docs/IMPROVEMENTS.md   Improvement backlog
```

## Getting started 🚀

Prerequisites: Bun, and for anything touching real Cloudflare resources a `wrangler login`.

```bash
bun install
bun run services:install          # the two workers keep their own lockfiles
bun run types                     # generate worker-configuration.d.ts from wrangler.jsonc
```

Local database (a miniflare SQLite file under `.wrangler/state/v3/d1`):

```bash
bun run db:reset          # rebuild from dbSnapshots/dev-snapshot.sql, then apply pending migrations
```

`bun run replicate:all` instead mirrors production D1 + R2 into the local stores (needs `wrangler login`;
restart the dev server afterwards).

Environment files are all gitignored:

- `.env` — every local dev value, client (`VITE_*`/`PUBLIC_*`) and server alike. Server-side values:
  `SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_MAPS_KEY`, `PDF_SERVICE_AUTH_TOKEN`,
  `AUTOMATED_EMAILS_SERVICE_AUTH_TOKEN`; client values include `VITE_OWNER_EMAIL` and `VITE_URL`.
- `.env.production` — build-time client values (only `VITE_*`/`PUBLIC_*` are ever inlined into client code).
- `services/*/.dev.vars` — the workers' local secrets (`wrangler dev` reads them).
- `tests/.env.test` — `VITE_URL`, `TEST_EMAIL`, `TEST_PASSWORD` for the API tests.

Production secrets are Cloudflare secrets (`wrangler secret put`), never files. `bun run worker-secrets`
creates/rotates the two shared site↔worker tokens and mirrors them into the local env files.

Run it:

```bash
bun run dev                       # Astro dev server on http://localhost:4321
```

To exercise PDFs or emails locally, start the matching worker in another terminal from its folder
(`bunx wrangler dev --config wrangler.jsonc`, no `--bun`): pdfWorker on :8787, emailWorker on :8788.
`astro dev` resolves the `PDF_SERVICE` / `EMAIL_SERVICE` bindings to those sessions automatically. A local
email-worker request never sends real mail (it renders, logs `[dry-run:…]` and returns 200).

## Architecture 🧭

### Request flow

```txt
browser ──▶ Worker (Astro SSR) ──▶ src/pages/api/[...slug].ts ──▶ APIServer.handle
                │                                                   │ match route (decoded, typed params)
                │ SSR pages call the API in-process                 │ middleware (auth, rate limit)
                │ (lib/hooks/useAPI.server.ts, never a self-fetch)  │ Zod body validation
                ▼                                                   ▼ handler → { data } | { message } | { error, details? }
           D1 · R2 · Images · PDF_SERVICE · EMAIL_SERVICE
```

### API routes

- Every endpoint is an `APIServer` instance in a group file `lib/api/routes/<group>.ts`
  (`Books.get`, `Pupils.post`, …): `new APIServer({ method, path, schema?, responseSchema?, multipart?, rawBlob? }, [middleware], handler)`.
  `APIRoute` (`APIRoute.ts`) holds the contract, the registry and path matching; `APIServer` adds the handler,
  middleware and dispatch. `lib/api/routes/index.ts` imports every group and exposes the server registry.
- Path params arrive decoded; `[id:number]` params are real numbers (a non-numeric segment doesn't match the route).
  The handler's `body` is typed from the route's Zod schema (`z.output`).
- **Errors.** Every `/api` response is JSON. Handlers throw `APIError` (`notFound`, `badRequest`, `forbidden`,
  `conflict`, `gone`) for expected failures; its message is public, so it's Greek and never contains SQL. Anything
  else is logged with `console.error` and the caller gets a generic 500. Unknown paths answer 404, wrong methods 405,
  invalid bodies 400 with per-field `details`.
- D1 has no transactions: `executeTransaction` runs statements immediately, so multi-step writes that must be atomic
  use `db.batch(...)`.

### Client and server stay separate

The browser never loads the route registry (handlers, SQL, Zod schemas):

- `lib/api/contract.ts` is a **generated**, browser-safe map `endpoint → { method, path, multipart, rawBlob }`
  (`bun run api:contract`). `typecheck`, a unit test and `bun run check` fail when it drifts from the registry.
- `lib/api/types.ts` derives `APIEndpointNames` / `APIArgs` / `APIResponse` from the registry with type-only imports.
- Browser code imports from `@routes/index.client` (`API`, `APIEndpoints`, types) and calls the API with
  `apiCall` (`lib/hooks/apiCall.ts`), `useAPIClient` or `createAPIResource`. Failures throw `APIRequestError`
  (HTTP `status`, per-field `details`); network failures stay a `TypeError`.
- Astro frontmatter uses `useAPI(endpoint, req, Astro)` from `lib/hooks/useAPI.server.ts`, which dispatches
  in-process (a Worker fetching its own origin fails on the edge with Cloudflare error 1042).
- `bun run check:bundle` (after a build) fails if server-only code shows up in `dist/client`.

### Data, env and storage

- **Database:** `executeQuery` / `executeTransaction` in `lib/utils.server.ts` (D1 binding, `???` placeholder
  expansion, query logging). Schema changes are migrations in `migrations/`.
- **Types:** entity types in `types/entities.ts` are derived from the Zod schemas in `lib/api/schemas.ts`.
- **Env:** `getEnv()` (`lib/env/env.ts`) is the one accessor for vars and secrets: `import.meta.env` merged once with
  the `cloudflare:workers` runtime env (runtime wins), values untouched. Bindings come from the runtime env.
- **Storage:** `Bucket` (`lib/bucket/index.ts`) wraps the R2 binding — `list` (paginated), `get`, `put`, `delete`,
  `move` (copy, then delete; keeps the content type).
- **Backups:** the admin Settings page downloads a restorable SQL dump of D1 (`lib/sqlDump.ts`); for real backups
  prefer `wrangler d1 export`.

### Aux workers

- **PDF** (`services/pdfWorker`): the browser posts to the site's `POST /api/pdf`, which proxies through the
  `PDF_SERVICE` binding with a shared bearer token.
- **Emails** (`services/emailWorker`): registration confirmations and admin invites go through the `EMAIL_SERVICE`
  binding with a shared token. The worker also hosts the campaign CLI (`bun run campaign`, recipients from D1).

### Adding an endpoint

1. Add `new APIServer(...)` to the right group in `lib/api/routes/<group>.ts` (reuse schemas from
   `lib/api/schemas.ts`, Greek messages, `APIError` for expected failures).
2. `bun run api:contract` to regenerate the client contract.
3. Call it with `apiCall("Group.endpoint", { RequestObject, UrlArgs })` in the browser or `useAPI(...)` in frontmatter.
4. Add tests under `tests/api/` and run `bun run test`.

## Common commands

| Task | Command |
| --- | --- |
| Dev server | `bun run dev` |
| Typecheck (fast gate) | `bun run typecheck` |
| Astro check (slower, also `.astro` files) | `bun run astro-check` |
| Contract check + typecheck + tests | `bun run check` |
| Tests (dev server must be running) | `bun run test` |
| Unit tests only | `bun test tests/unit` |
| Production build | `bun run build` |
| Query the local D1 | `bun run db:query -- "SELECT 1"` |
| Workers: typecheck / tests | `bun run services:typecheck` · `bun run services:test` |
| Format files you touched | `bunx prettier --write <files>` (the repo is not fully formatted; don't format it wholesale) |

The full table (database tooling, replication, secrets) is in [`AGENTS.md`](AGENTS.md).

## Testing ✅

- `tests/api/*.test.ts` run against the dev server at `VITE_URL` (from `tests/.env.test`) through
  `tests/testHelpers.ts`. They write fixtures to the local dev D1; `bun run dev:clean` removes them
  (dry-run by default). The sysusers suite also needs the email worker running locally.
- `tests/unit/*.test.ts` are plain Bun tests with no server.

## Deployment ☁️

Deploys are manual and need Cloudflare credentials:

```bash
bun run cf deploy          # build + wrangler deploy (production)
bun run cf deploy:preview  # preview environment
```

The deployed site workers are `byzantini-website-production` and `byzantini-website-preview` (adapter-suffixed;
target those for `wrangler secret` / `wrangler tail`). Each worker in `services/` deploys on its own from its
folder with `bunx wrangler deploy --config wrangler.jsonc`. Remote D1 migrations:
`bunx wrangler d1 migrations apply DB --remote`.

## AI-assisted development 🤖

- [`AGENTS.md`](AGENTS.md) is the canonical guide for AI coding agents; `CLAUDE.md` is a symlink to it.
- `.github/copilot-instructions.md` is the GitHub Copilot mirror — keep it in sync with `AGENTS.md`.

## Security notes 🔒

- Env files (`.env*`, `.dev.vars`, `tests/.env.test`) are gitignored and must never be committed or
  pasted anywhere.
- Never put real credentials or tokens in code, tests or docs.
- If a credential was ever committed, rotate it.
