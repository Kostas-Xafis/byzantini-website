import type { AudienceStats, CampaignStats, ChannelStats, DailyPoint, SmsDeliveryStats, StatsReport } from "./stats";

/**
 * Renders a collected {@link StatsReport} as the exact text
 * `bun run campaign --stats` prints.
 *
 * Why the formatting lives in its own module: `stats.ts` answers "what happened"
 * from the campaign state files, and this file answers "how does that look in a
 * terminal". Keeping the two apart means the numbers stay testable as numbers
 * and the layout stays changeable without touching a single query.
 *
 * Why the report is derived locally (no provider call at render time): the state
 * files are the only record of what THIS tool actually sent, so the renderer
 * needs nothing but the object it is handed. It performs no I/O, opens no
 * network connection and holds no credentials, which is why `--stats` works on a
 * laptop with no D1 access and never fails because Bird or MailerSend is down.
 *
 * Why plain text and no ANSI colour: this output is piped into `less`, appended
 * to CI logs and pasted into tickets. An escape sequence that survives into a
 * redirect is noise at best, and it breaks `grep` at worst — so emphasis is
 * carried by layout (boxes, alignment, bars) instead of by colour.
 *
 * Why width-aware padding is not optional here: the campaign titles are Greek
 * with emoji in them (`🎼`, `⭐`), and this report draws box borders and bar
 * charts. Greek letters are one column wide, but emoji are two and combining
 * marks are zero, so `String.prototype.padEnd` — which counts UTF-16 code units —
 * misaligns every border the moment a title contains one. Everything below
 * measures in terminal columns ({@link displayWidth}) and iterates by code point
 * so a surrogate pair is never split.
 *
 * The renderer is deterministic: the same report object always produces the same
 * bytes, apart from relative ages, which are measured against the report's own
 * `generatedAt` rather than the wall clock at print time.
 */

/* ------------------------------------------------------------------------- */
/* Glyphs and geometry                                                       */
/* ------------------------------------------------------------------------- */

/**
 * Bar glyphs. All three are U+2580–U+259F (Block Elements), which Unicode marks
 * as East Asian "Ambiguous": one column in the Greek/UTF-8 terminals this tool
 * runs in, two only in a CJK locale. They are deliberately checked BEFORE the
 * wide ranges in {@link displayWidth} so a chart row always aligns with its date.
 */
const SENT_BLOCK = "█";
const FAILED_BLOCK = "▓";
const EMPTY_BLOCK = "░";

/** Em dash: the one rendering of "no value here". `null` must never leak to a terminal. */
const NONE = "—";

/** Separator between items on one line. One column wide, unlike a bullet. */
const DOT = "·";

/** Appended by {@link truncateDisplay} when text does not fit. */
const ELLIPSIS = "…";

/** Daily chart bar field. One row per day stays under 50 columns, so a 30-day axis is readable. */
const DAILY_BAR_WIDTH = 32;

/** Rate/progress bar field, sized to keep an audience row inside ~72 columns. */
const RATE_BAR_WIDTH = 24;

/** Narrowest frame, so a small report still looks deliberate rather than cramped. */
const MIN_INNER_WIDTH = 68;

/** Widest frame: past this a line is truncated, because a 200-column box wraps in any terminal. */
const MAX_INNER_WIDTH = 104;

/** Recent delivery buckets shown before the rest are summarised away. */
const MAX_TREND_BUCKETS = 10;

/**
 * Sparkline glyphs, from empty to full (U+2581–U+2588, so all width 1).
 *
 * The lowest level is a visible block rather than a space: in a report where a
 * whole window can be quiet, a row of `▁` still reads as "this is the window",
 * while a row of blanks reads as a rendering bug.
 */
const SPARK_BLOCKS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

/** Most glyphs a sparkline may use, however long the window is. */
const SPARK_MAX_GLYPHS = 40;

/** Fewest glyphs a downsampled sparkline may shrink to before it stops carrying information. */
const MIN_SPARK_GLYPHS = 8;

/** Width assumed when nothing tells us otherwise: the narrowest terminal still in common use. */
const DEFAULT_WIDTH = 80;

/** Below this many terminal columns the box is dropped for a plain, stacked layout. */
const MIN_FRAMED_WIDTH = 64;

/** Narrowest column a fact may be wrapped into before wrapping stops being readable. */
const MIN_WRAP_WIDTH = 8;

/** Bar used by the stacked fact form, where a full-width rate bar would eat the line. */
const FACT_BAR_WIDTH = 12;

/** What a compact chart row says when the campaign had no activity in the window. */
const QUIET_SUMMARY = "no activity";

/* ------------------------------------------------------------------------- */
/* Width-aware text measurement                                              */
/* ------------------------------------------------------------------------- */

/**
 * Zero-width code points: combining marks and format controls.
 *
 * This uses Unicode property escapes rather than a hand-written range table
 * because the mark blocks are numerous and scattered (U+0300–U+036F, U+1AB0–U+1AFF,
 * U+1DC0–U+1DFF, U+20D0–U+20FF, U+FE20–U+FE2F, plus the Hebrew, Arabic and Indic
 * mark spaces). `\p{Mn}`/`\p{Me}` cover all of them in one line, and `\p{Cf}`
 * covers the zero-width joiners, BOMs and soft hyphens. A table copied by hand
 * would silently drift from Unicode; the engine's data does not.
 */
const ZERO_WIDTH = /[\p{Mn}\p{Me}\p{Cf}]/u;

/**
 * Double-width ranges below U+1F300 (sorted, non-overlapping).
 *
 * Two groups are in here. The CJK blocks are genuinely double-width. The single
 * code points in the U+2xxx range are the emoji that Unicode gives an emoji
 * presentation by default, so a terminal draws them two columns wide without a
 * variation selector — ⭐ (U+2B50) among them. Text-presentation symbols such as
 * ★ (U+2605), © and ™ are NOT listed: a plain terminal renders those one column
 * wide, and claiming two would push every following border out by one.
 *
 * `█▓░` (U+2588, U+2593, U+2591) and the box-drawing set (U+2500–U+257F) fall
 * between the ranges on purpose: both are width 1.
 */
const WIDE_RANGES: readonly (readonly [number, number])[] = [
	[0x1100, 0x115f], // Hangul Jamo
	[0x231a, 0x231b], // watch, hourglass
	[0x23e9, 0x23ec],
	[0x23f0, 0x23f0],
	[0x23f3, 0x23f3],
	[0x25fd, 0x25fe],
	[0x2614, 0x2615],
	[0x2648, 0x2653], // zodiac
	[0x267f, 0x267f],
	[0x2693, 0x2693],
	[0x26a1, 0x26a1],
	[0x26aa, 0x26ab],
	[0x26bd, 0x26be],
	[0x26c4, 0x26c5],
	[0x26ce, 0x26ce],
	[0x26d4, 0x26d4],
	[0x26ea, 0x26ea],
	[0x26f2, 0x26f3],
	[0x26f5, 0x26f5],
	[0x26fa, 0x26fa],
	[0x26fd, 0x26fd],
	[0x2705, 0x2705],
	[0x270a, 0x270b],
	[0x2728, 0x2728],
	[0x274c, 0x274c],
	[0x274e, 0x274e],
	[0x2753, 0x2755],
	[0x2757, 0x2757],
	[0x2795, 0x2797],
	[0x27b0, 0x27b0],
	[0x27bf, 0x27bf],
	[0x2b1b, 0x2b1c],
	[0x2b50, 0x2b50], // ⭐ — the campaign registry uses this one
	[0x2b55, 0x2b55],
	[0x2e80, 0x303e], // CJK radicals, Kangxi, CJK symbols and punctuation
	[0x3041, 0x33ff], // kana, Hangul compatibility Jamo, CJK compatibility
	[0x3400, 0x4dbf], // CJK extension A
	[0x4e00, 0x9fff], // CJK unified ideographs
	[0xa000, 0xa4cf], // Yi
	[0xa960, 0xa97f], // Hangul Jamo extended A
	[0xac00, 0xd7a3], // Hangul syllables
	[0xf900, 0xfaff], // CJK compatibility ideographs
	[0xfe10, 0xfe19], // vertical forms
	[0xfe30, 0xfe6f], // CJK compatibility forms, small form variants
	[0xff00, 0xff60], // fullwidth forms
	[0xffe0, 0xffe6], // fullwidth signs
];

