import { can, PERMISSIONS, ROLE_LABELS, type Permission } from "@lib/auth/roles";
import { createSession, resolveSession, type ResolvedSession, type SessionMethod } from "@lib/auth/sessions";
import { APIError } from "../APIError";
import { COOKIE, SESSION_COOKIE_OPTIONS, type ServerCookies } from "../cookies";
import type { MiddlewareFunction } from "../APIServer";
import { APIServer, HTTP } from "../APIServer";

/**
 * Session authentication middleware (cookie `session_id` → `sys_user_sessions`, lib/auth/sessions.ts).
 * Attach via `[authenticateMiddleware]` on routes that need a signed-in admin.
 */
export const authenticateMiddleware: MiddlewareFunction = async ({ cookies }) => {
	if (!(await resolveSession(cookies.get(COOKIE.sessionId)))) return APIServer.jsonError("Unauthorized", HTTP.UNAUTHORIZED);
};

/**
 * The signed-in admin of a request (handlers behind `authenticateMiddleware`). Resolving twice is cheap:
 * the session is cached per isolate.
 */
export async function currentSession(cookies: ServerCookies): Promise<ResolvedSession> {
	const session = await resolveSession(cookies.get(COOKIE.sessionId));
	if (!session) throw new APIError(HTTP.UNAUTHORIZED, "Η συνεδρία έληξε. Συνδεθείτε ξανά.");
	return session;
}

/** The 403 message for a permission: who may use it, in Greek. */
export const forbiddenMessage = (permission: Permission) =>
	`Δεν έχετε δικαίωμα για αυτή την ενέργεια (μόνο: ${PERMISSIONS[permission].map((role) => ROLE_LABELS[role]).join(", ")}).`;

/**
 * Role check (lib/auth/roles.ts). The UI hides what an admin cannot use — this enforces it.
 * Use after `authenticateMiddleware`: `[authenticateMiddleware, requirePermission("queryLogs")]`.
 */
export const requirePermission =
	(permission: Permission): MiddlewareFunction =>
	async ({ cookies }) => {
		const session = await resolveSession(cookies.get(COOKIE.sessionId));
		if (!can(session?.role, permission)) return APIServer.jsonError(forbiddenMessage(permission), HTTP.FORBIDDEN);
	};

/** Opens a session for `userId` and sets the HttpOnly session cookie on the response. */
export async function startSession(cookies: ServerCookies, request: Request, userId: number, method: SessionMethod) {
	const token = await createSession(userId, method, request.headers.get("user-agent"));
	cookies.set(COOKIE.sessionId, token, SESSION_COOKIE_OPTIONS);
}
