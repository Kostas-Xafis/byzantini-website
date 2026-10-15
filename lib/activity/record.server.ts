import { resolveSession } from "@lib/auth/sessions";
import { executeQuery } from "@lib/utils.server";
import type { APIServer } from "@lib/api/routes/APIServer";
import { COOKIE, type ServerCookies } from "@lib/api/routes/cookies";
import { ROLE_LABELS, isRole } from "@lib/auth/roles";
import { ACTIVITY_LABELS } from "./labels";

/**
 * The activity log («Ιστορικό ενεργειών», `sys_activity`, migration 0008): one row per successful change
 * an admin makes, written by `APIServer.afterWrite` (installed in `lib/api/routes/index.ts`).
 *
 * A row keeps the admin's email next to their id, so it stays readable after the account is deleted.
 * The summary names the target (ids, a title or name, the new role) — never a password or a whole body.
 * Rows older than RETENTION_MS are swept now and then.
 */
const RETENTION_MS = 1000 * 60 * 60 * 24 * 365 * 2;
const SUMMARY_MAX = 200;

/** Fields that name what was changed, in the order they are worth showing. */
const NAME_FIELDS = ["title", "fullname", "name", "student_name", "email", "school_year", "role"] as const;
const ID_FIELDS = ["id", "pupil_id", "book_id", "teacher_id", "location_id", "announcement_id", "am"] as const;

/** A short, human description of the target of a change, from the path params and the body. */
export function summarize(params: Record<string, string | number>, body: unknown): string {
	const parts: string[] = [];
	const ids = new Set<string>();
	for (const [key, value] of Object.entries(params)) if (key !== "token" && key !== "link" && typeof value === "number") ids.add(String(value));

	if (Array.isArray(body)) {
		for (const item of body) if (typeof item === "number" || typeof item === "string") ids.add(String(item));
	} else if (body && typeof body === "object") {
		const record = body as Record<string, unknown>;
		const fullName = [record.last_name, record.first_name].filter((v) => typeof v === "string" && v.trim()).join(" ");
		if (fullName) parts.push(fullName);
		for (const field of NAME_FIELDS) {
			const value = record[field];
			if (typeof value === "string" && value.trim()) parts.push(field === "role" && isRole(value) ? `ρόλος: ${ROLE_LABELS[value]}` : value.trim());
		}
		for (const field of ID_FIELDS) {
			const value = record[field];
			if (typeof value === "number" || (typeof value === "string" && value && field === "am")) ids.add(field === "am" ? `ΑΜ ${value}` : String(value));
		}
		if (Array.isArray(record.ids)) for (const id of record.ids) if (typeof id === "number") ids.add(String(id));
	}
	const idList = [...ids].map((id) => (id.startsWith("ΑΜ") ? id : `#${id}`));
	const shownIds = idList.length > 8 ? [...idList.slice(0, 8), `+${idList.length - 8}`] : idList;
	const summary = [...new Set(parts), shownIds.join(", ")].filter(Boolean).join(" · ");
	return summary.length > SUMMARY_MAX ? summary.slice(0, SUMMARY_MAX - 1) + "…" : summary;
}

export async function recordActivity({
	route,
	params,
	body,
	cookies,
}: {
	route: APIServer;
	params: Record<string, string | number>;
	body: unknown;
	cookies: ServerCookies;
}) {
	const label = route.endpoint ? ACTIVITY_LABELS[route.endpoint] : undefined;
	if (!label) return;
	const session = await resolveSession(cookies.get(COOKIE.sessionId));
	if (!session) return; // public form, or the change ended the session (own account deleted)
	const now = Date.now();
	await executeQuery("INSERT INTO sys_activity (created_at, user_id, user_email, endpoint, label, summary) VALUES (?, ?, ?, ?, ?, ?)", [
		now,
		session.userId,
		session.email,
		route.endpoint,
		label,
		summarize(params, body) || null,
	]);
	if (Math.random() < 0.02) await executeQuery("DELETE FROM sys_activity WHERE created_at < ?", [now - RETENTION_MS]);
}
