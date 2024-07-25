import type { SysUserRegisterLink, SysUsers } from "../../types/entities";
import { createSessionId, generateShaKey, getSessionId } from "../utils.auth";
import { deepCopy } from "../utils.client";
import { execTryCatch, executeQuery, generateLink, getUsedBody, questionMarks } from "../utils.server";
import { SysUsersRoutes } from "./sysusers.client";


const serverRoutes = deepCopy(SysUsersRoutes);

serverRoutes.get.func = ({ ctx }) => {
	return execTryCatch(() => executeQuery<Pick<SysUsers, "id" | "email" | "privilege">>("SELECT id, email, privilege FROM sys_users"));
};

serverRoutes.getById.func = ({ ctx }) => {
	return execTryCatch(async () => {
		const [id] = getUsedBody(ctx) || await ctx.request.json();
		const [user] = await executeQuery<SysUsers>("SELECT id, email, privilege FROM sys_users WHERE id = ? LIMIT 1", [id]);
		if (!user) throw Error("User not found");
		return user;
	});
};

serverRoutes.getBySid.func = ({ ctx }) => {
	return execTryCatch(async () => {
		const session_id = getSessionId(ctx.request) as string;
		const [user] = await executeQuery<SysUsers>("SELECT id, email, privilege FROM sys_users WHERE session_id = ? LIMIT 1", [session_id]);
		return user;
	});
};

serverRoutes.delete.func = ({ ctx }) => {
	return execTryCatch(async T => {
		let body = getUsedBody(ctx) || await ctx.request.json();
		const session_id = getSessionId(ctx.request) as string;
		const [{ id, privilege }] = await T.executeQuery<Pick<SysUsers, "id" | "privilege">>("SELECT id, privilege FROM sys_users WHERE session_id = ? LIMIT 1", [session_id]);
		if (body.includes(id)) {
			body = body.filter(id => id !== id);
			await T.executeQuery(`DELETE FROM sys_users WHERE id = ?`, [id]);
			if (body.length === 0) return "Deleted self successfully";
		}
		if (body.length === 1) await T.executeQuery(`DELETE FROM sys_users WHERE id = ? AND privilege < ?`, [body[0], privilege]);
		else await T.executeQuery(`DELETE FROM sys_users WHERE id IN (${questionMarks(body)}) AND privelege < ?`, [...body, privilege]);
		return "User/s deleted successfully";
	});
};


serverRoutes.registerSysUser.func = ({ ctx, slug }) => {
	const { link } = slug;
	return execTryCatch(async T => {
		const linkCheck = await T.executeQuery<SysUserRegisterLink>("SELECT * FROM sys_user_register_links WHERE link = ?", [link]);
		if (linkCheck.length === 0) {
			throw new Error("Invalid Link");
		} else if (linkCheck[0].exp_date < Date.now()) {
			await T.executeQuery("DELETE FROM sys_user_register_links WHERE link = ?", [link]);
			throw new Error("Invalid Link");
		}

		const { email, password } = getUsedBody(ctx) || await ctx.request.json();
		const key = await generateShaKey(password);

		const args = [email, key] as (string | number)[];
		const { session_id, session_exp_date } = createSessionId();
		args.push(linkCheck[0].privilege, session_id, session_exp_date);
		await T.executeQuery(`INSERT INTO sys_users (email, password, privilege, session_id, session_exp_date) VALUES (${questionMarks(args)})`, args);
		return { session_id };
	});
};

serverRoutes.createRegisterLink.func = ({ ctx }) => {
	return execTryCatch(async T => {
		const link = generateLink();
		const exp_date = Date.now() + 1000 * 60 * 60 * 24;
		const session_id = getSessionId(ctx.request);
		const [{ privilege }] = await T.executeQuery<Pick<SysUsers, "privilege">>("SELECT privilege FROM sys_users WHERE session_id = ? LIMIT 1", [session_id]);
		await T.executeQuery("INSERT INTO sys_user_register_links (link, exp_date, privilege) VALUES (?, ?, ?)", [link, exp_date, privilege - 1]);
		return { link };
	});
};

serverRoutes.validateRegisterLink.func = ({ ctx: _ctx, slug }) => {
	return execTryCatch(async T => {
		const { link } = slug;
		const [{ exp_date }] = await T.executeQuery<Pick<SysUserRegisterLink, "exp_date">>("SELECT exp_date FROM sys_user_register_links WHERE link = ? LIMIT 1", [
			link
		]);
		if (!exp_date) throw new Error("Invalid Link");
		if (exp_date < Date.now()) {
			await T.executeQuery("DELETE FROM sys_user_register_links WHERE link = ?", [link]);
			throw new Error("Invalid Link");
		}
		return { isValid: true };
	});
};

export const SysUsersServerRoutes = serverRoutes;
