# byzantini-website-pdf-gen — PDF generation Worker

Cloudflare Worker that renders the registration form PDFs for the Byzantini
website (replaces the retired dockerized/Cloud Run Bun service — Phase 8 PDF
port). Supports single PDFs and merged multi-registration PDFs.

## Overview

- Runtime: Cloudflare Workers (`pdf-lib` + `@pdf-lib/fontkit` — pure JS)
- Deployed name: **`byzantini-website-pdf-gen`**
- Templates + font are bundled static assets (no dependency on the site)
- **Reached only through the website's `PDF_SERVICE` service binding** — the
  browser admin panel no longer calls this worker's URL directly. The site's
  `POST /api/pdf` route (session-cookie authenticated) proxies here, sending
  `Authorization: Bearer <token>` with the shared secret.

## Environment

`.dev.vars` locally; `wrangler secret put` in production:

| Var | Purpose |
| --- | --- |
| `SERVICE_AUTH_TOKEN` | Shared secret — must match the website's `PDF_SERVICE_AUTH_TOKEN`; sent as `Authorization: Bearer` on every call |

> The website's `bun run worker-secrets` (rotation) keeps this value in sync:
> it writes the same token into `.dev.vars`, `.env.production` (mirror) and the
> deployed Cloudflare secret automatically.

No `vars` remain in `wrangler.jsonc`: `SITE_URL`, `IS_DEV`, the referer
allowlist and the session back-call (`POST /api/auth/session`) are all gone —
that auth existed only for the retired direct-browser flow.

## Local Run

```bash
bunx wrangler dev --config wrangler.jsonc   # http://127.0.0.1:8787
```

The website's local dev (Astro) resolves its `PDF_SERVICE` binding to this
`wrangler dev` session automatically (cross-command service bindings) — no URL
to configure anywhere.

## Deploy

```bash
bunx wrangler secret put SERVICE_AUTH_TOKEN --config wrangler.jsonc   # first time
bunx wrangler deploy --config wrangler.jsonc   # creates/updates byzantini-website-pdf-gen
```

> `--config wrangler.jsonc` is required: this worker lives inside the website
> repo, and wrangler otherwise walks up and picks up
> `../../.wrangler/deploy/config.json` ("config base path" error).
>
> Deploy this worker (and the emails worker) **before** the website when
> rolling out the service bindings — the site's binding needs the target
> worker to exist on the account.

## Observability

Enabled in `wrangler.jsonc`:

- `observability` — Workers Logs at 100% sampling (`head_sampling_rate: 1`,
  `logs.invocation_logs: true`), since volume is low.
- `analytics_engine_datasets` — binding `env.ANALYTICS` to the
  `byzantini_pdf_worker_requests` dataset. The dataset is created automatically
  on the first write after deploy; no manual dashboard step.

Every request emits **one Analytics Engine data point** and **one structured
JSON log line** (`{"event":"pdf_request",...}`), including requests that fail
auth or validation. The response also carries an `X-Request-Id` header that
matches the `requestId` of both records.

Recorded fields:

| Analytics Engine | Field | Meaning |
| --- | --- | --- |
| blob1 | `outcome` | `ok` \| `bad_request` \| `unauthorized` \| `error` |
| blob2 | `type` | request body `type` (`-` if unparsed) |
| blob3 | `mode` | `single` \| `multiple` (`-` if unparsed) |
| blob4 | `requestId` | UUID, also returned as `X-Request-Id` |
| blob5 | `colo` | Cloudflare colo that served the request |
| blob6 | `error` | short failure reason (`-` on success) |
| double1 | `durationMs` | wall-clock handling time |
| double2 | `status` | HTTP status returned |
| double3 | `count` | registrations rendered |
| index | `outcome` | sampling/grouping key |

> **No personal data.** Request bodies (names, emails, phone numbers, AMKA,
> addresses) and the `Authorization` header are never logged — only request
> metadata. Keep it that way when extending `src/observability.ts`.

