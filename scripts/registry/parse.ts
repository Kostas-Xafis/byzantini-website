/**
 * Pure helpers of the registry backfill (scripts/registryBackfill.ts): reading the school's Excel register
 * («ΜΗΤΡΩΟ - ΜΑΘΗΤΟΛΟΓΙΟ.xlsx») into plain records. No IO, no DB — unit-tested in
 * tests/unit/registryBackfill.test.ts.
 *
 * The workbook has one «Γενικό Μητρώο» sheet (one row per ΑΜ: the person) and one «Μαθητολόγιο <year>» sheet per
 * school year (one row per pupil and class that year). Its layout changed over the years:
 *
 *   2015-16 … 2017-18  Α/Α, ΑΜ, names, birth year, address, registration date, Τάξη, teacher, notes
 *   2018-19 … 2021-22  α/α, ΑΜ, names, birth year, address, Έτος Φοίτησης, teacher, notes (no date)
 *   2022-23            the same, in sections: «Α. ΣΧΟΛΗ ΒΥΖΑΝΤΙΝΗΣ», «Β. ΣΧΟΛΗ ΠΑΡΑΔΟΣΙΑΚΗΣ» (singing table, then one
 *                      table per instrument: «Τάξη Ουτίου Α2α.», …)
 *
 * In the older sheets a long cell sometimes overflowed into the next row(s), which then hold only that cell
 * («Βασίλειος» / «Παπαγεωργίου»): `mergeContinuationRows` glues them back, column by column.
 */
import { normalizeKey, normalizeText, parseAm } from "../../lib/pupils/normalize";
import { classYearsByMusicType, MusicType } from "../../lib/classYears";

export type Cell = string | number | boolean | null | undefined;
export type SheetRow = Cell[];

/** The school years the backfill writes: everything before the online register (2023-2024). */
export const BACKFILL_YEARS = ["2015-2016", "2016-2017", "2017-2018", "2018-2019", "2019-2020", "2020-2021", "2021-2022", "2022-2023"] as const;

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

const GREEK_RE = /[Ͱ-Ͽἀ-῿]/;
const LATIN_LOOKALIKES: Record<string, string> = {
	A: "Α",
	B: "Β",
	E: "Ε",
	Z: "Ζ",
	H: "Η",
	I: "Ι",
	K: "Κ",
	M: "Μ",
	N: "Ν",
	O: "Ο",
	P: "Ρ",
	T: "Τ",
	X: "Χ",
	Y: "Υ",
	a: "α",
	e: "ε",
	i: "ι",
	k: "κ",
	o: "ο",
	p: "ρ",
	t: "τ",
	u: "υ",
	v: "ν",
	x: "χ",
	y: "υ",
};

/**
 * Latin letters typed inside Greek words («Kωνσταντίνος», «B΄») become their Greek look-alikes. Words with no
 * Greek letter at all («Bag Cristina») are left alone.
 */
export function foldLookalikes(value: string): string {
	return value
		.split(/(\s+)/)
		.map((word) => (GREEK_RE.test(word) ? word.replace(/[A-Za-z]/g, (c) => LATIN_LOOKALIKES[c] ?? c) : word))
		.join("");
}

/** A cell as display text: trimmed, single spaces, look-alikes folded. */
export function cellText(value: Cell): string {
	if (value === null || value === undefined) return "";
	return foldLookalikes(normalizeText(String(value)));
}

/** Comparison key of a name: accent/case/spacing-insensitive, look-alikes folded, punctuation dropped. */
export function nameKey(value: Cell): string {
	return normalizeKey(cellText(value))
		.replace(/κων\/νοσ/g, "κωνσταντινοσ")
		.replace(/[^\p{L}\p{N} ]/gu, " ")
		.replace(/\s+/g, " ")
		.trim();
}

// ---------------------------------------------------------------------------
// Sheets
// ---------------------------------------------------------------------------

/** «Μαθητολόγιο 2015 - 2016» / «Μαθητολόγιο 2018-2019» → '2015-2016'; anything else → null. */
export function sheetSchoolYear(sheetName: string): string | null {
	const match = sheetName.match(/^Μαθητολόγιο\s+(\d{4})\s*-\s*(\d{4})\s*$/);
	return match ? `${match[1]}-${match[2]}` : null;
}

