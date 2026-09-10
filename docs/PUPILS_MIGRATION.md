# Μαθητολόγιο — pupils table + admin register page (scaffold)

Status: **plan / scaffold only** — no code written yet.
Branch: `Workers` · Local D1 snapshot: 1514 registrations, school years 2023-24 … 2026-27.

This document is the execution plan. Each phase is a separate, independently
verifiable step; we execute them one by one, top to bottom.

---

## 0. Decisions locked so far (from the owner)

| # | Question | Decision |
| --- | --- | --- |
| D1 | `pupils` columns | `am`, `first_name`, `last_name`, `fathers_name`, `birth_date`, `road`, `number`, `tk`, `region`, `telephone`, `cellphone`, `email`, `amka` |
| D2 | Identity conflicts | Match on `amka` as last resort; every orphan/unresolvable ΑΜ becomes `000-1`, `000-2`, … and goes through human review by the secretaries |
| D3 | ΑΜ format | Plain incremental integer, 3–4 digits |
| D4 | Empty `amka` | Not an error — it was not collected in earlier years |
| D5 | Multiple registrations per ΑΜ | Pupil data comes from the **latest** registration (by `date`) |
| D6 | History model | **One** `pupil_enrollments` table, filtered by music type in the UI |
| D7 | `registrations` after the split | **Dropped entirely** — the table disappears at the end of this process |
| D8 | Search | Server-side search + pagination (`Pupils.search`) |
| D9 | Tooling | Permanent, idempotent script under `scripts/`, dry-run by default, works against local dev **and** production D1 |
| D10 | Deliverables | (a) runnable script, (b) migration file in `migrations/` |
| D11 | Enrollment table (O1) | **Option B — a real `pupil_enrollments` table** |
| D12 | Column strip (O2) | Same migration family; `registrations` is dropped, not just stripped |
| D13 | Production | **Untouched by this work.** All execution is local; the script is merely *written* to be prod-capable |
| D14 | Safety | Local state is backed up before each destructive step; a failed run is reverted and retried |
| Q1 | Public form target | **Writes straight into `pupils` + `pupil_enrollments`**, linking by ΑΜ; new pupils get `needs_review = 1` |
| Q2 | Orphan codes | Separate `orphan_code` column; `pupils.am` stays `INTEGER` and is NULL for orphans |
| Q3 | API surface | **Rename everything to `Pupils.*`** (paths `/pupils/*`); the `Registrations` group is retired |
| Q4 | Totals counter | `total_registrations` → **`total_enrollments`**, counting enrollment rows |
| Q5 | Migration split | **0002 create + 0003 drop** (two files, verifiable in between) |
| Q6 | Re-registration link | **`registration_url` moves to `pupils`** and becomes permanent — one fixed link per pupil, seeded from their 2025-2026 registration |
| Q7 | `RegistrationForm.solid.tsx` | **Adapted in Phase 4** (mechanical: `Pupils.*` + `{ pupil, enrollment }` payload), behaviour unchanged |

## 1. Consequences of dropping `registrations` (read this before Phase 1)

`registrations` is not merely slimmed — it is removed, so every consumer moves
to `pupils` / `pupil_enrollments`:

| Consumer | Today | After |
| --- | --- | --- |
| `Registrations.get` (per year) | `SELECT * FROM registrations` | join of both new tables |
| `Registrations.getById` / `update` / `delete` | registration row | enrollment row (+ pupil) |
| `Registrations.post` (public form, **no auth**) | inserts one row | finds/creates pupil by ΑΜ, then inserts an enrollment |
| `Registrations.getByReregistrationUrl` | `registration_url` | moves to `pupil_enrollments.registration_url` |
| `Registrations.getYears` / `getTotalByYear` | distinct years | distinct years on `pupil_enrollments` |
| `Registrations.getTotal` | `total_registrations` counter | counter over enrollments (or pupils — see Q4) |
| `Registrations.email*` (4 routes) | email subscriptions | unchanged (separate table) |
| Admin table + exports + PDF | whole registration row | joined row (pupil info + enrollment) |
| `GlobalSearch`, `TotalsTable` | registration rows | joined rows |

