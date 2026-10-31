/**
 * Μαθητολόγιο search — pure ranking, no DB, no env (unit-tested in tests/unit).
 *
 * The secretaries pick the field to search (ΑΜ by default) and the query is matched
 * against that field only:
 *
 *   am          the ΑΜ (exact first, then prefix, in registry order), the ΑΜ a split
 *               row came from, the review codes ('000-Ο1'; typed with a Latin O / S too).
 *   name        a prefix of a word of the surname or the first name,
 *               accent/case-insensitive ('παπαδ' → 'Παπαδόπουλος'). Every word
 *               must match, in any order ('Αικατερίνη Πελέκη' = 'Πελέκη Αικ').
 *   amka        the ΑΜΚΑ (exact first, then prefix).
 *   phone       the digits anywhere in the landline or the mobile ('349 0962'; a
 *               +30 / 0030 country code in front of a 10-digit number is dropped).
 *   email       part of the email, case-insensitive.
 *   teacher     a pupil who ever had a teacher whose name matches like `name`; a name
 *               typed in full (a picked suggestion) matches only that name.
 *   instrument  the same with the instrument's name ('Λαούτο' ≠ 'Πολίτικο Λαούτο').
 *   music_type  a pupil who ever enrolled in that music type (query '0' | '1' | '2').
 *
 * Names and queries are split into words the same way — on anything that is not a letter or a
 * digit — so a title ('π. Θεόδωρος'), a nickname in brackets ('(Κακλής)'), a ' - ' or a
 * hyphenated surname ('Γεωργίου-Ελένη') read the same whichever way they are typed.
 *
 * The enrollment fields (teacher / instrument / music_type) are filtered by the caller
 * (`enrolledPupilIds`, the route's music-type filter); `rankPupils` only orders those.
 */
import { normalizeDigits, normalizeKey } from "./normalize";

export const PUPIL_SEARCH_FIELDS = ["am", "name", "amka", "phone", "email", "teacher", "music_type", "instrument"] as const;
export type PupilSearchField = (typeof PUPIL_SEARCH_FIELDS)[number];

export type SearchablePupil = {
	am: number | null;
	orphan_code: string;
	split_from_am: number | null;
	last_name: string;
	first_name: string;
	amka: string;
	telephone: string;
	cellphone: string;
	email: string;
};

export type SearchableEnrollment = { pupil_id: number; teacher_id: number; instrument_id: number };

/** The normalised words of a name or a query: letters and digits only ('π. Θεόδωρος' → ['π', 'θεοδωροσ']). */
const nameWords = (value: string) =>
	normalizeKey(value)
		.split(/[^\p{L}\p{N}]+/u)
		.filter(Boolean);

/** Query tokens, split and normalised exactly like the names they are compared with. */
export function tokenizeQuery(query: string): string[] {
	return nameWords(query);
}

/** Same words, any order ('Ραμπαούνης Λεωνίδας' = 'Λεωνίδας Ραμπαούνης'). */
const sameWords = (value: string, tokens: string[]) => {
	const words = nameWords(value);
	return words.length === tokens.length && words.sort().join(" ") === [...tokens].sort().join(" ");
};

/** Every token is the start of some word of `value` (any order). */
export function matchesWords(value: string, tokens: string[]): boolean {
	const words = nameWords(value);
	return tokens.every((token) => words.some((word) => word.startsWith(token)));
}

/**
 * ΑΜ field: the whole query is one key ('706', '000-ο1'). The review codes use Greek Ο / Σ, so a Latin o / s
 * (the same keys on a Latin layout) reads as them.
 */
const amKey = (query: string) => normalizeKey(query).replace(/\s+/g, "").replace(/o/g, "ο").replace(/s/g, "σ");

function scoreAm(pupil: SearchablePupil, key: string): number {
	let best = 0;
	if (pupil.orphan_code && normalizeKey(pupil.orphan_code).startsWith(key)) best = 70;
	if (!/^\d+$/.test(key)) return best;
	const am = pupil.am === null ? "" : String(pupil.am);
	if (am === key) return 100;
	if (pupil.split_from_am !== null && String(pupil.split_from_am) === key) best = Math.max(best, 75);
	if (am.startsWith(key)) best = Math.max(best, 60);
	return best;
}

