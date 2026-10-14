#!/usr/bin/env bun
/**
 * feesBackfill.ts — automatic fees for the existing enrollments of a school year (docs/FEES.md §4).
 *
 * Pins the year's ACTIVE catalog on its enrollments that have none, fills `fee_base` / `evaluation_fee` and
 * recalculates `total_payment` per pupil (lib/fees, the same function the API uses). An enrollment whose
 * existing `total_payment > 0` differs from the computed amount keeps its value and becomes «Ειδική τιμή»
 * (`fee_manual = 1`). Enrollments that already have a catalog are recalculated as the API would. Other
 * school years are never touched. Prints a per-pupil report.
 *
 * Talks to D1 only through `wrangler d1 execute` (local by default; `--remote` = production `byzantini-db`,
 * `--remote --env preview` = `byzantini-db-preview`).
 *
 * Usage:
 *   bun run fees:backfill                       # dry run, local dev DB, 2026-2027
 *   bun run fees:backfill -- --apply            # write (local)
 *   bun run fees:backfill -- --remote [--apply] # PRODUCTION — dry run first, read the report
 *   bun run fees:backfill -- --remote --env preview [--apply]  # the preview database
 *   bun run fees:backfill -- --year 2027-2028   # another school year (it must have a catalog)
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { computeYearFees, evaluationFee, feeBase, orderForFees, z_FeeCatalogData, type FeeCatalogData } from "../lib/fees";
import { classYearLabel } from "../lib/classYears";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const remote = args.includes("--remote");
const yearArg = args.indexOf("--year");
const YEAR = yearArg >= 0 ? args[yearArg + 1] : "2026-2027";
if (!YEAR || !/^\d{4}-\d{4}$/.test(YEAR)) {
	console.error("Μη έγκυρο σχολικό έτος (--year 2026-2027)");
	process.exit(1);
}
const envArg = args.indexOf("--env");
const ENV = envArg >= 0 ? args[envArg + 1] : undefined;
if (envArg >= 0 && (!ENV || ENV.startsWith("--"))) {
	console.error("Λείπει το όνομα του περιβάλλοντος (--env preview)");
	process.exit(1);
}
const target = remote ? "--remote" : "--local";
/** `wrangler d1 execute DB <target> [--env <name>]` */
const wranglerTarget = ["DB", target, ...(ENV ? ["--env", ENV] : [])];
const REPO_ROOT = path.resolve(import.meta.dir, "..");

/** One statement through wrangler, JSON results. */
async function query<T>(sql: string): Promise<T[]> {
	const proc = Bun.spawn(["bunx", "wrangler", "d1", "execute", ...wranglerTarget, "--json", "--command", sql], {
		cwd: REPO_ROOT,
		stdout: "pipe",
		stderr: "pipe",
	});
	const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
	if (code !== 0) throw new Error(`wrangler d1 execute failed (${code}):\n${err || out}`);
	const parsed = JSON.parse(out) as { results: T[] }[];
	return parsed[0]?.results ?? [];
}

