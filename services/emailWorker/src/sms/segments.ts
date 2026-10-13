/**
 * GSM 03.38 segmentation arithmetic for Bird SMS sends.
 *
 * Why this file exists: Bird rejects any free-text body above 12 segments with a
 * 422 and never truncates, and every segment is billed. So the campaign CLI has
 * to know a message's segment count BEFORE spending an API call — and an
 * operator writing a Greek body needs to see that Greek costs 67 characters per
 * segment instead of 160, long before the send goes out.
 *
 * Pure functions only: no I/O, no env, no dependencies, so this can be imported
 * from the CLI, the Worker, or a test with no setup at all.
 */

export type SmsEncoding = "GSM_7BIT" | "UCS_2";

/**
 * The GSM 03.38 basic (default) alphabet — the 128 code points a 7-bit SMS can
 * carry. Grouped one row per 16 slots so the table can be diffed against
 * 3GPP TS 23.038 by eye; the only invisible entries are the LF/CR at 0x0A/0x0D.
 * ESC (0x1B) is deliberately absent: it is not a typeable character, it is the
 * escape byte that introduces the extension table below.
 */
export const GSM7_BASIC = new Set<string>(
	[
		"@£$¥èéùìòÇ", // 0x00–0x09
		"\nØø\rÅå", // 0x0A–0x0F
		"Δ_ΦΓΛΩΠΨΣΘΞ", // 0x10–0x1A
		"ÆæßÉ", // 0x1C–0x1F
		" !\"#¤%&'()*+,-./", // 0x20–0x2F
		"0123456789:;<=>?", // 0x30–0x3F
		"¡ABCDEFGHIJKLMNO", // 0x40–0x4F
		"PQRSTUVWXYZÄÖÑÜ§", // 0x50–0x5F
		"¿abcdefghijklmno", // 0x60–0x6F
		"pqrstuvwxyzäöñüà", // 0x70–0x7F
	].join(""),
);

/**
 * The GSM 03.38 extension table: every entry is sent as ESC + its code, which is
 * exactly why each one costs 2 characters against the per-segment budget.
 * Comments are the escape-table code point, per 3GPP TS 23.038 §6.2.1.1.
 */
export const GSM7_EXTENDED = new Set<string>([
	"\f", // 0x0A FORM FEED
	"^", // 0x14
	"{", // 0x28
	"}", // 0x29
	"\\", // 0x2F
	"[", // 0x3C
	"~", // 0x3D
	"]", // 0x3E
	"|", // 0x40
	"€", // 0x65
]);

/** Capacity of a single (non-concatenated) SMS, per encoding. */
const SINGLE_GSM7 = 160;
const SINGLE_UCS2 = 70;

/**
 * Capacity of each part of a concatenated SMS. The 6-byte UDH (7 for UCS-2)
 * eats into every part, so `n` parts hold far less than `n * 160`.
 */
const MULTIPART_GSM7 = 153;
const MULTIPART_UCS2 = 67;

/**
 * Decides whether a body can travel as GSM-7 at all.
 *
 * One character outside the GSM tables forces the WHOLE message into UCS-2,
 * where a segment holds 70 characters instead of 160 — this is the check that
 * stops a stray emoji or a Greek word from silently tripling a campaign's cost
 * and segment count.
 *
 * Written as a code-point loop (`for…of`, not `charAt`), so an astral character
 * such as an emoji is tested as one unit and correctly reports UCS-2.
 */
export function detectEncoding(text: string): SmsEncoding {
	for (const char of text) {
		if (!GSM7_BASIC.has(char) && !GSM7_EXTENDED.has(char)) return "UCS_2";
	}
	// Empty text is vacuously GSM-7 — it needs no encoding at all, and GSM-7 is
	// the cheaper assumption for anything that only counts.
	return "GSM_7BIT";
}

/**
 * The billable character count Bird reports as `segments.characters`.
 *
 * Extras are not free: a GSM-7 extension character is sent as ESC + code, so it
 * counts as 2. Non-BMP code points (emoji) are one code point but two UTF-16
 * code units, and are counted as 2 here — the same convention Bird uses for
 * UCS-2, since that is how many 16-bit units the network actually carries.
 */
export function countCharacters(text: string): { encoding: SmsEncoding; characters: number } {
	const encoding = detectEncoding(text);
	let characters = 0;
	for (const char of text) {
		characters += encoding === "GSM_7BIT" && GSM7_EXTENDED.has(char) ? 2 : char.length;
	}
	return { encoding, characters };
}

