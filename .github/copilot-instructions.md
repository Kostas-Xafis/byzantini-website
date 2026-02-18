# Copilot instructions for Byzantini-Website

## Architecture and request flow
- This is an Astro + Cloudflare Pages app using Bun for scripts and tests.
- All API requests are funneled through `src/pages/api/[...slug].ts` and matched by `matchRoute` in `lib/routes/index.server.ts`.
- Public file/bucket reads are handled by `src/pages/[...slug].ts` (catch-all page route), which calls `Bucket.get` from `lib/bucket/index.ts`.
- Route definitions are split client/server:
  - Client contract + validation schema: `lib/routes/*.client.ts`
  - Server implementation: `lib/routes/*.server.ts`
  - Route registry/types: `lib/routes/index.client.ts`, `lib/routes/index.server.ts`

## Route authoring conventions (important)
- Always start server files by cloning client route metadata: `const serverRoutes = deepCopy(XRoutes)`.
- Assign handlers to `.func` and export that cloned object (example: `lib/routes/books.server.ts`).
- Request body pattern is intentional: `const body = getUsedBody(ctx) || await ctx.request.json();`
  - `requestValidation` middleware replaces `ctx.request.json` with parsed data.
- Use `EndpointRoute<...>` types in client route files (example: `lib/routes/announcements.client.ts`).
- URL params use typed path segments like `[id:number]`, parsed in `src/pages/api/[...slug].ts`.

## Data and transaction patterns
- DB access goes through `executeQuery` / `execTryCatch` in `lib/utils.server.ts`.
- Transactional handlers should use `execTryCatch(async T => { ... })` and `T.executeQuery(...)`.
- Use `questionMarks(args)` and `???` replacement conventions for dynamic SQL placeholders.
- Avoid ad-hoc DB clients; use `createDbConnection` / `createSimpleDbConnection` from `lib/db.ts`.

## Bucket and file storage patterns
- `Bucket` abstraction in `lib/bucket/index.ts` switches behavior by environment:
  - production: Cloudflare R2 binding `S3_BUCKET`
  - development: S3-compatible endpoint via AWS SDK env vars
- Bucket file names are stored as relative keys (for example announcement images under `anakoinoseis/images/...`).
- If changing file-serving behavior, check both `src/pages/[...slug].ts` and bucket key creation in route handlers.

## Environment and config expectations
- Env is centralized through `Env.setEnv(ctx)` / `Env.env` (`lib/env/env.ts`); API wrapper calls `Env.setEnv` before middleware/handlers.
- Vite compile-time env injection is in `loadEnvVars.ts` and `astro.config.mjs`.
- Cloudflare bucket binding and runtime flags are in `wrangler.jsonc`.

## Commands and workflows
- Install deps: `bun install`
- Dev server: `bun run dev`
- Build: `bun run build`
- Preview worker build: `bun run preview`
- Tests: `bun run test` (or `bun run tests` for per-file discovery)
- DB utility scripts:
  - Query CLI: `bun run query --dev --q "SELECT * FROM ..."`
  - Replication: `bun run db-replicate`

## Testing and change-safety notes
- API tests rely on typed endpoint metadata (`tests/testHelpers.ts` uses `APIEndpoints` + `APIRaw`).
- Preserve endpoint keys and route shape when refactoring `lib/routes/*` or tests may skip/fail unexpectedly.
- Prefer modifying one route pair (`*.client.ts` + `*.server.ts`) at a time and run targeted tests under `tests/api/`.