/** True for code points a terminal draws in two columns. */
function isWide(codePoint: number): boolean {
	// Everything from the emoji blocks upward is double-width: pictographs
	// (U+1F300–U+1FAFF) and the CJK extension planes (U+20000+) alike. Keeping
	// this as a threshold rather than a list is what makes 🎼 (U+1F3BC) work
	// without naming it.
	if (codePoint >= 0x1f300) return true;
	for (const [low, high] of WIDE_RANGES) {
		if (codePoint < low) return false; // ranges are sorted, so no later one can match
		if (codePoint <= high) return true;
	}
	return false;
}

/**
 * Terminal columns occupied by `text`.
 *
 * Iterates by code point (`for...of`), never by UTF-16 index: emoji and every
 * other astral character are surrogate pairs, and counting code units would both
 * overstate their width and let {@link truncateDisplay} cut one in half — which
 * renders as the replacement character and is how a "correct-looking" table ends
 * up broken.
 *
 * This is necessarily an approximation of what a specific terminal does (font,
 * locale and emoji presentation all move the goalposts), but it is the same
 * approximation for every string in the report, which is what alignment needs.
 */
export function displayWidth(text: string): number {
	let width = 0;
	for (const ch of text) {
		if (ZERO_WIDTH.test(ch)) continue;
		width += isWide(ch.codePointAt(0) as number) ? 2 : 1;
	}
	return width;
}

/** Pads `text` on the right to `width` terminal columns. Never truncates. */
export function padEndDisplay(text: string, width: number): string {
	const pad = width - displayWidth(text);
	return pad > 0 ? text + " ".repeat(pad) : text;
}

/** Pads `text` on the left to `width` terminal columns, for right-aligned numbers. */
function padStartDisplay(text: string, width: number): string {
	const pad = width - displayWidth(text);
	return pad > 0 ? " ".repeat(pad) + text : text;
}

/**
 * Cuts `text` to at most `width` terminal columns, appending `…` when it cuts.
 *
 * The ellipsis is reserved space rather than an afterthought: without it the
 * result could be `width + 1` columns wide and break the border it was padded
 * into. A double-width glyph that cannot fit whole is dropped rather than split.
 */
export function truncateDisplay(text: string, width: number): string {
	if (width <= 0) return "";
	if (displayWidth(text) <= width) return text;
	let out = "";
	let used = 0;
	for (const ch of text) {
		const w = ZERO_WIDTH.test(ch) ? 0 : isWide(ch.codePointAt(0) as number) ? 2 : 1;
		if (used + w + 1 > width) break; // +1 for the ellipsis
		out += ch;
		used += w;
	}
	return out + ELLIPSIS;
}

/** Splits an unbreakable word at a display-width boundary, returning both halves. */
function splitWide(word: string, width: number): [string, string] {
	let taken = "";
	let used = 0;
	for (const ch of word) {
		const w = ZERO_WIDTH.test(ch) ? 0 : isWide(ch.codePointAt(0) as number) ? 2 : 1;
		if (used + w > width) break;
		taken += ch;
		used += w;
	}
	return [taken, word.slice(taken.length)];
}

/**
 * Word-wraps `text` to `width` columns.
 *
 * Used for free text that arrives from outside (a provider error message) so a
 * long diagnostic is wrapped rather than truncated away: losing the tail of an
 * error is exactly the moment an operator needs it.
 */
function wrapDisplay(text: string, width: number): string[] {
	const lines: string[] = [];
	let current = "";
	for (const word of inlineText(text).split(" ")) {
		if (!word) continue;
		let rest = word;
		while (rest) {
			const candidate = current ? `${current} ${rest}` : rest;
			if (displayWidth(candidate) <= width) {
				current = candidate;
				break;
			}
			if (current) {
				lines.push(current);
				current = "";
				continue;
			}
			if (displayWidth(rest) <= width) {
				current = rest;
				break;
			}
			const [head, tail] = splitWide(rest, width);
			if (!head) {
				lines.push(truncateDisplay(rest, width));
				break;
			}
			lines.push(head);
			rest = tail;
		}
	}
	if (current) lines.push(current);
	return lines.length > 0 ? lines : [""];
}

/* ------------------------------------------------------------------------- */
/* Value formatting                                                          */
/* ------------------------------------------------------------------------- */

/** Collapses control characters (a newline inside an error message) into single spaces. */
function inlineText(text: string): string {
	return text
		.replace(/[\u0000-\u001f\u007f]+/g, " ")
		.replace(/ {2,}/g, " ")
		.trim();
}

