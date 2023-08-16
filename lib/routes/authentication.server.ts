import { AuthenticationRoutes } from "./authentication.client";
import { createSessionId, execTryCatch, executeQuery } from "../utils";
import type { SysUsers } from "../../types/entities";
import { authentication } from "../middleware/authentication";
// import { scryptSync } from "node:crypto";

const serverRoutes = JSON.parse(JSON.stringify(AuthenticationRoutes)) as typeof AuthenticationRoutes;

serverRoutes.userLogin.func = async function (req) {
	return await execTryCatch(async () => {
		const credentials = await req.json();
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

serverRoutes.authenticateSession.func = async function (req) {
	return await execTryCatch(async () => {
		const response = await authentication(req);
		if (response) return { isValid: false };
		return { isValid: true };
	});
};

export const AuthenticationServerRoutes = serverRoutes;