Three constraints follow:

1. **Order.** A migration cannot run TypeScript, so the backfill script must read
   `registrations` **before** the drop. Per environment:
   apply `0002` (create `pupils` + `pupil_enrollments`) → run
   `migratePupils.ts --apply` → verify counts → apply `0003` (drop
   `registrations`, `total_registrations`).
2. **The wire shape must be preserved.** `lib/pdf.client.ts:30` hands the whole
   `Registrations` object to the PDF worker, which accepts only
   `type: "registration"` (`services/pdfWorker`, a separate repo — out of scope).
   The replacement routes therefore return the **joined** row so the PDF/Excel
   clients keep working without touching the worker.
3. **Back-compat names.** Whether the API keys stay `Registrations.*` (paths
   unchanged, internals rewritten) or move to `Pupils.*` is Q3 below. The public
   form's route must stay unauthenticated either way.

**Recommended de-risking:** keep create (0002) and drop (0003) in separate
migration files so each step is verifiable and revertible on its own. The script
and schema are identical either way; only the split point moves.

---

## 2. Data-quality findings (measured on the local D1 = prod mirror)

These numbers drive the cleansing rules in Phase 3.

| Finding | Value | Consequence |
| --- | --- | --- |
| `registrations` rows | 1514 | — |
| Distinct `am` | 690 | 401 ΑΜ have 2+ rows |
| Distinct `amka` | 639 | 365 rows empty, 3 rows `00000000000` |
| ΑΜ shared by differing normalized names | **292 rows / 128 ΑΜ** | must be split or merged |
| … of those, same person proven by cellphone | 103 ΑΜ | auto-merge candidate |
| … same person proven by email | 99 ΑΜ | auto-merge candidate |
| … same person proven by ΑΜΚΑ | 73 ΑΜ | auto-merge candidate |
| True collisions (different people, same ΑΜ) | e.g. `111` = 3 people, `123` = 4 | split → `111`, `111-1`, `111-2` |
| `am = '000'` | 62 rows (58 distinct names) | orphans → `000-1`… |
| `am = '000 - Αναμονή'` / `'999 - Αναμονή'` | 1 + 1 | orphans |
| `am = '΄1158'` (keraia prefix) | 1 | normalize → `1158` |
| `am` with trailing/leading spaces | e.g. `'1287   '`, `'761 '` | trim |
| Only 6 of 62 `000` rows recoverable via ΑΜΚΑ | 6 | the rest go to human review |
| ΑΜ width by year | 3-digit only in 2023-24; 4-digit grows to 104/200 by 2026-27 | 3- and 4-digit are both valid |
| `class_year` spellings | 26 variants (`Α' Ετος` / `Α΄ έτος` / `Α'  Έτος Διλώματος`, `undefined`) | normalize, flag `undefined` |
| Same ΑΜ, same year, multiple rows | normal (one row per instrument/class) | e.g. ΑΜ 919 = 16 rows |

---

## 3. Target schema (Option B)

