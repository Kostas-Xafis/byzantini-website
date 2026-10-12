# Turso → Cloudflare D1 port — runbook

Status: **executed against `byzantini-db` (production) on 2026-09-12** — see §7.
The flow is now **one command per target** (§1) and reproduces local, preview and
production identically.
Branch: `Workers`. Companion docs: `docs/PUPILS_MIGRATION.md` (the pupil-register
backfill that is part of the port).

This document answers four questions:

1. how to rebuild a D1 database from Turso in one command,
2. what that command actually does (and how to check it),
3. the ordering trap that used to destroy data — and why it can no longer happen,
4. how to prove the port landed correctly.

**Turso is read-only.** Every Turso connection in this tooling goes through a
guard that refuses any statement that is not a read (`SELECT` / `PRAGMA` / `WITH`
/ `EXPLAIN`). Nothing here ever writes to Turso; it stays the source of truth
until the final cutover.

---

## 1. The one command

```bash
bun run port --db local                     # extract Turso → rebuild the local dev DB
bun run port --db preview                   # …the preview database
bun run port --db prod --yes-prod           # …production (writes need --yes-prod)
bun run port --all --yes-prod               # all three, one after another
bun run port:verify                         # read-only: compare every target, write nothing
```

| Package script                                                           | Equivalent                                         |
| ------------------------------------------------------------------------ | -------------------------------------------------- |
| `bun run port`                                                           | `bun scripts/portD1.ts` (defaults to `--db local`) |
| `port:local` / `port:preview` / `port:prod` / `port:all` / `port:verify` | the same CLI with the targets pre-set              |

Useful flags:

| Flag                 | Meaning                                                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `--db a,b` / `--all` | targets; default `local`                                                                                                         |
| `--from latest`      | reuse the newest bundle under `dbSnapshots/turso-export/` instead of reading Turso (also `--from <stamp>` / `--from <dir>`)      |
| `--dry-run`          | print the whole plan; write nothing anywhere — no wipe, no migration, no load, not even a bundle                                 |
| `--verify-only`      | compare each target against the bundle; no writes at all (so prod needs no `--yes-prod`)                                         |
| `--yes-prod`         | required to write to prod; `--all` **skips** prod with a visible notice when it is missing (an explicit `--db prod` is an error) |
| `--no-backup`        | skip the automatic pre-wipe `wrangler d1 export` of a remote target                                                              |
| `--report <dir>`     | where the run report goes (default `dbSnapshots/port-reports/<stamp>/`)                                                          |
| `--out <dir>`        | where a fresh export bundle goes                                                                                                 |
| `--limit <n>`        | export smoke test (refused for anything that loads)                                                                              |
| `--exclude <table>`  | drop a table from the bundle/load (repeatable)                                                                                   |
| `--verbose`          | per-table output, plus sample rows for every backfill issue                                                                      |

`--all` always runs in a stable order: `local`, `preview`, `prod`.

Rerunning is always safe: each target is wiped and rebuilt from the bundle, so a
second run converges to exactly the same state as the first.

---

## 2. What the one command does

```
EXTRACT   read Turso (read-only) → bundle under dbSnapshots/turso-export/<stamp>/
             manifest.json · data.sql · data.jsonl
             (or reuse one: --from latest|<stamp>|<dir>)
   ↓
PLAN      build the pupil register from the bundle's `registrations` rows
             the same pure planner as scripts/migratePupils.ts (nothing written yet)
   ↓
PER TARGET (local › preview › prod)
   backup   `wrangler d1 export <db> --remote` → dbSnapshots/backups/   (remote only)
   wipe     DROP every table, `d1_migrations` included
   migrate  `wrangler d1 migrations apply` — 0001 → 0002 → 0003, all at once
   load     DELETE + parameterised INSERT of every non-legacy bundle table
   pupils   INSERT the pupils + pupil_enrollments generated in PLAN, update total_enrollments
   verify   row counts + canonical SHA-256 digests + the pupil invariants (§5)
   ↓
REPORT    dbSnapshots/port-reports/<stamp>/report.json + pupils-backfill.sql
```

The exact commands the port spawns, if you want to reproduce a step by hand:

