# End-to-end smoke tests (Playwright)

A few browser tests against a running dev server (docs/IMPROVEMENTS.md T3). They are **not** part of
`bun run test` (that is `bun test ./tests/`, which never looks in `e2e/`).

| Spec | What it covers |
| --- | --- |
| `admin.spec.ts` | password sign-in → «Αρχική» with the «Χρειάζονται προσοχή» tiles; a wrong password; an ended session (a 401 inside the dashboard and a full page load with a dead cookie) → `/login?…&expired=1` «Η συνεδρία σας έληξε» → back to the same page; roles (a secretary has no activity log / query logs / fee catalog and a typed restricted URL shows «Δεν έχετε πρόσβαση»; an owner has the activity log and the fee catalog, not the query logs) |
| `registration.spec.ts` | `/eggrafes`: an empty submit lists the required fields and sends nothing; a new student (no ΑΜ field, sent as 000) registers successfully |
| `navbar.spec.ts` | the public navbar at 1024 px (burger menu) and 1366 px (every link in the bar) — B8 |

Projects: `desktop` (Chromium, 1280 px) runs everything; `phone` (Chromium, 375 px) runs the tests whose
title contains `@phone` (sign-in, both registration tests).

## Running

```bash
bunx playwright install chromium   # once per machine (browsers live in ~/.cache/ms-playwright, never in the repo)
bun run e2e                        # all projects
bun run e2e -- --project=desktop -g "roles"   # any Playwright CLI flag after -- (use --project=<name>: under Bun a file path after `--project <name>` is read as another project)
```

Needs, like the API suite:

- the dev server — `E2E_BASE_URL` (default `http://e2e.localhost:4321`), e.g. `E2E_BASE_URL=http://e2e.localhost:4323 bun run e2e`.
  Keep the `e2e.localhost` host: cookies are shared across ports, so a test admin's `session_id` on
  `localhost:<port>` would sign out whoever uses the dashboard on `localhost` in the same browser. If you
  look at the suite's pages in a shared browser, use that host there too;
- the **emails worker** (`cd services/emailWorker && bunx wrangler dev --config wrangler.jsonc`): the tests invite their
  admins, which sends an invite email (dry-run locally — nothing is sent);
- `tests/.env.test` (`TEST_EMAIL` / `TEST_PASSWORD`, the harness sysadmin) and the local dev DB
  (`.wrangler/state/v3/d1`) — the registration test reads and cleans it directly.

The runner runs on **Bun** (`bunx --bun playwright test`, Playwright 1.64): it works, and the helpers reuse
`tests/localDb.ts` (`bun:sqlite`). It also runs under Node, except the registration spec's DB helpers.

Failures keep a trace and a screenshot in `e2e/test-results/` (gitignored): `bunx playwright show-trace <trace.zip>`.
There is deliberately no HTML report: the dev server's file watcher reloads open pages when an `.html` file
under the project changes.

## Content-Security-Policy

Every test fails when its page logs a CSP violation (the automatic `cspViolations` fixture): the dashboard
and the sign-in pages carry a strict CSP (`src/middleware.ts`), and a blocked script or style may not break
any assertion. A failure there is a finding about the page or the policy — never loosen it in the tests.

## Data the suite writes (and removes)

- **Admins:** the harness admin is only used through the API. Every browser sign-in is a throwaway
  `e2e.<role>.<random>@example.com` admin, created the real way (invite → `POST /api/sys/register/<link>`,
  `SysUsers.setRole` for an owner) and deleted when the test ends, passed or failed, together with the
  «Ιστορικό ενεργειών» rows about them (`support/fixtures.ts`).
  The owner's own account is never used in the browser.
- **Pupil:** the registration happy path writes a «Δοκιμαστικός Μαθητής» without ΑΜ (an orphan `000-Ο<n>` row),
  an ΑΜΚΑ starting with 99 (no real ΑΜΚΑ does) and a `pupils.test.e2e.*@example.com` email; the test deletes the
  pupil, its enrollment and the newsletter row afterwards.
- `bun run dev:clean` also removes both kinds of fixture, in case a run was killed half-way.

Do not edit `package.json`, `tsconfig.json` or `astro.config.mjs` while the suite runs against an Astro 7 dev
server started with `bun run dev`: the config-change restart fails (`this.#runtimeDispatcher?.close is not a
function`) and every request then answers 500 «Parent environment not initialized» until the server is restarted.
