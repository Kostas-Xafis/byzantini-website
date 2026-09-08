import { looseStringIncludes, removeAccents } from "@utilities/string";
import type { CellValue } from "./Row.solid";

/** Special column name: search across every searchable column at once. */
export const ALL_COLUMNS = "*" as const;

export type ComparatorOp = "=" | "!=" | ">" | "<" | ">=" | "<=";

/**
 * Splits a query into an optional comparison operator and the remaining
 * expression. Operators are matched before whitespace, so "> 2024" works too.
 */
export const parseComparator = (query: string): { op: ComparatorOp | ""; rest: string } => {
	const trimmed = query.trim();
	const match = trimmed.match(/^(>=|<=|!=|>|<|=)\s*(.*)$/s);
	return match ? { op: match[1] as ComparatorOp, rest: match[2] } : { op: "", rest: trimmed };
};

const formatDate = (ms: number): string => new Date(ms).toLocaleDateString("el-GR");

type DateRange = { from: number; to: number };

/**
 * Parses a date expression into a half-open range [from, to):
 * - `dd/mm/yyyy` → that day
 * - `mm/yyyy` → that month
 * - `yyyy` → that year
 * Returns null when the token is not a date expression.
 */
const parseDateToken = (token: string): DateRange | null => {
	if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(token)) {
		const [day, month, year] = token.split("/").map(Number);
		const from = new Date(year, month - 1, day).getTime();
		return { from, to: from + 86_400_000 };
	}
	if (/^\d{1,2}\/\d{4}$/.test(token)) {
		const [month, year] = token.split("/").map(Number);
		return { from: new Date(year, month - 1, 1).getTime(), to: new Date(year, month, 1).getTime() };
	}
	if (/^\d{4}$/.test(token)) {
		const year = Number(token);
		return { from: new Date(year, 0, 1).getTime(), to: new Date(year + 1, 0, 1).getTime() };
	}
	return null;
};

/**
 * Date column matching with day-level semantics:
 * - `05/02/2024` (or `=05/02/2024`) → that day
 * - `02/2024` → that whole month
 * - `2024` → that whole year
 * - `>`, `>=`, `<`, `<=`, `!=` compare against the day granularity.
 */
export const dateMatches = (ms: number, query: string): boolean => {
	if (!Number.isFinite(ms) || ms <= 0) return false;
	const { op, rest } = parseComparator(query);
	const range = parseDateToken(rest);
	if (!range) return looseStringIncludes(formatDate(ms), query);
	switch (op) {
		case ">":
			return ms >= range.to;
		case "<":
			return ms < range.from;
		case ">=":
			return ms >= range.from;
		case "<=":
			return ms < range.to;
		case "!=":
			return ms < range.from || ms >= range.to;
		default:
			return ms >= range.from && ms < range.to;
	}
};

/**
 * Number column matching. Supports `>`, `>=`, `<`, `<=`, `!=`, `=`
 * (exact) operators; a bare expression matches as a substring ("12"
 * matches "312"). Greek comma decimals ("50,5") are accepted.
 */
export const numberMatches = (value: unknown, query: string): boolean => {
	if (value === null || value === undefined || value === "") return false;
	const col = Number(value);
	if (!Number.isFinite(col)) return looseStringIncludes(String(value), query.trim());
	const { op, rest } = parseComparator(query);
	const normalized = rest.replace(/,/g, ".");
	const nVal = Number(normalized);
	if (rest === "" || !Number.isFinite(nVal)) return looseStringIncludes(String(col), query.trim());
	switch (op) {
		case ">":
			return col > nVal;
		case "<":
			return col < nVal;
		case ">=":
			return col >= nVal;
		case "<=":
			return col <= nVal;
		case "!=":
			return col !== nVal;
		default:
			return col === nVal || looseStringIncludes(String(col), normalized);
	}
};

/** Renders a cell the way the table does, so search looks at what the user sees. */
export const formatCellValue = (value: unknown, type: CellValue): string => {
	if (value === null || value === undefined || value === "") return "";
	switch (type) {
		case "boolean":
			return value ? "ναι" : "όχι";
		case "date":
			return typeof value === "number" && value > 0 ? formatDate(value) : String(value);
		default:
			return String(value);
	}
};

/** Matches a single cell (formatted) against a query, honoring the column type. */
export const cellMatches = (value: unknown, type: CellValue, query: string): boolean => {
	const needle = query.trim();
	if (!needle) return true;
	switch (type) {
		case "number":
			return numberMatches(value, needle);
		case "date":
			return typeof value === "number" ? dateMatches(value, needle) : looseStringIncludes(formatCellValue(value, type), needle);
		default: {
			const col = formatCellValue(value, type);
			return col !== "" && looseStringIncludes(col, needle);
		}
	}
};

/** Matches a row when ANY of its cells matches (all-columns mode). */
export const rowMatchesAny = (row: unknown[], types: CellValue[], query: string): boolean => {
	const needle = query.trim();
	if (!needle) return true;
	return row.some((cell, i) => {
		if (cell === null || cell === undefined || cell === "") return false;
		const type = types[i] ?? "string";
		return cellMatches(cell, type, needle);
	});
};

/**
 * Normalizes a string for accent/case-insensitive matching while keeping a
 * mapping from each normalized character back to its original index, so
 * matched ranges can be sliced out of the ORIGINAL string.
 */
const buildNormalizedIndexMap = (text: string) => {
	let norm = "";
	const map: number[] = [];
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		const decoded = removeAccents(ch).toLowerCase();
		if (decoded.length === 0) {
			// Lone combining mark in the source: keep it 1:1 for index stability.
			norm += ch.toLowerCase();
			map.push(i);
		} else {
			for (const d of decoded) {
				norm += d;
				map.push(i);
			}
		}
	}
	return { norm, map };
};

/**
 * Finds all (non-overlapping) accent/case-insensitive occurrences of `query`
 * inside `text` and returns their ranges as [start, end) indices of `text`.
 * Comparison operators ("=100", ">500") are ignored for highlighting — the
 * goal is to mark the literal matched substring.
 */
export const findHighlightRanges = (text: string, query: string): [number, number][] => {
	const needle = buildNormalizedIndexMap(parseComparator(query).rest).norm;
	if (!needle) return [];
	const { norm, map } = buildNormalizedIndexMap(text);
	const ranges: [number, number][] = [];
	let from = 0;
	for (;;) {
		const idx = norm.indexOf(needle, from);
		if (idx === -1) break;
		ranges.push([map[idx], map[idx + needle.length - 1] + 1]);
		from = idx + needle.length;
	}
	return ranges;
};
