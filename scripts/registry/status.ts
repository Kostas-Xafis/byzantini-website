/**
 * «Διέκοψε» and «Μετεγγραφή» from the school's Excel register (scripts/registryStatus.ts runs it): which pupils
 * stopped, which came by transfer, and the secretariat's «Μεταγραφή» review notes that become the field. Pure: no IO,
 * no DB — unit-tested in tests/unit/registryStatus.test.ts.
 *
 * Where the register says it:
 *   «Γενικό Μητρώο», «Παρατηρήσεις»: «ΔΙΕΚΟΨΕ» → stopped after the pupil's last enrollment year.
 *   «Μαθητολόγιο <year>», «Παρατηρήσεις»: «Μετεγγραφή από <σχολή>» or «ΒΕΒΑΙΩΣΗ <ωδείο / σχολή>» → came that year from
 *     there (keyed by ΑΜ); in the ministry's 2025-2026 export (keyed by ΑΜΚΑ) «Μετεγγραφή», sometimes «ΑΠΟ 2023-24».
 */
import { normalizeKey } from "../../lib/pupils/normalize";
import { samePerson } from "./parse";

/** Uppercase without accents, one character for one: indexes found in it are indexes of the original text. */
export const fold = (text: string) => [...text].map((ch) => ch.normalize("NFD")[0]!.toUpperCase()).join("");

/** '2023-24' / '2023-2024' → '2023-2024'. */
export function fullSchoolYear(text: string): string | null {
	const match = text.match(/(\d{4})\s*-\s*(\d{2}|\d{4})\b/);
	if (!match) return null;
	const start = Number(match[1]);
	const end = match[2]!.length === 2 ? Math.floor(start / 100) * 100 + Number(match[2]) : Number(match[2]);
	return end === start + 1 ? `${start}-${end}` : null;
}

