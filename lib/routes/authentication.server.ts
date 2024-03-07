import type { SysUsers } from "../../types/entities";
import { authentication, createSessionId, generateShaKey } from "../utils.auth";
import { deepCopy } from "../utils.client";
import { execTryCatch, executeQuery, getUsedBody } from "../utils.server";
import { AuthenticationRoutes } from "./authentication.client";

const serverRoutes = deepCopy(AuthenticationRoutes);


serverRoutes.userLogin.func = ({ ctx }) => {
	return execTryCatch(async () => {
		const credentials = getUsedBody(ctx) || await ctx.request.json();

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

serverRoutes.userLogout.func = ({ ctx }) => {
	return execTryCatch(async () => {
		const { sid } = getUsedBody(ctx) || await ctx.request.json();
		await executeQuery("UPDATE sys_users SET session_id = NULL, session_exp_date = NULL WHERE session_id = ?", [sid]);
		return "Logged out";
	});
};

serverRoutes.authenticateSession.func = ({ ctx }) => {
	return execTryCatch(async () => {
		const isAuthenticated = await authentication(ctx);
		return { isValid: isAuthenticated };
	});
};

export const AuthenticationServerRoutes = serverRoutes;
