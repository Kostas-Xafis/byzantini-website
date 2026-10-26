# Error alerting — proposal (docs/IMPROVEMENTS.md P12, handoff task C2)

Status: **option A + an uptime check chosen by the owner (2026-10-15) and implemented** — see "What was built"
at the end. Alerts go to the sysadmin only. The uptime monitor itself still has to be created (an external account).

## The problem

When something breaks in production, nobody finds out until a secretary or a parent complains.

- The site's `wrangler.jsonc` has `observability: { enabled: true }` and nothing else (the two workers also set
  `head_sampling_rate: 1` and logs).
- Unexpected API errors are only `console.error`-logged in `APIServer.errorResponse` (`[api] <context>: <error>`)
  and answered with a generic Greek 500. The same goes for an `afterWrite` (activity log) failure, a response that
  does not match its schema, and a failed email or PDF call.
- Workers Logs keeps those lines (3 days on the Free plan, 7 on Paid), but nobody reads them unless they already
  know something is wrong.

What we want: **someone (the sysadmin) is told within minutes to an hour when unexpected errors happen**, with
enough to find the cause, and **no personal data of pupils or parents leaves the system** in the alert.

## What must never be reported

Request bodies (names, ΑΜΚΑ, phones, addresses, emails), cookies / `Authorization`, query strings with tokens
(invite, reset and registration links), SQL arguments. An alert carries: time, endpoint key (e.g.
`Pupils.post`), HTTP status, error class and message (our messages are Greek text without data; DB/driver
messages are truncated), environment, request id.

## Options

### A. In-house: record errors in D1, email a digest (recommended)

1. `APIServer.errorResponse` (and the other `console.error` sites above) also insert a row into a new
   `sys_errors` table: `created_at, endpoint, status, error_name, message (truncated to ~300 chars), request_id,
   environment` — through the same `executeQuery` wrapper, never throwing (a failing log must not hide the
   original error). Repeated identical errors are counted, not duplicated (`count`, `last_seen_at`), so a broken
   route cannot flood the table.
2. A **Cron Trigger** on the emails worker (it already sends mail via MailerSend) runs e.g. every 15 minutes,
   reads new rows through a small authenticated site route, and emails the sysadmin a digest only when there
   are new errors. Daily «όλα καλά» is optional.
3. A sysadmin-only «Σφάλματα» page next to query logs lists them (role permission `queryLogs` or a new one).
   Rows are kept 90 days.