/** Parses an ISO timestamp, returning null rather than an Invalid Date. */
function parseDate(value: string | null | undefined): Date | null {
	if (!value) return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Thousands separators, applied by hand rather than with `toLocaleString`.
 *
 * The same report must print the same bytes on a laptop, in CI and over SSH:
 * `toLocaleString` depends on the host's locale and ICU build, so a machine with
 * LANG=el_GR could render 3.503 — which reads as a decimal to everyone else.
 */
function formatCount(value: number): string {
	if (!Number.isFinite(value)) return NONE;
	return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** A 0..1 fraction as a one-decimal percentage. Null and non-finite render as `—`. */
function formatPercent(fraction: number | null | undefined): string {
	if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) return NONE;
	return `${(fraction * 100).toFixed(1)}%`;
}

/**
 * `YYYY-MM-DD HH:mm` in LOCAL time.
 *
 * Local, not UTC, for the same reason `stats.ts` buckets days locally: "sent
 * today" and "last sent 18:41" are read by an operator sitting in the school's
 * timezone, and a UTC stamp would make an afternoon send look like the evening.
 * The day rule is re-stated in three lines here instead of importing `dayKey`,
 * so that this formatter does not drag the campaign registry (and through it D1
 * and the R2 asset list) into its import graph just to pad a date.
 */
function formatStamp(value: string | null | undefined): string {
	const date = parseDate(value);
	if (!date) return NONE;
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * A period bound: date-only values are printed as they are.
 *
 * `new Date("2026-02-01")` is parsed as UTC midnight by spec, so running it
 * through {@link formatStamp} could shift Bird's window back a day west of
 * Greenwich. A value with no time of day carries no timezone to convert, so it
 * is echoed verbatim.
 */
function formatIso(value: string | null | undefined): string {
	if (!value) return NONE;
	return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : formatStamp(value);
}

/**
 * Compact relative age, measured against the report's own `generatedAt`.
 *
 * Anchoring to `generatedAt` rather than `Date.now()` keeps the renderer
 * deterministic (same input, same bytes) and avoids the impossible "sent 5
 * minutes in the future" that a clock skew between the collecting and rendering
 * moments would otherwise print.
 */
function formatAge(value: string | null | undefined, now: Date): string {
	const date = parseDate(value);
	if (!date) return NONE;
	const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
	if (seconds < 90) return "just now";
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.round(hours / 24);
	if (days < 14) return `${days}d ago`;
	const weeks = Math.round(days / 7);
	if (weeks < 9) return `${weeks}w ago`;
	const months = Math.round(days / 30);
	return months < 18 ? `${months}mo ago` : `${Math.round(days / 365)}y ago`;
}

/** Latency in milliseconds, with separators. Null renders as `—`. */
function formatMs(ms: number | null | undefined): string {
	if (ms === null || ms === undefined || !Number.isFinite(ms)) return NONE;
	return `${formatCount(ms)}ms`;
}

/** "Email" / "SMS" — the label the channel column and section titles use. */
function channelLabel(channel: ChannelStats["channel"]): string {
	return channel === "sms" ? "SMS" : "Email";
}

/** "MM-DD" for a chart row: the year is in the report header, so it would only add noise. */
function shortDay(day: string): string {
	return day.length >= 10 ? day.slice(5, 10) : day;
}

/**
 * A sparse Bird bucket label ("2026-02-10" or "2026-02-10T14") as `MM-DD` /
 * `MM-DD HH:00`. Relabelled, never converted: Bird's bucket boundaries are its
 * own, and silently re-basing them on the local clock would misstate the numbers.
 */
function formatBucket(bucket: string): string {
	const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}))?/.exec(bucket);
	if (!match) return truncateDisplay(inlineText(bucket), 16);
	const [, , month, day, hour] = match;
	return hour ? `${month}-${day} ${hour}:00` : `${month}-${day}`;
}

/* ------------------------------------------------------------------------- */
/* Layout primitives                                                         */
/* ------------------------------------------------------------------------- */

type Align = "left" | "right";

/**
 * Renders rows as a column-aligned block, measuring every cell in display
 * columns. Trailing whitespace is trimmed so a line never carries invisible
 * padding into the caller's own padding step.
 */
function alignRows(rows: string[][], aligns: Align[], gap = 2): string[] {
	const widths: number[] = [];
	for (const row of rows) {
		row.forEach((cell, i) => {
			widths[i] = Math.max(widths[i] ?? 0, displayWidth(cell));
		});
	}
	return rows.map((row) =>
		row
			.map((cell, i) => {
				const width = widths[i] ?? displayWidth(cell);
				return (aligns[i] ?? "left") === "right" ? padStartDisplay(cell, width) : padEndDisplay(cell, width);
			})
			.join(" ".repeat(gap))
			.trimEnd(),
	);
}

/**
 * A label/value grid, `perRow` pairs per line.
 *
 * Counters like Bird's seven delivery states are one short line each if stacked,
 * and one unreadable line if run together; a grid keeps all seven visible at
 * once without a 100-column row.
 */
function grid(pairs: [string, string][], perRow: number): string[] {
	const rows: string[][] = [];
	for (let i = 0; i < pairs.length; i += perRow) {
		rows.push(pairs.slice(i, i + perRow).flat());
	}
	return alignRows(
		rows,
		rows[0].map((_, i) => (i % 2 === 0 ? "left" : "right")),
		3,
	);
}

/**
 * A grid that shrinks to fit: four pairs per row, then three, then two, then one.
 *
 * Returns null when even one pair per row is too wide, which tells the caller to
 * fall back to the stacked fact form rather than truncate every value.
 */
function fitGrid(pairs: [string, string][], indent: string, available: number, maxPerRow = 4): string[] | null {
	for (let perRow = maxPerRow; perRow >= 1; perRow--) {
		const lines = grid(pairs, perRow).map((line) => indent + line);
		if (lines.every((line) => displayWidth(line) <= available)) return lines;
	}
	return null;
}

/**
 * A table laid out only if it fits.
 *
 * Returns null rather than a truncated table: a row of clipped numbers looks
 * like data and is not, so the caller uses {@link factLines} instead.
 */
function fitTable(rows: string[][], aligns: Align[], gap: number, indent: string, available: number): string[] | null {
	const lines = alignRows(rows, aligns, gap).map((line) => indent + line);
	return lines.every((line) => displayWidth(line) <= available) ? lines : null;
}

/**
 * `label` followed by ` · `-joined facts, wrapped to `width`.
 *
 * This is how a section degrades when its aligned table will not fit: the same
 * numbers, printed as sentences rather than columns. A fact is never split from
 * its own number, the separator is only ever a break point, and a single fact
 * wider than the line is word-wrapped rather than dropped.
 */
function factLines(label: string, facts: string[], width: number, indent: string): string[] {
	const prefix = label ? `${label}  ` : "";
	const continuation = indent + " ".repeat(displayWidth(prefix));
	const lines: string[] = [];
	let line = indent + prefix;
	let factsOnLine = 0;
	const flush = () => {
		if (line.trim()) lines.push(line.trimEnd());
		line = continuation;
		factsOnLine = 0;
	};
	for (const fact of facts) {
		if (!fact) continue;
		const separator = factsOnLine > 0 ? ` ${DOT} ` : "";
		if (displayWidth(line + separator + fact) <= width) {
			line += separator + fact;
			factsOnLine++;
			continue;
		}
		if (factsOnLine > 0) flush();
		if (displayWidth(line + fact) <= width) {
			line += fact;
			factsOnLine = 1;
			continue;
		}
		// One fact wider than a whole line: wrap its words instead of overflowing.
		for (const piece of wrapDisplay(fact, Math.max(MIN_WRAP_WIDTH, width - displayWidth(continuation)))) {
			if (factsOnLine === 0 && displayWidth(line + piece) <= width) {
				line += piece;
				factsOnLine = 1;
			} else {
				flush();
				line += piece;
				factsOnLine = 1;
			}
		}
	}
	if (line.trim()) lines.push(line.trimEnd());
	return lines.length > 0 ? lines : [indent + prefix.trimEnd()];
}

/**
 * A rate/progress bar of `width` blocks.
 *
 * A null, negative or non-finite fraction yields an empty bar, never a bar of
 * negative length, and the fill is clamped so a fraction above 1 (a total that
 * shrank after the fact, say) cannot overflow the field. Callers that want a
 * "no data" distinction print `—` next to the bar instead of relying on it.
 */
function bar(fraction: number | null, width: number, fill = SENT_BLOCK, empty = EMPTY_BLOCK): string {
	if (fraction === null || !Number.isFinite(fraction) || width <= 0) return empty.repeat(Math.max(0, width));
	const filled = Math.max(0, Math.min(width, Math.round(fraction * width)));
	return fill.repeat(filled) + empty.repeat(width - filled);
}

/* ------------------------------------------------------------------------- */
/* Terminal geometry                                                         */
/* ------------------------------------------------------------------------- */

/**
 * How wide the output may be.
 *
 * stdout has no `columns` when it is a pipe or a redirect, which is exactly the
 * case where silently assuming a wide terminal is worst: CI logs and `> stats.txt`
 * get wrapped by whatever reads them next. `COLUMNS` is the conventional override
 * a shell exports, and 80 is the fallback because it is the narrowest width a
 * terminal is still expected to have.
 */
