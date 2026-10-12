/**
 * scripts/lib/pupilsRun.ts — the pupil-register backfill engine.
 *
 * `scripts/lib/pupilsBackfill.ts` holds the cleansing RULES (pure, no I/O).
 * This file holds the RUN: read the legacy rows, plan the backfill, build the
 * INSERT batch, write it, and verify what landed. It is shared by
 *
 *   scripts/migratePupils.ts — the low-level CLI, which reads `registrations`
 *                              from the target database itself;
 *   scripts/portD1.ts        — the one-command port, which reads them from the
 *                              Turso bundle instead, because after a wipe the
 *                              target has no `registrations` table at all.
 *
 * Both paths feed the SAME pure planner, so they produce the same pupils from
 * the same legacy rows — the port only changes where those rows are read from.
 */
import { writeFileSync } from "node:fs";
import { databaseBinding, type BatchOptions, type D1Client, type D1Target, type SqlStatement } from "./d1";
import {
	buildBatch,
	conservationKey,
	enrollmentFields,
	LEGACY_COLUMNS,
	planBackfill,
	renderStatement,
	type BackfillBatch,
	type BackfillPlan,
	type EnrollmentFields,
	type ExistingPupils,
	type InsertRow,
	type IssueCode,
	type LegacyRow,
} from "./pupilsBackfill";
import { digestRows, quoteIdent, type Row, type TablePlan } from "./portBundle";

// ---------------------------------------------------------------------------
// Preflight (only meaningful when reading the legacy rows from a target)
// ---------------------------------------------------------------------------

export const REQUIRED_TABLES = ["pupils", "pupil_enrollments", "total_enrollments"] as const;

/** The exact column list the backfill reads from `registrations`, in schema order. */
export const LEGACY_READ = `SELECT ${LEGACY_COLUMNS.join(", ")} FROM registrations ORDER BY id`;

/**
 * The commands that make a target ready for a TARGET-SIDE backfill —
 * deliberately NOT `d1 migrations apply`.
 *
 * `migrations apply` runs EVERY pending migration, and 0003_drop_registrations.sql
 * drops the very table this reads from. On a database where both 0002 and 0003
 * are pending (any freshly created environment), that would destroy the source
 * rows before the backfill has copied them. So the create migration is applied
 * on its own with `d1 execute --file`; `migrations apply` is only safe
 * afterwards (step 3 below), when 0002 is a no-op and 0003 is the intended drop.
 *
 * The port flow (scripts/portD1.ts) does not need any of this: it reads the
 * legacy rows from the Turso bundle, so its target never holds `registrations`
 * and all three migrations can be applied in one pass.
 */
export function migrationHint(target: D1Target): string[] {
	const scope = target.kind === "local" ? "--local" : "--remote";
	const name = databaseBinding(target.name);
	return [
		`1. create the new tables ONLY:  bunx wrangler d1 execute ${name} ${scope} --file migrations/0002_pupils.sql`,
		`2. backfill + verify:            bun scripts/migratePupils.ts --db ${target.name}${target.kind === "remote" ? " --yes-prod" : ""} --apply`,
		`3. drop the legacy table:        bunx wrangler d1 migrations apply ${name} ${scope}${target.name === "preview" ? " -e preview" : ""}`,
		``,
		`Or rebuild the whole target from Turso in one step:  bun run port --db ${target.name}${target.kind === "remote" ? " --yes-prod" : ""}`,
	];
}

