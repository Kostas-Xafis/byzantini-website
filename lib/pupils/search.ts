/**
 * Μαθητολόγιο search — pure ranking, no DB, no env (unit-tested in tests/unit).
 *
 * The secretaries look pupils up by ΑΜ or by name, so only those fields take part:
 *
 *   digits      the ΑΜ (exact first, then prefix), the ΑΜ a split row came from,
 *               an exact 11-digit ΑΜΚΑ, the review codes ('000-Ο1').
 *   words       a prefix of a word of the surname or the first name,
 *               accent/case-insensitive ('παπαδ' → 'Παπαδόπουλος'). Every word
 *               must match, in any order ('Αικατερίνη Πελέκη' = 'Πελέκη Αικ').
 *
 * Contact details, father's name or region no longer match: a phone fragment
 * or a common father's name pulled in dozens of unrelated pupils.
 */
import { normalizeKey } from "./normalize";

export type SearchablePupil = {
	am: number | null;
	orphan_code: string;
	split_from_am: number | null;
	last_name: string;
	first_name: string;
	amka: string;
};

const AMKA_DIGITS = 11;

/** Query tokens, normalised like the names they are compared with. */
export function tokenizeQuery(query: string): string[] {
	return normalizeKey(query).split(" ").filter(Boolean);
}

const nameWords = (value: string) =>
	normalizeKey(value)
		.split(/[\s\-,.]+/)
		.filter(Boolean);

/** Best score of one token against one pupil; 0 = no match. */
function scoreToken(token: string, pupil: SearchablePupil, last: string[], first: string[]): number {
	let best = 0;
	if (pupil.orphan_code && normalizeKey(pupil.orphan_code).startsWith(token)) best = 70;

	if (/^\d+$/.test(token)) {
		const am = pupil.am === null ? "" : String(pupil.am);
		if (am === token) return 100;
		if (token.length === AMKA_DIGITS && pupil.amka === token) return 95;
		if (pupil.split_from_am !== null && String(pupil.split_from_am) === token) best = Math.max(best, 75);
		if (am.startsWith(token)) best = Math.max(best, 60);
		return best;
	}

	if (last[0]?.startsWith(token)) best = Math.max(best, 50);
	else if (last.some((word) => word.startsWith(token))) best = Math.max(best, 40);
	if (first.some((word) => word.startsWith(token))) best = Math.max(best, 30);
	return best;
}

/**
 * Relevance of a pupil for the query tokens: 0 when any token matches nothing, otherwise the sum of the
 * tokens' scores, with a bonus when the query reads as the start of «Επώνυμο Όνομα» (or «Όνομα Επώνυμο»).
 */
export function scorePupil(pupil: SearchablePupil, tokens: string[]): number {
	if (tokens.length === 0) return 1;
	const last = nameWords(pupil.last_name);
	const first = nameWords(pupil.first_name);
	let score = 0;
	for (const token of tokens) {
		const tokenScore = scoreToken(token, pupil, last, first);
		if (tokenScore === 0) return 0;
		score += tokenScore;
	}
	const phrase = tokens.join(" ");
	if ([...last, ...first].join(" ").startsWith(phrase)) score += 20;
	else if ([...first, ...last].join(" ").startsWith(phrase)) score += 5;
	return score;
}

/** The matching pupils, best first; ties (and an empty query) in alphabetical order. */
export function rankPupils<T extends SearchablePupil>(pupils: T[], query: string): T[] {
	const tokens = tokenizeQuery(query);
	const byName = (a: T, b: T) => a.last_name.localeCompare(b.last_name, "el") || a.first_name.localeCompare(b.first_name, "el");
	if (tokens.length === 0) return [...pupils].sort(byName);
	// An ΑΜ prefix ('69') reads best in registry order: 69, 690, 691, …
	const numeric = tokens.every((token) => /^\d+$/.test(token));
	const byAm = (a: T, b: T) => (numeric ? (a.am ?? Number.MAX_SAFE_INTEGER) - (b.am ?? Number.MAX_SAFE_INTEGER) : 0);
	return pupils
		.map((pupil) => ({ pupil, score: scorePupil(pupil, tokens) }))
		.filter((entry) => entry.score > 0)
		.sort((a, b) => b.score - a.score || byAm(a.pupil, b.pupil) || byName(a.pupil, b.pupil))
		.map((entry) => entry.pupil);
}