function resolveWidth(explicit?: number): number {
	if (explicit !== undefined && Number.isFinite(explicit) && explicit > 0) return Math.floor(explicit);
	const fromStdout = process.stdout?.columns;
	if (typeof fromStdout === "number" && Number.isFinite(fromStdout) && fromStdout > 0) return Math.floor(fromStdout);
	const fromEnv = Number(process.env.COLUMNS);
	if (Number.isFinite(fromEnv) && fromEnv > 0) return Math.floor(fromEnv);
	return DEFAULT_WIDTH;
}

/**
 * Where a section's text goes, and how much room it has.
 *
 * The same section builders serve both layouts; only the indents and the
 * available width differ. `available` always counts the indent, so a builder can
 * compare a finished line against it directly.
 */
type Layout = {
	/** Widest a finished content line may be, indent included. */
	available: number;
	/** Prefix for a section title. */
	titleIndent: string;
	/** Prefix for a section's content lines. */
	contentIndent: string;
	/**
	 * Room for a campaign heading. Framed mode truncates to it; plain mode passes
	 * Infinity, because it renders the heading itself and wraps it over as many
	 * lines as the title needs.
	 */
	headingBudget: number;
};

/** Rows and columns are lines of text, so a "gap" is literal spaces, not a column. */
function indentWidth(indent: string): number {
	return displayWidth(indent);
}

/* ------------------------------------------------------------------------- */
/* Sections                                                                  */
/* ------------------------------------------------------------------------- */

/** One boxed block: the heading goes in the top border, `lines` are the body. */
type FrameSection = { heading: string; lines: string[] };

/**
 * Merges every channel's daily series into one row per day, oldest first.
 *
 * The chart is a campaign chart, not a channel chart: `█` is "sends" and `▓` is
 * "failures" for the campaign as a whole. Days are keyed by their `YYYY-MM-DD`
 * string, which sorts chronologically, so a channel whose series starts late
 * still lines up with the others.
 */
