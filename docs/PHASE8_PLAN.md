# Phase 8 — Aux services port plan (post-cutover)

> Goal: bring PDF generation, image compression and email onto the Workers
> platform so everything is one deployable unit. **Not started** — cutover
> (Phase 7 domain switch) comes first; this is the blueprint.

## 1. PDF worker (`services/pdfWorker`, ~358 LOC) — ✅ DONE

- **Deps**: `pdf-lib` + `@pdf-lib/fontkit` — **both pure JS → workerd-compatible**.
- **What it does**: `Bun.serve` HTTP service; registers fonts (TTF), renders the
  registration PDF (`PDFRegstration`) from a typed `PDFRequest`; the main app
  calls it via `lib/pdf.client.ts` (`Authorization: Bearer <session_id>`).
- **Port options** (pick at execution):
  - **(a) In-process (recommended start)**: a `PDF.generate` APIServer route in
    the main worker; fonts from the `ASSETS` binding; `lib/pdf.client.ts` calls
    `useAPI` instead of the external URL (keeps the bearer flow server-side).
    Cost: +~600 kB gzip bundle — verify against Workers size limits.
  - **(b) Separate worker + service binding** (`byzantini-pdf`, `services` in
    wrangler config) — cleaner isolation, two deploys.
- **Executed design (user choice: keep the direct browser → worker call)**:
  - `services/pdfWorker` converted from the Bun/Docker service into the
    Cloudflare Worker **`byzantini-website-pdf-gen`** (`wrangler.jsonc` +
    `src/index.ts`; Dockerfiles, `.env` and the root `docker:*` scripts
    removed). Same `POST /` contract and response codes; same referer
    allowlist + bearer-session validation against `<SITE_URL>/api/auth/session`
    (parses both the old `{res:{data}}` and new `{data}` envelopes);
    `.dev.vars` `IS_DEV=true` skips auth locally.
  - Registration templates (`notAssets/pdf_templates/*.pdf`) + the
    DidactGothic font are **bundled static assets** (`assets/`, served via the
    `ASSETS` binding) — the worker no longer fetches templates from the site.
  - `VITE_PDF_SERVICE_URL` now points at the worker
    (`https://byzantini-website-pdf-gen.koxafis.workers.dev`; dev:
    `http://127.0.0.1:8787` via `wrangler dev`). `lib/pdf.client.ts` is
    unchanged (it already POSTs JSON + bearer and reads a PDF blob).
  - Local dev: `cd services/pdfWorker && bunx wrangler dev --config wrangler.jsonc` (no `--bun`).
  - Decommission: Cloud Run instance `byz-pdfworker-*` + Docker image after
    the website is rebuilt/redeployed with the new URL.


## 2. Image compression (`services/imageCompression`, ~128 LOC) — ✅ DONE

- **Deps**: `sharp` — **native, cannot run in workerd**.
- **What it did**: accepted images, resized/compressed (thumbnails + main
  images for announcements); the app called it with
  `VITE_IMG_COMPRESSION_SERVICE_URL`.
- **Executed design**: Cloudflare Images binding.
  - `wrangler.jsonc` declares `"images": { "binding": "IMAGES" }` at top level
    AND under `env.production` / `env.preview` (the binding is not inherited by
    named environments; the adapter would otherwise auto-add it anyway).
  - `lib/images.ts` exposes `compressImageForThumb()` — same `sqrt(size / 40KB) / 2`
    shrink heuristic as the sharp service, output format follows input format,
    `fit: "scale-down"` (avoids the old accidental upscaling just above 40 KB).
  - `Announcements.postImage` generates `thumb_*` in-process (still
    `authenticateMiddleware`-protected, unlike the old external service's
    referer/self-fetch auth); the client no longer sends `thumbData`.
  - `VITE_IMG_COMPRESSION_SERVICE_URL` dropped from env files/types; Docker
    `imgcomp` scripts removed; `services/imageCompression` (untracked, own
    `.git`) deleted — decommission the Cloud Run instance after cutover.
  - Dev: miniflare simulates the binding locally (workerd images worker), so
    `astro dev` and the API tests exercise the real transform path.

## 3. Email service (`email/`, React templates + MailerSend) — ✅ DONE (part 1)

- **Deps**: `@react-email/render` (pure JS → workerd-friendly), `mailersend`
  (HTTP API → worker-friendly), `@aws-sdk/client-s3` (template assets — replace
  with `ASSETS`/R2 binding), React 19 (SSR render of templates).
- **What it does**: renders React-email templates (registration confirmation,
  unsubscribe flows) and sends via MailerSend; currently an external HTTP
  service called by `registrations.server` (Phase 4 port already calls
  `AUTOMATED_EMAILS_SERVICE_URL`).
- **Port options**:
  - **(a) In-process sender route** (recommended): `Email.*` APIServer routes
    render the templates + call MailerSend directly; `email/render` moves under
    `lib/emails/`; the Docker service + `AUTOMATED_EMAILS_SERVICE_URL` retire.
  - **(b) Cloudflare Email Sending API** as the transport instead of MailerSend
    (keep `cloudflare-email-service` skill guidance in mind).
