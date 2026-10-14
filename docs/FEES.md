# Δίδακτρα — automatic yearly fees + «Υπό Κατάταξη» as a status

Design record for the automatic fee assignment (owner requirements, 2026-10-14). The implementation must
follow this file; change it in the same commit if a decision changes.

## 1. «Υπό Κατάταξη» is a status, not a class year

- `pupil_enrollments.evaluation INTEGER NOT NULL DEFAULT 0` — 1 = this enrollment took (or awaits) the
  evaluation exam. It is **permanent**: it stays 1 after placement, because it is the documented reason
  for the evaluation fee.
- While awaiting placement, `class_year = ''`. The secretariat places the pupil by setting `class_year`;
  `evaluation` stays 1.
- The public form is unchanged for the user (it still offers «Υπό Κατάταξη» in the class-year list). The
  server maps that submission to `evaluation = 1, class_year = ''`.
- Display everywhere (admin table, Μαθητολόγιο, Excel/PDF, email): `class_year` if set, otherwise
  «Υπό Κατάταξη»; a placed evaluation row may show a small «Κατάταξη» badge next to its year.
- Existing data (migration 0006): every `class_year = 'Υπό Κατάταξη'` row → `evaluation = 1, class_year = ''`.
  Rows of school years **before 2026-2027** additionally flag their pupil for review (`needs_review = 1`,
  `review_note` gets «Υπό Κατάταξη <year>: ορίστε το έτος φοίτησης») so the secretariat fixes them. Their
  fees are not touched.

## 2. The price catalog (single source of truth, versioned)

A catalog **version** = settings + a list of price rules (migration 0007; owner decision 2026-10-15).

- `fee_catalogs (id INTEGER PK, school_year TEXT NOT NULL, evaluation_fee INTEGER NOT NULL,
  multi_enrollment_factor REAL NOT NULL, created_at INTEGER NOT NULL, created_by TEXT, data TEXT /* legacy */)`
  - `evaluation_fee`: ONE amount for every department, per enrollment with `evaluation = 1`, never discounted.
  - `multi_enrollment_factor`: applied to every enrollment after the first of the pupil's year (§3).
  - `data` is the legacy JSON of migration 0006. 0007 converts it and leaves it in place (the previous worker
    keeps reading it until the new code is deployed); the new code never reads it and writes `'{}'`. It is
    dropped in a later migration once this code is live.
- `fee_catalog_rules (id PK, catalog_id NOT NULL → fee_catalogs, class_id INTEGER NOT NULL, class_years TEXT NULL
  /* JSON array */, teacher_id INTEGER NULL, price INTEGER NOT NULL)`:
  - `class_id` 0 Βυζαντινή / 1 Παραδοσιακή / 2 Ευρωπαϊκή.
  - `class_years` NULL = every class year of the department, otherwise a non-empty set of that department's
    placement class years (`placementClassYearsForClassId`; never «Υπό Κατάταξη»). The editor offers ranges;
    storage is the set.
  - `teacher_id` NULL = any teacher. `price` in whole euros ≥ 0. No per-instrument rules.

Versions are **immutable**: editing the catalog inserts a new version (catalog + rules in one `db.batch`). The
active catalog of a school year = its newest version.

**Precedence** (the matching rule of the enrollment's department with the highest rank wins; owner: a teacher's
flat price has the higher priority):

1. teacher + class years
2. teacher (all class years)
3. class years
4. department base (all class years, no teacher)

**Validation** rejects ambiguity: within the same `(class_id, teacher_id or none)` no class year may be covered by
two rules, and there is at most one all-years rule. Teacher ids must exist (400 otherwise).

**Awaiting placement** (`evaluation = 1`, `class_year = ''`): only all-years rules can match (a teacher's
all-years price or the department base), so the enrollment is priced immediately when the department has one;
otherwise `fee_base` stays NULL until placement (the Traditional seed). Placement recalculates from the pinned
catalog.

Seed (migration 0006, converted by 0007) for `2026-2027`: `evaluation_fee` 80, `multi_enrollment_factor` 0.5, rules:

| department | class years | teacher | price |
|---|---|---|---|
| Βυζαντινή | all | — | 20 |
| Βυζαντινή | all | Νικόλαος Ταπραντζής | 50 |
| Βυζαντινή | all | Ιωάννης Χαβιαρλής | 50 |
| Παραδοσιακή | Α' Προκαταρκτική … Γ' Μέση | — | 50 |
| Παραδοσιακή | Α' Ανωτέρα … Β' Διπλώματος | — | 100 |
| Ευρωπαϊκή | all (the school awards no European diplomas) | — | 50 |

Teacher ids are looked up by name in migration 0006 (`SELECT id FROM teachers WHERE fullname = ...`), never
hard-coded. The «μη συνεργαζόμενοι καθηγητές» are just teacher rules — no teachers column.

**Deploying 0007** (production already runs 0006 + the backfill): apply 0007 and deploy the new code
immediately after, with **no catalog edits in between** (the old code would write a JSON-only version without
rules). 0007 only restructures the catalogs: catalog ids are kept, no enrollment is re-pinned or repriced; the
rehearsal on the production export showed the new engine reproduces every stored fee.

## 3. Fees on an enrollment

