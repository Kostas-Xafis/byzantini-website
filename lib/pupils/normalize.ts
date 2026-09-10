/**
 * Pupil data normalization — pure functions, no DB, no env.
 *
 * These rules exist because of what is actually in `registrations` (measured
 * on the 1514-row local snapshot, see docs/PUPILS_MIGRATION.md §2):
 *
 *   ΑΜ            '706', '1287   ', '761 ', '΄1158', '000', '000 - Αναμονή',
 *                 '999 - Αναμονή', '3592307', '200488938'
 *   names         'Ψύλλιας' / 'Ψυλλιας', 'Γεωργίου Σωτήρης -Ταξιάρχης' /
 *                 'Γεωργίου  Σωτήριος - Ταξιάρχης', 'ΔΑΛΙΑΝΗΣ ΝΙΚΟΛΑΟΣ'
 *   class_year    'Α' Ετος' / 'Α΄ έτος' / 'Α'  Έτος Διλώματος' / 'undefined'
 *   amka          '' (not collected in earlier years), '00000000000' (fake)
 *   phones        '6973490962', '+30 697 349 0962', '-'
 *
 * Everything here is deterministic and side-effect free so the backfill script
 * (scripts/migratePupils.ts) can be unit-tested exhaustively.
 */

/** ΑΜ must be 1–4 digits to be a plausible registry number. */
export const AM_MIN_DIGITS = 1;
export const AM_MAX_DIGITS = 4;

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
 * Phone key for identity clustering: digits only, with the Greek country code
 * and legacy placeholder removed. Returns "" when there is no usable number, so
 * callers never cluster on a shared placeholder like '-'.
 */
export function normalizePhone(value: string | null | undefined): string {
	const text = normalizeText(value);
	if (text === "" || text === EMPTY_PHONE) return "";
	let digits = normalizeDigits(text);
	if (digits.startsWith("0030")) digits = digits.slice(4);
	else if (digits.startsWith("30") && digits.length > 10) digits = digits.slice(2);
	return digits.length >= 8 ? digits : "";
}

/** Lower-cased, trimmed email; "" when absent. */
export function normalizeEmail(value: string | null | undefined): string {
	const text = normalizeText(value).toLowerCase();
	return text.includes("@") ? text : "";
}

/**
 * ΑΜΚΑ is an 11-digit number. The data contains '' (not collected) and the fake
 * '00000000000', both of which mean "unknown" rather than a value.
 */
export function normalizeAmka(value: string | null | undefined): string {
	const digits = normalizeDigits(value);
	if (digits === "" || /^0+$/.test(digits)) return "";
	return digits;
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
	/** Machine-readable reason, useful for the backfill report. */
	reason: "ok" | "zero" | "waiting" | "non_numeric" | "too_long" | "empty";
	/** The raw value as it appeared, for the report. */
	raw: string;
}

const WAITING_RE = /αναμον/i;

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
 *
 * Digits are extracted from anywhere in the value, so the keraia and any other
 * decoration cannot change the number itself.
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
	if (numeric === NEW_PUPIL_AM) {
		return { am: null, kind: "orphan", digits, reason: "zero", raw };
	}
	if (digits.length > AM_MAX_DIGITS) {
		return { am: null, kind: "invalid", digits, reason: "too_long", raw };
	}
	return { am: numeric, kind: "valid", digits, reason: "ok", raw };
}

// ---------------------------------------------------------------------------
// Person identity
// ---------------------------------------------------------------------------

export type PersonKeyType = "amka" | "cellphone" | "telephone" | "email";

export interface PersonKey {
	type: PersonKeyType;
	value: string;
}

export interface PersonLike {
	first_name?: string | null;
	last_name?: string | null;
	fathers_name?: string | null;
	amka?: string | null;
	cellphone?: string | null;
	telephone?: string | null;
	email?: string | null;
}

/**
 * Stable name key used to tell "same person, different spelling" from "two
 * people sharing an ΑΜ". Returns "" when there is no name to compare.
 */
export function personNameKey(person: PersonLike): string {
	return normalizeKey(`${person.last_name ?? ""} ${person.first_name ?? ""}`);
}

