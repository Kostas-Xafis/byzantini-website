import { AuthenticationRoutes } from "./authentication.client";
import { createSessionId, execTryCatch, executeQuery } from "../utils.server";
import type { SysUsers } from "../../types/entities";
import { authentication } from "../middleware/authentication";
// import { scryptSync } from "node:crypto";

const serverRoutes = JSON.parse(JSON.stringify(AuthenticationRoutes)) as typeof AuthenticationRoutes;

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