New columns on `pupil_enrollments`:

| column | meaning |
|---|---|
| `fee_catalog_id INTEGER NULL` | catalog version **pinned at registration** (the active version for the enrollment's school year at insert time). NULL = no automatic fees (all pre-2026-27 rows, or a year without a catalog) → `total_payment` behaves exactly as before. |
| `fee_base INTEGER NULL` | the class price from the pinned catalog, before the discount. NULL while it cannot be known (awaiting placement with no all-years price). |
| `evaluation_fee INTEGER NOT NULL DEFAULT 0` | the evaluation fee from the pinned catalog when `evaluation = 1`, else 0. |
| `fee_manual INTEGER NOT NULL DEFAULT 0` | «Ειδική τιμή»: the secretariat set `total_payment` by hand; recalculation never touches it. |

`total_payment` stays the final amount owed (exports, payments and the PDF keep reading it).

**Prices only ever come from the enrollment's pinned catalog** — a later catalog edit never changes an
existing enrollment, not even during a recalculation or a placement.

### Calculation (pure function, `lib/fees/`)

For one pupil + one school year, over ALL their enrollments of that year (manual ones included — they still
occupy a position):

1. Order by department **Βυζαντινή (0) → Παραδοσιακή (1) → Ευρωπαϊκή (2)**, ties by enrollment id (earlier
   registration first).
2. Position 0 → factor 1; every later position → `multi_enrollment_factor` of **that enrollment's** catalog.
3. `fee_base` = the price of the highest-precedence matching rule of the pinned catalog (§2); NULL when no
   rule matches (e.g. Traditional awaiting placement without an all-years price).
4. For rows with `fee_catalog_id` NOT NULL and `fee_manual = 0`:
   `total_payment = round(fee_base × factor) + evaluation_fee` (`fee_base` NULL counts as 0 until placed).
   Rounding: to whole euros, half up.

### When it runs

Recalculate the affected pupil + school year(s), in the same request, after: the public registration
(`Pupils.post`), an admin enrollment (`Pupils.enroll`), `Pupils.updateEnrollment` (class, class year /
placement, teacher, evaluation toggle, school year move — recalc both years) and `Pupils.deleteEnrollments`.
Use `db.batch` for the resulting UPDATEs where practical (D1 has no transactions).

### «Ειδική τιμή» (manual fee)

- Admin edit: saving a `total_payment` different from the computed one sets `fee_manual = 1`.
- «Επαναφορά τιμής καταλόγου» clears `fee_manual` and recalculates (from the pinned catalog).
- API detail (`Pupils.updateEnrollment`): `fee_manual: false` = Επαναφορά, `fee_manual: true` = keep the sent
  total. When `fee_manual` is omitted, a sent `total_payment` becomes manual only if it differs from BOTH the
  computed price and the stored total — an edit form that sends back the unchanged stored total (e.g. while
  placing a pupil) must not freeze the old price. An already manual row stays manual unless the sent total equals
  the computed one. `Pupils.enroll`: a typed `total_payment > 0` different from the computed price is manual.
- The marker is shown next to the fee in the registrations table, the edit modal and the Μαθητολόγιο.

## 4. Existing 2026-2027 enrollments

`scripts/feesBackfill.ts` (`bun run fees:backfill`, **dry run by default**, `--apply` to write, `--remote`
for production via `wrangler d1 execute`, `--remote --env preview` for the preview database): pins the
2026-2027 catalog on that year's enrollments, fills `fee_base`/`evaluation_fee` and applies the **standard
fees to all of them** (`fee_manual = 0`). A different hand-typed amount is not kept (owner decision): the
per-pupil report lists it («ήταν X € → Y €») and the secretariat sets «Ειδική τιμή» where it really was one.
Already-paid amounts are untouched. Older years are untouched.

## 5. Admin UI

- **Ρυθμίσεις → Κατάλογος διδάκτρων**: view the active catalog per school year, edit (creates a new version),
  version history (read-only). The settings (evaluation fee, discount) and the rule list: per rule a department,
  class years (all, or a range / set of that department's class years), an optional teacher picker and a price;
  the ambiguity validation of §2 shown per rule. Owner/admins only (authenticated route).
- **Edit enrollment** (registrations modal + Μαθητολόγιο): the registration details only, with the «Υπό
  Κατάταξη» checkbox (evaluation) and a class year select without that option (empty allowed while
  evaluation is set). It resends the stored payment fields so it never clobbers them.
- **«Δίδακτρα μαθητή»** (one pupil-year — «Δίδακτρα» button under the Μαθητολόγιο «Στοιχεία Μαθητή» card; the
  only place fees and payments are edited):
  school-year select (opens on the current year), the year's enrollments in discount order with per-row
  payment/price actions, totals «Δίδακτρα τμημάτων» / «Τέλη κατάταξης» / «Γενικό σύνολο» / «Πληρώθηκαν» /
  «Υπόλοιπο», and «Εξόφληση όλων» via `Pupils.settleYear` (`POST /pupils/fees/settle`
  `{ pupil_id, registration_year, payment_date }` → `{ updated }`: one UPDATE setting
  `payment_amount = total_payment` on every row of the pupil-year that still owes; fees untouched).