/**
 * Proof-of-identity keys, most trustworthy first. Two rows that share any of
 * these are the same person even if the name is spelled differently.
 *
 * `telephone` is deliberately weaker than `cellphone` (landlines are shared by
 * families) and is only returned when no cellphone exists.
 */
export function personIdentityKeys(person: PersonLike): PersonKey[] {
	const keys: PersonKey[] = [];
	const amka = normalizeAmka(person.amka);
	if (amka) keys.push({ type: "amka", value: amka });

	const cellphone = normalizePhone(person.cellphone);
	if (cellphone) keys.push({ type: "cellphone", value: cellphone });

	if (!cellphone) {
		const telephone = normalizePhone(person.telephone);
		if (telephone) keys.push({ type: "telephone", value: telephone });
	}

	const email = normalizeEmail(person.email);
	if (email) keys.push({ type: "email", value: email });

	return keys;
}

// ---------------------------------------------------------------------------
// Class year
// ---------------------------------------------------------------------------

/**
 * Canonical class years, mirroring lib/classYears.ts. Order matters: the first
 * entry a folded input matches wins, so more specific values must come first
 * ("Α' Ετος Διπλώματος" before "Α' Ετος").
 */
const CANONICAL_CLASS_YEARS = [
	"Υπό Κατάταξη",
	"Α' Προκαταρκτική",
	"Α' Ετος Διπλώματος",
	"Β' Ετος Διπλώματος",
	"Α' Διπλώματος",
	"Β' Διπλώματος",
	"Α' Κατωτέρα",
	"Β' Κατωτέρα",
	"Α' Μέση",
	"Β' Μέση",
	"Γ' Μέση",
	"Α' Ανωτέρα",
	"Β' Ανωτέρα",
	"Α' Ετος",
	"Β' Ετος",
	"Γ' Ετος",
	"Δ' Ετος",
	"Ε' Ετος",
] as const;

export type CanonicalClassYear = (typeof CANONICAL_CLASS_YEARS)[number];

/** Comparison key for class years: apostrophes/keraia/spaces/accents folded. */
function classYearKey(value: string): string {
	return normalizeKey(value)
		.replace(/[’'΄`´]/g, "")
		.replace(/-/g, " ")
		.replace(/\./g, "")
		.replace(/\s+/g, " ");
}

const CLASS_YEAR_BY_KEY = new Map<string, CanonicalClassYear>();
for (const canonical of CANONICAL_CLASS_YEARS) {
	CLASS_YEAR_BY_KEY.set(classYearKey(canonical), canonical);
}
// Extra spellings seen in the data that do not fold onto a canonical key.
CLASS_YEAR_BY_KEY.set(classYearKey("Προκαταρκτική"), "Α' Προκαταρκτική");

/** Canonical keys sorted longest-first so prefix matching is unambiguous. */
const CLASS_YEAR_KEYS_BY_LENGTH = [...CLASS_YEAR_BY_KEY.entries()].sort((a, b) => b[0].length - a[0].length);

/**
 * Maps the 26 observed spellings onto the canonical list.
 * Returns "" for missing/'undefined' values so the caller can flag them instead
 * of inventing a year.
 */
export function canonicalClassYear(value: string | null | undefined): CanonicalClassYear | "" {
	const text = normalizeText(value);
	if (text === "" || normalizeKey(text) === "undefined" || normalizeKey(text) === "null") return "";
	const key = classYearKey(text);
	const exact = CLASS_YEAR_BY_KEY.get(key);
	if (exact) return exact;
	// Last resort: the value starts with a canonical year plus more words
	// (e.g. a stray suffix). Word-boundary guarded so 'undefined' cannot match
	// 'υπο καταταξη'.
	for (const [candidateKey, canonical] of CLASS_YEAR_KEYS_BY_LENGTH) {
		if (key === candidateKey || key.startsWith(`${candidateKey} `)) return canonical;
	}
	return "";
}

/** True when the raw value is absent or the literal 'undefined'/'null'. */
export function isMissingClassYear(value: string | null | undefined): boolean {
	const key = normalizeKey(value);
	return key === "" || key === "undefined" || key === "null";
}

/** True when the raw value needs a human to fix it. */
export function needsClassYearReview(value: string | null | undefined): boolean {
	return !isMissingClassYear(value) && canonicalClassYear(value) === "";
}
