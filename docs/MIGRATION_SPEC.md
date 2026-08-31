# Migration Specification — Internal Invariants (read me first)

> This is the canonical handoff document for any agent (or subagent) working on the
> Byzantini-Website migration on branch `Workers`. It exists because subagents do not
> share the main conversation — the repo is the shared memory. **Read `AGENTS.md` too.**

## Non-negotiables

1. **Bun only.** Never `npm`/`npx`/`yarn`/`pnpm`. `bun install`, `bunx --bun <cmd>`.
2. **Secrets never leave their files.** `.dev.vars*`, `tests/.env.test`, `email/credentials.json` are
   gitignored. Never print values into code, diffs, docs, or chat.
3. **Do not touch generated dirs**: `dist/`, `.astro/`, `.cache/`, `.wrangler/`, `node_modules/`.
4. **Formatting**: tabs, width 100, `bracketSameLine`. Never run `bun run format` repo-wide —
   format only touched files (`bunx prettier --write <files>`).
5. **Greek UI text is preserved** — never translate or "improve" existing labels; new UI strings are Greek.
6. `bun run typecheck` must pass before any phase is declared done. `bun run check` = typecheck + tests.

## Target architecture (phase by phase — see `MIGRATION_PLAN.md`)

- **Phase 1 (DONE-BASE)**: Astro 7.2.9, `@astrojs/cloudflare` 14.2.x, `@astrojs/solid-js` 7.0.x,
  Tailwind 4 via `@tailwindcss/vite`, `tailwindcss` 4.3.x, `wrangler` 4.127.x, TS 6.0.3
  (TS 7 evaluation deferred — `@astrojs/check` peers only TS ^5||^6).
  Tailwind 4 entry: `src/styles/global.css` (imported once in `src/components/headers/Links.astro`,
  which every layout renders). Theme tokens live in `@theme`; dark mode is class-based
  (`@custom-variant dark (&:where(.dark, .dark *))`).
- **Phase 2**: `wrangler.toml` → `wrangler.jsonc`; static assets; `wrangler types` →
  `worker-configuration.d.ts` replaces `@cloudflare/workers-types`; server env reads become
  `import { env } from "cloudflare:workers"` (Isokratis pattern); client env stays `import.meta.env.VITE_/PUBLIC_`.
- **Phase 3**: D1 binding `DB` replaces libSQL/Turso. **Keep the `???` → `?, ?, …` preprocessing
  and the `ExecReturn` shape** so route call sites do not change. D1 has NO interactive
  transactions: use `db.batch([...])` for static multi-statement flows (atomic), or
  `db.withSession("first-primary")` for sequential consistency; never emulate rollback.
- **Phase 4**: Isokratis-style `APIClient`/`APIServer` (Zod via `astro/zod`), typed responses +
  HTTP statuses, `ServerCookies`; `useAPI` keeps its public signature. The
  `{res:{type:"data"|"message"|"error"}}` envelope is dropped at the server; the hooks unwrap.
- **Phase 5**: R2 direct binding (`env.S3_BUCKET`); delete AWS SDK + dev S3 endpoint.
- **Phase 6**: manual deploys: `wrangler deploy` against the adapter-generated config; envs
  `production` + `preview` (preview has its own D1/R2).
- **Phase 7**: cutover — D1 schema from real Turso export; verify row counts; Pages/Turso kept
  read-only for 2 weeks.
- **Phase 8**: port PDF/image/email services to Workers (research-first; email → Cloudflare Email Service).
- **Phase 9**: cleanup + docs (AGENTS.md refresh).

## Reference codebase

`~/Projects/Isokratis` — already on the target architecture. **READ-ONLY**: never edit it.
Use it for: `wrangler.jsonc` shape, `scripts/cf.ts` CLI wrapper, `migrations/` workflow,
`APIClient`/`APIServer` patterns, `ServerCookies`, `src/lib/d1.ts`.

## Data-layer rules (current app, until Phase 3 replaces them)

- All DB access through `lib/utils.server.ts` (`executeQuery`, `executeTransaction`, `execTryCatch`)
  and `lib/db.ts` — never ad-hoc connections.
- `???` expands to a comma-separated `?, ?, …` list (libSQL); object args are unpacked by
  `objectToArrayFromQuery` via SQL text parsing. Do not "simplify" this during migration.
- `query_logs` keeps its INSERT-based logging; it must remain best-effort.

## Investigated facts (do not re-research)

- D1 session API (current `@cloudflare/workers-types`): `D1DatabaseSession` exposes
  `prepare/batch/getBookmark` only — **no commit/rollback**.
- `@astrojs/cloudflare` 14.x emits `dist/server/entry.mjs` + `dist/server/wrangler.json`
  (assets `../client`); old `dist/_worker.js` layout is gone.
- **v14 removed `locals.runtime.env`** — `Runtime` is `{ cfContext }` only. Server env now
  comes from `cloudflare:workers`; we keep a guarded lazy bridge at `lib/env/runtime.ts`
  (guard exists because `bun test` runs outside workerd). `lib/bucket/index.ts` and
  `lib/env/env.ts` already use it.