```sql
-- identity
CREATE TABLE pupils (
  id            INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  am            INTEGER,              -- NULL = orphan awaiting human review
  orphan_code   TEXT,                 -- '000-1' … for the secretaries
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  fathers_name  TEXT NOT NULL DEFAULT '',
  birth_date    INTEGER NOT NULL DEFAULT 0,
  road          TEXT NOT NULL DEFAULT '',
  number        INTEGER NOT NULL DEFAULT 0,
  tk            INTEGER NOT NULL DEFAULT 0,
  region        TEXT NOT NULL DEFAULT '',
  telephone     TEXT NOT NULL DEFAULT '-',
  cellphone     TEXT NOT NULL DEFAULT '',
  email         TEXT NOT NULL DEFAULT '',
  amka          TEXT NOT NULL DEFAULT '',   -- '' allowed (legacy years)
  registration_url TEXT NOT NULL DEFAULT '', -- permanent re-registration link (Q6)
  needs_review  INTEGER NOT NULL DEFAULT 0,
  review_note   TEXT NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL DEFAULT 0,
  updated_at    INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX idx_pupils_am  ON pupils(am) WHERE am IS NOT NULL;
CREATE UNIQUE INDEX idx_pupils_url ON pupils(registration_url) WHERE registration_url <> '';

-- enrollment history (one row per pupil / year / class / instrument)
CREATE TABLE pupil_enrollments (
  id                 INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  pupil_id           INTEGER NOT NULL REFERENCES pupils(id),
  registration_year  TEXT    NOT NULL,
  class_id           INTEGER NOT NULL,   -- 0 byz · 1 par · 2 eur  = music type
  class_year         TEXT    NOT NULL DEFAULT '',
  teacher_id         INTEGER NOT NULL DEFAULT -1,
  instrument_id      INTEGER NOT NULL DEFAULT 0,
  date               INTEGER NOT NULL DEFAULT 0,
  payment_amount     INTEGER NOT NULL DEFAULT 0,
  total_payment      INTEGER NOT NULL DEFAULT 0,
  payment_date       INTEGER,
  pass               INTEGER NOT NULL DEFAULT 0,
  source             TEXT    NOT NULL DEFAULT 'migration',  -- migration | admin | form
  created_at         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_enrollments_pupil  ON pupil_enrollments(pupil_id);
CREATE INDEX idx_enrollments_year   ON pupil_enrollments(registration_year);
CREATE INDEX idx_enrollments_lookup ON pupil_enrollments(pupil_id, class_id, registration_year);

-- totals accumulator (Q4)
CREATE TABLE total_enrollments (amount INTEGER DEFAULT 0);

-- 0003: DROP TABLE registrations; DROP TABLE total_registrations;
```

`am` is `INTEGER` so `000` cannot be mistaken for a real registry number; the
human-review code lives in `orphan_code` (Q2). ΑΜΚΑ keeps its legacy `''` (D4).
Enrollment rows carry `class_id`, so the UI's three music-type tabs are a plain
`WHERE class_id = ?` filter, and the per-instrument/class history is the same
rows grouped by `instrument_id`. There is **no back-link to the old
`registrations` row** — that table is dropped.

`registration_url` lives on the **pupil** and never changes (Q6): the links
already emailed to 2025-2026 students keep working forever. The backfill takes
each pupil's newest non-empty `registration_url` and drops the duplicates (the
old column had no UNIQUE constraint). `total_enrollments.amount` is seeded by
the backfill and maintained by `Pupils.enroll` / `Pupils.deleteEnrollments`.

---

## 4. Phase plan

### Phase 1 — Schema migrations (deliverable b) — ✅ DONE (local, 2026-09-10)
1. ✅ `migrations/0002_pupils.sql` — `pupils` (with `registration_url`, `orphan_code`,
   `needs_review`), `pupil_enrollments`, `total_enrollments`, 9 indexes.
2. ⏳ `migrations/0003_drop_registrations.sql` — written but **not applied** until
   the backfill is verified.
3. ✅ Applied locally: `bunx wrangler d1 migrations apply DB --local`
   → `d1_migrations` id 3 = `0002_pupils.sql`.
4. ✅ Verified:
   - tables `pupils`, `pupil_enrollments`, `total_enrollments` + 9 indexes exist;
   - legacy `registrations` still holds **1514** rows (nothing touched);
   - two orphan rows (`am` NULL, `registration_url` '') both accepted;
   - duplicate real ΑΜ rejected (`UNIQUE constraint failed: pupils.am`);
   - duplicate non-empty `registration_url` rejected;
   - test rows deleted — `pupils` is empty again.
5. ⚠️ `bun run db:reset` replays the snapshot and **does not** re-run migrations —
   re-apply 0002/0003 after any reset.