async function executeFile(sql: string) {
	const dir = mkdtempSync(path.join(tmpdir(), "fees-backfill-"));
	const file = path.join(dir, "backfill.sql");
	writeFileSync(file, sql);
	try {
		// wrangler echoes one JSON result per statement — shown only when it fails.
		const proc = Bun.spawn(["bunx", "wrangler", "d1", "execute", ...wranglerTarget, "--file", file], { cwd: REPO_ROOT, stdout: "pipe", stderr: "pipe" });
		const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
		if (code !== 0) throw new Error(`wrangler d1 execute --file failed (${code}):\n${err || out}`);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

type Row = {
	id: number;
	pupil_id: number;
	class_id: number;
	class_year: string;
	teacher_id: number;
	evaluation: number;
	fee_catalog_id: number | null;
	fee_manual: number;
	fee_base: number | null;
	evaluation_fee: number;
	total_payment: number;
	am: number | null;
	orphan_code: string;
	last_name: string;
	first_name: string;
};

const DEPARTMENT = ["Βυζ", "Παρ", "Ευρ"];
const sqlValue = (value: number | null) => (value === null ? "NULL" : String(Math.trunc(value)));

console.log(`Βάση     : ${remote ? (ENV ? `απομακρυσμένη, περιβάλλον ${ENV} (--remote --env ${ENV})` : "PRODUCTION (--remote)") : "τοπική (--local)"}`);
console.log(`Έτος     : ${YEAR}`);
console.log(`Λειτουργία: ${apply ? "ΕΓΓΡΑΦΗ (--apply)" : "DRY RUN"}\n`);

const [activeRow] = await query<{ id: number; data: string }>(`SELECT id, data FROM fee_catalogs WHERE school_year = '${YEAR}' ORDER BY id DESC LIMIT 1`);
if (!activeRow) {
	console.error(`Δεν υπάρχει κατάλογος διδάκτρων για το ${YEAR}.`);
	process.exit(1);
}
const rows = await query<Row>(
	`SELECT e.id, e.pupil_id, e.class_id, e.class_year, e.teacher_id, e.evaluation, e.fee_catalog_id, e.fee_manual, e.fee_base,
		e.evaluation_fee, e.total_payment, p.am, p.orphan_code, p.last_name, p.first_name
	FROM pupil_enrollments e JOIN pupils p ON p.id = e.pupil_id
	WHERE e.registration_year = '${YEAR}'
	ORDER BY p.last_name, p.first_name, e.id`,
);

// Catalogs: the active one (pinned on unpinned rows) + any already pinned.
const catalogIds = [...new Set([activeRow.id, ...rows.map((r) => r.fee_catalog_id).filter((id): id is number => id !== null)])];
const catalogRows = await query<{ id: number; data: string }>(`SELECT id, data FROM fee_catalogs WHERE id IN (${catalogIds.join(", ")})`);
const catalogs = new Map<number, FeeCatalogData>();
for (const row of catalogRows) catalogs.set(row.id, z_FeeCatalogData.parse(JSON.parse(row.data)));

const byPupil = new Map<number, Row[]>();
for (const row of rows) byPupil.set(row.pupil_id, [...(byPupil.get(row.pupil_id) ?? []), row]);

const stats = { enrollments: rows.length, pupils: byPupil.size, pinned: 0, filled: 0, unchanged: 0, manual: 0, recalculated: 0, alreadyManual: 0 };
const updates: string[] = [];
const report: string[] = [];

for (const pupilRows of byPupil.values()) {
	const newlyPinned = new Set(pupilRows.filter((r) => r.fee_catalog_id === null).map((r) => r.id));
	const pinnedRows = pupilRows.map((r) => (r.fee_catalog_id === null ? { ...r, fee_catalog_id: activeRow.id, fee_manual: 0 } : r));
	const fees = new Map(computeYearFees(pinnedRows, catalogs).map((fee) => [fee.id, fee]));
	const lines: string[] = [];
	let changed = false;

	for (const row of orderForFees(pinnedRows)) {
		const label = `#${row.id} ${DEPARTMENT[row.class_id] ?? row.class_id} ${classYearLabel(row.class_year, row.evaluation) || "-"}`;
		const catalog = catalogs.get(row.fee_catalog_id!)!;
		const fee = fees.get(row.id);
		if (newlyPinned.has(row.id)) {
			stats.pinned++;
			changed = true;
			const base = feeBase(row, catalog);
			const evalFee = evaluationFee(row, catalog);
			const computed = fee!.total_payment;
			const keep = row.total_payment > 0 && row.total_payment !== computed;
			if (keep) {
				stats.manual++;
				lines.push(`    ${label}: ${row.total_payment} € κρατείται → «Ειδική τιμή» (κατάλογος: ${computed} €)`);
			} else if (row.total_payment === computed) {
				stats.unchanged++;
				lines.push(`    ${label}: ${computed} € (ίδιο)`);
			} else {
				stats.filled++;
				lines.push(`    ${label}: ${row.total_payment} → ${computed} €`);
			}
			updates.push(
				`UPDATE pupil_enrollments SET fee_catalog_id = ${activeRow.id}, fee_base = ${sqlValue(base)}, evaluation_fee = ${evalFee}, fee_manual = ${keep ? 1 : 0}, total_payment = ${keep ? row.total_payment : computed} WHERE id = ${row.id};`,
			);
		} else if (row.fee_manual) {
			stats.alreadyManual++;
			lines.push(`    ${label}: ${row.total_payment} € (ήδη «Ειδική τιμή»)`);
		} else if (fee && (fee.total_payment !== row.total_payment || fee.fee_base !== row.fee_base || fee.evaluation_fee !== row.evaluation_fee)) {
			stats.recalculated++;
			changed = true;
			lines.push(`    ${label}: ${row.total_payment} → ${fee.total_payment} € (επανυπολογισμός)`);
			updates.push(
				`UPDATE pupil_enrollments SET fee_base = ${sqlValue(fee.fee_base)}, evaluation_fee = ${fee.evaluation_fee}, total_payment = ${fee.total_payment} WHERE id = ${row.id};`,
			);
		} else {
			lines.push(`    ${label}: ${row.total_payment} € (ήδη υπολογισμένο)`);
		}
	}
	if (changed) {
		const first = pupilRows[0]!;
		report.push(`  ${first.am ?? first.orphan_code} ${first.last_name} ${first.first_name}`, ...lines);
	}
}

console.log(report.length ? `Αλλαγές ανά μαθητή:\n${report.join("\n")}\n` : "Καμία αλλαγή.\n");
const summary: [string, string | number][] = [
	[`εγγραφές ${YEAR}`, `${stats.enrollments} (${stats.pupils} μαθητές)`],
	[`κατάλογος #${activeRow.id} ορίστηκε σε`, stats.pinned],
	["  νέο ποσό", stats.filled],
	["  ίδιο ποσό", stats.unchanged],
	["  «Ειδική τιμή» (κρατείται)", stats.manual],
	["επανυπολογισμός", stats.recalculated],
	["ήδη «Ειδική τιμή»", stats.alreadyManual],
	["UPDATE εντολές", updates.length],
];
console.log("Σύνοψη:");
for (const [label, value] of summary) console.log(`  ${label.padEnd(32)}: ${value}`);

if (!apply) {
	console.log("\nDRY RUN — τίποτα δεν γράφτηκε. Ξανατρέξτε με --apply.");
	process.exit(0);
}
if (updates.length === 0) process.exit(0);
await executeFile(updates.join("\n") + "\n");
console.log(`\nΓράφτηκαν ${updates.length} εγγραφές.`);
