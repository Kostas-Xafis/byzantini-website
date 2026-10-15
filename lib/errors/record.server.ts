import { executeQuery } from "@lib/utils.server";
import { describeError, errorFingerprint } from "./describe";

/**
 * Records an unexpected server error in `sys_errors` («Σφάλματα», migration 0008) — the source of the sysadmin's
 * error digest (services/emailWorker/src/errorDigest.ts). Never throws: a failing log must not hide the error.
 *
 * `source` is the API endpoint key (`Pupils.post`) or `page <path>` for a page that crashed.
 */
export async function recordServerError(entry: { source: string; status: number; error: unknown; host: string }): Promise<void> {
	try {
		const { name, message } = describeError(entry.error);
		const now = Date.now();
		await executeQuery(
			`INSERT INTO sys_errors (fingerprint, source, status, error_name, message, host, count, first_seen_at, last_seen_at)
			VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
			ON CONFLICT (fingerprint) DO UPDATE SET count = count + 1, last_seen_at = excluded.last_seen_at`,
			[
				errorFingerprint({ source: entry.source, status: entry.status, name, message, host: entry.host }),
				entry.source,
				entry.status,
				name,
				message,
				entry.host,
				now,
				now,
			],
		);
	} catch (error) {
		console.error("[errors] could not record a server error", error);
	}
}
