/**
 * Fills «Διέκοψε» and «Μετεγγραφή» on the pupils (migration 0014) from the school's Excel register (owner's copy in
 * school_registry/, gitignored), and moves the secretariat's «Μεταγραφή» review notes into the field. The rules are
 * `scripts/registry/status.ts`.
 *
 * Run it after the register is matched (`scripts/registryReconcile.ts`): it finds pupils by their ΑΜ. Dry run + report
 * by default; idempotent (a second run finds nothing to do); never overwrites a value the secretariat set differently
 * (it reports it).
 *
 *   bun scripts/registryStatus.ts                       # dry run on the local database
 *   bun scripts/registryStatus.ts --apply               # write (local)
 *   bun scripts/registryStatus.ts --verbose             # list every pupil
 *   bun scripts/registryStatus.ts --sql out.sql         # also save the SQL it would run
 *   bun scripts/registryStatus.ts --file <xlsx>         # another copy of the register
 *   bun scripts/registryStatus.ts --remote [--env preview] [--apply]   # remote database: back it up first, dry run, read the report
 *
 * Talks to D1 only through `wrangler d1 execute` (local by default; `--remote` = production `byzantini-db`).
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";
import { currentSchoolYear, schoolYearOf } from "../lib/pupils/years";
import { cellText, excelDate, headerColumns, isDataRow, mergeContinuationRows, parseAm, sheetSchoolYear, type SheetRow } from "./registry/parse";
import { fold, planStatus, readTransferRemark, type ExcelMarks, type StatusPupil } from "./registry/status";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => {
	const i = args.indexOf(name);
	if (i === -1) return undefined;
	const value = args[i + 1];
	if (!value || value.startsWith("--")) {
		console.error(`${name} needs a value`);
		process.exit(1);
	}
	return value;
};
const apply = flag("--apply");
const remote = flag("--remote");
const verbose = flag("--verbose");
const ENV = option("--env");
const SQL_OUT = option("--sql");
const REPO_ROOT = path.resolve(import.meta.dir, "..");
const FILE = path.resolve(REPO_ROOT, option("--file") ?? "school_registry/ΜΗΤΡΩΟ - ΜΑΘΗΤΟΛΟΓΙΟ.xlsx");
const wranglerTarget = ["DB", remote ? "--remote" : "--local", ...(ENV ? ["--env", ENV] : [])];

async function wrangler(extra: string[]): Promise<string> {
	const proc = Bun.spawn(["bunx", "wrangler", "d1", "execute", ...wranglerTarget, ...extra], { cwd: REPO_ROOT, stdout: "pipe", stderr: "pipe" });
	const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
	if (code !== 0) throw new Error(`wrangler d1 execute failed (${code}):\n${err || out}`);
	return out;
}
const query = async <T>(sql: string): Promise<T[]> => (JSON.parse(await wrangler(["--json", "--command", sql])) as { results: T[] }[])[0]?.results ?? [];
async function executeFile(sql: string) {
	const dir = mkdtempSync(path.join(tmpdir(), "registry-status-"));
	const file = path.join(dir, "status.sql");
	writeFileSync(file, sql);
	try {
		await wrangler(["--file", file, ...(remote ? ["-y"] : [])]);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}
const lit = (value: string) => `'${value.replace(/'/g, "''")}'`;

// ---- The register ----

const wb = XLSX.readFile(FILE);
const rowsOf = (sheet: string) => XLSX.utils.sheet_to_json<SheetRow>(wb.Sheets[sheet]!, { header: 1, defval: null, blankrows: true });
const marks: ExcelMarks = { stopped: [], transfers: [] };

const general = rowsOf("Γενικό Μητρώο");
const head = general[0] ?? [];
const notesColumn = head.findIndex((cell) => /Παρατηρήσεις/.test(String(cell ?? "")));
const dateColumn = head.findIndex((cell) => /Ημ\/νια Εγγραφής/.test(String(cell ?? "")));
if (!/Αριθμός Μητρώου/.test(String(head[0])) || notesColumn < 0) throw new Error("Άγνωστη μορφή του φύλλου «Γενικό Μητρώο» (στήλες)");
for (const row of general.slice(1)) {
	const am = parseAm(row[0] as string).am;
	if (am === null || !fold(cellText(row[notesColumn])).includes("ΔΙΕΚΟΨΕ")) continue;
	// «Ημ/νια Εγγραφής»: the school year it falls in (a year runs from September).
	const registered = excelDate(row[dateColumn] as never);
	const registeredYear = registered === null ? null : schoolYearOf(new Date(registered).getUTCFullYear() - (new Date(registered).getUTCMonth() < 8 ? 1 : 0));
	marks.stopped.push({ am, surname: cellText(row[1]), name: cellText(row[2]), registeredYear });
}

for (const sheet of wb.SheetNames) {
	const sheetYear = sheetSchoolYear(sheet);
	if (!sheetYear) continue;
	// Old layout: columns by header («Αριθμός Μητρώου», «Παρατηρήσεις»); the ministry export (2025-2026): «ΑΜΚΑ», «Ονοματεπώνυμο».
	let columns: { am: number; surname: number; name: number; notes: number } | { amka: number; fullName: number; notes: number } | null = null;
	for (const row of mergeContinuationRows(rowsOf(sheet))) {
		const header = headerColumns(row);
		if (header) {
			columns = header.notes === null ? null : { am: header.am, surname: header.surname, name: header.name, notes: header.notes };
			continue;
		}
		const cells = row.map((cell) => cellText(cell));
		if (cells.includes("ΑΜΚΑ") && cells.includes("Ονοματεπώνυμο")) {
			columns = { amka: cells.indexOf("ΑΜΚΑ"), fullName: cells.indexOf("Ονοματεπώνυμο"), notes: cells.indexOf("Παρατηρήσεις") };
			continue;
		}
		if (!columns || columns.notes < 0 || !isDataRow(row)) continue;
		const remark = readTransferRemark(String(row[columns.notes] ?? ""));
		if (!remark) continue;
		if ("am" in columns) {
			const am = parseAm(row[columns.am] as string).am;
			if (am !== null) marks.transfers.push({ am, surname: cellText(row[columns.surname]), name: cellText(row[columns.name]), sheetYear, ...remark });
		} else {
			marks.transfers.push({ amka: cellText(row[columns.amka]).replace(/\D/g, ""), fullName: cellText(row[columns.fullName]), sheetYear, ...remark });
		}
	}
}

// ---- The database ----

type PupilRow = Omit<StatusPupil, "needs_review"> & { needs_review: number };
const pupilRows = await query<PupilRow>(
	"SELECT id, am, last_name, first_name, amka, email, review_note, needs_review, stopped_year, transfer_year, transfer_from FROM pupils",
);
const pupils: StatusPupil[] = pupilRows
	.filter((p) => !/@example\.com$/i.test(p.email ?? ""))
	.map((p) => ({ ...p, amka: p.amka ?? "", review_note: p.review_note ?? "", needs_review: !!p.needs_review }));
const enrollments = await query<{ pupil_id: number; registration_year: string }>("SELECT pupil_id, registration_year FROM pupil_enrollments");
const plan = planStatus({ marks, pupils, enrollments, currentYear: currentSchoolYear() });

// ---- Report ----

const byId = new Map(pupils.map((p) => [p.id, p]));
const who = (id: number) => {
	const p = byId.get(id)!;
	return `ΑΜ ${p.am ?? "-"}  ${p.last_name} ${p.first_name}`;
};
const target = remote ? (ENV && ENV !== "production" ? `${ENV.toUpperCase()} (--remote --env ${ENV})` : "ΠΑΡΑΓΩΓΗ (--remote)") : "τοπική (--local)";
console.log(`Αρχείο    : ${path.relative(REPO_ROOT, FILE)}`);
console.log(`Βάση      : ${target}`);
console.log(`Λειτουργία: ${apply ? "ΕΓΓΡΑΦΗ (--apply)" : "DRY RUN"}`);
console.log(`Excel     : «ΔΙΕΚΟΨΕ» ${marks.stopped.length} · σημειώσεις μετεγγραφής ${marks.transfers.length}`);

const byYear = (list: { year: string }[]) => {
	const counts = new Map<string, number>();
	for (const item of list) counts.set(item.year, (counts.get(item.year) ?? 0) + 1);
	return [...counts].map(([year, n]) => `${year}: ${n}`).join(" · ");
};
console.log(`\nΔΙΕΚΟΨΕ (μετά το έτος): ${plan.stopped.length}`);
if (plan.stopped.length) console.log(`  ${byYear(plan.stopped)}`);
if (verbose) for (const s of plan.stopped) console.log(`    ${s.year}  ${who(s.pupilId)}`);

console.log(
	`\nΜΕΤΕΓΓΡΑΦΗ: ${plan.transfers.length} (από το Excel ${plan.transfers.filter((t) => t.source === "excel").length}, από σημείωση της γραμματείας ${plan.transfers.filter((t) => t.source === "note").length})`,
);
if (plan.transfers.length) console.log(`  ${byYear(plan.transfers)}`);
const schools = new Map<string, number>();
for (const t of plan.transfers) schools.set(t.from || "(χωρίς σχολή)", (schools.get(t.from || "(χωρίς σχολή)") ?? 0) + 1);
for (const [school, n] of [...schools].sort((a, b) => b[1] - a[1])) console.log(`    ${String(n).padStart(3)}  ${school}`);
if (verbose) for (const t of plan.transfers) console.log(`    ${t.year}  ${who(t.pupilId)}${t.from ? `  από ${t.from}` : ""}`);

console.log(
	`\nΣΗΜΕΙΩΣΕΙΣ «Μεταγραφή» που φεύγουν: ${plan.notes.length} (φεύγουν από το «προς έλεγχο»: ${plan.notes.filter((n) => !n.needs_review && byId.get(n.pupilId)!.needs_review).length})`,
);
if (verbose) for (const n of plan.notes) console.log(`    ${who(n.pupilId)}: «${byId.get(n.pupilId)!.review_note}» → «${n.review_note}»`);

console.log(`\nΗΔΗ ΣΤΗ ΒΑΣΗ: ${plan.done}`);
console.log(`\nΔΕΝ ΕΓΙΝΑΝ: ${plan.skipped.length}`);
for (const s of plan.skipped) console.log(`  ${s}`);

// ---- SQL ----

const statements = [
	...plan.stopped.map((s) => `UPDATE pupils SET stopped_year = ${lit(s.year)} WHERE id = ${s.pupilId} AND stopped_year = '';`),
	...plan.transfers.map(
		(t) =>
			`UPDATE pupils SET transfer_year = ${lit(t.year)}, transfer_from = ${lit(t.from)} WHERE id = ${t.pupilId} AND transfer_year IN ('', ${lit(t.year)});`,
	),
	...plan.notes.map((n) => `UPDATE pupils SET review_note = ${lit(n.review_note)}, needs_review = ${n.needs_review ? 1 : 0} WHERE id = ${n.pupilId};`),
];
if (SQL_OUT) {
	writeFileSync(path.resolve(SQL_OUT), statements.join("\n") + "\n");
	console.log(`\nSQL: ${statements.length} εντολές → ${SQL_OUT}`);
}
if (!apply) {
	console.log("\nDRY RUN: τίποτα δεν γράφτηκε. Ξανατρέξτε με --apply.");
	process.exit(0);
}
if (statements.length) await executeFile(statements.join("\n"));
console.log(`\nΕγράφη: ${statements.length} εντολές.`);
