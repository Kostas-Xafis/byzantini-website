# byzantini-website-emails — email worker & campaign tooling

The whole email stack lives here (moved from `email/`): the Cloudflare Worker
**`byzantini-website-emails`** (transactional sends) plus the local Bun
campaign CLI for bulk mailings. Emails go out through **MailerSend**; campaign
SMS go out through **Bird** (see [SMS campaigns](#sms-campaigns-bird)).

## Contents

```
src/index.ts        Worker entry (transactional email endpoint) — deployed as byzantini-website-emails
src/observability.ts  Lite per-request telemetry (Analytics Engine + structured logs)
src/mailersend.ts   mailService (the campaign CLI's send path): MailerSend SDK + {{placeholder}} substitution
src/sms/            Bird SMS transport: REST client, delivery stats, segment arithmetic, phone normalisation
src/campaign/*      Campaign runner + statistics (recipients from Cloudflare D1, email or SMS)
src/cli.ts          Campaign CLI (bun run campaign) — run, or --stats to report
src/db.ts           D1 access for the CLI (wrangler d1 execute — login-based, no API token)
render/             React Email components → bun run templates:build → html_templates/
render/sms/         React Email components rendered to PLAIN TEXT → sms_templates/
html_templates/     Static templates served by the site at /html_templates/<name> (R2)
text_templates/     Plain-text email alternatives (multipart)
sms_templates/      Compiled SMS bodies read by the campaign CLI (never published)
scripts/            templates:build, checkSms, remove-suppressed
```

## Worker (transactional)

- `POST /` with `{ authToken, to, subject, htmlTemplateName, templateData }` —
  same contract as the retired Cloud Run service; constant-time token check
  against the `SERVICE_AUTH_TOKEN` secret; template read **from the worker's
  own `BUCKET` R2 binding** (`html_templates/<name>` — the same keys
  `POST /html-templates` writes; no HTTP fetch from the site); `{{ key }}`
  substituted per send; MailerSend called directly via its REST API (the
  `mailersend` npm package is gaxios-based and cannot run on workerd).
  `DRY_RUN=true` logs instead of sending (local dev).
- Secrets (never in files): `MAILERSEND_API_KEY`, `SERVICE_AUTH_TOKEN`.
- The site calls it through the **`EMAIL_SERVICE` service binding** (still
  sending the shared token in the body) — no URL env var anywhere.
- Every response carries `X-Request-Id` (see [Observability](#observability)).

### Local run / deploy

```bash
bunx wrangler dev --config wrangler.jsonc            # http://127.0.0.1:8788
bunx wrangler deploy --config wrangler.jsonc         # create/update the Worker
bunx wrangler secret put MAILERSEND_API_KEY --config wrangler.jsonc
bunx wrangler secret put SERVICE_AUTH_TOKEN --config wrangler.jsonc
```

> `--config wrangler.jsonc` is required (nested inside the website repo —
> wrangler otherwise picks up ../../.wrangler/deploy/config.json). Do not add
> `--bun`: the Bun runtime wedges `wrangler dev`.

`.dev.vars` (local dev): `DRY_RUN=true`, `MAILERSEND_API_KEY=dev-dummy-key`,
`SERVICE_AUTH_TOKEN=<dev token>` (must match the site's
`AUTOMATED_EMAILS_SERVICE_AUTH_TOKEN`). **Seed the local R2 templates once**
(after starting `wrangler dev` on 8788) so per-send reads find them:

```bash
bun run templates:build --dev   # publishes into the LOCAL worker → its local R2
```

> The website's `bun run worker-secrets` (rotation) keeps `SERVICE_AUTH_TOKEN`
> in sync here — it writes the same value into `.dev.vars`,
> `.env.development`, `.env.production` and the deployed Cloudflare secret
> automatically, so `wrangler dev` and `templates:build --dev/--prod` need no
> manual updates after a rotation.

## Observability

Enabled in `wrangler.jsonc`:

- `observability` — Workers Logs at 100% sampling (`head_sampling_rate: 1`,
  `logs.invocation_logs: true`); volume is low.
- `analytics_engine_datasets` — binding `env.ANALYTICS` to the
  `byzantini_email_worker_requests` dataset. The dataset is created
  automatically on the first write after deploy; no manual dashboard step.

Every request emits **one Analytics Engine data point** and **one structured
JSON log line** (`{"event":"email_request",...}`) — including template
publishes and requests that fail auth or validation. Responses also carry an
`X-Request-Id` header matching the `requestId` of both records.

| Analytics Engine | Field | Meaning |
| --- | --- | --- |
| blob1 | `outcome` | `ok` \| `bad_request` \| `unauthorized` \| `error` |
| blob2 | `endpoint` | `send` (`POST /`) \| `templates` (`POST /html-templates`) \| `-` |
| blob3 | `template` | template name (`-` when not applicable) |
| blob4 | `requestId` | UUID, also returned as `X-Request-Id` |
| blob5 | `colo` | Cloudflare colo that served the request |
| blob6 | `error` | short failure reason (`-` on success) |
| double1 | `durationMs` | wall-clock handling time |
| double2 | `status` | HTTP status returned |
| double3 | `count` | emails sent (1) or template files in the request (n) |
| index | `outcome` | sampling/grouping key |

> **No personal data.** Recipient addresses, subject lines, `templateData` and
> rendered HTML are never written to the dataset or the structured log line —
> only request metadata. Keep it that way when extending `src/observability.ts`.
>
> Heads-up: the older per-send lines in `src/index.ts` (`[mail] to=… subject=…`
> and `[dry-run] to=…`) *do* contain the recipient and subject, and Workers
> Logs persists them. They predate this telemetry — ask if you want them
> reduced to metadata and correlated by `requestId` instead.

Query the dataset with the [Workers Analytics Engine SQL API](https://developers.cloudflare.com/analytics/analytics-engine/sql-api/)
(token needs **Account Analytics Read**):

```sql
-- sends vs template publishes, by outcome, last 24h
SELECT blob2 AS endpoint, blob1 AS outcome, SUM(_sample_interval) AS requests
FROM byzantini_email_worker_requests
WHERE timestamp > NOW() - INTERVAL '1' DAY
GROUP BY endpoint, outcome
ORDER BY requests DESC;
```

```sql
-- which templates are going out, last 7 days
SELECT blob3 AS template, SUM(_sample_interval) AS sends
FROM byzantini_email_worker_requests
WHERE blob2 = 'send' AND blob1 = 'ok' AND timestamp > NOW() - INTERVAL '7' DAY
GROUP BY template
ORDER BY sends DESC;
```

```sql
-- average / worst handling time per endpoint, last 7 days
SELECT blob2 AS endpoint,
       SUM(_sample_interval * double1) / SUM(_sample_interval) AS avg_ms,
       MAX(double1) AS max_ms
FROM byzantini_email_worker_requests
WHERE timestamp > NOW() - INTERVAL '7' DAY
GROUP BY endpoint
ORDER BY avg_ms DESC;
```

Local dev: the binding resolves to a local simulation of Analytics Engine, and
structured log lines still print to the terminal. Live tailing:

```bash
bunx wrangler tail --config wrangler.jsonc   # real-time, not persisted
```

## Campaign CLI (local, Bun)

The CLI queries **Cloudflare D1** via `wrangler d1 execute --remote` (spawned
per query, using your existing `wrangler login` — **no API token, no server**):
`--db prod` ⇒ `byzantini-db` (production), default/`--db dev` ⇒
`byzantini-db-preview` (names pinned in the website `wrangler.jsonc`,
overridable via env).

### Env (`.env.development` / `.env.production`, gitignored)

| Var | Purpose |
| --- | --- |
| `D1_PROD_DATABASE_NAME` / `D1_DEV_DATABASE_NAME` | Optional overrides (default: `byzantini-db` / `byzantini-db-preview`) |
| `MAILERSEND_API_KEY` | Email sending (testmail / real sends) |
| `EMAIL_WORKER_URL` | Worker used by `templates:build --prod/--dev` (preset in `.env.*`) |
| `BIRD_API_KEY` | SMS sending. A Bird API key (`bk_eu1_…`) with the SMS permission. **Without it every SMS send stays in dry-run**, so a missing key can never turn a preview into a real blast |
| `BIRD_SMS_FROM` | The sender recipients see: an ASCII alphanumeric sender ID (e.g. `BYZSCHOOL`) or an E.164 number the workspace owns |
| `BIRD_REGION` / `BIRD_API_URL` | Optional Bird host override (default region `eu1`); the region in the key must match the host |
| `BIRD_DRY_RUN` | `true` (or `1`) forces SMS dry-run even when a key is present |
| `BIRD_MAX_SEGMENTS` | Optional safety cap, default 12 — Bird's own hard limit |
| `TEST_SMS_TO` | Your mobile — where `--testsms` sends when no number is passed (required for `--testsms` without a value) |

Requires the wrangler CLI to be logged in (`wrangler login` — already needed
for deploys).

### Workflow

```bash
# 1. build templates (React Email → html_templates/, mirror to bucket/latest)
bun run templates:build
bun run templates:build --prod   # publish via the email worker's R2 binding (deployed worker)
bun run templates:build --dev    # publish via the local worker (bunx wrangler dev on 8788)
bun run templates:build --prod --dry-run   # print the resolved target; publish nothing
```

Publishing POSTs the built files to `<EMAIL_WORKER_URL>/html-templates`, which
writes them into the `BUCKET` R2 binding (`byzantini-bucket`, keys
`html_templates/<name>` — the exact keys the worker's per-send template reads
use, and the same files the site's file proxy used to serve). The CLI needs no
S3/R2 credentials; the shared `SERVICE_AUTH_TOKEN` authorizes the publish.
`EMAIL_WORKER_URL` is preset in `.env.development`
(`http://127.0.0.1:8788`) and `.env.production` (the deployed worker).

> **Why `--prod` needs `override: true`.** Bun auto-loads `.env.development`
> before any of these scripts run (`NODE_ENV` is unset for them). `loadEnvFile`
> historically only set keys *absent* from `process.env`, so `--prod` loaded
> `.env.production` but kept the auto-loaded dev `EMAIL_WORKER_URL` and every
> "production" publish died with `ConnectionRefused` against
> `127.0.0.1:8788`. The CLIs now load their explicitly chosen env file with
> `override: true` (see `src/loadEnvFile.ts`). `--dry-run` prints the resolved
> worker URL without publishing, and `--prod` refuses to publish to a localhost
> URL — use either when a publish seems to go to the wrong place.

# 2. run a campaign
bun run campaign                   # list campaigns (shows which support SMS)
bun run campaign renew-2026        # dry run against the preview D1
bun run campaign renew-2026 --testmail          # dry run + one test email to your inbox
bun run campaign renew-2026 --db prod --testmail
bun run campaign renew-2026 --send --db prod --yes   # for real

# ...or by SMS (see "SMS campaigns (Bird)" below)
bun run campaign renew-2026 --sms --testsms
bun run campaign renew-2026 --sms --db prod --send --yes
bun run campaign renew-2026 --channel both --db prod --send --yes   # email + SMS

# 3. see how a campaign has actually done
bun run campaign --stats                 # every campaign, from local state
bun run campaign renew-2026 --stats      # just one
bun run campaign renew-2026 --stats --live --delivery

# 4. clean suppressed recipients before a campaign
bun run remove-suppressed suppressions.csv --db prod --yes
```

- Dry runs print recipients and write sample emails to `out/`.
- Sends resume from `campaign-state/<id>.json` (email) or
  `<id>.sms.json` (SMS); pacing 1/sec, 900/day.
- Accounts: dry-run default is the **preview D1**; the CLI refuses real
  `--send` runs against it.
- Phone numbers are masked in all CLI output, and `campaign-state/` is
  gitignored, so neither the terminal nor git carries a list of students' numbers.

### Adding a campaign

1. Add the email component in `render/emails/`, register it in `render/index.tsx`.
2. `bun run templates:build`.
3. Add a `CampaignConfig` in `src/campaign/campaigns.ts` (subject, template,
   `getRecipients` query in `src/campaign/queries.ts`, optional
   `plainTextTemplateName` under `text_templates/`).
4. **For SMS:** add a short component in `render/sms/`, register it in
   `render/sms/index.tsx`, run `bun run templates:build`, then add an `sms`
   block (`templateName`, `category`, `maxSegments`) to the `CampaignConfig`.
   Budget for **67 characters per segment** — Greek is UCS-2. Run
   `bun run sms:check` to confirm the body fits and the transport accepts it.

## SMS campaigns (Bird)

A campaign run can send SMS instead of email. **The SMS body is compiled from
React Email components**: `bun run templates:build` renders every component in
`render/sms/` to plain text with `@react-email/render` (`{ plainText: true }`)
and writes it to `sms_templates/<name>`, which the CLI reads at send time and
fills in with the same `{{placeholder}}` substitution the HTML emails use. SMS
copy therefore lives beside its email copy, written in the same component style
and reviewed in the same diff.

```bash
bun run templates:build && bun run sms:check   # compile + verify (sends nothing)

bun run campaign renew-2026 --sms              # dry run → out/<id>-sms-preview-N.txt
bun run campaign renew-2026 --sms --testsms    # + one test SMS to TEST_SMS_TO
bun run campaign renew-2026 --sms --db prod --send --yes
```

### Before the first real send

Bird is **default-deny**, so three things must be true in the Bird dashboard:

1. **Enable the destination.** SMS → Destinations → enable **Greece**. Until
   then every send is refused with `E12020` — and Bird checks this *before* it
   resolves the sender, so a bad sender stays invisible until this is done.
2. **Own a sender.** SMS → Senders → Add sender ID, claim an alphanumeric ID
   such as `BYZSCHOOL`, then set `BIRD_SMS_FROM` to it.
3. **Use an SMS-capable API key** with the SMS permission, set as `BIRD_API_KEY`.

> **The sender must be ASCII.** Bird alphanumeric sender IDs are 3–11 ASCII
> characters containing at least one letter, so the school's Greek name
> (`Σχολή Βυζαντινής & Παραδοσιακής Μουσικής`) **cannot be the sender** — and
> neither can `6983380631`, unless the workspace owns it as a Bird number.
> Use an ASCII ID such as `BYZSCHOOL`: `resolveSmsFrom()` rejects anything else
> up front with that explanation. The school is identified inside the message
> instead — by name in the review ask, by the secretariat phone in the
> reminders — where recipients actually read it.

### Cost: Greek is UCS-2

Greek characters are not in the GSM-7 alphabet, so a message is billed as
**UCS-2 — 70 characters** for a single segment and **67** for each segment of a
longer message (against 160/153 for plain ASCII). Each campaign therefore
declares a `maxSegments` budget in `src/campaign/campaigns.ts` (currently 3),
the build prints every body's segment count, and `sms:check` fails if a body no
longer fits. A send re-checks each recipient (names vary in length) and refuses
to start if any body would exceed the budget, rather than failing per recipient
mid-run. The personalized registration link alone is 68 characters, which is why
the SMS copy is terse.

### Which campaigns can send SMS

Only campaigns whose recipient query returns a **mobile number** can.
`src/campaign/queries.ts` reads `pupils.cellphone`/`pupils.telephone` and
`teachers.telephone`, normalises them to E.164 via `src/sms/phone.ts`, and
**skips landlines** — a Greek landline cannot receive a text, so sending to one
would fail and still be billed. `return-2026` reads the legacy
`email_subscriptions` list, which holds email addresses only: it has no `sms`
block, and `--sms` refuses it with a clear message. The CLI always reports how
many recipients were skipped for want of a number.

### Options

| Flag | Effect |
| --- | --- |
| `--sms` | Send SMS instead of email (shorthand for `--channel sms`) |
| `--channel email\|sms\|both` | Choose the channel explicitly |
| `--testsms [number]` | One test SMS of the first recipient's data (default `TEST_SMS_TO`; errors if neither is set) |
| `--sms-message "<text>"` | Ad-hoc body instead of the compiled template; `{{placeholders}}` are substituted per recipient |
| `--sms-category <c>` | Bird category for an ad-hoc body (`marketing` by default) |
| `--sms-segments <n>` | Override the campaign's segment budget (1–12) |

Progress is logged with a **masked** number, resume state lives in
`campaign-state/<id>.sms.json` — separate from the email run, so neither channel
can mark the other's recipients as done — and an ad-hoc `--sms-message` goes
through the same segment check as a compiled template.

### Incomplete recipient data

A recipient whose data cannot fill a placeholder the template uses — a pupil
with no `registration_url`, say — is **skipped and recorded**, rather than sent
a message with a visible gap and a dead link that still bills two segments. One
bad row does not stop the campaign: the skip is printed, kept in the state
file's `failed` list, and counted in the run summary.

An over-long *body* is the opposite case. It is a property of the copy rather
than of one recipient, so it **aborts the run during pre-flight**, before the
first message is sent.

### Marketing compliance

Student-facing campaigns send as `category: "marketing"`, which is why each body
ends with `STOP=διαγραφή`: Bird requires opt-out instructions on marketing
messages and honours `STOP`/`UNSTOP` itself, suppressing the number. Staff
messages (the teacher campaign) send as `category: "service"` and carry no STOP
instruction. A phone opt-out reported to the secretariat goes into the
`phones` list of the opt-out file (E.164) — it is deliberately a separate list
from the email one, since the two consents are independent.

### Opt-outs

The opt-out lists hold real people's contact details, so they are **not in the
repository**. Campaigns read them from `campaign-blocklist.json` next to
`package.json` (gitignored), or from the path in `CAMPAIGN_BLOCKLIST_FILE`:

```json
{ "emails": ["someone@example.gr"], "phones": ["+306912345678"] }
```

Emails compare case-insensitively. If the file is missing, a campaign refuses to
run rather than mail people who opted out. The test suite uses
`tests/fixtures/campaign-blocklist.json` instead.

## Campaign statistics

`--stats` reports what a campaign has actually sent. With a campaign id it
covers that campaign; without one it covers every campaign that has ever run.

```bash
bun run campaign --stats                      # all campaigns, from local state
bun run campaign renew-2026 --stats           # one campaign
bun run campaign renew-2026 --stats --live    # + current audience and progress
bun run campaign renew-2026 --stats --delivery # + Bird's carrier delivery figures
bun run campaign --stats --days 30            # wider daily-breakdown window
bun run campaign --stats --json > stats.json  # machine-readable
```

For each campaign it prints a per-channel breakdown — sent, failed, sent today,
sent in the window, first and last send — plus daily activity and a totals block
across all campaigns. Daily activity is a compact sparkline when reporting every
campaign at once and a day-by-day chart when reporting a single one; the
sparklines share one scale, so campaigns are comparable at a glance. The output
adapts to the terminal width and stays aligned with Greek text and emoji in
campaign titles.

### Where the numbers come from

| Source | Flag | What it adds |
| --- | --- | --- |
| `campaign-state/` | always | The base counts. Offline: no network, no credentials. |
| Cloudflare D1 | `--live` | How many recipients the campaign reaches **now**, so you can see what is still unsent. One query per channel (~15s each). |
| Bird | `--delivery` | Carrier-confirmed SMS delivery: accepted / sent / delivered / undelivered / failed / rejected / expired, delivery and failure rates, latency percentiles, and a per-day trend. Needs `BIRD_API_KEY`. |

> **Why the base counts are local.** The state files are the only record of what
> *this tool* did. MailerSend cannot be asked "which of these 2,365 addresses
> did you accept", and a provider dashboard counts everything sent from the
> domain — including the Worker's transactional mail. Bird's delivery figures do
> come from the provider, because whether a handset received a message is only
> knowable from the carrier; they are found by the `campaign:<id>` tag every SMS
> carries.

Counts are **distinct recipients**, not raw records: a state file is
append-only, so someone who failed on three runs is one person, not three
failures. `--delivery` is the only part that can fail on its own — if Bird is
unreachable or the key is missing, the report says so inline and still prints
every local number. `--json` writes clean JSON to stdout (progress notes go to
stderr), so it pipes safely.

## Tests

```bash
bun run test                                            # whole suite — offline, a few seconds
bun run test:watch
CAMPAIGN_LIVE_TEST=1 bun run test tests/live.test.ts    # opt-in: ONE real email, to you
```

### Nothing in the suite can email or text a real audience

This tooling talks to MailerSend (real email to real students) and Bird (real
SMS, billed per segment), so the suite is built so that a mistake cannot become
an incident:

- **`--send` is refused outright** by the harness's `runCli()`. A subprocess run
  with the production database emails the whole campaign, and no test has any
  business doing that.
- **Both providers are disarmed at import time.** Importing the harness replaces
  `MAILERSEND_API_KEY` with an unusable placeholder — Bun auto-loads
  `.env.development`, which holds the real key — and sets `BIRD_DRY_RUN=true`.
  `ENV_FILE_PROTECT` stops any `.env.*` file from putting the real key back.
- **The email send loop is tested through a seam** (`RunOptions.emailSend` in
  `src/campaign/runner.ts`) that replaces only the delivery call, so state,
  resume, the daily cap and failure recording are all the real code under test.
- **The SMS suite never sends.** Bird's dry-run is a product feature, so the SMS
  loop runs through the transport it really has, plus a fetch guard that fails
  the test on any provider request.
- **One test sends for real, by invitation only.** `tests/live.test.ts` covers
  the actual send path — real template read, real MailerSend handoff — with an
  audience of exactly one recipient, built in memory: you. It is skipped unless
  `CAMPAIGN_LIVE_TEST=1`, and `assertOperatorOnlySend()` refuses any audience
  that is not a lone message to the operator. A bug there means one extra email
  to whoever ran the tests, never a blast to the school.

### Test seams in the product code

Three small hooks exist so the suite never touches real data. Each is useful
outside tests too:

| Seam | Why |
| --- | --- |
| `CAMPAIGN_STATE_DIR` | Point resume state elsewhere. Without it a test would write into `campaign-state/` and mark real students as already-sent, silently shrinking a live campaign. |
| `CAMPAIGN_OUT_DIR` | Same, for the dry-run previews in `out/`. |
| `ENV_FILE_PROTECT` | Comma-separated keys an env file may never override. For CI jobs supplying their own sending key, and for the suite pinning one to an unusable value. |

### What the suite covers

| File | Covers |
| --- | --- |
| `harness.test.ts` | The safety rails themselves — if these rot, every other file becomes dangerous |
| `campaign-send.test.ts` | Send loop: state, resume, daily cap, failures, channel isolation, pre-flight abort vs per-recipient skip |
| `recipients.test.ts` | Recipient selection and dedupe, Greek phone normalisation, segment arithmetic, SMS copy and sender rules |
| `stats.test.ts` | Stats aggregation and the renderer's width and consistency invariants |
| `cli.test.ts` | Argument validation, the CLI's own safety refusals, `--stats` and `--json` |
| `live.test.ts` | One real email, to the operator, opt-in only |

## Notes & warnings

- `.env.development` / `.env.production` hold real secrets — never commit
  (gitignored) or paste values into chats/diffs.
- `html_templates/_legacy/` is historical reference only.
- The old `email/` folder can be deleted once the Worker + CLI are verified
  against the new stack.
- Typecheck: `bun run typecheck` (worker) / `bun run typecheck:cli` (CLI).
