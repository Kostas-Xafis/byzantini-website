import { AuthenticationRoutes } from "./authentication.client";
import { createSessionId, execTryCatch } from "../utils.server";
import type { SysUsers } from "../../types/entities";
import { executeQuery } from "../utils.server";
import type { APIContext } from "astro";
// import { scryptSync } from "node:crypto";

const serverRoutes = JSON.parse(JSON.stringify(AuthenticationRoutes)) as typeof AuthenticationRoutes;

const small_cache = new Map<string, boolean>(); // This actually works! Nice.

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
	else small_cache.delete(session_id);
	return isValid;
}

serverRoutes.userLogin.func = async (ctx) => {
	return await execTryCatch(async () => {
		const credentials = await ctx.request.json();
		// const SECRET = await import.meta.env.DB_PWD;
		// const salt = (await executeQuery<string>("SELECT password FROM sys_users WHERE email = ? LIMIT 1", [credentials.email]))[0].split(":")[1];
		// const hash = scryptSync(credentials.password + SECRET, salt, 64).toString("hex") + ":" + salt;

		const [user] = await executeQuery<SysUsers>("SELECT * FROM sys_users WHERE email = ? AND password = ? LIMIT 1", [
			credentials.email,
			credentials.password
		]);
		const isValid = user !== undefined;
		if (isValid) {
			const { session_exp_date, session_id } = createSessionId();
			await executeQuery("UPDATE sys_users SET session_id = ?, session_exp_date = ? WHERE email = ?", [
				session_id,
				session_exp_date,
				credentials.email
			]);
			return { isValid, session_id };
		} else {
			return { isValid };
		}
	});
};

serverRoutes.userLogout.func = async (ctx) => {
	return await execTryCatch(async () => {
		const { sid } = await ctx.request.json();
		await executeQuery("UPDATE sys_users SET session_id = NULL, session_exp_date = NULL WHERE session_id = ?", [sid]);
		return "Logged out";
	});
};

serverRoutes.authenticateSession.func = async (ctx) => {
	return await execTryCatch(async () => {
		const isAuthenticated = await authentication(ctx);
		return { isValid: isAuthenticated };
	});
};

export const AuthenticationServerRoutes = serverRoutes;