Query the dataset with the [Workers Analytics Engine SQL API](https://developers.cloudflare.com/analytics/analytics-engine/sql-api/)
(token needs **Account Analytics Read**):

```sql
-- request volume and failures, last 24h
SELECT blob1 AS outcome, SUM(_sample_interval) AS requests
FROM byzantini_pdf_worker_requests
WHERE timestamp > NOW() - INTERVAL '1' DAY
GROUP BY outcome
ORDER BY requests DESC;
```

```sql
-- average / worst handling time per mode, last 7 days
SELECT blob3 AS mode,
       SUM(_sample_interval * double1) / SUM(_sample_interval) AS avg_ms,
       MAX(double1) AS max_ms
FROM byzantini_pdf_worker_requests
WHERE timestamp > NOW() - INTERVAL '7' DAY
GROUP BY mode
ORDER BY avg_ms DESC;
```

In local dev (`wrangler dev`), the binding resolves to a local simulation of
Analytics Engine; structured log lines still print to the terminal.

## API

### Endpoint

- `POST /` (JSON body) — same contract as before:
  `{ type: "registration", request: { isMultiple, data } }`; responds with the
  PDF bytes (`application/pdf`) or a plain-text error with a 4xx/5xx status.

### Authorization and Access Rules

- **Every** request must carry `Authorization: Bearer <SERVICE_AUTH_TOKEN>`
  (constant-time compare). The site adds it when proxying through the
  `PDF_SERVICE` binding; the actual user gate is the site's
  `authenticateMiddleware` (session cookie) on `POST /api/pdf`.
- No CORS, no referer allowlist, no `IS_DEV` skip, no session back-call to the
  website.

## Request Schema (registration)

Single PDF:

```json
{
  "type": "registration",
  "request": {
    "isMultiple": false,
    "data": {
      "url": "/pdf_templates/byz_template.pdf",
      "student": {
        "id": 1,
        "am": "123",
        "amka": "",
        "first_name": "John",
        "last_name": "Doe",
        "fathers_name": "Father",
        "birth_date": 946684800000,
        "telephone": "2100000000",
        "cellphone": "6900000000",
        "email": "john@example.com",
        "road": "Street",
        "number": 1,
        "tk": 11111,
        "region": "Athens",
        "registration_year": "2025-2026",
        "class_year": "A",
        "class_id": 0,
        "teacher_id": 1,
        "instrument_id": 1,
        "date": 1735689600000,
        "payment_amount": 0,
        "total_payment": 0,
        "pass": true
      },
      "teachersName": "Teacher Name",
      "instrument": "Piano"
    }
  }
}
```

Merged multi-PDF: same shape with `"isMultiple": true` and `data` as an array
of the `data` objects above (template files are merged in order).

### Template paths

Bundled assets:

- `/pdf_templates/byz_template.pdf` (`class_id` 0)
- `/pdf_templates/eur_template.pdf` (`class_id` 2)
- `/pdf_templates/par_template.pdf` (`class_id` 1)
- `/fonts/DidactGothic-Regular.ttf`

## Response

- `200`: PDF bytes (`Content-Type: application/pdf`)
- `400`: malformed body or unsupported request type
- `401`: missing/invalid bearer token

Every response also carries `X-Request-Id` (see [Observability](#observability)).

## Local smoke test

Use the token value from your `.dev.vars` (never print secrets into logs):

```bash
curl -s -X POST "http://127.0.0.1:8787" \
  -H "Authorization: Bearer <SERVICE_AUTH_TOKEN from .dev.vars>" \
  -H "Content-Type: application/json" \
  -d '{"type":"registration","request":{"isMultiple":false,"data":{"url":"/pdf_templates/byz_template.pdf","student":{"id":1,"am":"123","amka":"","first_name":"John","last_name":"Doe","fathers_name":"Father","birth_date":946684800000,"telephone":"2100000000","cellphone":"6900000000","email":"john@example.com","road":"Street","number":1,"tk":11111,"region":"Athens","registration_year":"2025-2026","class_year":"A","class_id":0,"teacher_id":1,"instrument_id":1,"date":1735689600000,"payment_amount":0,"total_payment":0,"pass":true},"teachersName":"Teacher Name","instrument":"Piano"}}}' \
  -o /tmp/registration.pdf && file /tmp/registration.pdf
```

## Integration

The main app's admin panel calls the site API (`POST /api/pdf` via
`lib/pdf.client.ts`), which proxies through the `PDF_SERVICE` service binding.
No `VITE_PDF_SERVICE_URL` any more.