### Phase 2 — Shared normalization module — ✅ DONE (2026-09-10)
1. ✅ `lib/pupils/normalize.ts` (296 lines, pure functions, no DB/env):
   - `stripDiacritics` / `collapseWhitespace` / `normalizeText` (display) and
     `normalizeKey` (comparison: accents + case + spacing + final sigma);
   - `parseAm` → `{ am, kind: valid|orphan|invalid, digits, reason, raw }`,
     handling `'1287   '`, `'761 '`, `'΄1158'`, `'000'`, `'000 - Αναμονή'`,
     `'999 - Αναμονή'`, and flagging 7/9-digit values as `too_long` instead of
     guessing;
   - `normalizeAmka` ('' and `00000000000` → unknown), `normalizePhone`
     (country-code + placeholder aware), `normalizeEmail`;
   - `personNameKey` + `personIdentityKeys` (ΑΜΚΑ → cellphone → email, landline
     only as a last resort because families share landlines);
   - `canonicalClassYear` + `isMissingClassYear` + `needsClassYearReview`
     (all 26 observed spellings → the 18 canonical years).
2. ✅ `tests/unit/pupils.normalize.test.ts` — **20 tests, 91 assertions, all
   passing**, fixtures taken verbatim from the live data.
3. ✅ `bun run typecheck` green.
4. Bugs the tests caught before the backfill existed:
   - `stripDiacritics` was folding the final sigma, which made it unusable for
     display text ('Ψύλλιας' → 'Ψυλλιασ') — moved to `normalizeKey`;
   - the class-year prefix fallback matched `'undefined'` to `'Υπό Κατάταξη'`
     (`'undefined'.startsWith('υπο καταταξη')`) — now word-boundary guarded and
     missing values are excluded;
   - `needsClassYearReview('undefined')` wrongly flagged a missing value.

### Phase 3 — Cleansing + import script (deliverable a) — ✅ DONE (local, 2026-09-10)
`scripts/migratePupils.ts` (idempotent, dry-run by default, `bun run pupils:migrate`):

✅ Clean replay from the pre-migration backup → migration 0002 → `--apply`.
Results on the 1514 legacy rows:

| Result | Value |
| --- | --- |
| Pupils created | **745** (683 with a valid ΑΜ, 62 review rows) |
| Enrollment rows | **1514** (exactly one per legacy row — no loss) |
| Orphans re-united with a real pupil | 17 (via ΑΜΚΑ → cellphone → email) |
| Name variants merged (same person) | 14 |
| Suffix splits (same ΑΜ, different person) | 17 |
| `total_enrollments` | 1514 |
| Second `--apply` | "Nothing to do" — idempotent |

Review queue: **45** true orphans (no usable ΑΜ → `000-Ο1`…) + **17** splits
(`111-Σ1`, `999-Σ1`…) = **62 rows** for the secretaries, all `needs_review = 1`
with a Greek `review_note` explaining why.

Integrity: 0 enrollments without a pupil, 0 nameless pupils, 0 empty
`class_year`, 0 duplicate codes/ΑΜs/URLs. Spot checks: ΑΜ 919 keeps all 16
enrollments; ΑΜ 849/988/1041 collapsed to one pupil each; ΑΜ 111 split into
`111`, `111-Σ1`, `111-Σ2`.

Issues reported: `am_zero` 62, `name_merged_by_identity` 30,
`am_shared_different_names` 14, `class_year_missing` 5, `am_invalid` 4,
`am_waiting` 2.

CLI: `--apply`, `--db local|prod`, `--yes-prod`, `--verbose`, `--report <file>`,
`-h`; env hooks `MIGRATE_LOG_SQL` / `MIGRATE_DUMP_SQL` for auditing the batch.
npm aliases: `bun run pupils:migrate`, `bun run pupils:migrate:apply`.

Bugs caught while rehearsing (each would have corrupted the import):
1. `pickLatest` iterated `ClusterRow` wrappers but indexed them as raw rows, so
   every field read as `undefined` → 745 pupils with empty names/URLs.
