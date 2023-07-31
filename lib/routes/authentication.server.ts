import { routes as AuthenticationRoutes } from "./authentication.client";
import { Transaction, createSessionId, execTryCatch, executeQuery, generateLink, questionMarks } from "../utils";
import type { SysUser, SysUserRegisterLink } from "../../types/entities";
import { authentication } from "../middleware/authentication";

const serverRoutes = JSON.parse(JSON.stringify(AuthenticationRoutes)) as typeof AuthenticationRoutes;

serverRoutes.userLogin.func = async function (req) {
	return await execTryCatch(async () => {
		const credentials = await req.json();
		const [user] = await executeQuery<SysUser>("SELECT * FROM sys_users WHERE email = ? AND password = ? LIMIT 1", [
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

serverRoutes.registerSysUser.func = async function (req, slug) {
	const { link } = slug;
	return await execTryCatch(async (T: Transaction) => {
		const linkCheck = await T.execute<SysUserRegisterLink>("SELECT * FROM sys_user_register_links WHERE link = ?", [link]);
		if (linkCheck.length === 0) {
			throw new Error("Invalid Link");
		} else if (linkCheck[0].exp_date < Date.now()) {
			await T.execute("DELETE FROM sys_user_register_links WHERE link = ?", [link]);
			return "Link expired";
		}
		const args = Object.values(await req.json());
		const result = await T.execute(`INSERT INTO sys_users (email, password) VALUES (${questionMarks(args.length)})`, args);
		const [user] = await T.execute<Pick<SysUser, "session_id">>("SELECT session_id FROM sys_users WHERE id = ? LIMIT 1", [
			result.insertId
		]);
		return user;
	});
};

serverRoutes.authenticateSession.func = async function (req) {
	return await execTryCatch(async () => {
		const response = await authentication(req);
		if (response) return { isValid: false };
		return { isValid: true };
	});
};

serverRoutes.createRegisterLink.func = async function (req) {
	return await execTryCatch(async () => {
		const link = generateLink();
		const exp_date = Date.now() + 1000 * 60 * 60 * 24;
		await executeQuery("INSERT INTO sys_user_register_links (link, date) VALUES (?, ?)", [link, exp_date]);
		return link;
	});
};

export const AuthenticationServerRoutes = serverRoutes;