- **Executed design (user choice: separate worker, keep MailerSend, fetch
  templates from the site)**:
  - New worker **`byzantini-website-emails`** (`services/emailWorker`): same
    `POST /` contract as the old mail server (`{authToken, to, subject,
    htmlTemplateName, templateData}`), constant-time token check against the
    `SERVICE_AUTH_TOKEN` secret, templates fetched from
    `<SITE_URL>/html_templates/<name>` (R2 file proxy — the same source the old
    service used in production; template names validated, no traversal),
    MailerSend called **directly via its REST API** (the `mailersend` npm
    package uses gaxios/node http and does not run on workerd).
    `DRY_RUN=true` in `.dev.vars` logs instead of sending.
  - **Whole `email/` folder moved into the worker project** (campaign CLI,
    `render/`, html/text templates, Dockerfiles — unused parts kept): the
    campaign CLI reads recipients from **Cloudflare D1** through
    `wrangler d1 execute --remote` (`src/db.ts` spawns wrangler per query —
    uses the existing `wrangler login`; no API token, no server):
    `--db prod` ⇒ `byzantini-db`, default `dev` ⇒ `byzantini-db-preview`
    (names default to the pinned `wrangler.jsonc` values, overridable). The
    worker itself stays transactional-only (no attachments / plain-text —
    campaign-only features). The old `email/` folder is kept until the worker
    + CLI are verified.
  - **AWS SDK removed**: `@aws-sdk/client-s3` (the only user was
    `templates:build --prod/--dev`'s S3-compatible upload) is gone. The
    worker now holds the R2 binding (`BUCKET` ⇒ `byzantini-bucket`) and
    `templates:build` publishes through `POST /html-templates` on the worker
    (authToken-gated; keys `html_templates/<name>`), so the CLI needs no R2
    credentials — `EMAIL_WORKER_URL` tells the CLI which worker to publish to.
  - Site side: no code change — the deployed secret `AUTOMATED_EMAILS_SERVICE_URL`
    just points at the worker; the shared token stays the same and is copied to
    the worker's `SERVICE_AUTH_TOKEN` secret.
  - Secrets (never in files): `wrangler secret put MAILERSEND_API_KEY` /
    `SERVICE_AUTH_TOKEN` on the worker; re-point the site's
    `AUTOMATED_EMAILS_SERVICE_URL` to
    `https://byzantini-website-emails.koxafis.workers.dev`.
  - Decommission the Cloud Run mail service after cutover.

## Sequencing

1. PDF (cheapest — pure JS): in-process route + fonts via ASSETS; verify
   `registrations` PDF tests + admin download.
2. Email: move templates in-process; keep MailerSend; E2E registration email.
3. ~~Images: switch uploads to the `IMAGES` binding; visual-verify thumbnails.~~ ✅ DONE (see §2).
4. Decommission: `services/` (+ docker scripts), `.env` service vars,
   `AUTOMATED_EMAILS_*` → worker secrets (already there).

## 4. Worker↔worker transport: service bindings — ✅ DONE (2026-09)

The last HTTP-based link between the site and the aux workers was replaced by
**service bindings** (no worker↔worker HTTP left; the only remaining external
HTTP is CLI→worker `POST /html-templates` for `templates:build`, which cannot
be a binding).

- Site `wrangler.jsonc` declares `EMAIL_SERVICE` → `byzantini-website-emails`
  and `PDF_SERVICE` → `byzantini-website-pdf-gen` (top level AND under
  `env.production`/`env.preview` — service bindings, like other bindings, are
  NOT inherited by named environments).
- **PDF flow rerouted**: the browser never calls the PDF worker directly any
  more. `lib/pdf.client.ts` posts same-origin to the new authenticated API
  route `Pdf.generate` (`POST /api/pdf`, session cookie via
  `authenticateMiddleware`), which proxies through the `PDF_SERVICE` binding
  with `Authorization: Bearer <PDF_SERVICE_AUTH_TOKEN>`.
- **pdfWorker auth rewritten**: referer allowlist + `IS_DEV` + session
  back-call to `<SITE_URL>/api/auth/session` removed; every call now needs the
  shared `SERVICE_AUTH_TOKEN` secret (constant-time compare, like the emails
  worker). `SITE_URL`/`IS_DEV` vars deleted; CORS deleted.
- **Emails worker template source changed**: per-send templates are read from
  its own `BUCKET` R2 binding (`html_templates/<name>` — the same keys
  `POST /html-templates` writes) instead of `GET <SITE_URL>/html_templates/`.
  `SITE_URL` var deleted; local dev seeds its R2 via `templates:build --dev`.
- **Site email calls**: `Registrations.post` + `SysUsers.createRegisterLink`
  now go through `sendAutomatedEmail` (`lib/api/routes/emailService.ts`) over
  the `EMAIL_SERVICE` binding, still sending the shared
  `AUTOMATED_EMAILS_SERVICE_AUTH_TOKEN` in the body (the worker's public URL
  stays token-gated for the CLI publish endpoint).
- Env cleanup: `VITE_PDF_SERVICE_URL`, `AUTOMATED_EMAILS_SERVICE_URL`,
  pdfWorker/emailWorker `SITE_URL` and pdfWorker `IS_DEV` are gone (types,
  `.dev.vars`, `.env*`, docs). New site secret `PDF_SERVICE_AUTH_TOKEN`
  (worker-side: pdfWorker `SERVICE_AUTH_TOKEN`).
- Local dev unchanged in shape: `astro dev` + one `wrangler dev` per worker —
  the Vite plugin resolves the bindings to the local sessions automatically
  (cross-command service bindings, supported since mid-2025). The sysusers
  test suite needs the emails worker running (invite send), as before.
- **Rollout order**: deploy both aux workers first (and set pdfWorker's
  `SERVICE_AUTH_TOKEN` secret), then rebuild + deploy the site. Old
  deployed secrets (`AUTOMATED_EMAILS_SERVICE_URL`, `VITE_PDF_SERVICE_URL`)
  can be deleted afterwards. Secret bootstrap/rotation: `bun run worker-secrets`
  (`scripts/workerSecrets.ts`) — dry-run first.