2. Split codes (`999-1`) collided with orphan codes (`999-1` from
   `'999 - Αναμονή'`) → now `-Σ<n>` for splits and `-Ο<n>` for orphans.
3. `(SELECT last_insert_rowid())` in the enrollment INSERTs did **not** reliably
   reference the just-inserted pupil: replaying the batch through the `sqlite3`
   CLI produced 328 enrollments pointing at non-existent pupils. The batch now
   assigns pupil ids explicitly and is deterministic (same result via the script
   and via `sqlite3 < batch.sql`).

### Phase 3b — Backups / revert (D14)
- Before each destructive step, copy the live local D1 file and the snapshot into
  `dbSnapshots/backups/` (gitignored).
- Current backups already taken:
  `dbSnapshots/backups/dev-snapshot.sql.2026-09-10_021438.bak` and
  `dbSnapshots/backups/local-d1.2026-09-10_021438.sqlite`.
- Revert = restore the `.sqlite` copy over the live file (or
  `bun run db:reset` + re-apply migrations), then retry the failed step.

### Phase 4 — Server API (`lib/api/routes/pupils.ts`) — ✅ DONE (2026-09-10)
The `Registrations` group is retired (Q3). New surface (paths under `/pupils`):

| Key | Path | Auth | Replaces |
| --- | --- | --- | --- |
| `Pupils.search` | `POST /pupils/search` | yes | new — the Μαθητολόγιο search |
| `Pupils.get` | `POST /pupils/[id:number]` | yes | new — pupil + enrollments by music type |
| `Pupils.update` | `PUT /pupils` | yes | `Registrations.update` (pupil half) |
| `Pupils.post` | `POST /pupils` | **no** | `Registrations.post` (public form; Q1) |
| `Pupils.enroll` | `POST /pupils/enroll` | yes | admin "add historical registration" |
| `Pupils.getEnrollmentsByYear` | `GET /pupils/enrollments/[year:number]` | yes | `Registrations.get` |
| `Pupils.getEnrollmentById` | `POST /pupils/enrollments/[id:number]` | yes | `Registrations.getById` |
| `Pupils.updateEnrollment` | `PUT /pupils/enrollments` | yes | `Registrations.update` (enrollment half) |
| `Pupils.deleteEnrollments` | `DELETE /pupils/enrollments` | yes | `Registrations.delete` |
| `Pupils.getYears` | `GET /pupils/years` | yes | `Registrations.getYears` |
| `Pupils.getTotalByYear` | `GET /pupils/totalByYear` | yes | `Registrations.getTotalByYear` |
| `Pupils.getTotal` | `GET /pupils/total` | yes | `Registrations.getTotal` |
| `Pupils.getByReregistrationUrl` | `GET /pupils/reregistration/[url:string]` | **no** | `Registrations.getByReregistrationUrl` — returns the pupil (by their permanent `registration_url`) plus their latest enrollment per music type, so the form can prefill |

The four email-subscription routes move unchanged to a new
`EmailSubscriptions.*` group (paths `/email-subscriptions/*`) — they are about
newsletter opt-in, not pupils.

`Pupils.getEnrollmentsByYear` / `getEnrollmentById` return the **joined** row
(pupil fields + enrollment fields) in the exact field order of
`src/components/admin/controls/Registrations/reshapeData.ts:14-40`, so the admin
table, Excel/PDF exports and the PDF worker keep working unchanged.

Steps:
1. Write the group; register it in `lib/api/routes/index.ts` (2 lines; types derive).
2. Zod schemas in `lib/api/schemas.ts` + `types/entities.ts` (`Pupils`,
   `PupilEnrollments`); all messages Greek.
3. Delete `lib/api/routes/registrations.ts`.
4. Update the ~6 consumers: `RegistrationForm.solid.tsx` (Q7 — mechanical
   adaptation: `Pupils.getByReregistrationUrl` prefill + `{ pupil, enrollment }`
   submit, behaviour unchanged), `RegistrationsTable`, `TotalsTable`,
   `GlobalSearch`, `reshapeData.ts`/`onModify`/`onDelete`, and the controls barrel.