function mergeDaily(channels: ChannelStats[]): DailyPoint[] {
	const byDay = new Map<string, DailyPoint>();
	for (const channel of channels) {
		for (const point of channel.daily) {
			const bucket = byDay.get(point.day) ?? { day: point.day, sent: 0, failed: 0 };
			bucket.sent += point.sent;
			bucket.failed += point.failed;
			byDay.set(point.day, bucket);
		}
	}
	return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

/**
 * The scaled bar for one day: `█` for sent, then `▓` for failed.
 *
 * Both segments are derived from the SAME scaled length, so the two parts always
 * add up to the total bar and a day with any activity always shows at least one
 * block (a bar rounded down to nothing would hide a send that happened).
 */
function dailyBar(sent: number, failed: number, peak: number, width = DAILY_BAR_WIDTH): string {
	const total = sent + failed;
	if (total <= 0 || peak <= 0 || width <= 0) return "";
	const length = Math.min(width, Math.max(1, Math.round((total / peak) * width)));
	if (failed <= 0) return SENT_BLOCK.repeat(length);
	if (sent <= 0) return FAILED_BLOCK.repeat(length);
	const sentLength = Math.max(1, Math.min(length - 1, Math.round((sent / total) * length)));
	return SENT_BLOCK.repeat(sentLength) + FAILED_BLOCK.repeat(length - sentLength);
}

/**
 * The window's day-by-day chart, for the one-campaign view.
 *
 * One row per day, every day labelled: that is what makes a 14- or 30-day axis
 * legible, and it is why the bars are scaled to a single peak per campaign —
 * comparing row lengths is only meaningful on a shared scale. Empty days keep
 * their date and show no bar and no count, so the axis has no holes in it.
 *
 * This is the detailed form, so it is reserved for `--stats <campaign>`. Across
 * every campaign it would spend fourteen lines per campaign saying "nothing
 * happened on Tuesday"; {@link compactChart} spends one instead.
 */
function dailyChart(campaign: CampaignStats, windowDays: number, layout: Layout): string[] {
	const merged = mergeDaily(campaign.channels);
	const peak = merged.reduce((max, point) => Math.max(max, point.sent + point.failed), 0);
	const sources = campaign.channels.map((c) => channelLabel(c.channel)).join(" + ");
	const days = `${windowDays} day${windowDays === 1 ? "" : "s"}`;
	// "busiest day 0" would read like a measurement; a quiet window is a fact
	// about the campaign, so it is stated as one.
	const scale = peak > 0 ? `busiest day ${formatCount(peak)}` : "no activity in this window";
	const lines = factLines("", [`Daily activity — last ${days}${sources ? ` (${sources})` : ""}`, `${SENT_BLOCK} sent`, `${FAILED_BLOCK} failed`, scale], layout.available, layout.contentIndent);
	if (merged.length === 0) {
		lines.push(`${layout.contentIndent}No daily breakdown available for this campaign.`);
		return lines;
	}
	// The bar gives up its width before anything else does: a shorter bar is still
	// a bar, whereas a clipped date column or count is not a chart any more.
	const countWidth = Math.max(...merged.map((point) => displayWidth(formatCount(point.sent + point.failed))));
	const barWidth = Math.max(8, Math.min(DAILY_BAR_WIDTH, layout.available - indentWidth(layout.contentIndent) - 5 - 2 - 2 - countWidth));
	for (const point of merged) {
		const total = point.sent + point.failed;
		const blocks = dailyBar(point.sent, point.failed, peak, barWidth);
		const row = `${layout.contentIndent}${shortDay(point.day)}  ${padEndDisplay(blocks, barWidth)}${total > 0 ? `  ${formatCount(total)}` : ""}`;
		lines.push(row.trimEnd());
	}
	return lines;
}

/**
 * The sparkline scale, shared by every campaign in one report.
 *
 * Deliberately report-wide rather than per-campaign: the whole point of the
 * compact form is that a busy campaign's row looks busier than a quiet one's, and
 * that only holds if all of them are drawn against the same yardstick. For a
 * window that fits in {@link SPARK_MAX_GLYPHS} a bucket is exactly one day, so
 * this is the busiest day in the report — the figure the detailed chart would
 * have scaled to. For a longer window it is the busiest bucket, measured on the
 * same bucket boundaries for every campaign, which keeps the comparison fair and
 * still uses the full height of the glyphs.
 */
type ChartScale = {
	/** Busiest bucket in the report: one day each, unless the window had to be downsampled. */
	bucketPeak: number;
	/** Days summed into each glyph; 1 when the window fits in {@link SPARK_MAX_GLYPHS}. */
	bucketDays: number;
	/** Glyphs per sparkline, identical for every campaign because the window is shared. */
	glyphs: number;
	/** Which date form the compact line can afford. Chosen once, so every row matches. */
	dates: "full" | "short" | "none";
	/** True when even the long label had to shrink to `Daily (14d)`. */
	shortLabel: boolean;
	/** True when no single line fits: the sparkline drops below its label instead. */
	stacked: boolean;
};

/** Sums daily activity into fixed-size buckets, oldest first. */
function bucketSums(points: DailyPoint[], bucketDays: number): number[] {
	const size = Math.max(1, bucketDays);
	const sums: number[] = [];
	for (let i = 0; i < points.length; i += size) {
		sums.push(points.slice(i, i + size).reduce((n, point) => n + point.sent + point.failed, 0));
	}
	return sums;
}

/** The long and short forms of the compact chart's label. */
function chartLabel(windowDays: number, short: boolean): string {
	const days = `${windowDays} day${windowDays === 1 ? "" : "s"}`;
	return short ? `Daily (${windowDays}d)` : `Daily (last ${days})`;
}

/** A range bound: full date, or `MM-DD` when the year is not needed to tell them apart. */
function rangeDate(day: string, form: ChartScale["dates"]): string {
	return form === "full" ? day : shortDay(day);
}

/**
 * Works out the shared sparkline scale, the date form and the glyph budget.
 *
 * All three are measured rather than assumed: a 365-day window would otherwise
 * draw 365 blocks and blow the box apart, and a narrow terminal would rather
 * have a shorter sparkline than a truncated one. The layout is chosen from the
 * WIDEST campaign total in the report, so every campaign reserves the same room
 * and the rows stay comparable and aligned.
 */
function chartScale(campaigns: CampaignStats[], windowDays: number, layout: Layout): ChartScale {
	const series = campaigns.map((campaign) => mergeDaily(campaign.channels));
	const days = series.reduce((max, points) => Math.max(max, points.length), 0);
	const fallback = { bucketPeak: 0, bucketDays: 1, glyphs: 0, dates: "full", shortLabel: false, stacked: false } as ChartScale;
	if (days === 0) return fallback;
	// The reservation has to cover the widest total any campaign will print: the
	// same `sentInWindow` sum the channel table shows, or the sentence a campaign
	// with no activity at all prints instead.
	const widestSends = campaigns.reduce((max, campaign) => Math.max(max, campaign.channels.reduce((n, channel) => n + channel.sentInWindow, 0)), 0);
	const first = series.find((points) => points.length > 0);
	if (!first) return fallback;
	const from = first[0].day;
	const to = first[first.length - 1].day;
	const suffix = " in window";
	const summaryWidth = Math.max(displayWidth(`${formatCount(widestSends)}${suffix}`), displayWidth(QUIET_SUMMARY));

	const pick = (dates: ChartScale["dates"], shortLabel: boolean): ChartScale | null => {
		const indent = indentWidth(layout.contentIndent);
		const fromText = dates === "none" ? "" : `${rangeDate(from, dates)} `;
		const toText = dates === "none" ? "" : ` ${rangeDate(to, dates)}`;
		const head = indent + displayWidth(`${chartLabel(windowDays, shortLabel)}  ${fromText}`);
		const tail = displayWidth(toText) + displayWidth(` ${DOT} `) + summaryWidth;
		const room = layout.available - head - tail;
		if (room < MIN_SPARK_GLYPHS) return null;
		const glyphs = Math.min(SPARK_MAX_GLYPHS, room);
		const bucketDays = days > glyphs ? Math.ceil(days / glyphs) : 1;
		return { bucketPeak: 0, bucketDays, glyphs: Math.ceil(days / bucketDays), dates, shortLabel, stacked: false };
	};
	// Richest first: full dates, then no year, then no dates, then a shorter label.
	const chosen =
		pick("full", false) ??
		pick("short", false) ??
		pick("none", false) ??
		pick("short", true) ??
		pick("none", true) ??
		// Nothing fits on one line: the label keeps its own line and the sparkline
		// drops below it, which is the only form left that can shrink indefinitely.
		(() => {
			// One indent for the label, one more for the glyph column beneath it.
			const head = indentWidth(layout.contentIndent) + 2;
			const tail = displayWidth(` ${DOT} `) + summaryWidth;
			const room = Math.max(1, layout.available - head - tail);
			const glyphs = Math.min(SPARK_MAX_GLYPHS, room);
			const bucketDays = days > glyphs ? Math.ceil(days / glyphs) : 1;
			return { bucketPeak: 0, bucketDays, glyphs: Math.ceil(days / bucketDays), dates: "none", shortLabel: true, stacked: true } as ChartScale;
		})();

	let bucketPeak = 0;
	for (const points of series) {
		for (const sum of bucketSums(points, chosen.bucketDays)) bucketPeak = Math.max(bucketPeak, sum);
	}
	return { ...chosen, bucketPeak };
}

/**
 * One glyph per bucket of days, scaled to the shared bucket peak.
 *
 * Buckets sum their days rather than averaging them: a quiet week and one busy
 * day should not average out to "medium", because the campaign still reached all
 * those people.
 */
function sparkline(points: DailyPoint[], scale: ChartScale): string {
	if (points.length === 0 || scale.glyphs === 0) return "";
	const span = SPARK_BLOCKS.length - 1;
	return bucketSums(points, scale.bucketDays)
		.map((value) => {
			const level = scale.bucketPeak > 0 ? Math.max(0, Math.min(span, Math.round((value / scale.bucketPeak) * span))) : 0;
			return SPARK_BLOCKS[level];
		})
		.join("");
}

/**
 * The window's activity in one line, for the all-campaigns view.
 *
 * Same information as {@link dailyChart}, compressed: the window, the shape of
 * the activity, and the total. The bars are sent plus failed — the whole point of
 * the `▓` overlay is to show failures — but the number beside them is taken from
 * the very same `sentInWindow` field the channel table prints, so the two figures
 * labelled "in window" always agree. Deriving it by re-summing the daily series
 * would be a second source of truth for one number, and two figures with the same
 * label eight apart look like a bug even when both are individually correct.
 */
function compactChart(campaign: CampaignStats, windowDays: number, scale: ChartScale, layout: Layout): string[] {
	const merged = mergeDaily(campaign.channels);
	const label = chartLabel(windowDays, scale.shortLabel);
	const indent = layout.contentIndent;
	if (merged.length === 0 || scale.glyphs === 0) return [`${indent}${label}  no daily breakdown available`];
	const sends = campaign.channels.reduce((n, channel) => n + channel.sentInWindow, 0);
	const failures = merged.reduce((n, point) => n + point.failed, 0);
	// A window with failures but no sends still shows its `▓` marks, so it prints
	// "0 in window" rather than claiming there was no activity at all.
	const summary = sends + failures > 0 ? `${formatCount(sends)} in window` : QUIET_SUMMARY;
	// Padded to the shared glyph count so the closing date and the total line up
	// down the column, whatever a campaign's own day count happens to be.
	const spark = padEndDisplay(sparkline(merged, scale), scale.glyphs);
	// The form chosen when even the most abbreviated single line was too narrow:
	// the label keeps its own line and the sparkline drops below it.
	if (scale.stacked) return [`${indent}${label}`, `${indent}  ${spark} ${DOT} ${summary}`];
	const from = scale.dates === "none" ? "" : `${rangeDate(merged[0].day, scale.dates)} `;
	const to = scale.dates === "none" ? "" : ` ${rangeDate(merged[merged.length - 1].day, scale.dates)}`;
	return [`${indent}${label}  ${from}${spark}${to} ${DOT} ${summary}`];
}

/**
 * How many recipients the campaign reaches right now, and how far through them
 * it is. Only rendered with `--live`, and only for channels the campaign is
 * configured for.
 *
 * A null audience means "not measured", which is a different fact from zero
 * recipients — an unmeasured channel prints `—` and says so rather than showing
 * a 0 that would read as "this campaign reaches nobody".
 */
function audienceSection(campaign: CampaignStats, audience: AudienceStats, layout: Layout): string[] {
	const lines: string[] = [];
	// Footnotes are wrapped rather than truncated: the second half of "…have since
	// left this segment" is the part that explains the 175% above it.
	const note = (text: string) => {
		for (const line of wrapDisplay(text, Math.max(MIN_WRAP_WIDTH, layout.available - indentWidth(layout.contentIndent)))) {
			lines.push(`${layout.contentIndent}${line}`);
		}
	};
	const channels = campaign.configuredChannels.length > 0 ? campaign.configuredChannels : (["email", "sms"] as const);
	const rows: string[][] = [["Channel", "Audience", "Sent", "Remaining", "Progress"]];
	const facts: { label: string; values: string[] }[] = [];
	let left = 0;
	// The fact-form bar is short by design: it is a shape cue beside the number,
	// not the table column it replaces.
	const factBar = Math.max(4, Math.min(FACT_BAR_WIDTH, layout.available - indentWidth(layout.contentIndent) - 24));
	for (const channel of channels) {
		const reach = channel === "email" ? audience.email : audience.sms;
		const sent = campaign.channels.find((c) => c.channel === channel)?.sent ?? 0;
		const label = channelLabel(channel);
		if (reach === null || reach === undefined) {
			rows.push([label, NONE, formatCount(sent), NONE, "not measured — run with --live"]);
			facts.push({ label, values: [`audience ${NONE}`, `sent ${formatCount(sent)}`, `remaining ${NONE}`, "not measured — run with --live"] });
			continue;
		}
		// A zero-recipient audience would otherwise divide by zero and print NaN%
		// with a negative-length bar; "nothing to reach" says the true thing.
		const fraction = reach > 0 ? sent / reach : null;
		const remaining = formatCount(Math.max(0, reach - sent));
		const percent = formatPercent(fraction);
		const progress = fraction === null ? `${NONE}  nothing to reach` : `${bar(fraction, RATE_BAR_WIDTH)}  ${percent}`;
		rows.push([label, formatCount(reach), formatCount(sent), remaining, progress]);
		facts.push({
			label,
			values: [
				`audience ${formatCount(reach)}`,
				`sent ${formatCount(sent)}`,
				`remaining ${remaining}`,
				fraction === null ? `${NONE} nothing to reach` : `${bar(fraction, factBar)}  ${percent}`,
			],
		});
		if (sent > reach) left += sent - reach;
	}
	const table = fitTable(rows, ["left", "right", "right", "right", "left"], 2, layout.contentIndent, layout.available);
	if (table) lines.push(...table);
	else for (const fact of facts) lines.push(...factLines(fact.label, fact.values, layout.available, layout.contentIndent));

	// Progress above 100% is not an arithmetic error: a campaign audience is a
	// live segment (renew-2026 reaches "students who have NOT yet registered"), so
	// everyone who registers after the send leaves it and the denominator shrinks
	// underneath the campaign. The true percentage stays in the table — clamping
	// it would hide that the list moved — and this line says why it can exceed 100.
	if (left > 0) {
		note(
			`Sent exceeds the current audience — ${formatCount(left)} recipient${left === 1 ? " has" : "s have"} since left this segment (e.g. they have now registered).`,
		);
	}

	// Surfaced rather than swallowed: a recipient dropped for want of a mobile is
	// the difference between "the SMS went to everyone" and the truth.
	if (audience.smsSkipped !== null && audience.smsSkipped !== undefined && audience.smsSkipped > 0) {
		note(`Skipped ${formatCount(audience.smsSkipped)} recipient${audience.smsSkipped === 1 ? "" : "s"} — no mobile number on file.`);
	}
	return lines;
}

/** Bird's delivery truth for the campaign's SMS tag, plus a rate bar. */
function deliverySection(campaign: CampaignStats, now: Date, layout: Layout): string[] {
	const delivery: SmsDeliveryStats | null | undefined = campaign.delivery;
	const lines: string[] = [];
	const indent = layout.contentIndent;

	// A lookup failure degrades to a warning and the rest of the report still
	// prints: the local numbers above are the ones an operator acts on, and a
	// provider outage must not cost them those.
	if (campaign.deliveryError) {
		// Wrapped to the frame rather than truncated: the tail of an error message
		// is usually the part that names the cause.
		for (const line of wrapDisplay(`Warning — ${campaign.deliveryError}`, Math.max(MIN_WRAP_WIDTH, layout.available - indentWidth(indent)))) {
			lines.push(`${indent}${line}`);
		}
	}
	if (!delivery) {
		if (!campaign.deliveryError) {
			lines.push(`${indent}No Bird delivery records for this campaign's SMS tag yet.`);
		}
		return lines;
	}

	const counters: [string, string][] = [
		["Accepted", formatCount(delivery.accepted)],
		["Sent", formatCount(delivery.sent)],
		["Delivered", formatCount(delivery.delivered)],
		["Undelivered", formatCount(delivery.undelivered)],
		["Failed", formatCount(delivery.failed)],
		["Rejected", formatCount(delivery.rejected)],
		["Expired", formatCount(delivery.expired)],
	];
	const gridLines = fitGrid(counters, indent, layout.available);
	if (gridLines) lines.push(...gridLines);
	else lines.push(...factLines("", counters.map(([label, value]) => `${label} ${value}`), layout.available, indent));
	lines.push("");
	const rateBar = Math.max(4, Math.min(RATE_BAR_WIDTH, layout.available - indentWidth(indent) - 28));
	const rateCell =
		delivery.deliveryRate === null
			? `${NONE}  nothing accepted in this window`
			: `${padEndDisplay(formatPercent(delivery.deliveryRate), 6)}  ${bar(delivery.deliveryRate, rateBar)}`;
	const rateRows: string[][] = [
		["Delivery rate", rateCell],
		["Failure rate", delivery.failureRate === null ? NONE : `${formatPercent(delivery.failureRate)}  (undelivered + failed + expired)`],
		["Latency", `p50 ${formatMs(delivery.latency.p50)} ${DOT} p95 ${formatMs(delivery.latency.p95)} ${DOT} p99 ${formatMs(delivery.latency.p99)}`],
		["Period", `${formatIso(delivery.period.from)} → ${formatIso(delivery.period.to)}`],
		["Data as of", delivery.period.dataAsOf ? `${formatStamp(delivery.period.dataAsOf)} (${formatAge(delivery.period.dataAsOf, now)})` : NONE],
	];
	const rateLines = fitTable(rateRows, ["left", "left"], 2, indent, layout.available);
	if (rateLines) lines.push(...rateLines);
	else for (const [label, value] of rateRows) lines.push(...factLines(label, [value], layout.available, indent));

	if (delivery.trend.length > 0) {
		const sorted = [...delivery.trend].sort((a, b) => a.bucket.localeCompare(b.bucket));
		const shown = sorted.slice(-MAX_TREND_BUCKETS);
		const hidden = sorted.length - shown.length;
		lines.push("");
		lines.push(`${indent}Trend (${shown.length} of ${sorted.length} Bird bucket${sorted.length === 1 ? "" : "s"}, as reported)`);
		const rows: string[][] = [["Bucket", "Accepted", "Delivered", "Failed"]];
		for (const point of shown) {
			rows.push([formatBucket(point.bucket), formatCount(point.accepted), formatCount(point.delivered), formatCount(point.failed)]);
		}
		const trendIndent = `${indent}  `;
		const trendLines = fitTable(rows, ["left", "right", "right", "right"], 2, trendIndent, layout.available);
		if (trendLines) lines.push(...trendLines);
		else {
			// No room for four columns: one line per bucket, written out as facts.
			for (const point of shown) {
				lines.push(
					...factLines(
						formatBucket(point.bucket),
						[`accepted ${formatCount(point.accepted)}`, `delivered ${formatCount(point.delivered)}`, `failed ${formatCount(point.failed)}`],
						layout.available,
						trendIndent,
					),
				);
			}
		}
		if (hidden > 0) lines.push(`${trendIndent}… ${hidden} earlier bucket${hidden === 1 ? "" : "s"} not shown`);
	}
	return lines;
}

/**
 * `title · id`, trimmed to fit `budget`.
 *
 * The id is reserved before the title is cut: it is the string an operator types
 * into the CLI, while the title is decoration they have already read. Cutting the
 * whole heading instead would drop the id off the end of exactly the long Greek
 * titles this registry is full of.
 */
function campaignHeading(campaign: CampaignStats, budget: number): string {
	const title = inlineText(campaign.title) || campaign.campaignId;
	const id = inlineText(campaign.campaignId);
	if (title === id) return truncateDisplay(title, budget);
	const idPart = ` ${DOT} ${truncateDisplay(id, Math.max(MIN_WRAP_WIDTH, Math.floor(budget / 2)))}`;
	const titleBudget = Math.max(MIN_WRAP_WIDTH, budget - displayWidth(idPart));
	return `${truncateDisplay(title, titleBudget)}${idPart}`;
}

/** The per-campaign footer: first and last recorded send, wrapped to fit. */
function campaignFooter(campaign: CampaignStats, now: Date, layout: Layout): string[] {
	const first = campaign.firstSentAt ? `${formatStamp(campaign.firstSentAt)} (${formatAge(campaign.firstSentAt, now)})` : NONE;
	const last = campaign.lastSentAt ? `${formatStamp(campaign.lastSentAt)} (${formatAge(campaign.lastSentAt, now)})` : NONE;
	return factLines("", [`First sent ${first}`, `last sent ${last}`], layout.available, layout.contentIndent);
}

/**
 * What every section needs to know about the report around it.
 *
 * Bundled rather than passed as six positional arguments, because `detailed`
 * and `scale` are exactly the kind of booleans and objects that get swapped at a
 * call site without the compiler noticing.
 */
type RenderContext = {
	now: Date;
	windowDays: number;
	/** Indents and available width for this mode. */
	layout: Layout;
	/** True for a one-campaign report: the room for a day-by-day chart. */
	detailed: boolean;
	scale: ChartScale;
};

/** Everything above the totals block for one campaign. */
function campaignSection(campaign: CampaignStats, ctx: RenderContext): FrameSection {
	const { layout } = ctx;
	const configured = campaign.configuredChannels.map((channel) => channelLabel(channel)).join(" + ");
	const lines = factLines("", [`Channels configured: ${configured || NONE}`], layout.available, layout.contentIndent);
	lines.push("");
	lines.push(`${layout.titleIndent}Channel activity`);
	// `channels` only lists channels that have run, which can be fewer than the
	// configured set — the line above is what explains the missing row.
	if (campaign.channels.length === 0) {
		lines.push(`${layout.contentIndent}No sends recorded for this campaign yet.`);
	} else {
		lines.push(...channelRows(campaign.channels, ctx.now, layout));
	}
	// One campaign earns the day-by-day rows; several campaigns get one line each,
	// so a five-campaign report is a page rather than seventy rows of nothing.
	lines.push("", ...(ctx.detailed ? dailyChart(campaign, ctx.windowDays, layout) : compactChart(campaign, ctx.windowDays, ctx.scale, layout)));

	if (campaign.audience) {
		lines.push("", `${layout.titleIndent}Audience / progress (--live)`, ...audienceSection(campaign, campaign.audience, layout));
	}
	// `delivery` is present-and-null when Bird answered "no rows for this tag",
	// which is why the check is against undefined rather than truthiness.
	if (campaign.delivery !== undefined || campaign.deliveryError) {
		const tag = campaign.delivery ? `Delivery (Bird SMS tag ${campaign.delivery.tag})` : "Delivery";
		lines.push("", `${layout.titleIndent}${tag}`, ...deliverySection(campaign, ctx.now, layout));
	}

	lines.push("", ...campaignFooter(campaign, ctx.now, layout));
	return { heading: campaignHeading(campaign, layout.headingBudget), lines };
}

/**
 * The channel table, or one stacked fact line per channel when the table will
 * not fit. The `0` counts are printed rather than blanked either way: "sent 0"
 * and "no row at all" are different facts.
 */
function channelRows(channels: ChannelStats[], now: Date, layout: Layout): string[] {
	const rows: string[][] = [["Channel", "Sent", "Failed", "Today", "In window", "Last sent"]];
	for (const channel of channels) {
		rows.push([
			channelLabel(channel.channel),
			formatCount(channel.sent),
			formatCount(channel.failed),
			formatCount(channel.sentToday),
			formatCount(channel.sentInWindow),
			channel.lastSentAt ? `${formatStamp(channel.lastSentAt)} (${formatAge(channel.lastSentAt, now)})` : NONE,
		]);
	}
	const table = fitTable(rows, ["left", "right", "right", "right", "right", "left"], 2, layout.contentIndent, layout.available);
	if (table) return table;
	const lines: string[] = [];
	for (const channel of channels) {
		lines.push(
			...factLines(
				channelLabel(channel.channel),
				[
					`sent ${formatCount(channel.sent)}`,
					`failed ${formatCount(channel.failed)}`,
					`today ${formatCount(channel.sentToday)}`,
					`in window ${formatCount(channel.sentInWindow)}`,
					`last sent ${channel.lastSentAt ? `${formatStamp(channel.lastSentAt)} (${formatAge(channel.lastSentAt, now)})` : NONE}`,
				],
				layout.available,
				layout.contentIndent,
			),
		);
	}
	return lines;
}

/**
 * The campaign heading in plain mode.
 *
 * The title wraps over as many lines as it needs. The id — a slug with no spaces
 * to break at — goes on its own line, indented under a `·`, so that when it has
 * to be split the reader can see where the continuation starts instead of
 * meeting a fragment in the middle of the title.
 */
function plainHeadingLines(campaign: CampaignStats, width: number): string[] {
	const title = inlineText(campaign.title) || campaign.campaignId;
	const id = inlineText(campaign.campaignId);
	const lines = wrapDisplay(title, Math.max(MIN_WRAP_WIDTH, width - 2)).map((line) => `  ${line}`);
	if (id === title) return lines;
	wrapDisplay(id, Math.max(MIN_WRAP_WIDTH, width - 4)).forEach((line, i) => {
		lines.push(i === 0 ? `  ${DOT} ${line}` : `    ${line}`);
	});
	return lines;
}

/** The report-wide totals block. */
function totalsSection(report: StatsReport, layout: Layout): FrameSection {
	const { totals } = report;
	const rows: string[][] = [
		["Campaigns", formatCount(totals.campaigns), totals.campaigns === 1 ? "campaign with recorded activity" : "campaigns with recorded activity"],
		["Email sent", formatCount(totals.emailSent), `${formatCount(totals.emailFailed)} failed`],
		["SMS sent", formatCount(totals.smsSent), `${formatCount(totals.smsFailed)} failed`],
		["In window", formatCount(totals.sentInWindow), `last ${report.windowDays} day${report.windowDays === 1 ? "" : "s"}`],
		// The distinction matters: a recipient who failed on three runs is one
		// person and three records, and only one of those numbers is a headcount.
		["Failures", formatCount(totals.failureAttempts), "failure records, not distinct recipients"],
	];
	const table = fitTable(rows, ["left", "right", "left"], 3, layout.contentIndent, layout.available);
	const lines =
		table ??
		factLines(
			"",
			rows.map(([label, value, note]) => `${label} ${value}${note ? ` (${note})` : ""}`),
			layout.available,
			layout.contentIndent,
		);
	return { heading: "Totals", lines };
}

/* ------------------------------------------------------------------------- */
/* Frames                                                                    */
/* ------------------------------------------------------------------------- */

/**
 * The one inner width shared by every frame in the report, so the boxes line up.
 *
 * `cap` is the widest inner width the terminal can hold (`width - 4`), and it is a
 * hard ceiling rather than a preference: a frame that cannot fit is wrapped by
 * the terminal, and once it wraps the borders no longer describe anything.
 */
function frameWidth(sections: FrameSection[], cap: number): number {
	let needed = Math.min(MIN_INNER_WIDTH, cap);
	for (const section of sections) {
		needed = Math.max(needed, displayWidth(section.heading) + 4);
		for (const line of section.lines) needed = Math.max(needed, displayWidth(line));
	}
	return Math.max(1, Math.min(cap, needed));
}

/**
 * The hard invariant, applied to every line on the way out.
 *
 * The builders above are all width-aware, so this should never fire; it exists
 * because "no line exceeds the terminal" is the one property a report cannot
 * recover from, and one forgotten branch should not be able to break it.
 */
function clampLines(lines: string[], width: number): string[] {
	return lines.map((line) => truncateDisplay(line, width));
}

/**
 * Draws one light-style frame around a section.
 *
 * One frame style for the whole report, deliberately: a different border per
 * section would make a diff between two runs unreadable, and a monospace log has
 * no room for decoration that carries no meaning. Body lines are truncated as a
 * last resort so an unexpectedly long line can never break the right border.
 */
function renderFrame(section: FrameSection, inner: number): string[] {
	const heading = truncateDisplay(inlineText(section.heading), Math.max(1, inner - 4));
	const top = `┌─ ${heading} ${"─".repeat(Math.max(1, inner - displayWidth(heading) - 1))}┐`;
	const body = section.lines.map((line) => `│ ${padEndDisplay(truncateDisplay(line, inner), inner)} │`);
	const bottom = `└${"─".repeat(Math.max(1, inner + 2))}┘`;
	return [top, ...body, bottom];
}

/* ------------------------------------------------------------------------- */
/* Entry point                                                               */
/* ------------------------------------------------------------------------- */

/**
 * Renders the whole report as the text the CLI prints.
 *
 * The returned string always ends with exactly one `\n` — it is a complete
 * document, not a fragment — so the caller can hand it straight to
 * `console.log` (which adds nothing but the line break it is given) or write it
 * to a file for a diff between two runs.
 *
 * `options.single` changes two things. The header names the campaign instead of
 * the report, and the daily chart is drawn in full: with one campaign in front of
 * you, fourteen labelled rows are worth their space, while across five campaigns
 * they would bury the numbers under a wall of quiet days.
 *
 * `options.width` overrides the terminal width; see {@link resolveWidth} for what
 * happens when it is omitted. Nothing this function returns is ever wider than
 * that, whatever the data: a report that wraps is a report whose borders no
 * longer line up, and an operator reading a wrapped frame cannot tell a rendering
 * bug from a real number. Below {@link MIN_FRAMED_WIDTH} the box is dropped
 * altogether and sections are stacked, because a frame squeezed to 40 columns
 * would spend most of its width on its own decorations.
 */
export function renderStatsReport(report: StatsReport, options: { single?: boolean; width?: number } = {}): string {
	const width = resolveWidth(options.width);
	const now = parseDate(report.generatedAt) ?? new Date();
	const empty = report.campaigns.length === 0;
	const detailed = options.single === true;
	const title = options.single
		? `Campaign statistics — ${report.campaigns[0] ? inlineText(report.campaigns[0].title) || report.campaigns[0].campaignId : "unknown campaign"}`
		: "Campaign statistics — all campaigns";
	const subtitle =
		// No relative age on the generation stamp: it is the clock every other age
		// in the report is measured against, so "just now" would say nothing.
		`Window: last ${report.windowDays} day${report.windowDays === 1 ? "" : "s"} ${DOT} generated ${formatStamp(report.generatedAt)}`;
	const lines = [...wrapDisplay(title, width), ...wrapDisplay(subtitle, width)];

	if (empty) {
		lines.push("", "No campaign has been sent yet.", "Once a run records sends, they will be summarised here.");
		return `${clampLines(lines, width).join("\n")}\n`;
	}

	if (width < MIN_FRAMED_WIDTH) {
		// Plain mode: no box, sections stacked with their columns written out as
		// sentences. The frame is the first thing to go because it costs four
		// columns per line and carries no information of its own.
		const layout: Layout = { available: width, titleIndent: "  ", contentIndent: "    ", headingBudget: Number.POSITIVE_INFINITY };
		const scale = chartScale(report.campaigns, report.windowDays, layout);
		const ctx: RenderContext = { now, windowDays: report.windowDays, layout, detailed, scale };
		lines.push("─".repeat(width));
		for (const campaign of report.campaigns) {
			const section = campaignSection(campaign, ctx);
			// The heading is rendered here rather than taken from the section: plain
			// mode has no top border to fit it into, so it can wrap instead of cut.
			lines.push("", ...plainHeadingLines(campaign, width), ...section.lines);
		}
		const totals = totalsSection(report, layout);
		lines.push("", `${layout.titleIndent}${totals.heading}`, ...totals.lines);
		return `${clampLines(lines, width).join("\n")}\n`;
	}

	// Framed mode. Two passes, because one line inside a frame wraps to the frame's
	// width: the sections are built once against the widest frame allowed to
	// measure them, the shared width is decided from that, and then they are laid
	// out again so the wrap matches the box it ends up in. Every other line is
	// width-stable, so the second pass cannot grow past the width the first pass
	// measured. The frame costs four columns (two borders and two pads), which is
	// why the cap is the terminal width minus four.
	const cap = Math.min(MAX_INNER_WIDTH, width - 4);
	const build = (inner: number): FrameSection[] => {
		const layout: Layout = { available: inner, titleIndent: "", contentIndent: "  ", headingBudget: Math.max(MIN_WRAP_WIDTH, inner - 4) };
		const scale = chartScale(report.campaigns, report.windowDays, layout);
		const ctx: RenderContext = { now, windowDays: report.windowDays, layout, detailed, scale };
		return [...report.campaigns.map((campaign) => campaignSection(campaign, ctx)), totalsSection(report, layout)];
	};
	const inner = frameWidth(build(cap), cap);
	const sections = build(inner);
	lines.push("─".repeat(inner + 4));
	for (const section of sections) {
		lines.push("", ...renderFrame(section, inner));
	}
	return `${clampLines(lines, width).join("\n")}\n`;
}
