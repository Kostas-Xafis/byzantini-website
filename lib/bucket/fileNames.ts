/**
 * Stored file names of the admin uploads (location images, teachers' pictures/CVs, announcement photos).
 *
 * Every upload gets a short version suffix — `<base>-<base36 timestamp>.<ext>` ("Ι. Ναός Αγίας Τριάδος-mgz4k2q1.jpeg") —
 * so a re-upload never lands on the same key: the DB column the public pages build URLs from changes, and browsers/the
 * CDN cannot show the previous picture. Names stored before the suffix existed ("Γιώργος Παπαδόπουλος.png") keep
 * working: they are only parsed, never required to carry a suffix.
 *
 * Client-safe (no bindings).
 */

/** `-` + 8 base36 digits: `Date.now().toString(36)` is 8 digits from 1973 to 2059. */
const VERSION_SUFFIX = /-[0-9a-z]{8}$/;
/** Longest base kept, so a versioned name stays within `isSafeFileName`'s 200 characters. */
const MAX_BASE_LENGTH = 150;

/** Splits "a.b.jpeg" into `{ stem: "a.b", ext: "jpeg" }` (the extension is the part after the LAST dot; "" when none). */
export function splitFileName(name: string): { stem: string; ext: string } {
	const dot = name.lastIndexOf(".");
	if (dot <= 0) return { stem: name, ext: "" };
	return { stem: name.slice(0, dot), ext: name.slice(dot + 1) };
}

/** The name part of a stored file name, without extension or version suffix ("Νίκος-mgz4k2q1.png" → "Νίκος"). */
export function fileBaseName(name: string): string {
	return splitFileName(name).stem.replace(VERSION_SUFFIX, "");
}

/** A base usable as one key segment: no slashes or control characters, trimmed and clipped. */
export function safeBaseName(base: string): string {
	const clean = base
		.replace(/[\/\\\u0000-\u001f\u007f]+/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, MAX_BASE_LENGTH)
		.trim();
	return clean === "" || clean === "." || clean === ".." ? "file" : clean;
}

/** `<base>-<base36 timestamp>[.<ext>]` — a fresh name for every upload/rename. */
export function versionedFileName(base: string, ext: string, now = Date.now()): string {
	const name = safeBaseName(base) + "-" + now.toString(36);
	return ext ? name + "." + ext : name;
}

/** The file extension of an upload's MIME type ("image/jpeg" → "jpeg", "application/pdf" → "pdf"). */
export const extensionOfType = (type: string) => (type.split("/")[1] ?? "").split(/[;+]/)[0].trim();
