import type { SysUsers } from "../../types/entities";
import { executeQuery } from "../utils.server";
import type { APIContext } from "astro";

const small_cache = new Map<string, boolean>(); // This actually works! Nice.

export const removeFromCache = (session_id: string) => {
	small_cache.delete(session_id);
};

export const getSessionId = (req: Request) => {
	const cookies = req.headers.get("cookie");
	if (!cookies) return null;
	let cookie = "" as string | undefined;
	if (cookies.indexOf(";") === -1) cookie = cookies;
	else
		cookie = cookies
			.replace(" ", "")
			.split(";")
			.find(cookie => cookie.startsWith("session_id"));
	if (!cookie) return null;
	return cookie.split("=")[1];
};

export async function authentication(ctx: APIContext) {
	const session_id = getSessionId(ctx.request);
	if (!session_id) return false;
	if (small_cache.has(session_id)) {
		// executeQuery("UPDATE cache_hits SET hits = hits + 1 WHERE cache_name = 'small_cache'");
		return true;
	}
	const [user] = await executeQuery<SysUsers>("SELECT * FROM sys_users WHERE session_id = ? LIMIT 1", [session_id]);
	const isValid = user !== undefined;
	if (isValid) small_cache.set(session_id, isValid);
	return isValid;
}
