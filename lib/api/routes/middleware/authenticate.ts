import { isSessionValid } from "@utilities/authentication";
import { COOKIE } from "../cookies";
import type { MiddlewareFunction } from "../APIServer";
import { APIServer, HTTP } from "../APIServer";

/**
 * Session authentication middleware (cookie `session_id` → sys_users lookup).
 * Attach via `[authenticateMiddleware]` on routes with `authentication: true`.
 */
export const authenticateMiddleware: MiddlewareFunction = async ({ cookies }) => {
	const sessionId = cookies.get(COOKIE.sessionId);
	if (!sessionId) return APIServer.jsonError("Unauthorized", HTTP.UNAUTHORIZED);
	const isValid = await isSessionValid(sessionId);
	if (!isValid) return APIServer.jsonError("Unauthorized", HTTP.UNAUTHORIZED);
};
