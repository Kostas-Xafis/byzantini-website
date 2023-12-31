import { SysUsersRoutes } from "./sysusers.client";
import { createSessionId, execTryCatch, executeQuery, generateLink, questionMarks } from "../utils.server";
import type { SysUserRegisterLink, SysUsers } from "../../types/entities";
import { getSessionId } from "./authentication.server";


const serverRoutes = JSON.parse(JSON.stringify(SysUsersRoutes)) as typeof SysUsersRoutes;

serverRoutes.get.func = async (ctx) => {
	return await execTryCatch(() => executeQuery<Pick<SysUsers, "id" | "email" | "privilege">>("SELECT id, email, privilege FROM sys_users"));
};

serverRoutes.getById.func = async (ctx) => {
	return await execTryCatch(async () => {
		const id = await ctx.request.json();
		const [user] = await executeQuery<SysUsers>("SELECT * FROM sys_users WHERE id = ? LIMIT 1", id);
		if (!user) throw Error("User not found");
		return user;
	});
};

serverRoutes.getBySid.func = async (ctx) => {
	return await execTryCatch(async () => {
		const session_id = getSessionId(ctx.request) as string;
		const [user] = await executeQuery<SysUsers>("SELECT * FROM sys_users WHERE session_id = ? LIMIT 1", [session_id]);
		return user;
	});
};

serverRoutes.delete.func = async (ctx) => {
	return await execTryCatch(async () => {
		let body = await ctx.request.json();
		const session_id = getSessionId(ctx.request) as string;
		const [{ id, privilege }] = await executeQuery<Pick<SysUsers, "id" | "privilege">>("SELECT id, privilege FROM sys_users WHERE session_id = ? LIMIT 1", [session_id]);
		if (body.includes(id)) {
			body = body.filter(id => id !== id);
			await executeQuery(`DELETE FROM sys_users WHERE id = ?`, [id]);
			if (body.length === 0) return "Deleted self successfully";
		}
		if (body.length === 1) await executeQuery(`DELETE FROM sys_users WHERE id = ? AND privilege < ?`, [body[0], privilege]);
		else await executeQuery(`DELETE FROM sys_users WHERE id IN (${questionMarks(body)}) AND privelege < ?`, [...body, privilege]);
		return "User/s deleted successfully";
	});
};


serverRoutes.registerSysUser.func = async (ctx, slug) => {
	const { link } = slug;
	return await execTryCatch(async T => {
		const linkCheck = await T.executeQuery<SysUserRegisterLink>("SELECT * FROM sys_user_register_links WHERE link = ?", [link]);
		if (linkCheck.length === 0) {
			throw new Error("Invalid Link");
		} else if (linkCheck[0].exp_date < Date.now()) {
			await T.executeQuery("DELETE FROM sys_user_register_links WHERE link = ?", [link]);
			throw new Error("Invalid Link");
		}

		// const SECRET = await import.meta.env.DB_PWD;
		// const body = await ctx.request.json();
		// const salt = randomBytes(16).toString("hex");
		// const hash = scryptSync(body.password + SECRET, salt, 64).toString("hex") + ":" + salt;
		// body.password = hash;

		const args = Object.values(await ctx.request.json()) as any[];
		const { session_id, session_exp_date } = createSessionId();
		args.push(linkCheck[0].privilege, session_id, session_exp_date);
		await T.executeQuery(`INSERT INTO sys_users (email, password, privilege, session_id, session_exp_date) VALUES (${questionMarks(args)})`, args);
		return { session_id };
	});
};

serverRoutes.createRegisterLink.func = async (ctx) => {
	return await execTryCatch(async () => {
		const link = generateLink();
		const exp_date = Date.now() + 1000 * 60 * 60 * 24;
		const session_id = getSessionId(ctx.request);
		const [{ privilege }] = await executeQuery<Pick<SysUsers, "privilege">>("SELECT privilege FROM sys_users WHERE session_id = ? LIMIT 1", [session_id]);
		await executeQuery("INSERT INTO sys_user_register_links (link, exp_date, privilege) VALUES (?, ?, ?)", [link, exp_date, privilege - 1]);
		return { link };
	});
};

serverRoutes.validateRegisterLink.func = async (ctx, slug) => {
	return await execTryCatch(async () => {
		const { link } = slug;
		const [{ exp_date }] = await executeQuery<Pick<SysUserRegisterLink, "exp_date">>("SELECT exp_date FROM sys_user_register_links WHERE link = ? LIMIT 1", [
			link
		]);
		if (!exp_date) throw new Error("Invalid Link");
		if (exp_date < Date.now()) {
			await executeQuery("DELETE FROM sys_user_register_links WHERE link = ?", [link]);
			throw new Error("Invalid Link");
		}
		return { isValid: true };
	});
};

export const SysUsersServerRoutes = serverRoutes;