/** Best score of one name token against one pupil; 0 = no match. */
function scoreNameToken(token: string, last: string[], first: string[]): number {
	let best = 0;
	if (last[0]?.startsWith(token)) best = 50;
	else if (last.some((word) => word.startsWith(token))) best = 40;
	if (first.some((word) => word.startsWith(token))) best = Math.max(best, 30);
	return best;
}

/**
 * Name relevance: 0 when any token matches nothing, otherwise the sum of the tokens' scores, with a
 * bonus when the query reads as the start of «Επώνυμο Όνομα» (or «Όνομα Επώνυμο»).
 */
export function scoreName(pupil: SearchablePupil, tokens: string[]): number {
	if (tokens.length === 0) return 1;
	const last = nameWords(pupil.last_name);
	const first = nameWords(pupil.first_name);
	let score = 0;
	for (const token of tokens) {
		const tokenScore = scoreNameToken(token, last, first);
		if (tokenScore === 0) return 0;
		score += tokenScore;
	}
	const phrase = tokens.join(" ");
	if ([...last, ...first].join(" ").startsWith(phrase)) score += 20;
	else if ([...first, ...last].join(" ").startsWith(phrase)) score += 5;
	return score;
}

/** Relevance of a pupil for a non-empty query on one field; 0 = no match. Enrollment fields always match. */
export function scorePupil(pupil: SearchablePupil, query: string, field: PupilSearchField): number {
	switch (field) {
		case "am":
			return scoreAm(pupil, amKey(query));
		case "name":
			return scoreName(pupil, tokenizeQuery(query));
		case "amka": {
			const digits = normalizeDigits(query);
			if (!digits) return 0;
			return pupil.amka === digits ? 100 : pupil.amka.startsWith(digits) ? 60 : 0;
		}
		case "phone": {
			const digits = normalizeDigits(query).replace(/^(?:00)?30(?=\d{10}$)/, "");
			if (!digits) return 0;
			return [pupil.telephone, pupil.cellphone].some((phone) => normalizeDigits(phone).includes(digits)) ? 1 : 0;
		}
		case "email": {
			const text = query.trim().toLowerCase();
			return pupil.email.toLowerCase().includes(text) ? 1 : 0;
		}
		case "teacher":
		case "instrument":
		case "music_type":
			return 1;
	}
}

/**
 * Pupils enrolled (any year) with a teacher / in an instrument whose name matches the query, or `null`
 * when the query is empty (no filter). A query that IS a whole name (any word order) keeps to that name:
 * picking 'Λαούτο' from the suggestions must not bring in 'Πολίτικο Λαούτο'.
 */
export function enrolledPupilIds(
	field: "teacher" | "instrument",
	query: string,
	enrollments: SearchableEnrollment[],
	names: { id: number; name: string }[],
): Set<number> | null {
	const tokens = tokenizeQuery(query);
	if (tokens.length === 0) return null;
	const exact = names.filter((entry) => sameWords(entry.name, tokens));
	const matched = exact.length ? exact : names.filter((entry) => matchesWords(entry.name, tokens));
	const ids = new Set(matched.map((entry) => entry.id));
	const key = field === "teacher" ? "teacher_id" : "instrument_id";
	return new Set(enrollments.filter((enrollment) => ids.has(enrollment[key])).map((enrollment) => enrollment.pupil_id));
}

/** The matching pupils, best first; ties (and an empty query) in alphabetical order. */
export function rankPupils<T extends SearchablePupil>(pupils: T[], query: string, field: PupilSearchField = "am"): T[] {
	const byName = (a: T, b: T) => a.last_name.localeCompare(b.last_name, "el") || a.first_name.localeCompare(b.first_name, "el");
	if (!query.trim()) return [...pupils].sort(byName);
	// An ΑΜ prefix ('69') reads best in registry order: 69, 690, 691, …
	const byAm = (a: T, b: T) => (field === "am" ? (a.am ?? Number.MAX_SAFE_INTEGER) - (b.am ?? Number.MAX_SAFE_INTEGER) : 0);
	return pupils
		.map((pupil) => ({ pupil, score: scorePupil(pupil, query, field) }))
		.filter((entry) => entry.score > 0)
		.sort((a, b) => b.score - a.score || byAm(a.pupil, b.pupil) || byName(a.pupil, b.pupil))
		.map((entry) => entry.pupil);
}
