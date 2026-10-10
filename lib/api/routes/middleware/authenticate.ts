import type { SysUsers } from "@_types/entities";
import { isOwnerEmail } from "@env/ownerEmail";
import { executeQuery } from "@lib/utils.server";
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

/**
 * Owner-only routes (the UI already hides them from other admins — this enforces it).
 * Use after `authenticateMiddleware`: `[authenticateMiddleware, ownerOnlyMiddleware]`.
 */
export const ownerOnlyMiddleware: MiddlewareFunction = async ({ cookies }) => {
	const [user] = await executeQuery<Pick<SysUsers, "email">>("SELECT email FROM sys_users WHERE session_id = ? LIMIT 1", [cookies.get(COOKIE.sessionId)]);
	if (!isOwnerEmail(user?.email)) return APIServer.jsonError("Forbidden", HTTP.FORBIDDEN);
};
