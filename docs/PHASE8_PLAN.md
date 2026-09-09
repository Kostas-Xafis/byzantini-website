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
  - Local dev: `cd services/pdfWorker && bunx --bun wrangler dev`.
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

## 3. Email service (`email/`, React templates + MailerSend)

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

## Sequencing

1. PDF (cheapest — pure JS): in-process route + fonts via ASSETS; verify
   `registrations` PDF tests + admin download.
2. Email: move templates in-process; keep MailerSend; E2E registration email.
3. ~~Images: switch uploads to the `IMAGES` binding; visual-verify thumbnails.~~ ✅ DONE (see §2).
4. Decommission: `services/` (+ docker scripts), `.env` service vars,
   `AUTOMATED_EMAILS_*` → worker secrets (already there).
