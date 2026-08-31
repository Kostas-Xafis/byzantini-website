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
- Define endpoints in pairs under `lib/routes/`: `*.client.ts` (contract +
  validation) and `*.server.ts` (implementation).
- In `*.server.ts`, clone client routes via `deepCopy(...)` (from
  `@utilities/objects`) and assign `route.func` handlers.
- Central route assembly:
  - `lib/routes/index.client.ts` builds `API`/`APIEndpoints`.
  - `lib/routes/index.server.ts` builds `APIRaw`, injects middleware by flags,
    and exports `matchRoute(...)`.
- Use `useAPI` from `lib/hooks/useAPI.astro.ts` (Astro/server) or
  `lib/hooks/useAPI.solid.ts` (Solid); endpoint keys look like
  `Authentication.userLogin`.

## Middleware, validation, and responses
- Prefer `execTryCatch(...)` + wrappers in `lib/utils.server.ts` for handler
  returns/errors.
- Set route flags (`authentication`, `validation`, `multipart`) in route
  contracts; middleware auto-attaches in `lib/routes/index.server.ts`.
- Validation is Valibot-based via `requestValidation(...)` in
  `lib/middleware/requestValidation.ts`.

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
  bridge + `Env.env`); local secrets live in `.dev.vars`.
- Client `VITE_`/`PUBLIC_` vars come from Vite-native `.env` files
  (gitignored).
- Storage abstraction is `Bucket` (`lib/bucket/index.ts`): production uses
  Cloudflare R2 binding `S3_BUCKET`; development uses the local HTTP store
  (`bun run bucket:serve`, `scripts/bucketServer.ts`).
- PDF generation is delegated to `services/pdfWorker`; client integration
  lives in `lib/pdf.client.ts` and sends `Authorization: Bearer <session_id>`.

## Workflows and conventions
- Core commands: `bun run dev` (starts `bucket:serve` too), `bun run build`,
  `bun run types`, `bun run test`, `bun run db:query -- "..."`,
  `bun run db:reset`, `bun run typecheck`, `bun run check`.
- Tests use API helpers in `tests/testHelpers.ts` (`useTestAPI(...)`); env comes
  from `tests/.env.test`, 10s per-test timeout; they need the dev server, the
  docker services (pdf/img) and `bucket:serve`.
- Preserve existing Greek user-facing messages and labels when editing related
  flows.
- Keep TS path aliases from `tsconfig.json` (`@routes/*`, `@utilities/*`,
  `@hooks/*`, `@env/*`, etc.).
- Extend existing route groups/utilities instead of introducing a new
  transport or API plumbing layer.

> Migration in progress on branch `Workers` — see `docs/MIGRATION_SPEC.md`
> and `MIGRATION_PLAN.md` for the plan and do-not-re-research facts.