- v14 dropped the `platformProxy` adapter option — `@cloudflare/vite-plugin` options
  (`configPath`, `remoteBindings`, …) take its place; wrangler config is auto-discovered
  (wrangler.json → wrangler.jsonc → wrangler.toml). **The build validates the wrangler
  config**, so the `wrangler.toml→jsonc` swap was pulled into Phase 1 (no `main` key — the
  adapter generates it).
- Dev server now listens on **4321** (was 3000) — `tests/.env.test` VITE_URL already matches.
- Tailwind 4 drops dotted theme keys (`--text-1.5xl`); the four custom font sizes are
  `@utility` definitions in `src/styles/global.css`. Named container-query variants were and
  remain inert (no `@container/nav` declaration anywhere).
- `@astrojs/check` on the Workers branch reports the **same 4 pre-existing errors** as the
  old stack on `main` (Links shareImage alt, spoudastiria LocationRow.priority,
  anakoinoseis `key` prop, anakoinoseis Element.src) — verified against a worktree baseline.
  Not upgrade regressions; don't "fix" them in this migration unless asked.
- `tsc --noEmit` is fully green (`bun run typecheck`).
- Adapter v14 auto-adds `SESSION` KV + IMAGES bindings (Astro sessions/images). We don't use
  Astro sessions — revisit in Phase 2 (may disable/ignore).
- Pre-existing test failure on BOTH stacks: `tests/api/announcements.test.ts` `#3`
  (uploadImages) — on the old stack it times out; on the new stack it fails fast. It needs
  the local Docker image-compression service (`services/imageCompression`, port 4323) up;
  the test suite generally needs both Docker services running (PDF 4322, images 4323).

## Phase 1 verified facts (added while executing)

- **Astro 6+/7 CSRF**: `security.checkOrigin` is on by default and rejects form/multipart
  POSTs without an `Origin` header (403 "Cross-site POST form submissions are forbidden").
  `tests/testHelpers.ts` now sends `Origin: VITE_URL` (real browsers already send it for
  same-origin requests — admin panel unaffected).
- **Multipart validation is a pre-existing latent bug, not a migration regression**: multipart
  bodies always arrive as strings; `postImage`'s contract wants `announcement_id: number`, so
  the server 400s ("Μη έγκυρο announcement_id"). On the old stack the same request hung
  instead. Fix deferred to Phase 4: coerce numeric strings in `requestValidation` for
  `multipart: true` routes.
- **Dev bucket**: the AWS SDK cannot be loaded in the workerd dev runtime (eval-import returns
  `{}`) and raw `node:fs` writes are denied (`EPERM`). Replaced with a dependency-free local
  HTTP server — `scripts/bucketServer.ts` (`bun run bucket:serve`, port 4567, serves the
  `bucket/latest` folder; auto-started by `bun run dev`) — reachable from both the dev runtime
  and Bun tests, so they share one store. `lib/bucket/index.ts` dev functions now call it;
  prod uses the R2 binding.
- **Local service ports**: `services/imageCompression/.env` `PORT` must be **4323** (it was
  4321, which now collides with the dev server). PDF stays 4322. App env already references
  4323/4322.
- **v14 dev server binds 4321** (Astro's `port: 3000` is not honored by the vite-plugin dev
  server) — `tests/.env.test` VITE_URL=4321 already matches. Old Pages-era URLs/ports are gone.


## Phase 6 verified facts (edge vs local — the 1042 story)

- **Cloudflare error 1042**: a Worker that self-fetches its own origin gets
  `error code: 1042` on the real edge (allowed locally in miniflare). The SSR
  pages called `useAPI` server-side via `fetch(origin + "/api/...")` → all SSR
  pages 404'd on the deployment while working locally. **Fix**: server-side
  `useAPI` now dispatches **in-process** via `APIServer.handle` with a synthetic
  request (cookies copied from the Astro context) — `lib/hooks/useAPI.astro.ts`.
- `Env.setEnv` must merge the `cloudflare:workers` runtime env on EVERY path
  (not only when `ctx` is passed) — without it `SECRET` was empty at runtime
  (would have broken production logins too). Fixed in `lib/env/env.ts`.
- **Wrangler persistence is config-relative**: commands with
  `--config dist/server/wrangler.json` persist to `dist/server/.wrangler` unless
  `--persist-to .wrangler/state` is passed. `scripts/cf.ts` passes it on every
  local command so CLI migrations + `wrangler dev` share one store.
- **The build wipes `dist/server/`** — deploy configs derived from the generated
  `wrangler.json` must be created AFTER the build; `bun run cf deploy:preview`
  now generates `dist/server/wrangler.preview.generated.json` post-build
  (preview D1/R2 ids + `preview_urls: false`).
- `wrangler.preview.jsonc` (committed) is the config for preview D1 tooling
  (`wrangler d1 ... --config wrangler.preview.jsonc`).
- Local D1 state rotated when the `database_id` was pinned — reseed after
  pinning (`bunx wrangler d1 migrations apply ... --local` + import).
- The test user's password hash in the snapshots was created under the OLD
  dev SECRET — after switching to the current `.dev.vars` SECRET, rehash once
  via `generateShaKey` (see PHASE6 — done for local + preview D1).
