import { AuthenticationRoutes } from "./authentication.client";
import { execTryCatch } from "../utils.server";
import type { SysUsers } from "../../types/entities";
import { executeQuery } from "../utils.server";
import { authentication, createSessionId, generateShaKey } from "../utils.auth";

const serverRoutes = JSON.parse(JSON.stringify(AuthenticationRoutes)) as typeof AuthenticationRoutes;


serverRoutes.userLogin.func = async (ctx) => {
	return await execTryCatch(async () => {
		const credentials = await ctx.request.json();

		const [sysUser] = await executeQuery<SysUsers>("SELECT * FROM sys_users WHERE email = ? LIMIT 1", [credentials.email]);
		if (!sysUser) return { isValid: false };

		const [hash, salt] = sysUser.password.split(":");
		const key = (await generateShaKey(credentials.password, salt)).split(":")[0];

		const isValid = key === hash;
		if (!isValid) return { isValid };

		const { session_exp_date, session_id } = createSessionId();
		await executeQuery("UPDATE sys_users SET session_id = ?, session_exp_date = ? WHERE email = ?", [
			session_id,
			session_exp_date,
			credentials.email
		]);
		return { isValid, session_id };
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