/**
 * How many SMS segments the body will be billed as, and why.
 *
 * The first segment holds 160 GSM-7 / 70 UCS-2 characters; every additional
 * segment holds 153 / 67 because of the concatenation header. Empty text is
 * 0 characters and 0 segments — a real state the CLI must handle, since it means
 * "nothing to send" rather than "one empty SMS".
 */
export function estimateSegments(text: string): { count: number; encoding: SmsEncoding; characters: number } {
	const { encoding, characters } = countCharacters(text);
	if (characters === 0) return { count: 0, encoding, characters };
	const single = encoding === "GSM_7BIT" ? SINGLE_GSM7 : SINGLE_UCS2;
	if (characters <= single) return { count: 1, encoding, characters };
	const multipart = encoding === "GSM_7BIT" ? MULTIPART_GSM7 : MULTIPART_UCS2;
	return { count: Math.ceil(characters / multipart), encoding, characters };
}

/**
 * The largest character count that still fits in `segments` segments — the exact
 * inverse of {@link estimateSegments}, used as the budget when truncating.
 *
 * Anything below 1 segment holds nothing, so it returns 0 rather than a negative
 * budget that would make callers slice backwards.
 */
export function maxCharactersForSegments(segments: number, encoding: SmsEncoding): number {
	const parts = Math.floor(segments);
	if (!Number.isFinite(parts) || parts < 1) return 0;
	if (parts === 1) return encoding === "GSM_7BIT" ? SINGLE_GSM7 : SINGLE_UCS2;
	return parts * (encoding === "GSM_7BIT" ? MULTIPART_GSM7 : MULTIPART_UCS2);
}

/**
 * Cuts a body down to `maxSegments` without ever cutting a word — or a surrogate
 * pair — in half, and marks the cut with `…` when the marker still fits.
 *
 * Available to callers that want to CLAMP a body rather than refuse it. The
 * campaign runner deliberately does not use it: silently truncating a marketing
 * message would cut its call to action — or its STOP opt-out instruction — so an
 * over-budget body aborts the run instead (see {@link assertWithinSegments}).
 * The caller always re-measures the RESULT with
 * {@link estimateSegments} before sending; the marker is therefore only appended
 * when the result still fits, because `…` is not in GSM 03.38 and adding it to a
 * full GSM-7 body would silently promote that body to UCS-2, where the same
 * character count needs more segments. In that (common) case the text is
 * returned without a marker rather than silently over the cap.
 */
export function truncateToSegments(text: string, maxSegments: number): string {
	if (maxSegments < 1) return "";
	const { count, encoding } = estimateSegments(text);
	if (count <= maxSegments) return text;

	const cap = maxCharactersForSegments(maxSegments, encoding);
	// Code-point iteration so an emoji is kept or dropped whole.
	const chars = [...text];
	let kept = 0;
	let used = 0;
	for (const char of chars) {
		const weight = encoding === "GSM_7BIT" && GSM7_EXTENDED.has(char) ? 2 : char.length;
		if (used + weight > cap) break;
		used += weight;
		kept++;
	}

	let truncated = chars.slice(0, kept).join("");
	// Back up to the last whitespace, but only when the cut really landed inside
	// a word: if the next character is whitespace the cut is already clean, and if
	// there is no whitespace to back up to the hard cut is the best we can do.
	if (kept < chars.length && !/\s/.test(chars[kept])) {
		for (let i = kept - 1; i > 0; i--) {
			if (/\s/.test(chars[i])) {
				truncated = chars.slice(0, i).join("").replace(/\s+$/, "");
				break;
			}
		}
	}

	const usedByResult = countCharacters(truncated).characters;
	if (usedByResult + 1 <= cap && estimateSegments(`${truncated}…`).count <= maxSegments) return `${truncated}…`;
	return truncated;
}

/**
 * Fails fast, locally, on a body Bird would reject with a 422 anyway.
 *
 * The thrown message names the actual segment count and the cap, because the
 * operator reading it has to decide between shortening the text and splitting
 * the campaign — "invalid SMS body" would not tell them which.
 */
export function assertWithinSegments(text: string, maxSegments: number): void {
	const { count, encoding, characters } = estimateSegments(text);
	if (count > maxSegments) {
		const label = encoding === "GSM_7BIT" ? "GSM-7" : "UCS-2";
		throw new Error(
			`SMS body needs ${count} segments (${characters} ${label} characters) but the limit is ${maxSegments} segment(s). Shorten the text or send it as more than one message.`,
		);
	}
}