const isBlank = (cell: Cell) => cell === null || cell === undefined || String(cell).trim() === "";

/** A data row starts with a serial number (Α/Α) and carries an ΑΜ. */
export function isDataRow(row: SheetRow): boolean {
	const first = row[0];
	if (typeof first === "number") return true;
	return typeof first === "string" && /^\s*\d+\s*$/.test(first);
}

/**
 * Rows whose first two cells (Α/Α, ΑΜ) are empty but some other cell is not are the overflow of the previous data
 * row's cells: each non-empty cell is appended, with a space, to the same column of that row.
 */
export function mergeContinuationRows(rows: SheetRow[]): SheetRow[] {
	const out: SheetRow[] = [];
	for (const row of rows) {
		const previous = out[out.length - 1];
		const continuation = isBlank(row[0]) && isBlank(row[1]) && row.some((cell) => !isBlank(cell));
		if (continuation && previous && isDataRow(previous)) {
			row.forEach((cell, i) => {
				if (isBlank(cell)) return;
				previous[i] = isBlank(previous[i]) ? cell : `${String(previous[i]).trim()} ${String(cell).trim()}`;
			});
			continue;
		}
		out.push([...row]);
	}
	return out;
}

export type HeaderColumns = {
	am: number;
	surname: number;
	name: number;
	father: number;
	born: number;
	date: number | null;
	classYear: number;
	teacher: number;
	notes: number | null;
};

/** Finds the columns of a yearly sheet from its header row («Αριθμός Μητρώου», «Τάξη» / «Έτος Φοίτησης», …). */
export function headerColumns(row: SheetRow): HeaderColumns | null {
	const find = (re: RegExp) => row.findIndex((cell) => typeof cell === "string" && re.test(cell));
	const am = find(/Αριθμός Μητρώου/);
	const teacher = find(/Διδάσκων/);
	const classYear = find(/^\s*Τάξη\s*$|Έτος Φοίτησης/);
	if (am < 0 || teacher < 0 || classYear < 0) return null;
	const date = find(/Ημερομηνία Εγγραφής|Ημ\/νια Εγγραφής/);
	const notes = find(/Παρατηρήσεις/);
	return {
		am,
		surname: find(/Επώνυμο/),
		name: find(/^\s*Όνομα\s*$/),
		father: find(/Όνομα [Ππ]ατρός/),
		born: find(/Έτος Γέννησης/),
		date: date < 0 ? null : date,
		classYear,
		teacher,
		notes: notes < 0 ? null : notes,
	};
}

// ---------------------------------------------------------------------------
// Sections, instruments, class years
// ---------------------------------------------------------------------------

/** class_id of a section heading («Α. ΣΧΟΛΗ ΒΥΖΑΝΤΙΝΗΣ ΜΟΥΣΙΚΗΣ» → 0, «Β. ΣΧΟΛΗ ΠΑΡΑΔΟΣΙΑΚΗΣ ΜΟΥΣΙΚΗΣ» → 1). */
export function sectionClassId(text: string): number | null {
	const key = nameKey(text);
	if (!/σχολη/.test(key)) return null;
	if (/βυζαντιν/.test(key)) return 0;
	if (/παραδοσιακ/.test(key)) return 1;
	if (/ευρωπαικ/.test(key)) return 2;
	return null;
}

/** Instrument table headings of the traditional section → `instruments.id` (the local/production ids). Keys are
 * lowercase Greek, so letters are matched as `[α-ω]` — `\w` is ASCII-only. */
const INSTRUMENT_HEADINGS: [RegExp, number][] = [
	[/πολιτικ[α-ω]* λαουτ|λαφτα/, 3],
	[/πολιτικ[α-ω]* λυρα/, 10],
	[/ουτι/, 1],
	[/λαουτ/, 2],
	[/ταμπουρα/, 5],
	[/ταμπουρ/, 4],
	[/μαντολιν/, 6],
	[/σαντουρ/, 7],
	[/κανονακ/, 9],
	[/βιολ/, 12],
	[/(?:^|\s)νει(?:\s|$)/, 13], // `\b` is ASCII-only: it never fires next to a Greek letter
	[/κλαριν/, 14],
	[/φλογερ/, 15],
	[/κρουστ/, 20],
	[/κρητικ[α-ω]* λυρα/, 21],
	[/ποντιακ[α-ω]* λυρα/, 22],
	[/ασκαυλ/, 50],
	[/μπουζουκ/, 27],
	[/κιθαρ/, 28],
	[/τραγουδ/, 44],
];

