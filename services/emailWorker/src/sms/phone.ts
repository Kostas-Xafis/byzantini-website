/**
 * Greek phone normalisation for SMS — the single funnel between the dirty
 * `TEXT` columns in D1 and Bird's API, which accepts strict E.164 only
 * (`+306912345678`) and rejects the whole request otherwise.
 *
 * The values were hand-entered over many years: `pupils.cellphone` and
 * `pupils.telephone` are `TEXT` (`telephone` defaults to the literal `"-"` for
 * "unknown"), `teachers.telephone` is a nullable `varchar(80)`, and the rows mix
 * `69…` mobiles with `2…` landlines (`2102850060`), sometimes already carrying a
 * `+30`, `0030` or `30` prefix, separated by whatever was on the keyboard —
 * spaces (including non-breaking), dashes, dots, parentheses, slashes — with the
 * occasional `εσ. 12` extension appended.
 *
 * Two rules shape everything below:
 *
 * - **Reject, never guess.** A wrong number is a real SMS to a stranger, so a
 *   value that is not provably a Greek number returns `null` and the caller
 *   skips the row. That is also why a leading `+` is authoritative: `+30`
 *   already states the country code, and "repairing" it a second time is how a
 *   Greek number silently turns into somebody else's.
 * - **Never throw.** One batch runs over thousands of dirty rows, so `null` is a
 *   result; an exception would abort the campaign. Nothing here can throw.
 *
 * Log through `maskPhone`, never the raw value: these are pupils' and teachers'
 * personal numbers, and the campaign keeps its logs on disk.
 */

/**
 * Cells that mean "we have no number" rather than a number. `pupils.telephone`
 * defaults to `"-"`, and the rest are what years of hand entry produced.
 * Compared against the trimmed raw cell, before stripping could turn `"-"` into
 * an empty string and lose what the row actually said.
 */
const MISSING_VALUES = new Set(["-", "--", "0", "0000000000", "n/a", "null", "undefined", "none", "καμία"]);

/**
 * The leading run of a cell that can still belong to a single number: digits, a
 * `+`, and the separators people type — whitespace (including non-breaking
 * space), every dash from hyphen through em dash, the minus sign, dots,
 * parentheses and slashes.
 *
 * Anything else ends the number, which is what makes `6912345678 εσ. 12` work:
 * the run stops at `ε` and the extension is ignored. It is also why
 * `abc6983380631` stays unparsed — a run that does not start at the first
 * character is not a number we are willing to dial.
 */
const LEADING_NUMBER_RUN = /^[\s\u00A0\u2010-\u2015\u2212.\-()\/+0-9]*/;

/** Greek country calling code, without the `+`. */
const COUNTRY_CODE = "30";

/**
 * A national number is always 10 digits, of which `maskPhone` shows the first
 * two and the last three — so exactly five are hidden, every time.
 */
const NATIONAL_MASK = "*****";

/**
 * The 10-digit national part of a cell, or `null` when the cell does not hold a
 * Greek number. Shape only: `isUsableGreekNational` adds the plausibility rules
 * on top, so `maskPhone` can still render a value that is worth logging even
 * when it is not worth dialling.
 */
function nationalPart(raw: string | null | undefined): string | null {
	// Runs over raw D1 rows, so the declared type is a promise, not a fact.
	if (typeof raw !== "string") return null;

	const text = raw.trim();
	if (text === "" || MISSING_VALUES.has(text.toLowerCase())) return null;

	const run = LEADING_NUMBER_RUN.exec(text)?.[0] ?? "";
	const cleaned = keepLeadingPlus(run);
	if (cleaned === "" || cleaned === "+") return null;

	// A leading `+` is a promise about the country code: trust it, and accept the
	// one Greek form it can mean. It is deliberately never stripped first — a
	// `+30` that loses its `30` and then gains a fresh `+30` would turn any
	// foreign number into a Greek one.
	if (cleaned.startsWith("+")) {
		const digits = cleaned.slice(1);
		return digits.length === 12 && digits.startsWith(COUNTRY_CODE) ? digits.slice(2) : null;
	}
	if (cleaned.startsWith(`00${COUNTRY_CODE}`) && cleaned.length === 14) return cleaned.slice(4);
	// `30` without a `+` is only a country code when the digits add up to 12:
	// a bare 10-digit national number must never be read as one.
	if (cleaned.startsWith(COUNTRY_CODE) && cleaned.length === 12) return cleaned.slice(2);
	if (cleaned.length === 10 && (cleaned.startsWith("69") || cleaned.startsWith("2"))) return cleaned;
	return null;
}

