/**
 * Makes the Μαθητολόγιο agree with the school's «Γενικό Μητρώο» (owner's copy in school_registry/, gitignored) and
 * numbers every pupil still without ΑΜ. The plan (rules, the principal's decisions) is `scripts/registry/reconcile.ts`.
 *
 * Run it after `bun run registry:backfill` (the history must be in first). Dry run + report by default; idempotent (a
 * second run finds nothing to do). It also writes, for the principal, an Excel with the numbers it gives and the
 * corrections his register needs (school_registry/, gitignored).
 *
 *   bun scripts/registryReconcile.ts                      # dry run on the local database (report + Excel preview)
 *   bun scripts/registryReconcile.ts --apply              # write (local)
 *   bun scripts/registryReconcile.ts --sql out.sql        # also save the SQL it would run
 *   bun scripts/registryReconcile.ts --file <xlsx>        # another copy of the register
 *   bun scripts/registryReconcile.ts --decisions <json>   # the principal's decisions (default school_registry/reconcile-decisions.json)
 *   bun scripts/registryReconcile.ts --remote [--apply]   # PRODUCTION: back it up first, dry run, read the report
 *
 * Talks to D1 only through `wrangler d1 execute` (local by default; `--remote` = production `byzantini-db`).
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";
import { classYearLabel } from "../lib/classYears";
import { currentSchoolYear } from "../lib/pupils/years";
import { birthYear, cellText, parseAm, type SheetRow } from "./registry/parse";
import { existsSync, readFileSync } from "node:fs";
import { NO_DECISIONS, planReconcile, type DbEnrollment, type DbPupil, type Decisions, type RegisterEntry } from "./registry/reconcile";

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
const ENV = option("--env");
const SQL_OUT = option("--sql");
const REPO_ROOT = path.resolve(import.meta.dir, "..");
const FILE = path.resolve(REPO_ROOT, option("--file") ?? "school_registry/ΜΗΤΡΩΟ - ΜΑΘΗΤΟΛΟΓΙΟ.xlsx");
/** The principal's decisions (they name pupils: gitignored, next to the register). */
const DECISIONS_FILE = path.resolve(REPO_ROOT, option("--decisions") ?? "school_registry/reconcile-decisions.json");
const decisions: Decisions = existsSync(DECISIONS_FILE) ? { ...NO_DECISIONS, ...JSON.parse(readFileSync(DECISIONS_FILE, "utf8")) } : NO_DECISIONS;
if (!existsSync(DECISIONS_FILE)) console.warn(`Χωρίς αποφάσεις: δεν βρέθηκε το ${path.relative(REPO_ROOT, DECISIONS_FILE)}`);
const wranglerTarget = ["DB", remote ? "--remote" : "--local", ...(ENV ? ["--env", ENV] : [])];

async function query<T>(sql: string): Promise<T[]> {
	const proc = Bun.spawn(["bunx", "wrangler", "d1", "execute", ...wranglerTarget, "--json", "--command", sql], {
		cwd: REPO_ROOT,
		stdout: "pipe",
		stderr: "pipe",
	});
	const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
	if (code !== 0) throw new Error(`wrangler d1 execute failed (${code}):\n${err || out}`);
	return (JSON.parse(out) as { results: T[] }[])[0]?.results ?? [];
}

