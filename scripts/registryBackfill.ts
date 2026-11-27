#!/usr/bin/env bun
/**
 * registryBackfill.ts — fills the Μαθητολόγιο with the school's history before the online register: the pupils of
 * «Γενικό Μητρώο» and the enrollments of the school years 2015-2016 … 2022-2023, read from the Excel register
 * («ΜΗΤΡΩΟ - ΜΑΘΗΤΟΛΟΓΙΟ.xlsx», owner's copy in school_registry/, gitignored). Parsing: scripts/registry/parse.ts.
 *
 * What it writes (decisions agreed with the owner, 2026-11-26):
 * - **Pupils** of «Γενικό Μητρώο» whose ΑΜ the database does not have, from that sheet (name, father, birth year →
 *   1 January of that year, address, email, phones; no ΑΜΚΑ). A pupil already in the database is never changed,
 *   except for the review notes below. An ΑΜ written on two different people (469) keeps the first; the other
 *   becomes a split pupil (`<ΑΜ>-Σ<n>`, flagged).
 * - **Enrollments** of 2015-2016 … 2022-2023 (source 'registry'): music type, instrument (2022-23 traditional
 *   section), class year, teacher, date (the sheet's when it has one, else 1 September). No payments, no fee
 *   catalog (those years are not priced). An enrollment the database already has (same pupil, year, music type,
 *   instrument) is skipped, so the script can run again.
 * - **Former teachers**: a teacher of those years who is not in the database is added hidden, with no classes, and
 *   flagged «Πρώην διδάσκων» (teachers.former, migration 0012).
 * - **Placement exams** (Κατατακτήριες) are inferred: a pupil's first enrollment in a department that is above the
 *   starting class year gets the «Κατάταξη» badge (evaluation = 1) and a note, without the review flag.
 * - **Promotions** («Προήχθη») are inferred too: a backfilled enrollment whose next enrollment in the same department
 *   is a higher class year. This step runs over every backfilled row on each run.
 * - **Duplicates** found in «Γενικό Μητρώο» (one person under two ΑΜs) are imported as they are and flagged
 *   «προς έλεγχο» with a note naming the other ΑΜ. The secretariat resolves them.
 * - Rows the script cannot place (an ΑΜ whose name does not match the database, an unknown class year, …) are left
 *   out and listed in the report.
 *
 * Talks to D1 only through `wrangler d1 execute` (local by default; `--remote` = production `byzantini-db`).
 *
 * Usage:
 *   bun run registry:backfill                          # dry run, local dev DB, prints the report
 *   bun run registry:backfill -- --apply               # write (local)
 *   bun run registry:backfill -- --sql out.sql         # also save the SQL it would run
 *   bun run registry:backfill -- --file <xlsx>         # another copy of the register
 *   bun run registry:backfill -- --verbose             # list every skipped row and every inferred placement
 *   bun run registry:backfill -- --remote [--apply]    # PRODUCTION — dry run first, read the report
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";
import { classYearsByMusicType, EVALUATION_LABEL } from "../lib/classYears";
import {
	BACKFILL_YEARS,
	birthYear,
	canonicalClassYear,
	cellText,
	excelDate,
	genderFromGivenName,
	headerColumns,
	instrumentFromHeading,
	isDataRow,
	isStartingClassYear,
	levenshtein,
	mergeContinuationRows,
	nameKey,
	parseAm,
	schoolYearStart,
	samePerson,
	sectionClassId,
	sheetSchoolYear,
	splitAddress,
	splitPhones,
	teacherKey,
	type HeaderColumns,
	type SheetRow,
} from "./registry/parse";

// ---------------------------------------------------------------------------
// Arguments and D1 access (same pattern as scripts/feesBackfill.ts)
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => {
	const i = args.indexOf(name);
	if (i < 0) return undefined;
	const value = args[i + 1];
	if (!value || value.startsWith("--")) {
		console.error(`Λείπει η τιμή του ${name}`);
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
	const dir = mkdtempSync(path.join(tmpdir(), "registry-backfill-"));
	const file = path.join(dir, "backfill.sql");
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

// ---------------------------------------------------------------------------
// The workbook
// ---------------------------------------------------------------------------

type Person = {
	am: number;
	line: number;
	surname: string;
	name: string;
	father: string;
	born: number | null;
	address: string;
	date: number | null;
	email: string;
	phones: { cellphone: string; telephone: string };
};

type SheetEnrollment = {
	sheet: string;
	line: number;
	year: string;
	am: number;
	surname: string;
	name: string;
	father: string;
	born: number | null;
	address: string;
	classId: number;
	instrumentId: number;
	classYearRaw: string;
	classYear: string;
	teacherRaw: string;
	date: number | null;
	notes: string;
};

const LEGACY_SHEETS: Record<string, { year: string; classId: number; instrumentId: number }> = {
	/** The 2022-23 singing class, also listed in the year's sheet — duplicates are dropped by key. */
	"ΤΜΗΜΑ ΤΡΑΓΟΥΔΙΟΥ": { year: "2022-2023", classId: 1, instrumentId: 44 },
	/** Pupils who joined in the spring semester of 2023. */
	"Μαθητολόγιο Β΄ 6 μήνου ΄23": { year: "2022-2023", classId: 0, instrumentId: 0 },
};