/** The school as written, without quotes or a leading «από»; an all-capitals name loses its accents («ΩΔΕΊΟ»). */
function cleanSchool(text: string): string {
	const school = text
		.replace(/["«»“”]/g, "")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/^(από|απο|ΑΠΟ|ΑΠΌ)\s+/, "");
	return school === school.toUpperCase() ? fold(school) : school;
}

/**
 * A «Παρατηρήσεις» cell that records a transfer: the school it names ('' when it names none) and, when the cell gives
 * one («ΑΠΟ 2023-24»), the year the transfer happened. Anything else → null («ΠΤΥΧΙΟ …», «ΒΕΒΑΙΩΣΗ 3», «Νέα Εγγραφή»).
 */
export function readTransferRemark(raw: string): { from: string; year: string | null } | null {
	const text = raw.replace(/\s+/g, " ").trim();
	const folded = fold(text);
	if (folded.includes("ΜΕΤΕΓΓΡΑΦ") || folded.includes("ΜΕΤΑΓΡΑΦ")) {
		const at = folded.search(/\sΑΠΟ\s/);
		const after = at < 0 ? "" : text.slice(at + 5).trim();
		const year = after ? fullSchoolYear(after) : null;
		return { from: year || !after ? "" : cleanSchool(after.replace(/[-\s\d]+$/, "")), year };
	}
	if (folded.startsWith("ΒΕΒΑΙΩΣΗ ")) {
		const school = cleanSchool(text.slice("ΒΕΒΑΙΩΣΗ ".length));
		return /ΩΔΕΙ|ΣΧΟΛ|ΨΑΛΤΙΚ/.test(fold(school)) ? { from: school, year: null } : null;
	}
	return null;
}

/** A «Σημείωση ελέγχου» part the secretariat typed for a transfer («Μεταγραφή», «Έκανε μεταγραφή!»). */
export function isTransferNote(part: string): boolean {
	const folded = fold(part)
		.replace(/[!.\s]+$/, "")
		.replace(/\s+/g, " ")
		.trim();
	return /^(ΕΚΑΝΕ )?ΜΕΤ(Α|Ε)Γ?ΓΡΑΦΗ$/.test(folded);
}

const NOTE_SEPARATOR = /\s*(?:·|;)\s*/;

export type StatusPupil = {
	id: number;
	am: number | null;
	last_name: string;
	first_name: string;
	amka: string;
	email: string;
	review_note: string;
	needs_review: boolean;
	stopped_year: string;
	transfer_year: string;
	transfer_from: string;
};
export type StatusEnrollment = { pupil_id: number; registration_year: string };

/** What the Excel says, read by the runner. */
export type ExcelMarks = {
	/** «ΔΙΕΚΟΨΕ» in the «Γενικό Μητρώο»: the ΑΜ and the register's name, to check it is still that person. */
	stopped: { am: number; surname: string; name: string; registeredYear: string | null }[];
	/** Transfer remarks of the yearly sheets: by ΑΜ (2015-2024) or by ΑΜΚΑ + «ΕΠΩΝΥΜΟ ΟΝΟΜΑ» (2025-2026). */
	transfers: { am?: number; amka?: string; fullName?: string; surname?: string; name?: string; sheetYear: string; from: string; year: string | null }[];
};

export type StatusPlan = {
	stopped: { pupilId: number; year: string }[];
	transfers: { pupilId: number; year: string; from: string; source: "excel" | "note" }[];
	/** Review notes without their «Μεταγραφή» part (and the flag that follows from the rest). */
	notes: { pupilId: number; review_note: string; needs_review: boolean }[];
	/** Marks not applied, with why (for the report). */
	skipped: string[];
	/** Already in the database as planned. */
	done: number;
};

const words = (text: string) => normalizeKey(text).split(" ").filter(Boolean).sort().join(" ");
const sameName = (p: Pick<StatusPupil, "last_name" | "first_name">, surname: string, name: string) =>
	words(`${p.last_name} ${p.first_name}`) === words(`${surname} ${name}`) || samePerson({ surname: p.last_name, name: p.first_name }, { surname, name });

export function planStatus(input: { marks: ExcelMarks; pupils: StatusPupil[]; enrollments: StatusEnrollment[]; currentYear: string }): StatusPlan {
	const { marks, pupils, enrollments, currentYear } = input;
	const plan: StatusPlan = { stopped: [], transfers: [], notes: [], skipped: [], done: 0 };
	const byAm = new Map(pupils.filter((p) => p.am !== null).map((p) => [p.am!, p]));
	const years = new Map<number, string[]>();
	for (const e of enrollments) years.set(e.pupil_id, [...(years.get(e.pupil_id) ?? []), e.registration_year]);
	const yearsOf = (id: number) => [...(years.get(id) ?? [])].sort();
	const label = (p: StatusPupil) => `ΑΜ ${p.am ?? "-"} ${p.last_name} ${p.first_name}`;

	// «Διέκοψε»: after the last year the pupil attended.
	for (const mark of marks.stopped) {
		const p = byAm.get(mark.am);
		if (!p || !sameName(p, mark.surname, mark.name)) {
			plan.skipped.push(`Διέκοψε: ΑΜ ${mark.am} (${mark.surname} ${mark.name}) δεν είναι το ίδιο άτομο στο Μαθητολόγιο`);
			continue;
		}
		// A pupil with no yearly row in the register (none in the database either) stopped in the year they registered.
		const last = yearsOf(p.id).at(-1) ?? mark.registeredYear;
		if (!last) {
			plan.skipped.push(`Διέκοψε: ${label(p)} δεν έχει καμία εγγραφή ούτε ημερομηνία εγγραφής`);
			continue;
		}
		if (last >= currentYear) {
			plan.skipped.push(`Διέκοψε: ${label(p)} έχει εγγραφή το ${last} (ξαναγράφτηκε ή διέκοψε φέτος: ελέγξτε)`);
			continue;
		}
		if (p.stopped_year === last) plan.done++;
		else if (p.stopped_year) plan.skipped.push(`Διέκοψε: ${label(p)} έχει ήδη «διέκοψε μετά το ${p.stopped_year}» (το Excel λέει ${last})`);
		else plan.stopped.push({ pupilId: p.id, year: last });
	}

	// «Μετεγγραφή» from the Excel: the earliest year it is written, the school where one is named.
	const found = new Map<number, { year: string; from: string; source: "excel" | "note" }>();
	for (const mark of marks.transfers) {
		let p: StatusPupil | undefined;
		if (mark.am !== undefined) {
			p = byAm.get(mark.am);
			if (p && mark.surname && !sameName(p, mark.surname, mark.name ?? "")) p = undefined;
		} else {
			const candidates = mark.amka ? pupils.filter((x) => x.amka === mark.amka) : [];
			const named = (list: StatusPupil[]) => list.filter((x) => words(`${x.last_name} ${x.first_name}`) === words(mark.fullName ?? ""));
			const byName =
				candidates.length === 1 ? candidates : named(candidates.length ? candidates : pupils.filter((x) => yearsOf(x.id).includes(mark.sheetYear)));
			p = byName.length === 1 ? byName[0] : undefined;
		}
		const who = mark.am !== undefined ? `ΑΜ ${mark.am}` : (mark.fullName ?? "-");
		if (!p) {
			plan.skipped.push(
				`Μετεγγραφή ${mark.sheetYear}: ${who} (${mark.surname ?? ""} ${mark.name ?? ""}) δεν βρέθηκε στο Μαθητολόγιο`.replace(/ \( \)/, ""),
			);
			continue;
		}
		// The year of the sheet: when they came here. A year in the remark («ΑΠΟ 2023-24») is when they started at the
		// other school (their first enrollment here is the sheet's year).
		const year = mark.sheetYear;
		const seen = found.get(p.id);
		if (!seen || year < seen.year) found.set(p.id, { year, from: mark.from || seen?.from || "", source: "excel" });
		else if (!seen.from && mark.from) seen.from = mark.from;
	}

	// The secretariat's «Μεταγραφή» notes: the transfer of the pupil's first year, unless the Excel says more.
	for (const p of pupils) {
		const parts = p.review_note.split(NOTE_SEPARATOR).filter(Boolean);
		if (!parts.some(isTransferNote)) continue;
		const rest = parts.filter((part) => !isTransferNote(part)).join(" · ");
		plan.notes.push({ pupilId: p.id, review_note: rest, needs_review: p.am === null || rest !== "" });
		if (!found.has(p.id)) {
			const first = yearsOf(p.id)[0];
			if (first) found.set(p.id, { year: first, from: "", source: "note" });
			else plan.skipped.push(`Μεταγραφή (σημείωση): ${label(p)} δεν έχει καμία εγγραφή`);
		}
	}

	for (const [pupilId, t] of found) {
		const p = pupils.find((x) => x.id === pupilId)!;
		if (p.transfer_year === t.year && (p.transfer_from === t.from || !t.from)) plan.done++;
		else if (p.transfer_year && p.transfer_year !== t.year)
			plan.skipped.push(`Μετεγγραφή: ${label(p)} έχει ήδη ${p.transfer_year} (το Excel λέει ${t.year})`);
		else plan.transfers.push({ pupilId, year: t.year, from: t.from || p.transfer_from, source: t.source });
	}
	plan.transfers.sort((a, b) => a.year.localeCompare(b.year) || a.pupilId - b.pupilId);
	plan.stopped.sort((a, b) => a.year.localeCompare(b.year) || a.pupilId - b.pupilId);
	return plan;
}