5. ✅ `tests/api/pupils.test.ts` — **17 tests, 360 assertions, all passing**.
   Runs IN PROCESS: `APIServer.handle` is called directly with synthetic
   Requests and the D1 binding is injected as a bun:sqlite adapter over a
   temporary COPY of the dev database, so it needs no dev server, no login and
   never writes to the dev DB. A forged `sys_users.session_id` row covers the
   authenticated routes.
6. ✅ `bun run typecheck` green; `lib/pupils/normalize.ts` unit tests still 20/20.

Bugs found while writing these tests:
1. `birth_date = 0` (5 pupils) failed `positiveInt` → every pupil-facing
   response schema 500'd. Relaxed to `z.number().int()` for pupils (0 = unknown).
2. `z_Pupils.omit(...).partial({...})` does NOT make fields optional — the
   validators keep their refinements, so an update sending only `{id, cellphone}`
   was rejected. `z_PupilUpdate` is now written out explicitly.
3. The newsletter insert passed the whole subscription object where two scalars
   belong (`[subscription[0]]`) → `Binding expected string…`. This bug was
   INHERITED from `registrations.ts` and only triggers for a brand-new email;
   fixed in both files.

Note: `getEnrollmentsByYear` returns the joined row with `am` as a STRING
(`'706'`, or the orphan code) so the admin table, Excel/PDF exports and the PDF
worker keep the exact legacy contract.

### Phase 5 — Admin UI (`Μαθητολόγιο`) — ✅ DONE (2026-09-10)
1. ✅ `src/components/admin/PupilsPage.solid.tsx` (~600 lines) — search-first:
   the page opens on a large centred search field; selecting a pupil moves the
   bar to the top and reveals the record below. The query is debounced 250 ms,
   paginated (20/page), and has a "Μόνο προς έλεγχο" toggle for the review queue.
2. ✅ Left column = personal information (ΑΜ/ΑΜΚΑ, name, birth date, address,
   phones, email, the permanent re-registration link). Right column = one tab
   per music type the pupil **has actually enrolled in** (`availableMusicTypes`
   derives them from the history), each showing that department's history table
   plus a per-instrument/per-class breakdown.
3. ✅ Actions via the existing modal machinery (`TableControl` +
   `TableControlsGroup`, prefix `pupils`): «Ενημέρωση Στοιχείων Μαθητή»
   (`Pupils.update`) and «Προσθήκη Εγγραφής» (`Pupils.enroll`, with the class
   years driven by the chosen music type).
4. ✅ Route `/admin/pupils` registered in `AdminRouter.solid.tsx` **above** the
   `*` catch-all; nav entry «Μαθητολόγιο» added under Σχολή, and the mobile
   stagger CSS extended to `nth-of-type(13)` (13 links now exist).
5. ✅ Feedback via `pushAlert(createAlert(...))`; no shared API store — the page
   keys data by pupil id and the shared store is keyed by endpoint only.
6. ✅ `bun run typecheck` green; the page module compiles through Vite
   (200, 121 KB, no transform errors); `/admin/pupils` renders 200.
7. ⏳ Browser walkthrough pending the owner (search → select → tabs → edit →
   add enrollment).

### Phase 5b — `/admin/registrations` column scope — ✅ DONE (owner request)
The table lists **enrollments** (one row per pupil / year / class / instrument),
so every enrollment field stays. Only the **pupil** fields were trimmed: the
record's address, phones, email, ΑΜΚΑ, birth date and URL are not repeated here
(the Μαθητολόγιο record view shows them).

| Kept | Source |
| --- | --- |
| `am`, `last_name`, `first_name`, `fathers_name` | pupil identity |
| `class_year`, `class_id`, `teacher_id`, `instrument_id`, `date`, `payment_amount`, `total_payment`, `payment_date`, `pass` | enrollment |
| `id` | hidden first column (`Row` reads the id from index 0) |

