import { isOwnerEmail } from "@env/ownerEmail";
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

/**
 * Owner-only routes (the UI already hides them from other admins — this enforces it).
 * Use after `authenticateMiddleware`: `[authenticateMiddleware, ownerOnlyMiddleware]`.
 */
export const ownerOnlyMiddleware: MiddlewareFunction = async ({ cookies }) => {
	const session = await resolveSession(cookies.get(COOKIE.sessionId));
	if (!isOwnerEmail(session?.email)) return APIServer.jsonError("Forbidden", HTTP.FORBIDDEN);
};

/** Opens a session for `userId` and sets the HttpOnly session cookie on the response. */
export async function startSession(cookies: ServerCookies, request: Request, userId: number, method: SessionMethod) {
	const token = await createSession(userId, method, request.headers.get("user-agent"));
	cookies.set(COOKIE.sessionId, token, SESSION_COOKIE_OPTIONS);
}
