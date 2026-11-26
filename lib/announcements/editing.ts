/**
 * Toolbar edits of the announcement editor (src/components/admin/AnnouncementTextEditor.solid.tsx), as pure
 * functions over the textarea's value and selection — client-safe and unit-tested. The marks are the ones
 * lib/announcements/format.ts renders.
 *
 * Each edit answers one replacement (`from`–`to` of the old text becomes `insert`) and the selection to set
 * afterwards, so the editor can apply it as a single, undoable insertion.
 */

export type TextEdit = { from: number; to: number; insert: string; selStart: number; selEnd: number };

/** Bold (`**`) or italic (`*`) around the selection; again on a marked selection takes the mark off. */
export function toggleWrap(value: string, start: number, end: number, marker: "**" | "*", placeholder: string): TextEdit {
	// Spaces at the edges of the selection stay outside the marks ("**λέξη** ", never "**λέξη **").
	while (start < end && /\s/.test(value[start])) start++;
	while (end > start && /\s/.test(value[end - 1])) end--;
	const m = marker.length;
	const selected = value.slice(start, end);

	// Already marked, with the marks just outside the selection: **[λέξη]**
	const before = value.slice(start - m, start);
	const after = value.slice(end, end + m);
	const outerIsMark = before === marker && after === marker && !(marker === "*" && value[start - 2] === "*" && value[end + 1] === "*");
	if (selected && outerIsMark) return { from: start - m, to: end + m, insert: selected, selStart: start - m, selEnd: end - m };
	// …or inside it: [**λέξη**]
	if (selected.length > 2 * m && selected.startsWith(marker) && selected.endsWith(marker)) {
		const inner = selected.slice(m, -m);
		const isOtherMark = marker === "*" && selected.startsWith("**") && !selected.startsWith("***");
		if (!isOtherMark) return { from: start, to: end, insert: inner, selStart: start, selEnd: start + inner.length };
	}

	const text = selected || placeholder;
	return { from: start, to: end, insert: marker + text + marker, selStart: start + m, selEnd: start + m + text.length };
}

export type LineStyle = "h2" | "ul" | "ol";

const LINE_PREFIX = /^(?:#{1,3}\s+|[-–•·]\s*(?=\S)|\*\s+|\d{1,3}[.)]\s+)/;
const STYLE_TEST: Record<LineStyle, RegExp> = {
	h2: /^#{1,3}\s+/,
	ul: /^(?:[-–•·]\s*(?=\S)|\*\s+)/,
	ol: /^\d{1,3}[.)]\s+/,
};

/** Heading / bulleted / numbered list on every line the selection touches; again on such lines makes them paragraphs. */
export function toggleLines(value: string, start: number, end: number, style: LineStyle): TextEdit {
	const from = value.lastIndexOf("\n", start - 1) + 1;
	// A selection ending right after a newline does not include the next line.
	const endAt = end > start && value[end - 1] === "\n" ? end - 1 : end;
	const nextBreak = value.indexOf("\n", endAt);
	const to = nextBreak === -1 ? value.length : nextBreak;
	const lines = value.slice(from, to).split("\n");

	const content = lines.filter((l) => l.trim());
	const allStyled = content.length > 0 && content.every((l) => STYLE_TEST[style].test(l.trim()) && !l.trim().startsWith("**"));
	let n = 0;
	const next = lines.map((line) => {
		const bare = line.trim().startsWith("**") ? line.trim() : line.trim().replace(LINE_PREFIX, "");
		if (!line.trim()) return line;
		if (allStyled) return bare;
		n++;
		return (style === "h2" ? "## " : style === "ul" ? "- " : `${n}. `) + bare;
	});
	const insert = next.join("\n");
	// One line: keep the caret at the end of it; several: select them all.
	return lines.length === 1
		? { from, to, insert, selStart: from + insert.length, selEnd: from + insert.length }
		: { from, to, insert, selStart: from, selEnd: from + insert.length };
}

const URL_LIKE = /^(?:https?:\/\/|www\.)\S+$/i;

/** `[κείμενο](https://…)`: the selected text becomes the label and the address is selected, ready to paste over. */
export function insertLink(value: string, start: number, end: number, placeholder: string): TextEdit {
	while (start < end && /\s/.test(value[start])) start++;
	while (end > start && /\s/.test(value[end - 1])) end--;
	const selected = value.slice(start, end);
	if (URL_LIKE.test(selected)) {
		const href = selected.startsWith("www.") ? "https://" + selected : selected;
		const insert = `[${placeholder}](${href})`;
		return { from: start, to: end, insert, selStart: start + 1, selEnd: start + 1 + placeholder.length };
	}
	const label = selected || placeholder;
	const insert = `[${label}](https://)`;
	const hrefStart = start + label.length + 3;
	return { from: start, to: end, insert, selStart: hrefStart, selEnd: hrefStart + "https://".length };
}
