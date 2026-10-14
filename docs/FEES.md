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

Table `fee_catalogs (id INTEGER PK, school_year TEXT NOT NULL, data TEXT NOT NULL /* JSON */, created_at
INTEGER NOT NULL, created_by TEXT)`. Rows are **immutable**: editing the catalog inserts a new version.
The active catalog of a school year = its newest row. Seed (migration 0006) for `2026-2027`:

```jsonc
{
  "evaluation_fee": 80,                     // flat, per enrollment, never discounted
  "byzantine": { "default": 20, "teachers": { "<id of Νικόλαος Ταπραντζής>": 50, "<id of Ιωάννης Χαβιαρλής>": 50 } },
  "traditional": {                          // per class year (every Traditional class year except Υπό Κατάταξη)
    "Α' Προκαταρκτική": 50, "Α' Κατωτέρα": 50, "Β' Κατωτέρα": 50, "Α' Μέση": 50, "Β' Μέση": 50, "Γ' Μέση": 50,
    "Α' Ανωτέρα": 100, "Β' Ανωτέρα": 100, "Α' Διπλώματος": 100, "Β' Διπλώματος": 100
  },
  "european": { "default": 50 },            // flat: the school awards no European diplomas
  "multi_enrollment_factor": 0.5            // every enrollment after the first of the pupil's year
}
```

Teacher ids are looked up by name in the migration (`SELECT id FROM teachers WHERE fullname = ...`), never
hard-coded. The «μη συνεργαζόμενοι καθηγητές» are just the `byzantine.teachers` map — no teachers column.

## 3. Fees on an enrollment

New columns on `pupil_enrollments`:

| column | meaning |
|---|---|
| `fee_catalog_id INTEGER NULL` | catalog version **pinned at registration** (the active version for the enrollment's school year at insert time). NULL = no automatic fees (all pre-2026-27 rows, or a year without a catalog) → `total_payment` behaves exactly as before. |
| `fee_base INTEGER NULL` | the class price from the pinned catalog, before the discount. NULL while it cannot be known (Traditional awaiting placement). |
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
3. `fee_base` = Byzantine: `byzantine.teachers[teacher_id] ?? byzantine.default`; Traditional:
   `traditional[class_year]` (NULL if `class_year` is empty or unknown); European: `european.default`.
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
  version history (read-only), the non-affiliated teachers as a teacher picker + price. Owner/admins only
  (authenticated route).
- **Edit enrollment** (registrations modal + Μαθητολόγιο): the registration details only, with the «Υπό
  Κατάταξη» checkbox (evaluation) and a class year select without that option (empty allowed while
  evaluation is set). It resends the stored payment fields so it never clobbers them.
- **«Δίδακτρα & Πληρωμή»** (one enrollment — € control in the registrations table, € button per Μαθητολόγιο
  history row): read-only summary, fee breakdown (class price, discount, evaluation fee, catalog price),
  editable total → «Ειδική τιμή», «Επαναφορά τιμής καταλόγου», paid amount/date, balance, «Εξόφληση».
- **«Δίδακτρα μαθητή»** (one pupil-year — «Δίδακτρα» button under the Μαθητολόγιο «Στοιχεία Μαθητή» card):
  school-year select (opens on the current year), the year's enrollments in discount order with per-row
  payment/price actions, totals «Δίδακτρα τμημάτων» / «Τέλη κατάταξης» / «Γενικό σύνολο» / «Πληρώθηκαν» /
  «Υπόλοιπο», and «Εξόφληση όλων» via `Pupils.settleYear` (`POST /pupils/fees/settle`
  `{ pupil_id, registration_year, payment_date }` → `{ updated }`: one UPDATE setting
  `payment_amount = total_payment` on every row of the pupil-year that still owes; fees untouched).
