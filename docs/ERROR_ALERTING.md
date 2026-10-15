# Error alerting — proposal (docs/IMPROVEMENTS.md P12, handoff task C2)

Status: **proposal, awaiting the owner's decision.** Nothing here is implemented yet.

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
