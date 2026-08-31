# Phase 6 — Deploy (DONE)

**Status: preview environment live + fully verified on the edge.**
`bun run cf deploy:preview` (build + generate + deploy) is the preview flow; prod
flows via `bun run cf deploy` once the cutover (Phase 7) is scheduled.

> History: deploy path verified with `wrangler deploy ... --dry-run` (~253 kB gzip);
> resources created (D1 prod+preview, ids pinned); secrets bulk-set; the edge-only
> SSR 404 was traced to CF error 1042 (worker self-fetch) and fixed with in-process
> dispatch (`lib/hooks/useAPI.astro.ts`) — see `docs/MIGRATION_SPEC.md`.

## Resource provisioning (needs auth)

1. `wrangler login`
2. `bun run cf d1:create` → creates `byzantini-db`; **copy the `database_id`** into
   `wrangler.jsonc` (top-level `d1_databases` and `env.production`, see the commented scaffold).
3. Preview D1: `wrangler d1 create byzantini-db-preview` → pin its id under `env.preview`.
4. R2: buckets `byzantini-bucket` + `byzantini-bucket-dev` exist (prod binding already in the
   top-level config; pin ids under `env.preview`/`env.production` if needed).
5. Rebuild + regenerate types: `bun run build && bun run types`.

> **Deployed worker names** (adapter-suffixed): production = `byzantini-website-production`,
> preview = `byzantini-website-preview`. All secret/vars and tail commands must target
> those names — the non-suffixed `byzantini-website` name has no worker.

## Secrets & vars

For EACH environment (`wrangler secret bulk` / `secret put` against the deployed
worker name; preview independently):

- `SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTOMATED_EMAILS_SERVICE_URL`,
  `AUTOMATED_EMAILS_SERVICE_AUTH_TOKEN` (in preview use the dev/test service URLs).
- Non-secret vars (site content etc. — preview values differ): put into `env.<env>.vars`
  in `wrangler.jsonc` (values are committed — do not place secrets there).

## Deploy

```bash
bun run cf deploy            # build + wrangler deploy --config dist/server/wrangler.json
bun run cf deploy:preview    # build + self-generate preview config + deploy
bun run cf tail --name byzantini-website-production   # live logs
```

> **Caveat**: the adapter-generated `dist/server/wrangler.json` currently carries bindings only
> when ids are present and drops `env.*` sections. Until that is resolved, `deploy:preview`
> behaves like `deploy`; the preview split lands when D1/R2 ids are pinned (step 1-4) and the
> generated config is re-checked (`python3 -c "import json;print(json.load(open('dist/server/wrangler.json')).keys())"`).

## Custom domain + cutover (Phase 7)

- Add `musicschool-metamorfosi.gr` as a custom domain on the Worker (dashboard or `wrangler.jsonc`
  `custom_domains`), keep Pages alive for rollback, then switch DNS when verified.
- Kept until cutover: Pages project `byzantini-website`, Turso (read-only), dev secrets.

## Verification checklist (pre-cutover)

1. `bun run cf deploy:preview` → smoke: homepage, announcements, login, one upload → D1 preview.
2. The large-binary multipart uploads (announcements images) — **verify on the real runtime**
   (`bun run cf dev` = built worker in workerd, or the preview deploy) — the vite-dev relay
   limitation does not apply there.
3. `bunx wrangler rollback --help` familiarity (versions-based rollback).