```bash
# backup (per remote target)
bunx wrangler d1 export DB --remote --output dbSnapshots/backups/byzantini-db-pre-port.<stamp>.sql
# migrations (the target is empty at this point)
bunx wrangler d1 migrations apply DB --local --persist-to .wrangler/state -c wrangler.jsonc
bunx wrangler d1 migrations apply DB --remote -e preview -c wrangler.jsonc        # preview
bunx wrangler d1 migrations apply DB --remote -c wrangler.jsonc                   # prod
```

> **Address a target by its binding (`DB`), never by its database name.**
> `wrangler d1 <cmd>` resolves the positional against the _selected environment's_
> `d1_databases`, and `env.preview` binds `DB` to `byzantini-db-preview`. Passing
> the top-level name `byzantini-db` together with `-e preview` fails with
> "Couldn't find a D1 DB with the name or binding 'byzantini-db'" — this was a real
> bug in the tooling until `scripts/lib/d1.ts` switched to the binding.

`query_logs` is never ported: it is 5.6k rows of diagnostics written by the
retired Turso runtime. Everything else comes over — 21 Turso tables, 20 ported,
of which `registrations` + `total_registrations` feed the pupil register and are
then dropped by `0003`.

---

## 3. The pieces

| File                                                | Role                                                                                                                                                   |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `scripts/portD1.ts`                                 | **The one command.** Orchestrates extract → wipe → migrate → load → pupils → verify, for any set of targets.                                           |
| `scripts/lib/portBundle.ts`                         | The bundle format, the canonical digest, schema checks, the wipe, the migration replay, the parameterised load, and the target comparison.             |
| `scripts/lib/d1.ts`                                 | Shared D1 transport: local miniflare SQLite **or** the D1 REST API (parameterised `query` / `batch`). Resolves credentials and reads `wrangler.jsonc`. |
| `scripts/lib/pupilsRun.ts`                          | The pupil-register run: read the legacy rows (from a target _or_ a bundle), plan, write, and verify.                                                   |
| `scripts/lib/pupilsBackfill.ts`                     | The backfill's cleansing rules — pure functions, no I/O.                                                                                               |
| `scripts/exportTurso.ts`                            | The low-level bundle/apply/verify/wipe CLI (§4). Same library as `portD1.ts`, so the two cannot drift.                                                 |
| `scripts/migratePupils.ts`                          | The target-side backfill CLI — for a database that already holds `registrations` (§4).                                                                 |
| `scripts/lib/normalize` → `lib/pupils/normalize.ts` | ΑΜ/ΑΜΚΑ/phone/email/class-year normalization.                                                                                                          |

Bundles are written to `dbSnapshots/turso-export/<UTC stamp>/` (gitignored):

| File            | Contents                                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------------------------- |
| `manifest.json` | Per-table row count, column list and a canonical SHA-256 digest, plus the excluded tables.                      |
| `data.sql`      | The same rows as `INSERT` statements — readable, and replayable with `sqlite3` or `wrangler d1 execute --file`. |
| `data.jsonl`    | The same rows as machine-readable JSON, used by `--from`.                                                       |

### How the verification works

`digestRows()` (same function for source and target) serialises every row as
`JSON.stringify(columns.map(canonical))` **in schema order**, sorts those lines,
and SHA-256s them. Storage order, rowid assignment and pagination cannot affect
it, so _equal digest + equal row count = the values are identical_, not merely
"the same number of rows". A comparison also reports schema differences, so a
narrower target cannot pass by accident.

---

## 4. The low-level commands

Needed only for partial work — a single bundle, a single load, or a backfill
against a database that still holds `registrations`. The one-command flow in §1
covers the normal case.

```bash
# 1. Read Turso and write a bundle (writes NOTHING to D1)
bun scripts/exportTurso.ts

# 2. See how far a D1 target has drifted from Turso (read-only)
bun scripts/exportTurso.ts --verify --db prod
bun scripts/exportTurso.ts --verify --db prod --exclude registrations --exclude total_registrations

# 3. Load a bundle into a target (DELETE + INSERT per table, then re-verify)
bun scripts/exportTurso.ts --from latest --apply --db prod --yes-prod
bun scripts/exportTurso.ts --from <stamp> --apply --db preview
bun scripts/exportTurso.ts --from <stamp> --apply --db local --local-file .wrangler/state/v3/d1/miniflare-D1DatabaseObject/<hash>.sqlite

# 4. Target-side pupil backfill (only when the target still has `registrations`)
bun scripts/migratePupils.ts --db local                    # dry run
bun scripts/migratePupils.ts --db local --apply
bun scripts/migratePupils.ts --db prod --yes-prod --apply --report dbSnapshots/pupils-backfill.json
```

