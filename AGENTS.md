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
Cloudflare Pages/Workers, with a typed internal API, libSQL/Turso database, R2
storage and two local worker services (PDF, image compression).

## Stack (do not change without a good reason)

- Runtime & package manager: **Bun** — never use `npm`/`yarn`/`pnpm`.
- Frontend: Astro 5.18 + SolidJS + Tailwind 3; site port is 3000.
- API: single catch-all route `src/pages/api/[...slug].ts` with typed, paired
  route contracts.
- Validation: Valibot (`lib/middleware/requestValidation.ts`).
- Database: libSQL/Turso in production; local SQLite snapshot in dev.
- Storage: Cloudflare R2 (`S3_BUCKET` binding) in production; S3-compatible
  endpoint in development (`lib/bucket/index.ts`).
- Deploy: `@astrojs/cloudflare` adapter → `dist/_worker.js/index.js`;
  config in `wrangler.toml` (note: `.toml`, not `.jsonc`).
- TS config: `tsconfig.json` extends `astro/tsconfigs/strict`, no emit.

## Command reference (use Bun)

Core loop:

| Task | Command | Notes |
| --- | --- | --- |
| Install | `bun install` | real lockfile is `bun.lock`; an EMPTY `bun.lockb` is committed only so Cloudflare Pages' package-manager detection picks Bun (it doesn't recognize `bun.lock`) — see `.gitignore` comment |
| Dev server | `bun run dev` | Astro dev, port 3000 |
| Dev server (CF env) | `bun run start` | sets `CLOUDFLARE_ENV=development` |
| Build | `bun run build` | production build (`CLOUDFLARE_ENV=production`) |
| Preview | `bun run preview` | `wrangler pages dev dist` |
| Build + preview | `bun run build-preview` | |
| Typecheck | `bun run typecheck` | `tsc --noEmit` (fast gate for every change) |
| Astro check | `bun run astro-check` | `astro check` (slower, more rules) |
| Full gate | `bun run check` | typecheck + tests |
| Tests | `bun run test` | full suite; env from tests/.env.test, 10s per test timeout |
| Format | `bun run format` | prettier (tabs, width 100) over source dirs — see note below |
| Format check | `bun run format:check` | fails on the existing repo; use on files you touch only |

Database tooling:

| Task | Command | Notes |
| --- | --- | --- |
| Query dev DB | `bun run db:query --q "SELECT 1"` | script already carries `--dev --q` |
| Query prod DB | `bun run db:query:prod --q "..."` | reads `.dev.vars` — careful |
| Recent query logs | `bun run db:logs` | |
| Refresh snapshots | `bun run db:replicate` | pulls the latest prod backup, then resets `latest.db` |
| Reset dev DB | `bun run db:reset` | local-only: rebuild `latest.db` from `dbSnapshots/dev-snapshot.sql` |

Worker services (local Docker only — `sudo docker`, not needed for most work):
`bun run docker:build` / `docker:pdf` / `docker:img` / `docker:run` / `docker:logs`.

Deploy (requires Cloudflare credentials — do NOT run casually, do not run in tests):
`bun run deploy:test` (builds and deploys `dist` to Pages branch `local-test`),
`bun run logs:test`.

## API architecture (project-critical, preserve the pattern)

- Endpoints are defined in **pairs** under `lib/routes/`:
  - `*.client.ts`: endpoint path, HTTP method, Valibot validation contract, flags.
  - `*.server.ts`: clones the client routes (`deepCopy` from
    `@utilities/objects`) and assigns `route.func` implementations.
- Central assembly:
  - `lib/routes/index.client.ts` builds `API` and `APIEndpoints` (typed keys
    like `Authentication.userLogin`).
  - `lib/routes/index.server.ts` builds `APIRaw`, auto-attaches middleware from
    route flags and exports `matchRoute(...)`.
- `src/pages/api/[...slug].ts` is the single API entrypoint: matches slug +
  HTTP method via `matchRoute`, sets env (`Env.setEnv(ctx)`), runs middleware,
  runs the handler, wraps JSON responses.
- Middleware is attached automatically from endpoint flags:
  `authentication: true` → auth middleware; `validation: schema` →
  `requestValidation(...)`; `multipart: true` → multipart parsing.
- Client consumption: `useAPI("Group.endpoint", payload)` from
  `lib/hooks/useAPI.astro.ts` (Astro/server) or `lib/hooks/useAPI.solid.ts`
  (Solid components). Payload types are derived from the contracts — do not
  bypass them.

## Database access rules

- Use the wrappers in `lib/utils.server.ts`: `executeQuery(...)`,
  `executeTransaction(...)`, `execTryCatch(...)` — do not create ad-hoc DB
  calls. They handle connection, `???` placeholder expansion and `query_logs`
  logging.
- Multiple-value SQL uses `???` placeholders (expanded by
  `questionMarks`/`sqlPreprocessor` in `lib/db.ts`).
- Multi-step writes use the transaction callback pattern — see
  `lib/routes/registrations.server.ts` for the canonical example.
- Dev vs prod connection is driven by `CONNECTOR` (`sqlite-dev` vs
  `sqlite-prod`) and the matching env vars.
- Prefer SQL parameterization; never interpolate user input into SQL strings.

## Env, storage and external services

- Read env through `Env.env` / `Env.setEnv(ctx)` (`lib/env/env.ts`), never via
  ad-hoc globals.
- `loadEnvVars.ts` loads `.dev.vars.<environment>`; only `VITE_`/`PUBLIC_`
  variables reach client code in production builds.
- Storage goes through `Bucket` (`lib/bucket/index.ts`) — R2 in production,
  S3-compatible in dev. Never access the binding directly in route code.
- PDF generation is delegated to `services/pdfWorker` via `lib/pdf.client.ts`
  (`Authorization: Bearer <session_id>`); image compression goes to
  `services/imageCompression` via `VITE_IMG_COMPRESSION_SERVICE_URL`.

## Secrets policy (hard rules)

- `.dev.vars`, `.dev.vars.development`, `tests/.env.test`,
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

1. Add the contract in a `*.client.ts` route group (path, method, validation,
   flags).
2. Add the implementation in the matching `*.server.ts`: `deepCopy` the client
   routes and set `route.func`.
3. Make sure the route group is exported from `lib/routes/index.client.ts` and
   `lib/routes/index.server.ts`.
4. Call it from the app with `useAPI("Group.endpoint", payload)`.
5. Add tests under `tests/api/` and run `bun run test`.

## Do / Don't

- DO: extend existing route groups and utilities instead of adding new
  transport/API layers; reuse `execTryCatch` for handler error handling.
- DO: run `bun run typecheck` before declaring a change done; run targeted
  tests for API changes.
- DO: keep diffs minimal and focused; don't reformat unrelated files.
- DON'T: run `deploy:test`, `logs:test` or any Docker command as part of
  routine work or to "verify" a change.
- DON'T: use `npm`/`npx`/`yarn`; use `bun`/`bunx`.
- DON'T: restart or rewrite parts of the architecture that work (database
  layer, route assembly, bucket abstraction) without an explicit request.
- DON'T: commit generated files, env files, snapshots, `bucket/`,
  `dbSnapshots/`, `notAssets/`, `public/images`, `email/` — they are
  gitignored on purpose.