`registration_year` is **not** shown: the page is scoped to a single school year
by the picker at the bottom, so every row would repeat the same value. It stays
available in the search-column list, since filtering by year within the current
selection is still meaningful.

- `am` is now `type: "string"` — orphans/splits show their review code
  (`000-Ο1`, `111-Σ1`) instead of a blank/NaN cell.
- `columnOrder`, `columns`, `enrollmentsToTable` and `searchColumns` in
  `controls/Registrations/reshapeData.ts` all shrank together — the positional
  contract between them must stay in sync.
- `searchColumns`: Επώνυμο / Όνομα / Πατρώνυμο / ΑΜ / Έτος Φοίτησης / Μουσική /
  Καθηγητής / Όργανο / Ημ. Εγγραφής / Ημ. Πληρωμής / Προάχθει.
- `reshapeData` tolerates missing teacher/instrument stores (`?? []`), so the
  table still renders if those fetches fail; the loading gate in
  `RegistrationsTable` was relaxed accordingly (they are still fetched for the
  edit modal).

### Phase 5c — pre-existing test-suite flake fixed — ✅ DONE
`tests/api/payments.test.ts` failed ~30% of runs, and the failure was becoming
permanent. Two independent causes:

1. The payload never sent `book_id`, which `Payments.post` requires
   (`postReq = z_Payments.omit({ id, amount, date })`).
2. It picked `book_id = R.int(32, 52)`, where 5 books are sold out (32, 33, 47,
   48, 51) and 49 does not exist → the route's "Το βιβλίο δεν είναι διαθέσιμο"
   guard rejected it. Worse, every successful run **incremented `books.sold`**
   and `Payments.delete` does not undo it, so the fixture was being drained.

Fix: a fixed in-stock book (34), `book_id` supplied, and `sold` reset to its
snapshot value before/after the file (directly in the local dev DB — the API can
only increase `sold`). Suite is now stable across repeated runs (3× 123/123).

### Phase 6 — drop `registrations` — ✅ DONE (local, 2026-09-10)
1. ✅ Backed up the pre-drop DB: `dbSnapshots/backups/local-d1-pre-drop.*.sqlite`.
2. ✅ Applied `migrations/0003_drop_registrations.sql` locally →
   `registrations` and `total_registrations` are gone. Remaining tables:
   `pupils` (745), `pupil_enrollments` (1514), `total_enrollments` (1514),
   zero orphaned enrollments.
3. ✅ Deleted `lib/api/routes/registrations.ts` and removed `Registrations` from
   `lib/api/routes/index.ts`.
4. ✅ Newsletter routes moved to a new `EmailSubscriptions` group
   (`lib/api/routes/emailSubscriptions.ts`). **Paths stay `/registrations/email-*`**
   on purpose — those URLs are inside thousands of already-sent emails and the
   static templates. Only the internal key changed.
5. ✅ Consumers updated: `RegistrationForm.solid.tsx`,
   `src/pages/unsubscribe/[...slug].astro`, `src/pages/subscriptions/index.astro`,
   the `createAPIResource` doc example, `scripts/cf.ts` help text.
6. ✅ `z_RegistrationsResponse` removed (the read side is `z_JoinedEnrollments`);
   `z_Registrations` and the `Registrations` type stay — the public form's
   `Pupils.post` body and the PDF client still use that flat shape.
7. ✅ `tests/api/registrations.test.ts` replaced by
   `tests/api/emailSubscriptions.test.ts` (7 tests: subscribe → token →
   validate → unsubscribe → validate-again, plus the unknown-email/token paths).
8. ✅ **Email worker campaign queries rewritten** (`services/emailWorker/src/campaign/queries.ts`
   — a separate git repo, gitignored by this one): all three functions now read
   `pupils` + `pupil_enrollments` instead of the dropped table. Verified against
   the local data: renewal 285 recipients, recent students 578, returning 2317;
   `bunx tsc --noEmit` clean in that repo.

