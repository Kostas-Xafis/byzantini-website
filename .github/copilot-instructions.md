# Copilot Instructions for Byzantini-Website

## Runtime + app shape
- Use Bun everywhere (`bun run ...`, `bun test ...`), not npm/yarn.
- Main web app: Astro 5 + Solid + Tailwind on Cloudflare Pages/Workers (`astro.config.mjs`, `wrangler.jsonc`).
- API entrypoint is the catch-all route `src/pages/api/[...slug].ts` (maps slug + HTTP method to route metadata).

## API architecture (project-critical)
- Define endpoints in pairs under `lib/routes/`: `*.client.ts` (contract + validation) and `*.server.ts` (implementation).
- In `*.server.ts`, clone client routes via `deepCopy(...)` and assign `route.func` handlers.
- Central route assembly:
  - `lib/routes/index.client.ts` builds `API`/`APIEndpoints`.
  - `lib/routes/index.server.ts` builds `APIRaw`, injects middleware by flags, and `matchRoute(...)`.
- Use `useAPI` from `lib/hooks/useAPI.astro.ts` for app calls; endpoint keys look like `Authentication.userLogin`.

## Middleware, validation, and responses
- Prefer `execTryCatch(...)` + wrappers in `lib/utils.server.ts` for handler returns/errors.
- Set route flags (`authentication`, `validation`, `multipart`) in route contracts; middleware auto-attaches in `lib/routes/index.server.ts`.
- Validation is Valibot-based via `requestValidation(...)` in `lib/middleware/requestValidation.ts`.

## Database + transactions
- Access DB through `executeQuery(...)` (`lib/utils.server.ts`) and `createDbConnection(...)` (`lib/db.ts`).
- SQL supports `???` placeholder expansion (`questionMarks` + `sqlPreprocessor` in `lib/db.ts`).
- For multi-step writes, use transaction callback style (see `lib/routes/registrations.server.ts`).
- Query logging is built-in (`query_logs` writes from `lib/db.ts`); avoid bypassing wrappers.

## Env, storage, and external services
- Read env through `Env.env` / `Env.setEnv(ctx)` (`lib/env/env.ts`), not ad-hoc globals.
- `loadEnvVars.ts` loads `.dev.vars.<env>`; production client exposure is restricted to `VITE_`/`PUBLIC_`.
- Storage abstraction is `Bucket` (`lib/bucket/index.ts`): production uses Cloudflare R2 binding `S3_BUCKET`; development uses S3-compatible SDK.
- PDF generation is delegated to `services/pdfWorker`; client integration lives in `lib/pdf.client.ts` and sends `Authorization: Bearer <session_id>`.

## Workflows and conventions
- Core commands: `bun run dev`, `bun run build`, `bun run preview`, `bun run test`, `bun run test-force`, `bun run db-replicate`, `bun run query`.
- Tests use API helpers in `tests/testHelpers.ts` (`useTestAPI(...)`) and cache hashes in `.cache/tests.json`.
- Preserve existing Greek user-facing messages and labels when editing related flows.
- Keep TS path aliases from `tsconfig.json` (`@routes/*`, `@utilities/*`, `@hooks/*`, `@env/*`, etc.).
- Extend existing route groups/utilities instead of introducing a new transport or API plumbing layer.

## Existing AI guidance sources
- Repository-level guidance files were not present; only `services/imageCompression/README.md` was found.
