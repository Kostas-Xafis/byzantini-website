# byzantini-website-pdf-gen — PDF generation Worker

Cloudflare Worker that renders the registration form PDFs for the Byzantini
website (replaces the retired dockerized/Cloud Run Bun service — Phase 8 PDF
port). Supports single PDFs and merged multi-registration PDFs.

## Overview

- Runtime: Cloudflare Workers (`pdf-lib` + `@pdf-lib/fontkit` — pure JS)
- Deployed name: **`byzantini-website-pdf-gen`**
- Templates + font are bundled static assets (no dependency on the site)

## Environment

Wrangler `vars` (see `wrangler.jsonc`) + `.dev.vars` locally:

| Var | Purpose |
| --- | --- |
| `SITE_URL` | Website base URL used to validate bearer sessions (POST `<SITE_URL>/api/auth/session`) |
| `IS_DEV` | `"true"` locally skips referer/session checks; **must stay unset in production** |

## Local Run

```bash
bunx --bun wrangler dev          # http://127.0.0.1:8787
```

## Deploy

```bash
bunx --bun wrangler deploy       # creates/updates byzantini-website-pdf-gen
```

> First deploy creates the Worker; the website is rebuilt with
> `VITE_PDF_SERVICE_URL=https://byzantini-website-pdf-gen.koxafis.workers.dev`
> (root `.env.production`) and redeployed to pick up the new service.

## API

### Endpoint

- `POST /` (JSON body)

### Supported Request Types

- `registration`

### Authorization and Access Rules

- `IS_DEV=true` (local only): referer + session checks skipped.
- Otherwise: referer hostname must be one of the allowlisted hosts
  (`musicschool-metamorfosi.gr`, `byzantini-website-production.koxafis.workers.dev`,
  `byzantini-website.preview.workers.dev`, legacy Pages host), and the
  `Authorization: Bearer <session_id>` token must validate against
  `SITE_URL/api/auth/session` (cookie `session_id=<token>`).
- CORS: enabled (`*`) — the browser admin panel calls this Worker cross-origin.

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
- `401`: referer/auth validation failed

## Local smoke test

```bash
curl -s -X POST "http://127.0.0.1:8787" \
  -H "Content-Type: application/json" \
  -d '{"type":"registration","request":{"isMultiple":false,"data":{"url":"/pdf_templates/byz_template.pdf","student":{"id":1,"am":"123","amka":"","first_name":"John","last_name":"Doe","fathers_name":"Father","birth_date":946684800000,"telephone":"2100000000","cellphone":"6900000000","email":"john@example.com","road":"Street","number":1,"tk":11111,"region":"Athens","registration_year":"2025-2026","class_year":"A","class_id":0,"teacher_id":1,"instrument_id":1,"date":1735689600000,"payment_amount":0,"total_payment":0,"pass":true},"teachersName":"Teacher Name","instrument":"Piano"}}}' \
  -o /tmp/registration.pdf && file /tmp/registration.pdf
```

## Integration

The main app's admin panel calls this Worker from the browser via
`lib/pdf.client.ts`; the endpoint URL comes from `VITE_PDF_SERVICE_URL`
(root `.env` / `.env.production`).