/** «Τάξη Ουτίου Α2α.» → 1, «Ελληνικό Παραδοσιακό Τραγούδι Α1» → 44; a heading that names no instrument → null. */
export function instrumentFromHeading(text: string): number | null {
	const key = nameKey(text);
	for (const [re, id] of INSTRUMENT_HEADINGS) if (re.test(key)) return id;
	return null;
}

const ORDINALS: Record<string, string> = { α: "Α", β: "Β", γ: "Γ", δ: "Δ", ε: "Ε" };

/**
 * A class year as the sheets wrote it, mapped onto the canonical list of its music type (lib/classYears.ts):
 *
 *   Βυζαντινή     «Α΄», «A΄», «Α' Ετος», «Δ΄ έτος», «ΔΙΠΛΩΜΑΤΟΣ Β΄», «Α΄ διπλώματος» → «Α' Έτος» … «Β' Έτος Διπλώματος»
 *   Παραδοσιακή   «Προκαταρκτική», «Β΄ Κατωτέρα», «Α΄ Μέση», «Α' Ανωτέρα» → «Α' Προκαταρκτική», «Β' Κατωτέρα», …
 *
 * Returns '' when the value cannot be placed (the backfill reports it).
 */
export function canonicalClassYear(raw: Cell, classId: number): string {
	const key = nameKey(raw);
	if (!key) return "";
	const letter = key.match(/(?:^|\s)([αβγδε])(?=\s|$)/)?.[1];
	const ordinal = letter ? ORDINALS[letter] : undefined;
	let label = "";
	if (classId === 0) {
		if (!ordinal) return "";
		label = /διπλωμ/.test(key) ? `${ordinal}' Έτος Διπλώματος` : `${ordinal}' Έτος`;
	} else {
		const level = /προκαταρκτ/.test(key)
			? "Προκαταρκτική"
			: /κατωτερ/.test(key)
				? "Κατωτέρα"
				: /μεση/.test(key)
					? "Μέση"
					: /ανωτερ/.test(key)
						? "Ανωτέρα"
						: /διπλωμ/.test(key)
							? "Διπλώματος"
							: "";
		if (!level) return "";
		label = `${ordinal ?? "Α"}' ${level}`;
	}
	const known = classYearsByMusicType[classId === 0 ? MusicType.Byzantine : classId === 1 ? MusicType.Traditional : MusicType.European];
	return known.includes(label) ? label : "";
}