Options worth knowing: `--exclude <table>` / `--include <table>`, `--limit <n>`
(export smoke test — `--apply` refuses a limited bundle), `--no-replace` (append
instead of replace), `--wipe` + `--dry-run` (§9), `--verbose`, `-h`.

`--from` accepts a directory, a bare stamp (`--from 2026-09-29T07-09-12-108Z`) or
`latest`.

---

## 5. The 0002 / 0003 ordering trap — and why the port cannot hit it

`wrangler d1 migrations apply` runs **every** pending migration, in order. On any
database where both are pending (i.e. every freshly created environment):

- `0002_pupils.sql` creates `pupils` / `pupil_enrollments` / `total_enrollments`
- `0003_drop_registrations.sql` **drops `registrations` and `total_registrations`**

The backfill reads `registrations`. Running `migrations apply` before the backfill
therefore destroys the source rows it needs — that is the documented
total-loss trap, and it is why the old sequence applied `0002` _alone_ with
`d1 execute --file`, ran the backfill, and only then ran `migrations apply`.

**The port removes the trap instead of documenting it.** The pupil register is
built from the bundle's `registrations` rows _before anything is written_, using
the same pure planner (`planBackfill` + `buildBatch`) that `migratePupils.ts`
uses. The target then gets **all three migrations in one pass** and is handed the
already-generated `pupils` / `pupil_enrollments` rows. The legacy table never has
to exist in the target, so there is no window in which it can be dropped too
early.

The two paths were checked against each other: replanning the register from an
export bundle reproduces, byte for byte, the `pupils` and `pupil_enrollments`
rows that the target-side backfill produced for the same data (same ids, same
values, same `total_enrollments`, same issue counts).

`migratePupils.ts` still exists for a target that already holds `registrations`
(and it still prints the safe three-step recipe when its target is missing the new
tables). It is not part of the port flow any more.

---

## 6. What the port verifies

Automatically, per target, before it reports success:

