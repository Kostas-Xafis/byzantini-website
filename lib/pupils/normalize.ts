/**
 * Pupil data normalization — pure functions, no DB, no env.
 *
 * Used by the pupil routes (lib/api/routes/pupils.ts) to parse the ΑΜ and to
 * compare names/phones when the public form identifies a pupil. The rules come
 * from what the legacy register actually held (docs/PUPILS_MIGRATION.md §2):
 *
 *   ΑΜ            '706', '1287   ', '761 ', '΄1158', '000', '000 - Αναμονή',
 *                 '999 - Αναμονή', '3592307', 'ΛΑΘΟΣ 1085'
 *   names         'Ψύλλιας' / 'Ψυλλιας', 'ΔΑΛΙΑΝΗΣ ΝΙΚΟΛΑΟΣ'
 *   phones        '6973490962', '+30 697 349 0962', '-'
 *
 * Everything here is deterministic and side-effect free so it can be unit-tested
 * exhaustively.
 */

/** ΑΜ must be at most 4 digits to be a plausible registry number. */
const AM_MAX_DIGITS = 4;

/** Marks the ΑΜ the public form uses for a brand-new pupil. */
const NEW_PUPIL_AM = 0;

/** Placeholder phone value written by the legacy form. */
const EMPTY_PHONE = "-";

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/**
 * Greek diacritics are stored decomposed (NFD) in the data, so both the
 * precomposed range and the combining-marks range must be removed. Casing and
 * the final-sigma distinction are intentionally left alone — `normalizeKey`
 * folds those, because doing it here would make the output unusable as display
 * text ('Ψύλλιας' must not become 'Ψυλλιασ').
 */
export function stripDiacritics(value: string): string {
	return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Collapses every whitespace run (including NBSP) and trims. */
export function collapseWhitespace(value: string): string {
	return value.replace(/[\s\u00a0\u200b]+/g, " ").trim();
}

/**
 * Display normalization: trims, collapses whitespace, keeps the original
 * casing and accents. `'Δαλιάνης  Νικόλαος '` → `'Δαλιάνης Νικόλαος'`.
 */
export function normalizeText(value: string | null | undefined): string {
	if (value === null || value === undefined) return "";
	return collapseWhitespace(String(value));
}

/**
 * Comparison key: accent-, case- and whitespace-insensitive, with the Greek
 * final sigma folded to σ so 'ΠΑΛΑΙΟΛΟΓΟΣ' and 'Παλαιολόγος' compare equal.
 * `'ΓΕΩΡΓΙΟΥ  Σωτήριος - Ταξιάρχης'` → `'γεωργιου σωτηριος - ταξιαρχης'`.
 */
export function normalizeKey(value: string | null | undefined): string {
	return stripDiacritics(normalizeText(value))
		.toLowerCase()
		.replace(/\u03c2/g, "\u03c3");
}

/** Digits only; `'697 349-0962'` → `'6973490962'`. */
export function normalizeDigits(value: string | null | undefined): string {
	if (!value) return "";
	return String(value).replace(/\D/g, "");
}

/**
 * Phone comparison key: digits only, with the Greek country code
 * and legacy placeholder removed. Returns "" when there is no usable number, so
 * callers never match on a shared placeholder like '-'.
 */
export function normalizePhone(value: string | null | undefined): string {
	const text = normalizeText(value);
	if (text === "" || text === EMPTY_PHONE) return "";
	let digits = normalizeDigits(text);
	if (digits.startsWith("0030")) digits = digits.slice(4);
	else if (digits.startsWith("30") && digits.length > 10) digits = digits.slice(2);
	return digits.length >= 8 ? digits : "";
}

// ---------------------------------------------------------------------------
// ΑΜ parsing
// ---------------------------------------------------------------------------

export type AmKind =
	/** A plausible registry number. */
	| "valid"
	/** The form's "new pupil" placeholder: 000, '000 - Αναμονή', '999 - Αναμονή'. */
	| "orphan"
	/** No digits at all, or a value the school must look at by hand. */
	| "invalid";

export interface ParsedAm {
	/** The number when kind === "valid", otherwise null. */
	am: number | null;
	kind: AmKind;
	/** Normalized digits, even for orphans/invalids ('000' → '000'). */
	digits: string;
	/** Machine-readable reason, for error messages and review notes. */
	reason: "ok" | "zero" | "waiting" | "non_numeric" | "too_long" | "empty" | "note";
	/** The raw value as it appeared, for the review note. */
	raw: string;
}

const WAITING_RE = /αναμον/i;

/** Any letter makes the value a note rather than a registry number (see parseAm). */
const LETTER_RE = /\p{L}/u;

/**
 * Parses the ΑΜ exactly as the legacy data presents it:
 *
 *   '706'          → valid 706
 *   '1287   '      → valid 1287   (trailing spaces)
 *   '΄1158'        → valid 1158   (Greek keraia prefix)
 *   '000'          → orphan       (new-pupil placeholder)
 *   '000 - Αναμονή'→ orphan       (explicit waiting marker)
 *   '999 - Αναμονή'→ orphan
 *   '3592307'      → invalid      (7 digits — too long, needs review)
 *   'abc'          → invalid
 *   'ΛΑΘΟΣ 1085'   → invalid      (a secretary's NOTE, see below)
 *   'ΔΕΝ ΕΧΕΙ ΑΜΚΑ'→ invalid
 *
 * Digits are extracted from anywhere in the value, so the keraia and any other
 * decoration cannot change the number itself.
 *
 * A value that contains LETTERS, however, is a note rather than a registry
 * number — the secretaries mark rows they could not resolve ('ΛΑΘΟΣ …',
 * 'ΔΕΝ ΕΧΕΙ …'). Those must never be mined for a number: taking the 1085 out of
 * 'ΛΑΘΟΣ 1085' would hand the pupil a real-looking ΑΜ, and silently hide the row
 * from the review list. They stay invalid (with the raw text kept for the
 * review note) and their `digits` are dropped so the orphan code lands in
 * the ordinary 000-Ο<n> family instead of mimicking an ΑΜ.
 */
export function parseAm(value: string | number | null | undefined): ParsedAm {
	const raw = value === null || value === undefined ? "" : String(value);
	const trimmed = normalizeText(raw);

	if (trimmed === "") return { am: null, kind: "invalid", digits: "", reason: "empty", raw };

	// Extract the first digit run; keep its leading zeros for the reason.
	const match = trimmed.match(/\d+/);
	if (!match) return { am: null, kind: "invalid", digits: "", reason: "non_numeric", raw };

	const digits = match[0];
	const numeric = Number(digits);

	if (WAITING_RE.test(trimmed)) {
		return { am: null, kind: "orphan", digits, reason: "waiting", raw };
	}
	if (LETTER_RE.test(trimmed)) {
		return { am: null, kind: "invalid", digits: "", reason: "note", raw };
	}
	if (numeric === NEW_PUPIL_AM) {
		return { am: null, kind: "orphan", digits, reason: "zero", raw };
	}
	if (digits.length > AM_MAX_DIGITS) {
		return { am: null, kind: "invalid", digits, reason: "too_long", raw };
	}
	return { am: numeric, kind: "valid", digits, reason: "ok", raw };
}