function cleanEmail(value: unknown): string {
	const text = cellText(value as string)
		.toLowerCase()
		.replace(/\s/g, "");
	const fixed = text.replace(/^(.+\.[a-z]{2,})\d+$/, "$1"); // «…@gmail.com1»
	return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(fixed) ? fixed : "";
}

function readWorkbook(file: string) {
	const wb = XLSX.readFile(file);
	const rowsOf = (name: string) => XLSX.utils.sheet_to_json<SheetRow>(wb.Sheets[name], { header: 1, defval: null, blankrows: true });

	// «Γενικό Μητρώο»: one row per ΑΜ.
	const general = rowsOf("Γενικό Μητρώο");
	const head = general[0] ?? [];
	if (!/Αριθμός Μητρώου/.test(String(head[0])) || !/Επώνυμο/.test(String(head[1])) || !/τηλέφωνο/i.test(String(head[10])))
		throw new Error("Άγνωστη μορφή του φύλλου «Γενικό Μητρώο» (στήλες)");
	const people: Person[] = [];
	general.slice(1).forEach((row, i) => {
		const am = parseAm(row[0] as string).am;
		if (am === null) return;
		people.push({
			am,
			line: i + 2,
			surname: cellText(row[1]),
			name: cellText(row[2]),
			father: cellText(row[3]),
			born: birthYear(row[4]),
			address: cellText(row[5]),
			date: excelDate(row[6]),
			email: cleanEmail(row[9]),
			phones: splitPhones(row[10]),
		});
	});

	// The yearly sheets.
	const enrollments: SheetEnrollment[] = [];
	const problems: string[] = [];
	const sheets = wb.SheetNames.map((name) => {
		const year = sheetSchoolYear(name);
		if (year && (BACKFILL_YEARS as readonly string[]).includes(year)) return { name, year, classId: 0, instrumentId: 0 };
		const legacy = LEGACY_SHEETS[name];
		return legacy ? { name, ...legacy } : null;
	}).filter((sheet) => sheet !== null);

	for (const sheet of sheets) {
		const raw = rowsOf(sheet.name);
		// Blank rows end a record: an overflow row must follow its record directly.
		const blocks: { rows: SheetRow[]; first: number }[] = [];
		let current: { rows: SheetRow[]; first: number } | null = null;
		raw.forEach((row, i) => {
			if (row.every((cell) => cell === null || String(cell).trim() === "")) return void (current = null);
			if (!current) blocks.push((current = { rows: [], first: i + 1 }));
			current.rows.push(row);
		});
		let cols: HeaderColumns | null = null;
		let classId = sheet.classId;
		let instrumentId = sheet.instrumentId;
		for (const block of blocks) {
			// Line numbers: merged rows keep the line of the record they started on.
			let line = block.first;
			const lines: number[] = [];
			block.rows.forEach((row, i) => {
				const continuation = (row[0] === null || String(row[0]).trim() === "") && (row[1] === null || String(row[1]).trim() === "");
				if (!continuation || i === 0) lines.push(block.first + i);
			});
			mergeContinuationRows(block.rows).forEach((row, i) => {
				line = lines[i] ?? line;
				const header = headerColumns(row);
				if (header) return void (cols = header);
				if (!isDataRow(row)) {
					const text = cellText(row.find((cell) => cell !== null && String(cell).trim() !== "") ?? "");
					const section = sectionClassId(text);
					if (section !== null) {
						classId = section;
						instrumentId = 0;
					} else if (classId === 1) {
						const instrument = instrumentFromHeading(text);
						if (instrument !== null) instrumentId = instrument;
					}
					return;
				}
				if (!cols) return void problems.push(`«${sheet.name}» γρ. ${line}: γραμμή πριν από την επικεφαλίδα`);
				const am = parseAm(row[cols.am] as string).am;
				if (am === null) return void problems.push(`«${sheet.name}» γρ. ${line}: μη έγκυρο ΑΜ «${cellText(row[cols.am])}»`);
				const classYearRaw = cellText(row[cols.classYear]);
				enrollments.push({
					sheet: sheet.name,
					line,
					year: sheet.year,
					am,
					surname: cellText(row[cols.surname]),
					name: cellText(row[cols.name]),
					father: cellText(row[cols.father]),
					born: birthYear(row[cols.born]),
					address: cols.surname >= 0 ? cellText(row[cols.surname + 4]) : "",
					classId,
					instrumentId,
					classYearRaw,
					classYear: canonicalClassYear(classYearRaw, classId),
					teacherRaw: cellText(row[cols.teacher]),
					date: cols.date === null ? null : excelDate(row[cols.date]),
					notes: cols.notes === null ? "" : cellText(row[cols.notes]),
				});
			});
		}
	}
	return { people, enrollments, problems };
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/**
 * Teachers written differently in the sheets than in the database (beyond what `teacherKey` folds: «π.», word
 * order, accents, «Κων/νος»).
 */
const TEACHER_ALIASES: Record<string, string> = {
	"Ειρήνη Χάρης": "Ειρήνη Χάρη",
	"Αντώνης Τσιώνας": "Αντώνιος Τσιώνας",
	"Ναταλία Ζαχαράκη": "Ναταλία Χαρίκλεια Ζαχαράκη",
	"Ιωάννης Κακλιδάκης": "Ιωάννης Κακλιδάκης (Κακλής)",
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

type DbPupil = {
	id: number;
	am: number | null;
	orphan_code: string;
	last_name: string;
	first_name: string;
	fathers_name: string;
	birth_date: number;
	review_note: string;
	needs_review: number;
};
type DbEnrollment = { pupil_id: number; registration_year: string; class_id: number; instrument_id: number; class_year: string };
type DbTeacher = { id: number; fullname: string; visible: number; former: number };

console.log(`Αρχείο    : ${path.relative(REPO_ROOT, FILE)}`);
console.log(`Βάση      : ${remote ? (ENV ? `απομακρυσμένη, περιβάλλον ${ENV}` : "PRODUCTION (--remote)") : "τοπική (--local)"}`);
console.log(`Λειτουργία: ${apply ? "ΕΓΓΡΑΦΗ (--apply)" : "DRY RUN"}\n`);

const { people, enrollments: sheetRows, problems } = readWorkbook(FILE);
const [dbPupils, dbEnrollments, dbTeachers] = await Promise.all([
	query<DbPupil>("SELECT id, am, orphan_code, last_name, first_name, fathers_name, birth_date, review_note, needs_review FROM pupils"),
	query<DbEnrollment>("SELECT pupil_id, registration_year, class_id, instrument_id, class_year FROM pupil_enrollments"),
	query<DbTeacher>("SELECT id, fullname, visible, former FROM teachers"),
]);
if (!dbTeachers.length) throw new Error("Δεν βρέθηκαν καθηγητές στη βάση — λάθος βάση;");

// ---- People: who is who ----

const dbIdentity = (p: DbPupil) => ({
	surname: p.last_name,
	name: p.first_name,
	father: p.fathers_name,
	born: p.birth_date ? new Date(p.birth_date).getUTCFullYear() : null,
});

const peopleByAm = new Map<number, Person[]>();
for (const person of people) peopleByAm.set(person.am, [...(peopleByAm.get(person.am) ?? []), person]);
const dbByAm = new Map(dbPupils.filter((p) => p.am !== null).map((p) => [p.am as number, p]));

/** Each pupil the backfill knows, by a stable reference: 'am:706' or 'split:469-Σ1'. */
type PupilRef = { ref: string; am: number | null; orphanCode: string; splitFrom: number | null; person: Person | null; db: DbPupil | null };
const refs = new Map<string, PupilRef>();
const notes = new Map<string, { text: string[]; review: boolean }>();
const addNote = (ref: string, text: string, review: boolean) => {
	const entry = notes.get(ref) ?? { text: [], review: false };
	if (!entry.text.includes(text)) entry.text.push(text);
	entry.review ||= review;
	notes.set(ref, entry);
};

// An ΑΜ written on more than one person: the first keeps it, the others are split off.
const splitCount = new Map<number, number>();
for (const [am, list] of peopleByAm) {
	list.forEach((person, i) => {
		if (i === 0) {
			refs.set(`am:${am}`, { ref: `am:${am}`, am, orphanCode: "", splitFrom: null, person, db: dbByAm.get(am) ?? null });
			return;
		}
		const n = (splitCount.get(am) ?? 0) + 1;
		splitCount.set(am, n);
		const code = `${am}-Σ${n}`;
		const existing = dbPupils.find((p) => p.orphan_code === code) ?? null;
		refs.set(`split:${code}`, { ref: `split:${code}`, am: null, orphanCode: code, splitFrom: am, person, db: existing });
		const first = list[0];
		addNote(
			`am:${am}`,
			`Το ΑΜ ${am} είναι γραμμένο και σε άλλο άτομο στο Γενικό Μητρώο (${person.surname} ${person.name}) — εκείνο καταχωρίστηκε ως ${code}`,
			true,
		);
		addNote(
			`split:${code}`,
			`Στο Γενικό Μητρώο με το ΑΜ ${am}, που είναι γραμμένο και σε άλλο άτομο (${first.surname} ${first.name}) — χρειάζεται νέο ΑΜ`,
			true,
		);
	});
}

// The register's person and the database's pupil with the same ΑΜ are different people: nothing of that ΑΜ is
// written (no enrollments, no notes); the report lists them for the secretariat.
const conflicts: { am: number; person: Person; db: DbPupil }[] = [];
for (const ref of refs.values()) {
	if (ref.person && ref.db && !samePerson(ref.person, dbIdentity(ref.db))) conflicts.push({ am: ref.person.am, person: ref.person, db: ref.db });
}
const conflictAms = new Set(conflicts.map((c) => c.am));

/** Same person and also the same father's name and birth year — strict enough to join records across numbers. */
const sameIdentity = (a: { surname: string; name: string; father?: string; born?: number | null }, b: typeof a) =>
	samePerson(a, b) && !!a.born && a.born === b.born && !!a.father && nameKey(a.father) === nameKey(b.father);

// Already in the Μαθητολόγιο under another number: a register person whose ΑΜ the database does not have, but who is
// exactly one database pupil by name, father's name and birth year — a pupil without ΑΜ (`000-Ο58`, ΑΜ still
// «ΛΑΘΟΣ 1085-1277»), or one of a duplicate pair the secretariat has already settled on the other ΑΜ. Their history
// goes to that pupil; no second pupil is created.
const aliases: { ref: PupilRef; am: number }[] = [];
for (const ref of refs.values()) {
	if (!ref.person || ref.db || ref.am === null) continue;
	const matches = dbPupils.filter((d) => sameIdentity(ref.person!, dbIdentity(d)));
	if (matches.length !== 1) continue;
	ref.db = matches[0];
	aliases.push({ ref, am: ref.am });
	addNote(ref.ref, `Στο Γενικό Μητρώο με ΑΜ ${ref.am}`, false);
}
/** The database pupil each ΑΜ of the register resolves to (by number or by identity). */
const dbIdOfAm = (am: number) => refs.get(`am:${am}`)?.db?.id;

// One person under two ΑΜs: same name, father and birth year (surname within 2 edits). Not flagged when the pair is
// already settled in the Μαθητολόγιο: one of the ΑΜs now belongs to someone else, or both lead to the same pupil.
{
	const byIdentity = new Map<string, Person[]>();
	for (const person of people) {
		const key = [nameKey(person.name), nameKey(person.father), person.born ?? ""].join("|");
		if (!nameKey(person.name) || !nameKey(person.father) || !person.born) continue;
		byIdentity.set(key, [...(byIdentity.get(key) ?? []), person]);
	}
	for (const group of byIdentity.values()) {
		for (const a of group) {
			if (conflictAms.has(a.am)) continue;
			const others = group
				.filter((b) => b.am !== a.am && levenshtein(nameKey(a.surname), nameKey(b.surname)) <= 2)
				.filter((b) => !conflictAms.has(b.am) && !(dbIdOfAm(a.am) !== undefined && dbIdOfAm(a.am) === dbIdOfAm(b.am)))
				.map((b) => b.am);
			if (others.length) addNote(`am:${a.am}`, `Πιθανή διπλή εγγραφή στο Γενικό Μητρώο: ίδιο άτομο με ΑΜ ${others.join(", ")}`, true);
		}
	}
}

// ---- Teachers ----

const teacherByKey = new Map<string, DbTeacher>();
for (const teacher of dbTeachers) {
	const key = teacherKey(teacher.fullname);
	const known = teacherByKey.get(key);
	if (!known || (known.former && !teacher.former)) teacherByKey.set(key, teacher); // a duplicate row: prefer the active one
}
for (const [alias, fullname] of Object.entries(TEACHER_ALIASES)) {
	const teacher = dbTeachers.find((t) => teacherKey(t.fullname) === teacherKey(fullname));
	if (teacher) teacherByKey.set(teacherKey(alias), teacher);
}
/** Former teachers to add: key → the spellings the sheets use (with counts). */
const newTeachers = new Map<string, Map<string, number>>();
const unresolvedTeachers = new Map<string, number>();
function resolveTeacher(raw: string): { id: number } | { newKey: string } | null {
	if (!raw) return null;
	const key = teacherKey(raw);
	const known = teacherByKey.get(key);
	if (known) return { id: known.id };
	if (key.split(" ").length < 2) {
		unresolvedTeachers.set(raw, (unresolvedTeachers.get(raw) ?? 0) + 1);
		return null;
	}
	const spellings = newTeachers.get(key) ?? new Map<string, number>();
	spellings.set(raw, (spellings.get(raw) ?? 0) + 1);
	newTeachers.set(key, spellings);
	return { newKey: key };
}
/** How a new former teacher is named when the sheets disagree or put the surname first. */
const FORMER_TEACHER_NAMES = ["Εφραιμία Κλησιάρχη", "Διαμαντής Αργυρόπουλος", "Ιωάννης Τραϊφόρος"];

/** The name a new former teacher is saved under: the most frequent spelling, «π.» kept if any spelling has it. */
function formerTeacherName(spellings: Map<string, number>): string {
	const named = FORMER_TEACHER_NAMES.find((name) => spellings.has(name) || [...spellings.keys()].some((s) => teacherKey(s) === teacherKey(name)));
	if (named) return named;
	const best = [...spellings]
		.sort((a, b) => b[1] - a[1])[0][0]
		.replace(/Κων\/νος/g, "Κωνσταντίνος")
		.replace(/^π\.\s*/, "");
	const priest = [...spellings.keys()].some((s) => /^π\.?\s/.test(s));
	return (priest ? "π. " : "") + best;
}

// ---- Enrollments ----

type NewEnrollment = SheetEnrollment & { ref: string; teacher: { id: number } | { newKey: string } | null; evaluation: boolean };
const planned: NewEnrollment[] = [];
const skipped: { row: SheetEnrollment; reason: string }[] = [];
const seen = new Map<string, NewEnrollment>();
const dbEnrollmentKeys = new Set(dbEnrollments.map((e) => `${e.pupil_id}|${e.registration_year}|${e.class_id}|${e.instrument_id}`));
const sheetOnlyAms = new Map<number, SheetEnrollment>();
/** Yearly rows written with someone else's ΑΜ, matched to their own by name, father and birth year. */
const corrected: { row: SheetEnrollment; am: number }[] = [];
let alreadyInDb = 0;

for (const sheetRow of sheetRows) {
	let row = sheetRow;
	// Which pupil: the register's person with this ΑΜ (the matching one when the ΑΜ is shared).
	let candidates = [...refs.values()].filter((r) => (r.am ?? r.splitFrom) === row.am && r.person);
	let target = candidates.find((r) => samePerson(r.person!, row)) ?? null;
	if (!target && candidates.length) {
		// The sheet wrote another person's ΑΜ: use the pupil's own when exactly one person of «Γενικό Μητρώο» has
		// this name, father's name and birth year.
		const own = people.filter((p) => samePerson(p, row) && p.born === row.born && nameKey(p.father) === nameKey(row.father) && !!row.born);
		if (own.length === 1 && (peopleByAm.get(own[0].am)?.length ?? 0) === 1) {
			corrected.push({ row, am: own[0].am });
			row = { ...row, am: own[0].am };
			candidates = [...refs.values()].filter((r) => r.am === row.am && r.person);
			target = candidates[0] ?? null;
		}
	}
	// The ΑΜ now belongs to someone else in the Μαθητολόγιο (a settled duplicate whose spare ΑΜ was given out again):
	// the row goes to the same person's other ΑΜ, when there is exactly one.
	if (target && conflictAms.has(row.am)) {
		const partners = [...refs.values()].filter(
			(r) => r.person && r.am !== null && r.am !== row.am && !conflictAms.has(r.am) && sameIdentity(r.person, row),
		);
		if (partners.length === 1) {
			corrected.push({ row, am: partners[0].am! });
			row = { ...row, am: partners[0].am! };
			target = partners[0];
		}
	}
	if (!target && candidates.length) {
		const p = candidates[0].person!;
		skipped.push({ row, reason: `το ΑΜ ${row.am} στο Γενικό Μητρώο είναι «${p.surname} ${p.name}»` });
		continue;
	}
	if (!target) {
		// In a yearly sheet but not in «Γενικό Μητρώο»: the pupil comes from the yearly row.
		if (!sheetOnlyAms.has(row.am)) sheetOnlyAms.set(row.am, row);
		const ref = `am:${row.am}`;
		target = refs.get(ref) ?? { ref, am: row.am, orphanCode: "", splitFrom: null, person: null, db: dbByAm.get(row.am) ?? null };
		refs.set(ref, target);
	}
	if (target.db && ((target.am !== null && conflictAms.has(target.am)) || !samePerson(dbIdentity(target.db), row))) {
		skipped.push({ row, reason: `το ΑΜ ${row.am} στο Μαθητολόγιο είναι «${target.db.last_name} ${target.db.first_name}»` });
		continue;
	}
	if (!row.classYear) {
		skipped.push({ row, reason: `άγνωστο έτος φοίτησης «${row.classYearRaw}»` });
		continue;
	}
	const key = `${target.ref}|${row.year}|${row.classId}|${row.instrumentId}`;
	const twin = seen.get(key);
	if (twin) {
		if (twin.classYear !== row.classYear)
			skipped.push({ row, reason: `δεύτερη εγγραφή της ίδιας χρονιάς (κρατήθηκε «${twin.classYear}», ${twin.sheet} γρ. ${twin.line})` });
		continue;
	}
	if (target.db && dbEnrollmentKeys.has(`${target.db.id}|${row.year}|${row.classId}|${row.instrumentId}`)) {
		alreadyInDb++;
		continue;
	}
	const enrollment: NewEnrollment = { ...row, ref: target.ref, teacher: resolveTeacher(row.teacherRaw), evaluation: false };
	seen.set(key, enrollment);
	planned.push(enrollment);
}

// ---- Placement exams (Κατατακτήριες), inferred ----

const dbClassYearsByPupil = new Map<number, DbEnrollment[]>();
for (const e of dbEnrollments) dbClassYearsByPupil.set(e.pupil_id, [...(dbClassYearsByPupil.get(e.pupil_id) ?? []), e]);
const placements: NewEnrollment[] = [];
{
	const groups = new Map<string, NewEnrollment[]>();
	for (const e of planned) groups.set(`${e.ref}|${e.classId}|${e.instrumentId}`, [...(groups.get(`${e.ref}|${e.classId}|${e.instrumentId}`) ?? []), e]);
	for (const group of groups.values()) {
		const first = group.sort((a, b) => a.year.localeCompare(b.year))[0];
		const db = refs.get(first.ref)?.db;
		const earlierInDb =
			db &&
			(dbClassYearsByPupil.get(db.id) ?? []).some(
				(e) => e.class_id === first.classId && e.instrument_id === first.instrumentId && e.registration_year < first.year,
			);
		if (earlierInDb || isStartingClassYear(first.classYear, first.classId) || /μετεγγραφ/i.test(first.notes)) continue;
		first.evaluation = true;
		placements.push(first);
		addNote(first.ref, `Κατάταξη ${first.year} (${first.classYear}): εκτίμηση από το ιστορικό του Excel`, false);
	}
}

// ---- Pupils to add ----

const nowMs = Date.now();
type NewPupil = {
	ref: PupilRef;
	source: {
		surname: string;
		name: string;
		father: string;
		born: number | null;
		address: string;
		email: string;
		phones: { cellphone: string; telephone: string };
		date: number | null;
	};
};
const newPupils: NewPupil[] = [];
for (const ref of refs.values()) {
	if (ref.db) continue;
	const fromSheet = ref.am !== null ? sheetOnlyAms.get(ref.am) : undefined;
	const person = ref.person;
	if (!person && !fromSheet) continue;
	newPupils.push({
		ref,
		source: person
			? { ...person }
			: {
					surname: fromSheet!.surname,
					name: fromSheet!.name,
					father: fromSheet!.father,
					born: fromSheet!.born,
					address: fromSheet!.address,
					email: "",
					phones: { cellphone: "", telephone: "" },
					date: fromSheet!.date,
				},
	});
}
const plannedRefs = new Set(planned.map((e) => e.ref));

// ---------------------------------------------------------------------------
// SQL
// ---------------------------------------------------------------------------

/** A pupil already in the database by its id (read from the same database); a new one by its ΑΜ / split code. */
const pupilIdSql = (ref: PupilRef) =>
	ref.db
		? String(ref.db.id)
		: ref.am !== null
			? `(SELECT id FROM pupils WHERE am = ${ref.am})`
			: `(SELECT id FROM pupils WHERE orphan_code = ${lit(ref.orphanCode)})`;
const statements: string[] = [];

/** New former teacher: key → the name it is saved under. */
const newTeacherNames = new Map([...newTeachers].map(([key, spellings]) => [key, formerTeacherName(spellings)]));
for (const fullname of new Set(newTeacherNames.values())) {
	statements.push(
		`INSERT INTO teachers (fullname, email, telephone, linktree, gender, title, visible, online, amka, former) SELECT ${lit(fullname)}, '', '', '', ${lit(genderFromGivenName(fullname.replace(/^π\.\s*/, "").split(" ")[0]))}, 0, 0, 0, '', 1 WHERE NOT EXISTS (SELECT 1 FROM teachers WHERE fullname = ${lit(fullname)});`,
	);
}
const teacherSql = (teacher: NewEnrollment["teacher"]) => {
	if (!teacher) return "-1";
	if ("id" in teacher) return String(teacher.id);
	const fullname = newTeacherNames.get(teacher.newKey)!;
	return `(SELECT id FROM teachers WHERE fullname = ${lit(fullname)} AND former = 1 ORDER BY id LIMIT 1)`;
};

for (const { ref, source } of newPupils) {
	const note = notes.get(ref.ref);
	const address = splitAddress(source.address);
	const guard = ref.am !== null ? `am = ${ref.am}` : `orphan_code = ${lit(ref.orphanCode)}`;
	statements.push(
		`INSERT INTO pupils (am, orphan_code, split_from_am, first_name, last_name, fathers_name, birth_date, road, number, tk, region, telephone, cellphone, email, amka, registration_url, needs_review, review_note, created_at, updated_at) SELECT ${[
			lit(ref.am),
			lit(ref.orphanCode),
			lit(ref.splitFrom),
			lit(source.name || "-"),
			lit(source.surname || "-"),
			lit(source.father),
			lit(source.born ? Date.UTC(source.born, 0, 1, 12) : 0),
			lit(address.road),
			lit(address.number),
			lit(address.tk),
			lit(address.region),
			lit(source.phones.telephone || "-"),
			lit(source.phones.cellphone),
			lit(source.email),
			"''",
			"''",
			note?.review ? 1 : 0,
			lit(note?.text.join(" · ") ?? ""),
			lit(source.date ?? nowMs),
			lit(nowMs),
		].join(", ")} WHERE NOT EXISTS (SELECT 1 FROM pupils WHERE ${guard});`,
	);
}

// Notes on pupils that were already in the database (idempotent: a note already there is not added again).
for (const [refKey, note] of notes) {
	const ref = refs.get(refKey);
	if (!ref?.db || (ref.am !== null && conflictAms.has(ref.am))) continue;
	for (const text of note.text) {
		statements.push(
			`UPDATE pupils SET review_note = CASE WHEN review_note = '' THEN ${lit(text)} ELSE review_note || ' · ' || ${lit(text)} END${note.review ? ", needs_review = 1" : ""}, updated_at = ${nowMs} WHERE id = ${ref.db.id} AND instr(review_note, ${lit(text)}) = 0;`,
		);
	}
}

for (const e of planned) {
	const ref = refs.get(e.ref)!;
	const pupilId = pupilIdSql(ref);
	const date =
		e.date ??
		(ref.person?.date && ref.person.date >= schoolYearStart(e.year) - 120 * 86400000 && ref.person.date < schoolYearStart(e.year) + 300 * 86400000
			? ref.person.date
			: schoolYearStart(e.year));
	statements.push(
		`INSERT INTO pupil_enrollments (pupil_id, registration_year, class_id, class_year, teacher_id, instrument_id, date, payment_amount, total_payment, payment_date, pass, source, created_at, evaluation, fee_catalog_id, fee_base, evaluation_fee, fee_manual) SELECT ${pupilId}, ${lit(e.year)}, ${e.classId}, ${lit(e.classYear)}, ${teacherSql(e.teacher)}, ${e.instrumentId}, ${date}, 0, 0, NULL, 0, 'registry', ${nowMs}, ${e.evaluation ? 1 : 0}, NULL, NULL, 0, 0 WHERE ${pupilId} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pupil_enrollments WHERE pupil_id = ${pupilId} AND registration_year = ${lit(e.year)} AND class_id = ${e.classId} AND instrument_id = ${e.instrumentId});`,
	);
}
// «Προήχθη», inferred: a backfilled enrollment whose pupil's next enrollment in the same department (and
// instrument) is a higher class year. Runs over every 'registry' row each time, so it also catches promotions
// that only the online years (2023-) show. Rows with no later enrollment stay «Όχι» (not known).
const rankRows = Object.values(classYearsByMusicType)
	.flatMap((list) => list.filter((label) => label && label !== EVALUATION_LABEL).map((label, i) => `(${lit(label)}, ${i + 1})`))
	.filter((row, i, all) => all.indexOf(row) === i);
const nextClassYear =
	"(SELECT n.class_year FROM pupil_enrollments n WHERE n.pupil_id = pupil_enrollments.pupil_id AND n.class_id = pupil_enrollments.class_id AND n.instrument_id = pupil_enrollments.instrument_id AND n.registration_year > pupil_enrollments.registration_year ORDER BY n.registration_year LIMIT 1)";
statements.push(
	`WITH class_rank(label, r) AS (VALUES ${rankRows.join(", ")}) UPDATE pupil_enrollments SET pass = 1 WHERE source = 'registry' AND pass = 0 AND (SELECT r FROM class_rank WHERE label = ${nextClassYear}) > (SELECT r FROM class_rank WHERE label = pupil_enrollments.class_year);`,
);
statements.push("UPDATE total_enrollments SET amount = (SELECT COUNT(*) FROM pupil_enrollments);");

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const byYear = new Map<string, { byz: number; par: number; placements: number }>();
for (const e of planned) {
	const entry = byYear.get(e.year) ?? { byz: 0, par: 0, placements: 0 };
	if (e.classId === 0) entry.byz++;
	else entry.par++;
	if (e.evaluation) entry.placements++;
	byYear.set(e.year, entry);
}
const withoutTeacher = planned.filter((e) => !e.teacher).length;
const reviewPupils = [...notes.entries()].filter(([, n]) => n.review);

console.log("ΕΓΓΡΑΦΕΣ ΑΝΑ ΧΡΟΝΙΑ (νέες)");
for (const year of BACKFILL_YEARS) {
	const e = byYear.get(year) ?? { byz: 0, par: 0, placements: 0 };
	console.log(`  ${year}: ${String(e.byz + e.par).padStart(4)}  (Βυζαντινή ${e.byz}, Παραδοσιακή ${e.par}; κατατάξεις ${e.placements})`);
}
console.log(`  Σύνολο: ${planned.length} · ήδη στη βάση: ${alreadyInDb} · χωρίς καθηγητή: ${withoutTeacher}\n`);

console.log(`ΜΑΘΗΤΕΣ`);
console.log(
	`  Νέοι μαθητές: ${newPupils.length} (από το Γενικό Μητρώο ${newPupils.filter((p) => p.ref.person).length}, μόνο από φύλλο χρονιάς ${newPupils.filter((p) => !p.ref.person).length}; χωρίς καμία εγγραφή 2015-2023: ${newPupils.filter((p) => !plannedRefs.has(p.ref.ref)).length})`,
);
console.log(`  Υπάρχοντες μαθητές που παίρνουν παλιές εγγραφές: ${new Set(planned.filter((e) => refs.get(e.ref)?.db).map((e) => e.ref)).size}`);
console.log(`  Σημειωμένοι «προς έλεγχο»: ${reviewPupils.length}`);
for (const [ref, n] of reviewPupils) console.log(`    ${ref.replace(/^(am|split):/, "")}: ${n.text.filter((t) => !t.startsWith("Κατάταξη")).join(" · ")}`);
console.log();

if (aliases.length) {
	console.log(`  Ήδη στο Μαθητολόγιο με άλλον αριθμό (η ιστορία τους πάει εκεί, όχι νέος μαθητής): ${aliases.length}`);
	for (const a of aliases) console.log(`    ΑΜ ${a.am} → ${a.ref.db!.am ?? a.ref.db!.orphan_code} «${a.ref.db!.last_name} ${a.ref.db!.first_name}»`);
}
if (conflicts.length) {
	console.log(`  Ίδιο ΑΜ, άλλο άτομο στο Γενικό Μητρώο και στο Μαθητολόγιο (δεν γράφτηκε τίποτα γι' αυτά): ${conflicts.length}`);
	for (const c of conflicts)
		console.log(`    ΑΜ ${c.am}: Γενικό Μητρώο «${c.person.surname} ${c.person.name}» · Μαθητολόγιο «${c.db.last_name} ${c.db.first_name}»`);
}
console.log();

console.log(`ΠΡΩΗΝ ΔΙΔΑΣΚΟΝΤΕΣ (νέοι, κρυφοί): ${newTeachers.size}`);
for (const [key, spellings] of newTeachers) {
	const fullname = newTeacherNames.get(key)!;
	const variants = [...spellings];
	console.log(
		`  ${fullname}  (${variants.reduce((n, [, c]) => n + c, 0)} εγγραφές${variants.length > 1 ? `; γραφές: ${variants.map(([s]) => s).join(" / ")}` : ""})`,
	);
}
if (unresolvedTeachers.size)
	console.log(`  Ασαφή ονόματα (η εγγραφή μένει χωρίς καθηγητή): ${[...unresolvedTeachers].map(([t, c]) => `«${t}» ×${c}`).join(", ")}`);
const oldHidden = dbTeachers.filter((t) => !t.visible && !t.former && planned.some((e) => e.teacher && "id" in e.teacher && e.teacher.id === t.id));
if (oldHidden.length) console.log(`  Κρυφοί καθηγητές της βάσης με παλιές εγγραφές (ίσως κι αυτοί πρώην): ${oldHidden.map((t) => t.fullname).join(", ")}`);
console.log();

if (corrected.length) {
	console.log(`ΔΙΟΡΘΩΜΕΝΟ ΑΜ (γραμμή χρονιάς με ΑΜ άλλου ή με ΑΜ που δόθηκε ξανά): ${corrected.length}`);
	for (const c of corrected) console.log(`  «${c.row.sheet}» γρ. ${c.row.line}: ${c.row.surname} ${c.row.name} — ΑΜ ${c.row.am} → ${c.am}`);
	console.log();
}

console.log(`ΓΡΑΜΜΕΣ ΠΟΥ ΔΕΝ ΜΠΗΚΑΝ: ${skipped.length + problems.length}`);
const reasons = new Map<string, number>();
for (const s of skipped) {
	const kind = s.reason.replace(/«[^»]*»/g, "«…»").replace(/\d+/g, "N");
	reasons.set(kind, (reasons.get(kind) ?? 0) + 1);
}
for (const [kind, count] of reasons) console.log(`  ${count} × ${kind}`);
if (problems.length) console.log(`  ${problems.length} × προβλήματα ανάγνωσης`);
if (verbose) {
	for (const s of skipped) console.log(`    «${s.row.sheet}» γρ. ${s.row.line} ΑΜ ${s.row.am} ${s.row.surname} ${s.row.name}: ${s.reason}`);
	for (const p of problems) console.log(`    ${p}`);
	console.log("\nΚΑΤΑΤΑΞΕΙΣ (εκτίμηση)");
	for (const e of placements) console.log(`    ${e.year} ΑΜ ${e.am} ${e.surname} ${e.name}: ${e.classYear}`);
} else console.log("  (--verbose για κάθε γραμμή)");
console.log();

const sql = statements.join("\n") + "\n";
if (SQL_OUT) {
	writeFileSync(path.resolve(process.cwd(), SQL_OUT), sql);
	console.log(`SQL: ${statements.length} εντολές → ${SQL_OUT}`);
}
if (!apply) {
	console.log("DRY RUN — τίποτα δεν γράφτηκε. Ξανατρέξτε με --apply.");
	process.exit(0);
}
await executeFile(sql);
const [after] = await query<{ pupils: number; enrollments: number; registry: number; passed: number }>(
	"SELECT (SELECT COUNT(*) FROM pupils) pupils, (SELECT COUNT(*) FROM pupil_enrollments) enrollments, (SELECT COUNT(*) FROM pupil_enrollments WHERE source = 'registry') registry, (SELECT COUNT(*) FROM pupil_enrollments WHERE source = 'registry' AND pass = 1) passed",
);
console.log(`Γράφτηκε. Μαθητές: ${after.pupils} · εγγραφές: ${after.enrollments} (από το μητρώο: ${after.registry}, «Προήχθη»: ${after.passed})`);