/**
 * Drops every separator, keeping a single leading `+`. The plus is only
 * meaningful at the front; anywhere else it is noise, exactly like a dash.
 */
function keepLeadingPlus(run: string): string {
	const digitsAndPluses = run.replace(/[^0-9+]/g, "");
	const hasLeadingPlus = digitsAndPluses.startsWith("+");
	return (hasLeadingPlus ? "+" : "") + digitsAndPluses.replace(/\+/g, "");
}

/** One digit repeated (`00000000`, `5555`) — the shape hand-entered filler takes. */
function isRepeatedDigit(digits: string): boolean {
	return /^(\d)\1*$/.test(digits);
}

/**
 * Whether a national part is a number we are willing to send to: 10 digits
 * starting `69` (mobile) or `2` (landline).
 *
 * Mobiles are a little stricter because that is where the junk lives: the
 * subscriber part of `6900000000` is a single repeated digit, so the row is
 * filler, not a number. Charging a real SMS to `6900000000` is exactly the kind
 * of mistake this module exists to prevent.
 */
function isUsableGreekNational(national: string): boolean {
	if (national.length !== 10) return false;
	if (!national.startsWith("69") && !national.startsWith("2")) return false;
	if (!national.startsWith("69")) return true;
	return !isRepeatedDigit(national) && !isRepeatedDigit(national.slice(2));
}

/**
 * Normalises one dirty cell to the E.164 form Bird requires, or `null` when the
 * cell does not hold a usable Greek number.
 *
 * Accepted shapes — everything else is rejected: `+30` followed by 10 national
 * digits; the same behind `0030`; the bare `30` form, but only when it adds up
 * to 12 digits, so a 10-digit national number is never mistaken for one; and a
 * bare 10-digit national number starting `69` (mobile) or `2` (landline). After
 * that the national part must be exactly 10 digits starting `69` or `2`, which
 * is what rejects the 11-digit (`69833806311`) and 9-digit (`698338063`) typos
 * instead of guessing at them.
 *
 * A trailing extension (`6912345678 εσ. 12`) is ignored, and a leading `+` is
 * authoritative — `+30` is never re-stripped, so `+49…` is rejected rather than
 * bent into a Greek number.
 *
 * @param raw - the column value as D1 returned it; `null` when it will not do.
 * @returns E.164 (`+30XXXXXXXXXX`), or `null` for missing or invalid input.
 */
export function normalizeGreekPhone(raw: string | null | undefined): string | null {
	const national = nationalPart(raw);
	if (national === null || !isUsableGreekNational(national)) return null;
	return `+${COUNTRY_CODE}${national}`;
}

/**
 * True when the value is a Greek mobile: E.164 whose national part starts `69`.
 *
 * Only mobiles are accepted for SMS — a Greek landline cannot receive a text at
 * all, so dialling one wastes a send and still bills for it.
 *
 * The answer is derived from `normalizeGreekPhone` rather than from a second
 * pattern, so the two can never drift apart: a value that is not usable enough
 * to send cannot be classified as a mobile, and junk or filler such as
 * `+306900000000` is `false` instead of an exception.
 *
 * @param e164 - the value to classify (an already-normalised number, as the
 * campaign code passes; a raw cell is tolerated and answered the same way).
 */
export function isGreekMobile(e164: string): boolean {
	const normalized = normalizeGreekPhone(e164);
	return normalized !== null && normalized.startsWith(`+${COUNTRY_CODE}69`);
}

/**
 * Privacy-safe display form for logs: the `+30` country code, the first two
 * digits of the national part and its last three survive, the middle is masked
 * — `+306912345678` becomes `+3069*****678`.
 *
 * Full numbers never belong in a log line: these are pupils' and teachers'
 * personal numbers, and the campaign's logs are written to disk and kept. Freely
 * usable on a raw cell as well, for the "why was this row skipped" lines.
 *
 * Anything unrecognisable — foreign, truncated, or junk — keeps only its last
 * two characters instead of being echoed back, and a value of one or two
 * characters is masked completely, so the full input is never returned.
 *
 * @param e164 - the value to mask. Never throws, never returns it in full.
 */
export function maskPhone(e164: string): string {
	const text = typeof e164 === "string" ? e164.trim() : "";
	if (text === "") return "";

	const national = nationalPart(text);
	if (national !== null) return `+${COUNTRY_CODE}${national.slice(0, 2)}${NATIONAL_MASK}${national.slice(-3)}`;

	// Too short to be a number we can structure: keep the tail, never the whole.
	return text.length <= 2 ? "*".repeat(text.length) : `${"*".repeat(text.length - 2)}${text.slice(-2)}`;
}