### Phase 7 — registration form: returning vs new student — ✅ DONE (owner spec)
The public form now has a three-step flow instead of dropping straight into the
full form:

1. **Pick a music type** (unchanged).
2. **Identify** — a small card showing only **ΑΜ** and **ΑΜΚΑ** plus the prompt
   «Είστε νέος μαθητής;» → «Πατήστε εδώ». Verifying the pair pulls the pupil's
   record and prefills the form (the same experience as the `?regid=` link,
   which skips this step entirely).
3. **Form** — revealed prefilled for a returning student, or blank with
   `ΑΜ = 000` for a new one. The music-type switcher only appears here.

New server route: **`Pupils.getByAm`** (`POST /pupils/lookup`, **public**) —
looks a pupil up by ΑΜ **and** ΑΜΚΑ, which must both match. Requiring both keeps
a bare ΑΜ from being usable to enumerate pupils; a 404 tells the form to send the
visitor down the new-student path. Returns the same `{ pupil, enrollments }`
shape as the re-registration link, so prefill is one code path.

Form details:
- lookup validation mirrors the old form's rules (ΑΜ must parse, ΑΜΚΑ is 11
  digits) with Greek messages;
- the prefilled enrolment fields reset (`class_year`, `teacher_id`,
  `instrument_id`) so the student re-registers for the current year, while the
  department they were last enrolled in is preselected;
- `?regid=` deep links skip the lookup step (the permanent link already
  identifies the pupil);
- closing the success popup returns to step 1.

Tests: `tests/api/pupilsAPI.test.ts` #22–#24 (lookup happy path using the
record's own ΑΜΚΑ rather than hardcoded personal data, wrong-ΑΜΚΑ 404, malformed
ΑΜΚΑ 400) — 24 tests total.

Supporting tooling: **`scripts/cleanDevTestData.ts`** (`bun run dev:clean`)
removes the fixtures the API suite writes to the local dev DB (test pupils,
their enrollments, `pupils.test.*` subscriptions) and re-derives the
`total_enrollments` counter. Dry-run by default; local only.

### Phase 8 — Verification + docs
1. `bun run typecheck`; targeted `bun test api/pupils.test.ts api/registrations.test.ts`.
2. Update `AGENTS.md`, `.github/copilot-instructions.md`,
   `docs/architecture/ARCHITECTURE.md` (ER diagram + admin routes).
3. Prod rehearsal checklist for tomorrow: backup (`Schema.get` dump / `db export`),
   apply 0002, dry-run script, review report, `--apply`, verify counts, **then**
   apply 0003.

---

## 5. Risks

| Risk | Mitigation |
| --- | --- |
| Prod data loss | 0002 is additive; 0003 is applied only after the backfill is verified on prod counts |
| Wrong merges (two people, one ΑΜ) | phone/email/ΑΜΚΑ proof required; otherwise split to `-N` and flag `needs_review` |
| Wrong splits (one person, two spellings) | accent/case folding + ΑΜΚΑ/phone/email clustering |
| Script run after the strip | script detects missing columns/tables and refuses with a clear message |
| `db:reset` silently drops migrations | re-apply 0002/0003 after reset (documented + script prints a reminder) |
| Test suite dirties local D1 | run `bun run db:reset` + re-apply migrations before the real rehearsal |
| PDF/Excel contract break | `Registrations.*` returns the joined row, so the wire shape is unchanged |
| `query_logs` spam from the backfill | bulk writes go through `wrangler d1 execute --file`, bypassing the app logger |

## 6. Non-goals (this task)

- Any `wrangler deploy` / remote command — production stays untouched (D13).
- A printable pupil record PDF (the PDF worker accepts only `type: "registration"`;
  that repo is separate).
- Touching `teachers.registration_number` / `registrations_number` — unrelated
  concept (teacher approval number).

## 7. Status

No open questions. Everything is decided (D1–D14, Q1–Q7); see §0.