| Level          | What is checked                                                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ported tables  | Row count **and** SHA-256 digest equality for every loaded table, plus column-set equality.                                                                                    |
| Pupil register | `pupils` and `pupil_enrollments` digests against the rows that were generated (timestamps excluded).                                                                           |
| Conservation   | One enrollment per `registrations` row, and the multiset of `(year, class, teacher, instrument, date, amounts, payment date, pass)` identical **in both directions**.          |
| Row invariants | 0 enrollments without a pupil · 0 nameless pupils · 0 pupils with an empty `registration_url` that are not flagged for review · every ΑΜΚΑ empty or exactly 11 digits (the API's `z_Amka` contract — one bad ΑΜΚΑ 500s the whole admin listing) · `total_enrollments.amount` = enrollment count. |

The SQL behind the row invariants (from the runbook's manual checklist):

```sql
SELECT COUNT(*) FROM pupil_enrollments e LEFT JOIN pupils p ON p.id = e.pupil_id WHERE p.id IS NULL;
SELECT COUNT(*) FROM pupils WHERE last_name = '' OR first_name = '';
SELECT COUNT(*) FROM pupils WHERE registration_url = '' AND needs_review = 0;
SELECT COUNT(*) FROM pupils;            -- people
SELECT COUNT(*) FROM pupil_enrollments; -- enrollment rows (>= pupils)
SELECT amount FROM total_enrollments;   -- must equal the enrollment count
```

`bun run port:verify` runs the comparison for every target without writing
anything.

> Running `bun run test` mutates the **local** dev database: apart from the pupil
> fixtures `bun run dev:clean` removes, the books / wholesalers / sysusers /
> payoffs suites leave rows behind, so a `--verify` right after a test run
> reports drift on those tables. `bun run port --db local` puts it back exactly in
> one command; `dev:clean` only covers the pupil fixtures.

---

## 7. What the 2026-09-12 production run did

Measured, not assumed — the historical manual run this tooling now automates:

| Step                        | Result                                                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Turso tables read           | 21 (20 ported + `query_logs` excluded)                                                                                |
| Rows exported               | 5,119                                                                                                                 |
| Drift found before the port | `registrations` −52, `email_subscriptions` −13, `announcements`/`sys_users`/`total_registrations` content differences |
| After `--apply --db prod`   | all 20 tables `✓ identical`                                                                                           |
| Schema check                | all 21 tables column-identical between Turso and D1                                                                   |
| Pupil backfill              | 1,566 legacy rows → 753 pupils, 1,566 enrollments, `total_enrollments` = 1,566                                        |

The first full one-command port of the **local** target (2026-09-29) rebuilt it
from a fresh Turso extract: 18 tables loaded, all `✓ identical`; 1,673 legacy rows
→ 792 pupils / 1,673 enrollments, row conservation 0 missing / 0 unexpected.

### Verifying _after_ the cutover

`registrations` and `total_registrations` were dropped on purpose, so a plain
`turso:verify` reports them as missing from the target. Exclude them:

```bash
bun scripts/exportTurso.ts --verify --db prod \
  --exclude registrations --exclude total_registrations
```

Two other differences are expected and must **not** be "fixed" by re-importing:

- `sys_users.session_id` / `session_exp_date` — whoever is logged into the admin
  panel rewrites these on every login; the identity columns (`email`, `password`)
  stay identical. Re-importing would only log the current session out. The
  comparison ignores exactly these two columns (and says so in its output), so a
  production target still verifies clean after an admin login.
- `query_logs` — excluded by default; it is written by whichever runtime is
  serving requests (and is empty right after a wipe).

---

## 8. Rollback and safety

- **Data** — the bundle under `dbSnapshots/turso-export/<stamp>/` is a complete
  copy of Turso; running the port again converges any target to it. The pre-wipe
  `wrangler d1 export` under `dbSnapshots/backups/` restores a remote target
  exactly as it was, including anything the bundle cannot express.
- **The pupil register is regenerated, not restored** — this is the point of the
  port: `pupils` / `pupil_enrollments` do not exist in Turso, so a wiped target
  gets them rebuilt from the bundle's `registrations` rows and verified (§6).
- **Schema** — `0003` is not reversible in place; restore an export
  (`wrangler d1 execute <db> --file <export>.sql`) and re-apply the migrations.
- **Turso is untouched by every command here.** The tooling refuses non-read
  statements on that connection.
- **Reports contain personal data.** `pupils-backfill.sql` inlines names, ΑΜΚΑ,
  emails and registration URLs for review; `dbSnapshots/` is gitignored — do not
  commit it, paste it, or ship it anywhere.

---

## 9. `--wipe` on its own (low-level, destructive)

`exportTurso.ts --apply --wipe` drops every table (including `d1_migrations`),
replays the migrations and loads the bundle. It does **not** rebuild the pupil
register: a Turso bundle has no `pupils` table, so the register is simply gone
afterwards.

Because of that, `--wipe` **refuses to run against a target that holds pupil
rows** unless you pass `--allow-pupil-loss`:

```bash
bun scripts/exportTurso.ts --apply --wipe --dry-run --db preview --from latest   # plan only, writes nothing
bun run port --db preview                                                        # ← what you normally want
```

The one-command port does not need `--wipe`: wiping is what it does, followed by
the pupil regeneration that makes it safe.

---

## 10. Per-target notes

| Target    | Database               | How it is reached                                                  | Notes                                                                                                                                                                                                                                                 |
| --------- | ---------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `local`   | miniflare store        | `bun:sqlite` on `.wrangler/state/v3/d1/miniflare-D1DatabaseObject` | Stop `bun run dev` first — workerd holds the same file. A fresh checkout has no store; the port's `migrations apply --local` creates it. The port has no `--local-file`: it always rebuilds the standard dev store (use `exportTurso.ts` for a copy). |
| `preview` | `byzantini-db-preview` | D1 REST API + `wrangler … -e preview`                              | No `--yes-prod` needed.                                                                                                                                                                                                                               |
| `prod`    | `byzantini-db`         | D1 REST API                                                        | Writes require `--yes-prod`; a pre-wipe backup is taken by default.                                                                                                                                                                                   |

Credentials: `CLOUDFLARE_API_TOKEN` if set, otherwise the existing wrangler OAuth
session (`~/.config/.wrangler/config/default.toml`). Nothing is ever printed;
Turso is shown as a host name. Turso credentials come from `.env`
(`TURSO_DB_URL` / `TURSO_DB_TOKEN`) — same file as the rest of the site's dev
values.

> If a remote target fails with **HTTP 401 / 403**, the wrangler session has
> expired: run `wrangler login` in an interactive terminal (or export
> `CLOUDFLARE_API_TOKEN`) and retry. `local` needs no credentials at all.
