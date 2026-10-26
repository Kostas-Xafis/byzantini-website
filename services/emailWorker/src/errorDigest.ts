/**
 * «Σφάλματα» digest (docs/ERROR_ALERTING.md, option A).
 *
 * The website records unexpected server errors in D1 (`sys_errors`, one row per distinct error, counted —
 * lib/errors/record.server.ts in the site). This worker's cron (every 15 minutes, `triggers` in wrangler.jsonc)
 * emails the sysadmins the rows seen since they were last notified, then marks them notified. Nothing is sent
 * when there is nothing new. Rows older than 90 days are deleted on every run.
 *
 * Recipients: every `sys_users` row with role `sysadmin` — never the owner or the secretaries. The rows hold no
 * personal data (the site scrubs messages before storing them), and the email links to the «Σφάλματα» page.
 */

/** Minimal slice of D1 this module uses — keeps the tests free of workerd. */
export interface DigestDb {
	prepare(query: string): {
		bind(...values: unknown[]): {
			all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
			run(): Promise<unknown>;
		};
	};
}

export interface SysErrorRow {
	id: number;
	source: string;
	status: number;
	error_name: string;
	message: string;
	host: string;
	count: number;
	first_seen_at: number;
	last_seen_at: number;
	notified_at: number | null;
}

export type DeliverFn = (email: { to: string; subject: string; html: string; label: string }) => Promise<void>;

/** Where the sysadmin reads the full list. */
export const ERRORS_PAGE_URL = "https://musicschool-metamorfosi.gr/admin/errors";
/** At most this many rows per email (the page has the rest). */
export const DIGEST_LIMIT = 50;
export const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export interface DigestResult {
	sent: number;
	errors: number;
	pruned: boolean;
}

export async function runErrorDigest(db: DigestDb, deliver: DeliverFn, now = Date.now()): Promise<DigestResult> {
	await db.prepare("DELETE FROM sys_errors WHERE last_seen_at < ?").bind(now - RETENTION_MS).run();

	const { results: rows } = await db
		.prepare(
			"SELECT id, source, status, error_name, message, host, count, first_seen_at, last_seen_at, notified_at " +
				"FROM sys_errors WHERE last_seen_at > COALESCE(notified_at, 0) ORDER BY last_seen_at DESC LIMIT ?",
		)
		.bind(DIGEST_LIMIT)
		.all<SysErrorRow>();
	if (rows.length === 0) return { sent: 0, errors: 0, pruned: true };

	const { results: admins } = await db
		.prepare("SELECT email FROM sys_users WHERE role = 'sysadmin' AND email <> ''")
		.bind()
		.all<{ email: string }>();
	if (admins.length === 0) {
		console.warn("[errors] new server errors but no sysadmin to notify");
		return { sent: 0, errors: rows.length, pruned: true };
	}

	const subject = digestSubject(rows);
	const html = renderDigest(rows, now);
	for (const { email } of admins) await deliver({ to: email, subject, html, label: "error-digest" });

	// Marked only after every send succeeded: a failed send is retried on the next run.
	const ids = rows.map((row) => row.id);
	await db
		.prepare(`UPDATE sys_errors SET notified_at = ? WHERE id IN (${ids.map(() => "?").join(", ")})`)
		.bind(now, ...ids)
		.run();
	console.log(`[errors] digest of ${rows.length} error(s) sent to ${admins.length} sysadmin(s)`);
	return { sent: admins.length, errors: rows.length, pruned: true };
}

export function digestSubject(rows: SysErrorRow[]): string {
	const total = rows.reduce((sum, row) => sum + row.count, 0);
	const kinds = rows.length === 1 ? "1 σφάλμα" : `${rows.length} σφάλματα`;
	return `[Ιστοσελίδα] ${kinds} διακομιστή (${total} ${total === 1 ? "φορά" : "φορές"})`;
}

const escapeHtml = (text: string) =>
	text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const when = (ms: number) =>
	new Date(ms).toLocaleString("el-GR", {
		timeZone: "Europe/Athens",
		day: "numeric",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	});

/** A plain, inline-styled HTML email (no template in R2: it must work even when template publishing broke). */
export function renderDigest(rows: SysErrorRow[], now = Date.now()): string {
	const items = rows
		.map((row) => {
			const recurring = row.notified_at !== null ? " (ξανά μετά την προηγούμενη ειδοποίηση)" : "";
			return (
				`<tr><td style="padding:10px 0;border-bottom:1px solid #eee">` +
				`<div style="font-weight:bold">${escapeHtml(row.source)} · HTTP ${row.status} · ` +
				`${row.count} ${row.count === 1 ? "φορά" : "φορές"}${recurring}</div>` +
				`<div style="font-family:monospace;font-size:13px;margin:4px 0">` +
				`${escapeHtml(row.error_name)}: ${escapeHtml(row.message)}</div>` +
				`<div style="color:#666;font-size:12px">τελευταία ${when(row.last_seen_at)} · ` +
				`πρώτη ${when(row.first_seen_at)} · ${escapeHtml(row.host)}</div>` +
				`</td></tr>`
			);
		})
		.join("");
	return (
		`<!doctype html><html lang="el"><body style="font-family:system-ui,sans-serif;color:#222">` +
		`<h2 style="color:#7f1d1d">Σφάλματα διακομιστή</h2>` +
		`<p>Νέα ή επαναλαμβανόμενα απρόσμενα σφάλματα στην ιστοσελίδα (έλεγχος ${when(now)}):</p>` +
		`<table style="border-collapse:collapse;width:100%">${items}</table>` +
		`<p><a href="${ERRORS_PAGE_URL}" style="color:#7f1d1d">Όλα τα σφάλματα στη σελίδα «Σφάλματα»</a></p>` +
		`<p style="color:#666;font-size:12px">Αυτόματο μήνυμα προς τον διαχειριστή συστήματος.</p>` +
		`</body></html>`
	);
}
