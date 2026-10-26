/**
 * What the «Σφάλματα» log keeps of an unexpected error — client-safe, no DB.
 *
 * Only the error's class and a scrubbed, truncated message: no stack, request body, cookie or query string. Emails
 * and long digit runs (ΑΜΚΑ, phone numbers, ids inside driver messages) are masked, so a message that quotes a
 * value cannot carry a pupil's data into the table or the sysadmin's inbox.
 */

export const MAX_ERROR_MESSAGE = 300;

export function scrubErrorMessage(text: string): string {
	const scrubbed = text
		.replace(/[^\s@<>"'(),;]+@[^\s@<>"'(),;]+\.[a-z]{2,}/gi, "<email>")
		.replace(/\d{6,}/g, "<number>")
		.replace(/\s+/g, " ")
		.trim();
	return scrubbed.length > MAX_ERROR_MESSAGE ? scrubbed.slice(0, MAX_ERROR_MESSAGE - 1) + "…" : scrubbed;
}

/** Class name and scrubbed message of anything thrown (an `Error`'s `cause` chain is appended, one level). */
export function describeError(error: unknown): { name: string; message: string } {
	if (error instanceof Error) {
		const cause = error.cause instanceof Error ? ` ← ${error.cause.name}: ${error.cause.message}` : "";
		return { name: error.name || "Error", message: scrubErrorMessage(`${error.message}${cause}`) || "(χωρίς μήνυμα)" };
	}
	return { name: typeof error, message: scrubErrorMessage(String(error)) || "(χωρίς μήνυμα)" };
}

/** One row per distinct error: the same failure repeating is counted, not stored again. */
export function errorFingerprint(parts: { source: string; status: number; name: string; message: string; host: string }): string {
	return [parts.host, parts.source, parts.status, parts.name, parts.message].join("|");
}