- **Cost:** €0 — D1 writes and cron triggers are within the current usage; one more email per incident.
- **Data:** never leaves Cloudflare + MailerSend (already the school's processors).
- **Setup:** one migration, ~150 lines of code, one new email template, the cron in the emails worker's
  `wrangler.jsonc`. No new accounts.
- **Limits:** only sees errors that reach our code (API handlers, page frontmatter if wired, the workers' own
  catch blocks). A crash before our code runs (e.g. a bad deploy that fails at startup) produces no row — the
  digest's silence would not prove health. Mitigation: the uptime check below.

### B. Sentry (`@sentry/cloudflare`)

Sentry's official Workers SDK wraps the worker's fetch handler and reports uncaught and captured errors with
stack traces, release tracking, grouping and email/Slack alerts.

- **Cost:** the free Developer plan is one user and about 5 000 errors per month (check sentry.io/pricing — the
  tiers change); more users means the paid Team plan.
- **Data:** a third-party processor (US/EU region selectable). Must be configured with `sendDefaultPii: false`
  and a `beforeSend` that strips request bodies, cookies, headers and query strings — and that configuration has
  to stay right forever. GDPR-wise it needs to be listed as a processor for the school.
- **Setup:** a Sentry account owned by the school, the DSN as a Cloudflare secret, wrapping the Astro adapter's
  worker entry (custom entry point) and both service workers; source-map upload in the build for readable
  stacks.
- **Strength:** catches everything, including errors outside our try/catch, with stacks and grouping.

### C. Cloudflare-only: Workers Logs + external check

Keep `console.error` as is and query Workers Logs (dashboard Observability query builder: `$metadata.level =
error`, grouped by message) — or poll the GraphQL Analytics API (`workersInvocationsAdaptive`, error ratio) from a
scheduled job and notify on a threshold.

- **Cost:** €0 on the current plan (Workers Logs: 200 000 events/day free; Paid: 20 M/month included, 7-day
  retention). An Analytics API token is needed for polling.
- **Limits:** I could not confirm built-in alert rules on Workers Logs — today it is a place to look, not a
  notifier, so this needs the same scheduled job as A, with less context (no endpoint key, only log text).

### Either way: an uptime check

A free external monitor (e.g. UptimeRobot, Better Stack) hitting `/` and a cheap health route every 5 minutes
catches the "whole site is down" case that no in-code reporting can. It needs only the sysadmin's email.

## Recommendation

**A + an uptime check.** It costs nothing, keeps pupils' data inside the systems the school already uses, fits
the existing stack (D1, the emails worker, the sysadmin pages) and covers the realistic failures of this site —
a route that starts failing after a deploy or a data edge case, a worker that cannot be reached. Revisit Sentry
(B) if errors outside our handlers become a real problem.

## Decisions needed from the owner

1. A, B or C (and whether to add the uptime monitor — it needs an account in the school's or the sysadmin's name).
2. Who receives the alerts (the sysadmin only, or the owner too) and how often (every 15 min when there are
   errors / a daily digest).
3. For B: who owns the Sentry account, and which region.

## What was built (option A)

- **Recording** — `sys_errors` (migration 0008; one row per distinct error: source, status, error class, scrubbed
  message, host, count, first/last seen, notified_at). `APIServer.onServerError` (installed by the route
  registry) records every 5xx the API answers — handler exceptions, a response that breaks its schema, a route that
  answers a 5xx itself (e.g. the PDF worker failed: its public message is kept) — plus a failed `afterWrite`;
  `src/middleware.ts` records pages that crash (`page /path`). `lib/errors/describe.ts` keeps only the error class
  and a message with emails and digit runs ≥ 6 masked, truncated to 300 characters.
- **«Σφάλματα» page** — `/admin/errors` (sysadmin, the `queryLogs` permission): newest first, count, «νέο» until
  notified, «Διαγραφή» per row or all. Routes `Errors.list` / `Errors.delete`.
- **Digest** — the emails worker's cron (`*/15 * * * *`, `services/emailWorker/src/errorDigest.ts`) reads
  `sys_errors` through its own `DB` binding to `byzantini-db`, emails every `sysadmin` the rows seen since they were
  last notified (at most 50 per email, a link to the page), marks them, and deletes rows older than 90 days.
  Nothing is sent when nothing is new; a failed send is retried next run. A plain inline-HTML email — no R2 template.
- **Health** — `GET /api/health` (public): `{ data: { ok: true } }` when the worker runs and D1 answers, 503
  otherwise.

### Setup (owner, at deploy time)

1. Apply 0008 remotely (it creates `sys_errors`), deploy the site, then deploy the emails worker
   (`cd services/emailWorker && bunx wrangler deploy --config wrangler.jsonc`) — the deploy registers the cron and
   the D1 binding. Errors of the **preview** site are recorded in the preview database and not mailed (the worker
   reads production only).
2. **Uptime monitor** (any free one — UptimeRobot, Better Stack, …), in the sysadmin's name:
   - a keyword/HTTP monitor on `https://musicschool-metamorfosi.gr/api/health`, every 5 minutes, alert when the
     status is not 200 (or the body lacks `"ok":true`);
   - optionally a second one on `https://musicschool-metamorfosi.gr/` for the static pages;
   - alerts to the sysadmin's email.
3. Check once: `bunx wrangler tail byzantini-website-emails` around a quarter past — an idle run logs nothing
   (no new errors); the «Σφάλματα» page shows anything recorded.

### Trying it locally

`cd services/emailWorker && bunx wrangler dev --config wrangler.jsonc --name errors-digest-check --port 8790
--persist-to ../../.wrangler/state --test-scheduled --var DRY_RUN:true`, then `curl
'http://localhost:8790/__scheduled?cron=*/15+*+*+*+*'` — it reads the site's local dev database and only logs
(`[dry-run:…]`, masked recipients). Keep `DRY_RUN:true` on the command line: the cron has no request to recognise
a local run by.