/** The class year a pupil starts from without a placement exam. */
export function isStartingClassYear(classYear: string, classId: number): boolean {
	if (classId === 0) return classYear === "Α' Έτος";
	return classYear === "Α' Προκαταρκτική" || classYear === "Α' Κατωτέρα";
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export function levenshtein(a: string, b: string): number {
	const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
	for (let j = 1; j <= b.length; j++) d[0][j] = j;
	for (let i = 1; i <= a.length; i++)
		for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
	return d[a.length][b.length];
}

const GREEKLISH: Record<string, string> = {
	α: "a",
	β: "v",
	γ: "g",
	δ: "d",
	ε: "e",
	ζ: "z",
	η: "i",
	θ: "th",
	ι: "i",
	κ: "k",
	λ: "l",
	μ: "m",
	ν: "n",
	ξ: "x",
	ο: "o",
	π: "p",
	ρ: "r",
	σ: "s",
	τ: "t",
	υ: "y",
	φ: "f",
	χ: "ch",
	ψ: "ps",
	ω: "o",
};

/** A name key in Latin letters, so «Damianos Stefania» and «Δαμιανός Στεφανία» compare: 'damianos stefania'. */
export function greeklish(value: Cell): string {
	return nameKey(value)
		.replace(/[α-ω]/g, (c) => GREEKLISH[c] ?? c)
		.replace(/y/g, "i")
		.replace(/w/g, "o")
		.replace(/ou/g, "u");
}

/** Everyday forms of given names the sheets use alongside the formal one (both sides as `nameKey`s). */
const GIVEN_NAME_FORMS: Record<string, string> = {
	στελιοσ: "στυλιανοσ",
	θανασησ: "αθανασιοσ",
	τασοσ: "αναστασιοσ",
	βασιλησ: "βασιλειοσ",
	μαιρη: "μαρια",
	κατερινα: "αικατερινη",
	αγγελα: "αγγελικη",
	κωστασ: "κωνσταντινοσ",
	κωστακησ: "κωνσταντινοσ",
	γιωργοσ: "γεωργιοσ",
	γιαννησ: "ιωαννησ",
	δημητρησ: "δημητριοσ",
	νικοσ: "νικολαοσ",
	γιωτα: "παναγιωτα",
	σωτηρησ: "σωτηριοσ",
	μιχαλησ: "μιχαηλ",
	λευτερησ: "ελευθεριοσ",
	θοδωρησ: "θεοδωροσ",
	σακησ: "αθανασιοσ",
	ανθουλα: "ανθη",
	βαγγελησ: "ευαγγελοσ",
	γρηγορησ: "γρηγοριοσ",
	αντωνησ: "αντωνιοσ",
	μανωλησ: "εμμανουηλ",
	αλεκοσ: "αλεξανδροσ",
	σπυροσ: "σπυριδων",
	παναγιωτησ: "παναγιωτησ",
	ελενη: "ελενη",
	φωτησ: "φωτιοσ",
	ηλιασ: "ηλιασ",
	στεφανια: "στεφανια",
};
const formalGivenName = (key: string) => GIVEN_NAME_FORMS[key] ?? key;

export type Identity = { surname: string; name: string; father?: string; born?: number | null };

/**
 * Whether two records are the same person despite spelling: the surname must agree (within 2 edits, or in Latin
 * letters within 2), and either a given name agrees (an everyday form counts: «Στέλιος» = «Στυλιανός»; so does a
 * shared stem, «Κατερίνα» / «Αικατερίνη») or, failing that, the father's name and the birth year both agree.
 */
export function samePerson(a: Identity, b: Identity): boolean {
	const [sa, sb] = [nameKey(a.surname), nameKey(b.surname)];
	if (!sa || !sb) return false;
	// A double surname («Κεφαλά - Φειδάκη») or a name typed into the surname cell («Ζαρρης Μιχαηλ»): one shared word.
	const wordsA = sa.split(" ").filter((w) => w.length >= 4);
	const wordsB = sb.split(" ").filter((w) => w.length >= 4);
	const sharedWord = wordsA.some((x) => wordsB.some((y) => x === y || levenshtein(x, y) <= 1));
	const surnameOk = sa === sb || sharedWord || levenshtein(sa, sb) <= 2 || levenshtein(greeklish(a.surname), greeklish(b.surname)) <= 2;
	if (!surnameOk) return false;
	const namesA = nameKey(a.name).split(" ").filter(Boolean).map(formalGivenName);
	const namesB = nameKey(b.name).split(" ").filter(Boolean).map(formalGivenName);
	if (!namesA.length || !namesB.length) return true;
	// One edit for short names (Ιωάννα ≠ Ιωάννης: siblings), two from 7 letters up.
	const close = (x: string, y: string) => {
		const tolerance = Math.min(x.length, y.length) >= 7 ? 2 : 1;
		return (
			x === y ||
			levenshtein(x, y) <= tolerance ||
			levenshtein(greeklish(x), greeklish(y)) <= tolerance ||
			(Math.min(x.length, y.length) >= 7 && (x.includes(y.slice(0, -1)) || y.includes(x.slice(0, -1))))
		);
	};
	if (namesA.some((x) => namesB.some((y) => close(x, y))) || close(namesA.join(""), namesB.join(""))) return true;
	// A given name that is not a name at all — the surname typed twice («Ταγαρά Ταγαρά») — is decided on father +
	// birth year. A real but different given name is a different person, even then: twins share both.
	const typo = (names: string[], surname: string) => names.every((n) => n === surname || n.length <= 2);
	if (!typo(namesA, sa) && !typo(namesB, sb)) return false;
	const fatherOk = !!a.father && !!b.father && formalGivenName(nameKey(a.father)) === formalGivenName(nameKey(b.father));
	return fatherOk && !!a.born && a.born === b.born;
}

/** A teacher's name as a matching key: no «π.», «Κων/νος» spelled out, word order ignored. */
export function teacherKey(value: Cell): string {
	const key = nameKey(cellText(value).replace(/Κων\/νος/gi, "Κωνσταντίνος"))
		.replace(/^π\s+|^πρωτοπρ\s+|^πατηρ\s+/, "")
		.trim();
	return key.split(" ").filter(Boolean).sort().join(" ");
}

/** Excel serial date (days since 1899-12-30) → epoch ms at noon UTC; anything else → null. */
export function excelDate(value: Cell): number | null {
	const serial = typeof value === "number" ? value : typeof value === "string" && /^\d{5}(\.\d+)?$/.test(value.trim()) ? Number(value) : NaN;
	if (!Number.isFinite(serial) || serial < 30000 || serial > 60000) return null;
	return Math.round((serial - 25569) * 86400000) + 12 * 3600000;
}

/** A 4-digit birth year (1900 … this year) or null. */
export function birthYear(value: Cell): number | null {
	const match = String(value ?? "").match(/\b(19\d{2}|20\d{2})\b/);
	if (!match) return null;
	const year = Number(match[1]);
	return year <= new Date().getUTCFullYear() ? year : null;
}

/** 1 September of a school year's first calendar year, noon UTC — the date of an enrollment the sheets do not date. */
export function schoolYearStart(year: string): number {
	return Date.UTC(Number(year.slice(0, 4)), 8, 1, 12);
}

/**
 * The register's phone cell, which sometimes holds two numbers run together («69820288726982028872»): the first
 * mobile (69…) and the first landline (2…), as 10-digit strings.
 */
export function splitPhones(value: Cell): { cellphone: string; telephone: string } {
	let digits = String(value ?? "").replace(/\D/g, "");
	if (digits.startsWith("0030")) digits = digits.slice(4);
	const numbers = digits.match(/69\d{8}|2\d{9}/g) ?? [];
	return { cellphone: numbers.find((n) => n.startsWith("69")) ?? "", telephone: numbers.find((n) => n.startsWith("2")) ?? "" };
}

/**
 * Free-text address → the pupil's address columns, best effort:
 * «Αδριανείου 11, Μεταμόρφωση» → road «Αδριανείου», number 11, region «Μεταμόρφωση»;
 * «Πρεβέζης 21,15121, Πεύκη» → … tk 15121. What does not fit stays in `road`, untouched.
 */
export function splitAddress(value: Cell): { road: string; number: number; tk: number; region: string } {
	let text = cellText(value);
	const empty = { road: "", number: 0, tk: 0, region: "" };
	if (!text) return empty;
	let tk = 0;
	const tkMatch = text.match(/(?:^|[\s,])(1\d{2})\s?(\d{2})(?=$|[\s,])/);
	if (tkMatch) {
		tk = Number(tkMatch[1] + tkMatch[2]);
		text = text.replace(tkMatch[0], tkMatch[0].startsWith(",") ? "," : " ");
	}
	const parts = text
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean);
	const first = parts.shift() ?? "";
	const roadMatch = first.match(/^(.*\D)\s+(\d{1,4})\s*[Α-Ωα-ωA-Za-z]?$/);
	const region = parts.join(", ");
	if (roadMatch) return { road: roadMatch[1].trim(), number: Number(roadMatch[2]), tk, region };
	return { road: first, number: 0, tk, region };
}

/** Greek given names ending in -α / -η / -ω (with or without accent) are female; the rest male. */
export function genderFromGivenName(name: string): "M" | "F" {
	const key = nameKey(name);
	return /[αηω]$/.test(key) ? "F" : "M";
}

export { parseAm };
