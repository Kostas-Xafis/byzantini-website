# Deploying `admin-auth-providers` — preview first, then production

Runbook for the branch that brings: per-device sessions + PBKDF2 + Google/Apple/Microsoft sign-in, roles, password
reset, invite management, activity log, «Σφάλματα» + email digest, security headers / CSP, public-file
hardening, the dashboard tiles, colour tokens, custom SVG icons (Font Awesome removed), the visual refresh.

Every command here needs the owner's Cloudflare login (`bunx wrangler login`). Run them from the repo root unless
stated. Nothing below deploys by itself.

## 0. State before starting (verified locally 2026-10-16)

- Branch `admin-auth-providers` contains `main` (registrations search fix) and every side branch.
- Gates on the merged code: typecheck, 178 unit, 353 API (PDF included), 13 Playwright e2e, both workers'
  typecheck + tests (13 + 40), `astro-check` = the 15 known errors, `bun run build` + `check:bundle` clean.
- Changes outside the site worker:
  - **D1:** one migration, `0008_auth_identities_sessions.sql` (sessions, identities, roles, password resets,
    invites with hashed links, activity log, `sys_errors`). It was edited in place while the branch was unreleased.
  - **Emails worker:** a new template (`sysuser_password_reset.html`), a 15-minute cron and a `DB` binding to
    **production** `byzantini-db` (error digest). Existing templates and the send API are unchanged.
  - **PDF worker:** unchanged.
- No new secrets are required. Optional: `APPLE_*`, `MICROSOFT_*` (each provider appears once its vars are set).

The preview site (`byzantini-website-preview`) has its own D1 (`byzantini-db-preview`) and R2
(`byzantini-bucket-dev`), but **shares the single emails worker and PDF worker with production**.

## 1. Preview

1. **Is 0008 still pending on preview?** (0008 was edited after it may have been applied there.)
   ```bash
   bunx wrangler d1 migrations list DB --remote --env preview
   ```
   - 0008 listed as pending → continue.
   - 0008 already applied (an older version) → the new tables are missing; do **not** edit history: reset the
     preview DB from a production export (`bun run db:replicate`, then import into `byzantini-db-preview`) or ask
     for a follow-up migration `0009` with the missing statements.
2. **Migrate the preview database:**
   ```bash
   bunx wrangler d1 migrations apply DB --remote --env preview
   ```
3. **Publish email templates** (adds the password-reset one; the others are rebuilt identically):
   ```bash
   cd services/emailWorker && bun run templates:build --prod
   ```
4. **Deploy the preview site:**
   ```bash
   bun run cf deploy:preview
   ```
   Do **not** deploy the emails worker yet — its cron reads production `sys_errors`, which exists only after
   step 2.2 below.
5. **Check on preview** (sign in with your own account; invite a throwaway admin for the role checks):
   - Sign-in with password and with Google; «Ο λογαριασμός μου» (devices, change password).
   - «Ξεχάσατε τον κωδικό;» → the email arrives → reset works.
   - Invite → «Εκκρεμείς προσκλήσεις» → resend / cancel; signup from the link.
   - A secretary does not see query logs / activity log / fee catalog; an owner sees activity + fee catalog.
   - «Αρχική» tiles, Μαθητολόγιο (`?review=1`), registrations, a PDF print, an Excel export.
   - Public pages: home, Εγγραφές form, Σπουδαστήρια, an announcement, Καθηγητές; icons and the logo look right.
   - Browser console on `/admin`: no Content-Security-Policy errors. `/api/health` → `{"data":{"ok":true}}`.
   - `/html_templates/…` and `/pdf_templates/…` answer 404.
   - Optional: `E2E_BASE_URL=https://<preview-host> bun run e2e` is **not** supported (the suite cleans the local
     DB) — use the checklist above.
6. Leave it running for a day or two with the secretaries if possible.

## 2. Production (slowly)

1. **Backup + checks:**
   ```bash
   bun run db:replicate      # dbSnapshots/prod-export.sql — the restore point
   bun run db:query:prod -- "SELECT lower(email), COUNT(*) FROM sys_users GROUP BY lower(email) HAVING COUNT(*) > 1"
   bunx wrangler d1 migrations list DB --remote --env production
   ```
   The duplicate query must return no rows; 0008 must be the only pending migration.
2. **Migrate production** (quiet hour — admins are signed out by it):
   ```bash
   bunx wrangler d1 migrations apply DB --remote --env production
   ```
   Pending invites are dropped (links are now stored hashed) — re-send them after step 4.
3. **Publish templates** if not already done in 1.3 (`cd services/emailWorker && bun run templates:build --prod`).
4. **Deploy the site:** `bun run cf deploy`.
5. **Deploy the emails worker** (cron + DB binding):
   ```bash
   cd services/emailWorker && bunx wrangler deploy --config wrangler.jsonc
   ```
6. **Right after:**
   - Sign in yourself (password + Google); check `/admin`, `/admin/errors`, `/api/health`.
   - Tell the admins to sign in again (sessions moved tables). **Do not rotate `SECRET`** until every admin has
     signed in once (legacy password hashes depend on it).
   - Re-send pending invites from «Διαχειριστές».
   - Create the uptime monitor on `https://musicschool-metamorfosi.gr/api/health` (docs/ERROR_ALERTING.md).
   - `bunx wrangler tail byzantini-website-production` for a few minutes; the «Σφάλματα» page over the next days.
7. **CPU budget:** PBKDF2 = 100 000 iterations (~20–40 ms CPU per sign-in). On the Workers **free** plan (10 ms
   CPU) lower `PBKDF2_ITERATIONS` in `lib/auth/passwords.ts` before step 4.

## 3. Rollback

- **Site / emails worker:** `bunx wrangler rollback --name byzantini-website-production` (or
  `byzantini-website-emails`) returns to the previous version.
- **Database:** the old code does not understand 0008 (sessions moved to `sys_user_sessions`), so a code rollback
  needs the data back too: `bunx wrangler d1 time-travel restore DB --env production --timestamp <before step 2.2>`
  (or import `dbSnapshots/prod-export.sql`). Data written after the migration is lost by a restore.