export async function preflight(client: D1Client): Promise<{ hasLegacy: boolean; appliedMigrations: string[]; tables: Set<string> }> {
	const tables = new Set((await client.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")).map((row) => String(row.name)));
	const appliedMigrations = tables.has("d1_migrations")
		? (await client.query<{ name: string }>("SELECT name FROM d1_migrations ORDER BY id")).map((row) => String(row.name))
		: [];

	const missing = REQUIRED_TABLES.filter((table) => !tables.has(table));
	if (missing.length) {
		console.error(`\n✗ The target (${client.target.label}) is missing: ${missing.join(", ")}`);
		console.error(`  They come from migrations/0002_pupils.sql.`);
		console.error(`  Applied migrations: ${appliedMigrations.length ? appliedMigrations.join(", ") : "(none)"}`);
		console.error(`\n  ⚠ Do NOT run \`d1 migrations apply\` yet — it would also run`);
		console.error(`    0003_drop_registrations.sql and drop the rows this script reads.`);
		console.error(`\n  Run, in this order:`);
		for (const line of migrationHint(client.target)) console.error(line ? `    ${line}` : "");
		console.error("");
		throw new Error("Target schema is not ready for the backfill.");
	}
	return { hasLegacy: tables.has("registrations"), appliedMigrations, tables };
}

// ---------------------------------------------------------------------------
// Reading the legacy rows
// ---------------------------------------------------------------------------

/** Reads `registrations` from the target, in `id` order (what the planner expects). */
export async function readLegacyRows(client: D1Client): Promise<LegacyRow[]> {
	return client.query<LegacyRow>(LEGACY_READ);
}

/**
 * Reads the legacy rows out of an export bundle's `registrations` table.
 *
 * Sorted by `id`, because that is the order the target-side read uses
 * (`ORDER BY id`) and the planner is order-sensitive. The exporter writes rows
 * in `rowid` order and `id` is an INTEGER PRIMARY KEY (so id *is* the rowid),
 * which makes this a no-op in practice — it is here so the equivalence does not
 * depend on that reasoning staying true.
 */
export function legacyRowsFromPlan(plan: TablePlan): LegacyRow[] {
	const missing = LEGACY_COLUMNS.filter((column) => !plan.columns.includes(column));
	if (missing.length) throw new Error(`Bundle table '${plan.name}' is missing column(s): ${missing.join(", ")}`);
	const rows = plan.rows.map((row) => {
		const legacy: Record<string, unknown> = {};
		for (const column of LEGACY_COLUMNS) legacy[column] = row[column];
		return legacy as LegacyRow;
	});
	return rows.sort((a, b) => Number(a.id) - Number(b.id));
}

/** The bundle table the port derives the pupil register from. */
export const LEGACY_PLAN_TABLE = "registrations";

// ---------------------------------------------------------------------------
// Planning + applying
// ---------------------------------------------------------------------------

/** The state the batch builder needs to stay idempotent (empty on a wiped target). */
export const EMPTY_EXISTING: ExistingPupils = { ams: new Set(), urls: new Set(), orphanCodes: new Set(), nextId: 1 };

export type BackfillRun = {
	legacy: LegacyRow[];
	plan: BackfillPlan;
	batch: BackfillBatch;
	insertPupils: number;
	insertEnrollments: number;
	statementCount: number;
	/** What the target already had, and therefore how much was skipped. */
	skipped: number;
};

/** Plans the backfill and builds its INSERT batch (pure — no I/O). */
export function planRun(legacy: LegacyRow[], existing: ExistingPupils = EMPTY_EXISTING): BackfillRun {
	const plan = planBackfill(legacy);
	const batch = buildBatch(plan.pupils, existing);
	return {
		legacy,
		plan,
		batch,
		insertPupils: batch.pupils.length,
		insertEnrollments: batch.enrollments.length,
		statementCount: batch.statements.length,
		skipped: batch.skipped,
	};
}

/** Collects the pupils already present in a target (idempotent re-runs). */
export async function existingPupils(client: D1Client): Promise<ExistingPupils> {
	const ams = new Set<number>(
		(await client.query<{ am: number }>("SELECT am FROM pupils WHERE am IS NOT NULL"))
			.map((row) => Number(row.am))
			.filter((value) => Number.isFinite(value)),
	);
	const urls = new Set<string>(
		(await client.query<{ registration_url: string }>("SELECT registration_url FROM pupils WHERE registration_url <> ''")).map((row) =>
			String(row.registration_url),
		),
	);
	const orphanCodes = new Set<string>(
		(await client.query<{ orphan_code: string }>("SELECT orphan_code FROM pupils WHERE orphan_code <> ''")).map((row) => String(row.orphan_code)),
	);
	const nextId = Number((await client.query<{ next: number }>("SELECT COALESCE(MAX(id), 0) + 1 AS next FROM pupils"))[0]?.next ?? 1);
	return { ams, urls, orphanCodes, nextId };
}

/** Writes the batch. Returns the number of rows affected. */
export async function applyRun(client: D1Client, run: BackfillRun, hooks: BatchOptions = {}): Promise<number> {
	return client.batch(run.batch.statements, hooks);
}

/** The whole batch with its parameters inlined — the reviewable artifact. */
export function renderRunSql(run: BackfillRun): string {
	return `${run.batch.statements.map(renderStatement).join("\n")}\n`;
}

/** The statements of the run, as `{sql, params}` (used by the SQL audit log). */
export function runStatements(run: BackfillRun): SqlStatement[] {
	return run.batch.statements;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

export type BackfillSummary = { perYear: Map<string, number>; issueCounts: Map<IssueCode, number> };

export function summarize(run: BackfillRun): BackfillSummary {
	const perYear = new Map<string, number>();
	for (const pupil of run.plan.pupils) {
		for (const enrollment of pupil.enrollments) {
			perYear.set(enrollment.registration_year, (perYear.get(enrollment.registration_year) ?? 0) + 1);
		}
	}
	const issueCounts = new Map<IssueCode, number>();
	for (const issue of run.plan.issues) issueCounts.set(issue.code, (issueCounts.get(issue.code) ?? 0) + 1);
	return { perYear, issueCounts };
}

/**
 * Prints the backfill report. `sourceLines` are the extra `label: value` rows
 * under "Legacy registrations" — `[["Migrations applied on the target", "…"]]`
 * for the target-side CLI, `[["Bundle", "…"]]` for the port.
 */
export function printBackfillReport(run: BackfillRun, sourceLines: [string, string][], verbose: boolean): BackfillSummary {
	const { pupils, stats } = run.plan;
	const { perYear, issueCounts } = summarize(run);

	console.log(`\n${"Legacy registrations".padEnd(37)}: ${run.legacy.length}`);
	for (const [label, value] of sourceLines) console.log(`${label.padEnd(37)}: ${value}`);

	console.log("\n=== ΠΡΟΣΩΠΑ / PUPILS ===");
	console.log(`  Σύνολο προσώπων που θα δημιουργηθούν : ${run.insertPupils} (${pupils.length} στο σύνολο)`);
	console.log(`  Με έγκυρο ΑΜ                        : ${pupils.filter((pupil) => pupil.am !== null).length}`);
	console.log(`  Orphans (000-Οn, needs_review)      : ${pupils.filter((pupil) => pupil.am === null).length}`);
	console.log(`  Orphans που ενώθηκαν με υπαρκτό ΑΜ  : ${stats.orphansAttached}`);
	console.log(`  Συνενώσεις ονομάτων (ίδιο πρόσωπο)  : ${stats.merges}`);
	console.log(`  Διαχωρισμοί (ίδιο ΑΜ, άλλο πρόσωπο) : ${stats.splits}`);
	if (run.skipped) console.log(`  Ήδη στο target (παραλείφθηκαν)      : ${run.skipped}`);

	console.log("\n=== ΕΓΓΡΑΦΕΣ / ENROLLMENTS ===");
	console.log(`  Σύνολο εγγραφών που θα δημιουργηθούν: ${run.insertEnrollments} (${stats.enrollments} στο σύνολο)`);
	for (const [year, count] of [...perYear.entries()].sort()) console.log(`    ${year}: ${count}`);

	console.log("\n=== ΕΚΚΡΕΜΟΤΗΤΕΣ / ISSUES ===");
	if (issueCounts.size === 0) console.log("  (καμία)");
	for (const [code, count] of [...issueCounts.entries()].sort((a, b) => b[1] - a[1])) {
		console.log(`  ${code.padEnd(28)} ${count}`);
	}

	if (verbose) {
		console.log("\n=== ΔΕΙΓΜΑΤΑ / SAMPLES ===");
		for (const code of [...new Set(run.plan.issues.map((issue) => issue.code))]) {
			console.log(`\n[${code}]`);
			for (const sample of run.plan.issues.filter((issue) => issue.code === code).slice(0, 8)) console.log(`  ${sample.detail}`);
		}
	}

	return { perYear, issueCounts };
}

export type BackfillReportMeta = {
	target: string;
	applied: boolean;
	source?: string;
	bundle?: string | null;
};

export function writeBackfillReport(file: string, run: BackfillRun, meta: BackfillReportMeta): void {
	const summary = summarize(run);
	writeFileSync(
		file,
		JSON.stringify(
			{
				generatedAt: new Date().toISOString(),
				source: meta.source ?? meta.target,
				target: meta.target,
				bundle: meta.bundle ?? null,
				applied: meta.applied,
				legacyRows: run.legacy.length,
				pupils: run.plan.pupils.length,
				pupilsToInsert: run.insertPupils,
				enrollments: run.plan.stats.enrollments,
				enrollmentsToInsert: run.insertEnrollments,
				skipped: run.skipped,
				stats: run.plan.stats,
				perYear: Object.fromEntries([...summary.perYear.entries()].sort()),
				issues: [...summary.issueCounts.entries()].map(([code, count]) => ({ code, count })),
				issueDetails: run.plan.issues,
			},
			null,
			2,
		),
		"utf8",
	);
	console.log(`\nReport written to ${file}`);
}

// ---------------------------------------------------------------------------
// Verification — prove the target holds exactly what the batch wrote
// ---------------------------------------------------------------------------

export type PupilCheck = { name: string; ok: boolean; detail: string };
export type PupilVerification = { ok: boolean; checks: PupilCheck[]; pupils: number; enrollments: number; counter: number | null };

/** The columns compared against the target (timestamps and generated ids excluded). */
export const PUPIL_DIGEST_COLUMNS = [
	"id",
	"am",
	"orphan_code",
	"split_from_am",
	"first_name",
	"last_name",
	"fathers_name",
	"birth_date",
	"road",
	"number",
	"tk",
	"region",
	"telephone",
	"cellphone",
	"email",
	"amka",
	"registration_url",
	"needs_review",
	"review_note",
];
export const ENROLLMENT_DIGEST_COLUMNS = [
	"pupil_id",
	"registration_year",
	"class_id",
	"class_year",
	"teacher_id",
	"instrument_id",
	"date",
	"payment_amount",
	"total_payment",
	"payment_date",
	"pass",
	"source",
];

/** Turns the batch's `{columns, values}` rows into digestable row objects. */
export function insertRowsToObjects(rows: InsertRow[]): Row[] {
	return rows.map((row) => Object.fromEntries(row.columns.map((column, index) => [column, row.values[index]])));
}

/** Groups rows by the documented conservation tuple; returns key → count. */
function groupByConservation(rows: EnrollmentFields[]): Map<string, number> {
	const groups = new Map<string, number>();
	for (const row of rows) {
		const key = conservationKey(row);
		groups.set(key, (groups.get(key) ?? 0) + 1);
	}
	return groups;
}

/**
 * The enrollment query selects exactly the conservation fields (plus the ones
 * the digest uses), so a target row can be read as an `EnrollmentFields`.
 */
function asEnrollmentFields(rows: Row[]): EnrollmentFields[] {
	return rows as unknown as EnrollmentFields[];
}

/**
 * Read-only verification of the pupil register.
 *
 * Two independent kinds of proof:
 *  1. WHAT WE WROTE LANDED — digest of the target's `pupils` /
 *     `pupil_enrollments` against the batch's own rows (same `digestRows` the
 *     data port uses, so "equal digest = identical values", not just counts).
 *  2. NOTHING WAS LOST — the multiset of `(year, class, teacher, instrument,
 *     date, amounts, payment date, pass)` over the legacy rows equals the one
 *     over the written enrollments, in both directions. This is the invariant
 *     docs/PUPILS_MIGRATION.md states for the migration; here it is computed
 *     rather than asserted.
 * Plus the row-level invariants from the runbook.
 */
export async function verifyPupils(client: D1Client, run: BackfillRun): Promise<PupilVerification> {
	const checks: PupilCheck[] = [];

	const targetPupils = await client.query<Row>(`SELECT ${PUPIL_DIGEST_COLUMNS.map(quoteIdent).join(", ")} FROM pupils`);
	const expectedPupils = insertRowsToObjects(run.batch.pupils);
	const pupilsDigest = digestRows(expectedPupils, PUPIL_DIGEST_COLUMNS);
	const targetPupilsDigest = digestRows(targetPupils, PUPIL_DIGEST_COLUMNS);
	checks.push({
		name: "pupils identical to the generated batch",
		ok: targetPupils.length === expectedPupils.length && pupilsDigest === targetPupilsDigest,
		detail: `${targetPupils.length} row(s), ${targetPupilsDigest.slice(7, 19)}${pupilsDigest === targetPupilsDigest ? "" : ` ≠ ${pupilsDigest.slice(7, 19)}`}`,
	});

	const targetEnrollments = await client.query<Row>(`SELECT ${ENROLLMENT_DIGEST_COLUMNS.map(quoteIdent).join(", ")} FROM pupil_enrollments`);
	const expectedEnrollments = insertRowsToObjects(run.batch.enrollments);
	const enrollmentsDigest = digestRows(expectedEnrollments, ENROLLMENT_DIGEST_COLUMNS);
	const targetEnrollmentsDigest = digestRows(targetEnrollments, ENROLLMENT_DIGEST_COLUMNS);
	checks.push({
		name: "enrollments identical to the generated batch",
		ok: targetEnrollments.length === expectedEnrollments.length && enrollmentsDigest === targetEnrollmentsDigest,
		detail: `${targetEnrollments.length} row(s), ${targetEnrollmentsDigest.slice(7, 19)}${enrollmentsDigest === targetEnrollmentsDigest ? "" : ` ≠ ${enrollmentsDigest.slice(7, 19)}`}`,
	});

	// One enrollment per legacy row: the planner must not drop or duplicate one.
	checks.push({
		name: "one enrollment per registrations row",
		ok: run.legacy.length === targetEnrollments.length,
		detail: `${run.legacy.length} registrations → ${targetEnrollments.length} enrollment(s)`,
	});

	// Row conservation, both directions.
	const legacyGroups = groupByConservation(run.legacy.map((row) => enrollmentFields(row)));
	const enrollmentGroups = groupByConservation(asEnrollmentFields(targetEnrollments));
	let missing = 0;
	let extra = 0;
	for (const [key, count] of legacyGroups) {
		const actual = enrollmentGroups.get(key) ?? 0;
		if (actual !== count) missing += count - Math.min(count, actual);
	}
	for (const [key, count] of enrollmentGroups) {
		const expected = legacyGroups.get(key) ?? 0;
		if (expected !== count) extra += count - Math.min(count, expected);
	}
	checks.push({
		name: "row conservation (registrations ↔ enrollments)",
		ok: missing === 0 && extra === 0,
		detail: `${legacyGroups.size} group(s); ${missing} missing, ${extra} unexpected`,
	});

	// Row-level invariants (runbook §4).
	const [dangling] = await client.query<{ n: number }>(
		"SELECT COUNT(*) AS n FROM pupil_enrollments e LEFT JOIN pupils p ON p.id = e.pupil_id WHERE p.id IS NULL",
	);
	const [nameless] = await client.query<{ n: number }>("SELECT COUNT(*) AS n FROM pupils WHERE last_name = '' OR first_name = ''");
	const [noUrl] = await client.query<{ n: number }>("SELECT COUNT(*) AS n FROM pupils WHERE registration_url = '' AND needs_review = 0");
	// The API's z_Amka accepts '' or exactly 11 digits; anything else makes every
	// listing that contains the pupil fail response validation (a 500 in the admin).
	const [badAmka] = await client.query<{ n: number }>("SELECT COUNT(*) AS n FROM pupils WHERE amka <> '' AND LENGTH(amka) <> 11");
	const [counterRow] = await client.query<{ amount: number | null }>("SELECT amount FROM total_enrollments");
	const counter = counterRow?.amount ?? null;

	const invariants: [string, number | boolean][] = [
		["0 enrollments without a pupil", Number(dangling?.n ?? -1) === 0],
		["0 pupils without a name", Number(nameless?.n ?? -1) === 0],
		["0 pupils without a registration_url (and not flagged for review)", Number(noUrl?.n ?? -1) === 0],
		["every ΑΜΚΑ is empty or 11 digits (the API contract)", Number(badAmka?.n ?? -1) === 0],
		["total_enrollments.amount equals the enrollment count", counter === targetEnrollments.length],
	];
	for (const [name, ok] of invariants) {
		checks.push({ name, ok: ok === true, detail: ok === true ? "ok" : "FAILED" });
	}

	return {
		ok: checks.every((check) => check.ok),
		checks,
		pupils: targetPupils.length,
		enrollments: targetEnrollments.length,
		counter: counter === null ? null : Number(counter),
	};
}

export function printPupilVerification(result: PupilVerification): void {
	console.log(`\nPupil register verification`);
	for (const check of result.checks) console.log(`  ${check.ok ? "✓" : "✗"} ${check.name} — ${check.detail}`);
	console.log(
		result.ok
			? `\n✓ Pupil register verified: ${result.pupils} pupil(s), ${result.enrollments} enrollment(s), total_enrollments=${result.counter}.`
			: `\n✗ Pupil register verification FAILED.`,
	);
}
