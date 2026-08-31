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
database, R2 storage and two local worker services (PDF, image compression).

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
- Storage: Cloudflare R2 (`S3_BUCKET` binding) in production; dev goes through
  `bun run bucket:serve` (local HTTP store on `bucket/latest`, see
  `lib/bucket/index.ts` + `scripts/bucketServer.ts`).
- Deploy: `@astrojs/cloudflare` adapter → `dist/server/entry.mjs` + `dist/client/`;
  config in `wrangler.jsonc`; manual deploys via `wrangler deploy`
  (deploy plumbing lands in Phase 6; CI/Pages integration is retired).
- Env: server-side via `cloudflare:workers` env (`.dev.vars` local secrets +
  `vars` in `wrangler.jsonc`); client-side via Vite-native `.env`
  (gitignored, `VITE_`/`PUBLIC_` only).
- TS config: `tsconfig.json` extends `astro/tsconfigs/strict`, no emit;
  runtime types from generated `worker-configuration.d.ts` (`bun run types`).

## Command reference (use Bun)

Core loop:

| Task | Command | Notes |
| --- | --- | --- |
| Install | `bun install` | real lockfile is `bun.lock` |
| Dev server | `bun run dev` | Astro dev, port **4321**; also starts `bun run bucket:serve` |
| Dev server (alt) | `bun run start` | alias for `dev` |
| Build | `bun run build` | production build |
| Types | `bun run types` | regenerate `worker-configuration.d.ts` after `wrangler.jsonc` changes |
| Typecheck | `bun run typecheck` | `tsc --noEmit` (fast gate for every change) |
| Astro check | `bun run astro-check` | `astro check` (slower, more rules; 4 pre-existing errors) |
| Full gate | `bun run check` | typecheck + tests |
| Tests | `bun run test` | full suite; needs dev server + docker services + `bucket:serve`; env from tests/.env.test, 10s per test timeout |
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
| Reset dev DB | `bun run db:reset` | wipes local D1 and rebuilds from `dbSnapshots/dev-snapshot.sql` |
| Apply migrations | `bunx wrangler d1 migrations apply DB --local` | fresh checkouts after `bun install` |

Worker services (local Docker only — needed for the API tests; images: `pdfworker`, `imgcomp`):
`bun run docker:build` / `docker:pdf` / `docker:img` / `docker:run` / `docker:logs`.

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
  `lib/api/routes/registrations.ts` for the canonical example.
- **D1 has no interactive transactions**: `executeTransaction` executes
  statements immediately (no rollback). Rollback-sensitive flows must be
  refactored to `db.batch(...)` or made idempotent — see `docs/MIGRATION_SPEC.md`.
- Prefer SQL parameterization; never interpolate user input into SQL strings.
- Schema changes go through `migrations/NNNN_*.sql` +
  `wrangler d1 migrations apply DB --local` (never ad-hoc DDL in route code).

## Env, storage and external services

- Server-side env comes from the `cloudflare:workers` env module
  (`lib/env/runtime.ts` bridge, `Env.env` for the merged view) — never ad-hoc
  globals; local secrets live in `.dev.vars`.
- Client-visible `VITE_`/`PUBLIC_` vars come from Vite-native `.env` files
  (gitignored; `.env` for dev, `.env.production` for builds).
- Storage goes through `Bucket` (`lib/bucket/index.ts`) — R2 binding in
  production, local HTTP store (`bun run bucket:serve`) in dev. Never access
  the binding directly in route code.
- PDF generation is delegated to `services/pdfWorker` via `lib/pdf.client.ts`
  (`Authorization: Bearer <session_id>`); image compression goes to
  `services/imageCompression` via `VITE_IMG_COMPRESSION_SERVICE_URL`.

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
- DON'T: run any `wrangler deploy`/`d1 ... --remote` or Docker command as part
  of routine work or to "verify" a change (deploys require real credentials).
- DON'T: use `npm`/`npx`/`yarn`; use `bun`/`bunx`.
- DON'T: restart or rewrite parts of the architecture that work (database
  layer, route assembly, bucket abstraction) without an explicit request.
- DON'T: commit generated files, env files, snapshots, `bucket/`,
  `dbSnapshots/`, `notAssets/`, `public/images`, `email/` — they are
  gitignored on purpose.
