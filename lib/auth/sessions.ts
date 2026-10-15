import type { SysUserSession, SysUsers } from "@_types/entities";
import { Random as R } from "@lib/random";
import { executeQuery } from "@lib/utils.server";
import { sha256Hex } from "./passwords";

/**
 * Admin sessions (server-only) — one `sys_user_sessions` row per signed-in device (migration 0008).
 *
 * The browser holds a random 256-bit token in the HttpOnly `session_id` cookie; the table stores only its
 * SHA-256 (`id`), so neither a database dump nor `query_logs` can be replayed as a login. Signing in on a
 * second device no longer signs the first one out, and signing out ends only the current device.
 */

/** Matches the cookie lifetime (`COOKIE_EXPIRES`, 7 days). */
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
/** `last_seen_at` is refreshed at most this often, so normal browsing does not write on every request. */
const LAST_SEEN_INTERVAL_MS = 1000 * 60 * 5;
/**
 * Per-isolate cache of resolved sessions. Kept short: a session ended on another isolate (sign-out,
 * revoked device, deleted admin) stops working everywhere within this window.
 */
const CACHE_TTL_MS = 1000 * 60;

export type SessionMethod = "password" | "google" | "apple" | "microsoft";

export type ResolvedSession = {
	/** SHA-256 of the cookie value — the row id. */
	id: string;
	userId: number;
	email: string;
	method: string;
	createdAt: number;
	expiresAt: number;
};

const cache = new Map<string, { session: ResolvedSession; cachedAt: number }>();

export const hashSessionToken = (token: string) => sha256Hex(token);

/** Opens a session for `userId`; returns the cookie value (the only place the raw token exists). */
export async function createSession(userId: number, method: SessionMethod, userAgent?: string | null): Promise<string> {
	const token = R.hex(64);
	const now = Date.now();
	await executeQuery("INSERT INTO sys_user_sessions (id, user_id, method, created_at, last_seen_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)", [
		await hashSessionToken(token),
		userId,
		method,
		now,
		now,
		now + SESSION_TTL_MS,
		userAgent?.slice(0, 256) ?? null,
	]);
	// Expired rows are dead weight; sweeping on sign-in keeps the table small without a cron.
	await executeQuery("DELETE FROM sys_user_sessions WHERE expires_at < ?", [now]);
	return token;
}

/** The live session behind a cookie value, or null when it is unknown, expired or its admin was deleted. */
export async function resolveSession(token: string | null | undefined): Promise<ResolvedSession | null> {
	if (!token) return null;
	const id = await hashSessionToken(token);
	const now = Date.now();
	const hit = cache.get(id);
	if (hit && now - hit.cachedAt < CACHE_TTL_MS && hit.session.expiresAt > now) return hit.session;
	cache.delete(id);

	const [row] = await executeQuery<
		Pick<SysUserSession, "id" | "user_id" | "method" | "created_at" | "expires_at" | "last_seen_at"> & Pick<SysUsers, "email">
	>(
		`SELECT s.id, s.user_id, s.method, s.created_at, s.expires_at, s.last_seen_at, u.email
		FROM sys_user_sessions s JOIN sys_users u ON u.id = s.user_id
		WHERE s.id = ? AND s.expires_at > ? LIMIT 1`,
		[id, now],
	);
	if (!row) return null;
	if (now - row.last_seen_at > LAST_SEEN_INTERVAL_MS) {
		await executeQuery("UPDATE sys_user_sessions SET last_seen_at = ? WHERE id = ?", [now, id]);
	}
	const session: ResolvedSession = { id, userId: row.user_id, email: row.email, method: row.method, createdAt: row.created_at, expiresAt: row.expires_at };
	cache.set(id, { session, cachedAt: now });
	return session;
}

export async function isSessionValid(token: string | null | undefined): Promise<boolean> {
	return (await resolveSession(token)) !== null;
}

/** Ends one session (by row id). */
export async function revokeSession(id: string, userId: number) {
	cache.delete(id);
	await executeQuery("DELETE FROM sys_user_sessions WHERE id = ? AND user_id = ?", [id, userId]);
}

/** Drops an admin's sessions from this isolate's cache (after their rows were deleted elsewhere). */
export function forgetUserSessions(userId: number, keepId?: string) {
	for (const [id, { session }] of cache) if (session.userId === userId && id !== keepId) cache.delete(id);
}

/** Ends every session of an admin, except `keepId` when given (the current device). */
export async function revokeUserSessions(userId: number, keepId?: string) {
	forgetUserSessions(userId, keepId);
	if (keepId) await executeQuery("DELETE FROM sys_user_sessions WHERE user_id = ? AND id <> ?", [userId, keepId]);
	else await executeQuery("DELETE FROM sys_user_sessions WHERE user_id = ?", [userId]);
}

export async function listSessions(userId: number) {
	return executeQuery<Omit<SysUserSession, "user_id">>(
		"SELECT id, method, created_at, last_seen_at, expires_at, user_agent FROM sys_user_sessions WHERE user_id = ? AND expires_at > ? ORDER BY last_seen_at DESC",
		[userId, Date.now()],
	);
}