async function executeFile(sql: string) {
	const dir = mkdtempSync(path.join(tmpdir(), "registry-reconcile-"));
	const file = path.join(dir, "reconcile.sql");
	writeFileSync(file, sql);
	try {
		const proc = Bun.spawn(["bunx", "wrangler", "d1", "execute", ...wranglerTarget, "--file", file], { cwd: REPO_ROOT, stdout: "pipe", stderr: "pipe" });
		const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
		if (code !== 0) throw new Error(`wrangler d1 execute --file failed (${code}):\n${err || out}`);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

/** SQL literal: numbers as they are, strings quoted, null/undefined → NULL. */
const lit = (value: string | number | null | undefined): string =>
	value === null || value === undefined ? "NULL" : typeof value === "number" ? String(value) : `'${value.replace(/'/g, "''")}'`;

// ---- The register ----

const wb = XLSX.readFile(FILE);
const general = XLSX.utils.sheet_to_json<SheetRow>(wb.Sheets["Γενικό Μητρώο"], { header: 1, defval: null, blankrows: true });
const head = general[0] ?? [];
if (!/Αριθμός Μητρώου/.test(String(head[0])) || !/Επώνυμο/.test(String(head[1]))) throw new Error("Άγνωστη μορφή του φύλλου «Γενικό Μητρώο» (στήλες)");
const register: RegisterEntry[] = [];
for (const row of general.slice(1)) {
	const am = parseAm(row[0] as string).am;
	if (am === null) continue;
	register.push({ am, surname: cellText(row[1]), name: cellText(row[2]), father: cellText(row[3]), born: birthYear(row[4]) });
}

// ---- The database ----

type PupilRow = Omit<DbPupil, "born" | "needs_review"> & {
	birth_date: number;
	needs_review: number;
	road: string;
	number: number;
	tk: number;
	region: string;
	telephone: string;
	cellphone: string;
};
const pupilRows = await query<PupilRow>(
	"SELECT id, am, orphan_code, split_from_am, last_name, first_name, fathers_name, birth_date, amka, email, review_note, needs_review, road, number, tk, region, telephone, cellphone FROM pupils",
);
const pupils: DbPupil[] = pupilRows.map((p) => ({
	...p,
	orphan_code: p.orphan_code ?? "",
	amka: p.amka ?? "",
	email: p.email ?? "",
	review_note: p.review_note ?? "",
	born: p.birth_date ? new Date(p.birth_date).getUTCFullYear() : null,
	needs_review: !!p.needs_review,
}));
type EnrollmentRow = DbEnrollment & { class_id: number; class_year: string; evaluation: number; teacher: string | null };
const enrollments = await query<EnrollmentRow>(
	"SELECT e.id, e.pupil_id, e.registration_year, e.date, e.class_id, e.class_year, e.evaluation, t.fullname AS teacher FROM pupil_enrollments e LEFT JOIN teachers t ON t.id = e.teacher_id",
);

const currentYear = currentSchoolYear();
const plan = planReconcile({ register, pupils, enrollments, currentYear, isTestPupil: (p) => /@example\.com$/i.test(p.email), decisions });

// ---- Report ----

const byId = new Map(pupilRows.map((p) => [p.id, p]));
const who = (id: number) => {
	const p = byId.get(id)!;
	return `${p.last_name} ${p.first_name} (π. ${p.fathers_name || "-"}, ${p.birth_date ? new Date(p.birth_date).getUTCFullYear() : "-"})`;
};
const fromLabel = (id: number, am: number | null) => (am !== null ? `ΑΜ ${am}` : byId.get(id)!.orphan_code || "χωρίς ΑΜ");

console.log(`Αρχείο    : ${path.relative(REPO_ROOT, FILE)} (Γενικό Μητρώο: ΑΜ 1 έως ${Math.max(...register.map((r) => r.am))}, ${register.length} γραμμές)`);
console.log(
	`Βάση      : ${remote ? (ENV && ENV !== "production" ? `${ENV.toUpperCase()} (--remote --env ${ENV})` : "ΠΑΡΑΓΩΓΗ (--remote)") : "τοπική (--local)"}`,
);
console.log(`Λειτουργία: ${apply ? "APPLY" : "DRY RUN"}\n`);

const groups = new Map<string, typeof plan.assignments>();
for (const a of plan.assignments) (groups.get(a.why) ?? groups.set(a.why, []).get(a.why)!).push(a);
console.log(`ΑΡΙΘΜΟΙ ΜΗΤΡΩΟΥ ΠΟΥ ΑΛΛΑΖΟΥΝ: ${plan.assignments.length}`);
for (const [why, list] of groups) {
	console.log(`  ${why}: ${list.length}`);
	for (const a of [...list].sort((x, y) => x.to - y.to)) console.log(`    ${fromLabel(a.pupilId, a.from)} → ΑΜ ${a.to}  ${who(a.pupilId)}`);
}
if (plan.splits.length) {
	console.log(`\nΔΙΑΧΩΡΙΣΜΟΣ (μία εγγραφή, δύο άτομα): ${plan.splits.length}`);
	for (const s of plan.splits)
		console.log(
			`  ΑΜ ${s.childAm} → ${s.child.surname} ${s.child.name} (Γενικό Μητρώο)· ${who(s.pupilId)} → νέα εγγραφή με ΑΜ ${s.parentAm} και ${s.moveEnrollmentIds.length} εγγραφές${s.amkaToParent ? ", με τον ΑΜΚΑ" : ""}`,
		);
}
if (plan.merges.length) {
	console.log(`\nΣΥΓΧΩΝΕΥΣΗ (ίδιο άτομο, δύο εγγραφές): ${plan.merges.length}`);
	for (const m of plan.merges) console.log(`  ${who(m.fromId)} (${m.enrollmentIds.length} εγγραφές) → ${who(m.intoId)}, όνομα: ${m.surname} ${m.name}`);
}
const cleanedFlags = plan.cleanups.filter((c) => byId.get(c.pupilId)!.needs_review && !c.needs_review).length;
console.log(`\nΚΑΘΑΡΙΣΜΑ (κωδικός «000-Ο…», σημείωση «εκκρεμεί ΑΜ»): ${plan.cleanups.length} μαθητές, ${cleanedFlags} φεύγουν από το «προς έλεγχο»`);
console.log(`\nΧΩΡΙΣ ΑΜ ΚΑΙ ΜΕΝΟΥΝ ΕΤΣΙ: ${plan.skipped.length}`);
for (const s of plan.skipped) console.log(`  ${fromLabel(s.pupilId, null)} ${who(s.pupilId)}: ${s.why}`);
if (plan.done.length) console.log(`\nΗΔΗ ΕΓΙΝΑΝ: ${plan.done.join(" · ")}`);
console.log(`\nΠΡΟΒΛΗΜΑΤΑ (δεν έγινε τίποτα γι' αυτά): ${plan.problems.length}`);
for (const p of plan.problems) console.log(`  ${p}`);
console.log(`\nΕπόμενο ελεύθερο ΑΜ: ${plan.nextAm}`);

// ---- SQL ----

const nowMs = Date.now();
const statements: string[] = [];
// 1. Everyone whose ΑΜ changes lets go of it first, so the unique index never sees the same ΑΜ twice.
for (const a of plan.assignments) statements.push(`UPDATE pupils SET am = NULL WHERE id = ${a.pupilId} AND am IS ${lit(a.from)};`);
for (const m of plan.merges) statements.push(`UPDATE pupils SET am = NULL WHERE id = ${m.fromId};`);
// 2. Merges: the enrollments move, the second record goes.
for (const m of plan.merges) {
	statements.push(`UPDATE pupil_enrollments SET pupil_id = ${m.intoId} WHERE pupil_id = ${m.fromId};`);
	statements.push(`UPDATE pupils SET last_name = ${lit(m.surname)}, first_name = ${lit(m.name)}, updated_at = ${nowMs} WHERE id = ${m.intoId};`);
	statements.push(`DELETE FROM pupils WHERE id = ${m.fromId};`);
}
// 3. Splits: the person on the record moves to a new record with their enrollments; the record becomes the register's person.
for (const s of plan.splits) {
	const url = crypto.randomUUID().replace(/-/g, "");
	statements.push(
		`INSERT INTO pupils (am, orphan_code, first_name, last_name, fathers_name, birth_date, road, number, tk, region, telephone, cellphone, email, amka, registration_url, needs_review, review_note, created_at, updated_at, media_consent, media_consent_at) ` +
			`SELECT ${s.parentAm}, '', first_name, last_name, fathers_name, birth_date, road, number, tk, region, telephone, cellphone, email, ${s.amkaToParent ? "amka" : "''"}, ${lit(url)}, 0, ${lit(`Χωρίστηκε από το ΑΜ ${s.childAm} (${s.child.surname} ${s.child.name} στο Γενικό Μητρώο)`)}, created_at, ${nowMs}, NULL, NULL FROM pupils WHERE id = ${s.pupilId};`,
	);
	statements.push(
		`UPDATE pupil_enrollments SET pupil_id = (SELECT id FROM pupils WHERE registration_url = ${lit(url)}) WHERE id IN (${s.moveEnrollmentIds.join(", ")});`,
	);
	statements.push(
		`UPDATE pupils SET last_name = ${lit(s.child.surname)}, first_name = ${lit(s.child.name)}, fathers_name = ${lit(s.child.father)}, birth_date = ${lit(s.child.born ? Date.UTC(s.child.born, 0, 1, 12) : 0)}${s.amkaToParent ? ", amka = ''" : ""}, updated_at = ${nowMs} WHERE id = ${s.pupilId};`,
	);
}
// 4. The new numbers.
for (const a of plan.assignments) statements.push(`UPDATE pupils SET am = ${a.to}, updated_at = ${nowMs} WHERE id = ${a.pupilId} AND am IS NULL;`);
// 5. Clean-up.
for (const c of plan.cleanups)
	statements.push(
		`UPDATE pupils SET orphan_code = '', split_from_am = NULL, review_note = ${lit(c.review_note)}, needs_review = ${c.needs_review ? 1 : 0} WHERE id = ${c.pupilId} AND am IS NOT NULL;`,
	);
const sql = statements.join("\n") + "\n";
if (SQL_OUT) {
	writeFileSync(path.resolve(SQL_OUT), sql);
	console.log(`\nSQL: ${SQL_OUT} (${statements.length} εντολές)`);
}

// ---- The Excel for the principal ----

const day = new Date().toISOString().slice(0, 10);
const excelFile = path.resolve(
	REPO_ROOT,
	`school_registry/Νέοι αριθμοί μητρώου ${day}${apply ? "" : " (πρόχειρο)"}${remote ? (ENV && ENV !== "production" ? ` (${ENV})` : "") : " (τοπική βάση)"}.xlsx`,
);
const latestOf = (id: number) =>
	enrollments.filter((e) => e.pupil_id === id).sort((a, b) => b.registration_year.localeCompare(a.registration_year) || b.date - a.date)[0];
const firstDateOf = (id: number) => {
	const first = enrollments.filter((e) => e.pupil_id === id).sort((a, b) => a.date - b.date)[0];
	return first ? new Date(first.date).toLocaleDateString("el-GR", { timeZone: "Europe/Athens" }) : "";
};
const registerRow = (am: number, id: number, override?: { surname: string; name: string; father: string; born: number | null }) => {
	const p = byId.get(id)!;
	const latest = latestOf(id);
	const born = override?.born ?? (p.birth_date ? new Date(p.birth_date).getUTCFullYear() : "");
	const address = [p.road && p.number ? `${p.road} ${p.number}` : p.road, p.region, p.tk || ""].filter(Boolean).join(", ");
	return [
		am,
		override?.surname ?? p.last_name,
		override?.name ?? p.first_name,
		override?.father ?? p.fathers_name,
		born,
		address,
		firstDateOf(id),
		latest ? classYearLabel(latest.class_year, !!latest.evaluation) : "",
		latest?.teacher ?? "",
		p.email,
		[p.cellphone, p.telephone].filter((x) => x && x !== "-").join(", "),
	];
};
const header = [
	"Αριθμός Μητρώου",
	"Επώνυμο",
	"Όνομα",
	"Όνομα Πατρός",
	"Έτος Γέννησης",
	"Διεύθυνση",
	"Ημ/νια Εγγραφής",
	"Έτος Φοίτησης",
	"Διδάσκων Καθηγητής",
	"e-mail",
	"τηλέφωνο",
];
const numbered = plan.assignments.filter((a) => a.why !== "βρέθηκε στο Γενικό Μητρώο" && !a.why.startsWith("το ΑΜ τ"));
const newRows = [...numbered.map((a) => registerRow(a.to, a.pupilId)), ...plan.splits.map((s) => registerRow(s.parentAm, s.pupilId))].sort(
	(a, b) => Number(a[0]) - Number(b[0]),
);
const fixes = [
	["Αριθμός Μητρώου", "Τι αλλάζει στο Γενικό Μητρώο"],
	...decisions.registerFixes.map((f) => [f.am, f.text]),
	...plan.assignments.filter((a) => a.why.startsWith("είχε το ΑΜ")).map((a) => [a.from ?? "", `${who(a.pupilId)}: ${a.why}· νέο ΑΜ ${a.to}.`]),
	...plan.splits.map((s) => [
		s.childAm,
		`Το ΑΜ ${s.childAm} είναι της/του ${s.child.surname} ${s.child.name}· ο/η ${who(s.pupilId)} γράφτηκε και ο/η ίδιος/α και παίρνει νέο ΑΜ ${s.parentAm}.`,
	]),
];
const out = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet([header, ...newRows]), "Νέα ΑΜ");
XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet(fixes), "Διορθώσεις μητρώου");
XLSX.writeFile(out, excelFile);
console.log(`Excel για τον Διευθυντή: ${path.relative(REPO_ROOT, excelFile)} (${newRows.length} νέα ΑΜ, ${fixes.length - 1} διορθώσεις)`);

if (!apply) {
	console.log("\nDRY RUN: τίποτα δεν γράφτηκε. Ξανατρέξτε με --apply.");
	process.exit(0);
}
if (!statements.length) {
	console.log("\nΤίποτα να γραφτεί.");
	process.exit(0);
}
await executeFile(sql);
console.log(`\nΕγράφη: ${statements.length} εντολές.`);
