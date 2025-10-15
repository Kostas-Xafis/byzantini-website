import type { SysUserRegisterLink, SysUsers } from "@_types/entities";
import { createSessionId, generateShaKey, getSessionId } from "@utilities/authentication";
import { deepCopy } from "@utilities/objects";
import { Random as R } from "@lib/random";
import { execTryCatch, executeQuery, getUsedBody, questionMarks } from "../utils.server";
import { SysUsersRoutes } from "./sysusers.client";


const serverRoutes = deepCopy(SysUsersRoutes);

serverRoutes.get.func = ({ ctx }) => {
	return execTryCatch(() => executeQuery<Pick<SysUsers, "id" | "email" | "privilege">>("SELECT id, email, privilege FROM sys_users"), "Σφάλμα κατά την ανάκτηση των χρηστών");
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
		const session_id = getSessionId(ctx) as string;
		const [user] = await executeQuery<SysUsers>("SELECT id, email, privilege FROM sys_users WHERE session_id = ? LIMIT 1", [session_id]);
		return user;
	});
};

serverRoutes.delete.func = ({ ctx }) => {
	return execTryCatch(async T => {
		let body = getUsedBody(ctx) || await ctx.request.json();
		const session_id = getSessionId(ctx) as string;
		const [{ id, privilege }] = await T.executeQuery<Pick<SysUsers, "id" | "privilege">>("SELECT id, privilege FROM sys_users WHERE session_id = ? LIMIT 1", [session_id]);
		if (body.includes(id)) {
			body = body.filter(id => id !== id);
			await T.executeQuery(`DELETE FROM sys_users WHERE id = ?`, [id]);
			if (body.length === 0) return "Deleted self successfully";
		}
		if (body.length === 1) await T.executeQuery(`DELETE FROM sys_users WHERE id = ? AND privilege < ?`, [body[0], privilege]);
		else await T.executeQuery(`DELETE FROM sys_users WHERE id IN (${questionMarks(body)}) AND privelege < ?`, [...body, privilege]);
		return "User/s deleted successfully";
	}, "Σφάλμα κατά την διαγραφή των διαχειριστών");
};


serverRoutes.registerSysUser.func = ({ ctx, slug }) => {
	return execTryCatch(async T => {
		const linkCheck = await T.executeQuery<SysUserRegisterLink>("SELECT * FROM sys_user_register_links WHERE link = ?", slug);
		if (linkCheck.length === 0) {
			throw new Error("Invalid Link");
		} else if (linkCheck[0].exp_date < Date.now()) {
			await T.executeQuery("DELETE FROM sys_user_register_links WHERE link = ?", slug);
			throw new Error("Invalid Link");
		}

		const { email, password } = getUsedBody(ctx) || await ctx.request.json();
		const key = await generateShaKey(password);

		const args = { email, password: key, privilege: linkCheck[0].privilege, ...createSessionId() };
		const { insertId } = await T.executeQuery(`INSERT INTO sys_users (email, password, privilege, session_id, session_exp_date) VALUES (???)`, args);
		return { id: insertId, session_id: args.session_id };
	}, "Σφάλμα κατά την εγγραφή του χρήστη");
};

serverRoutes.createRegisterLink.func = ({ ctx }) => {
	return execTryCatch(async T => {
		const link = R.link(64);
		// 24 hours expiration
		const exp_date = Date.now() + 1000 * 60 * 60 * 24;
		const session_id = getSessionId(ctx);
		const [{ privilege }] = await T.executeQuery<Pick<SysUsers, "privilege">>("SELECT privilege FROM sys_users WHERE session_id = ? LIMIT 1", [session_id]);
		await T.executeQuery("INSERT INTO sys_user_register_links (link, exp_date, privilege) VALUES (?, ?, ?)", [link, exp_date, privilege - 1]);
		return { link };
	}, "Σφάλμα κατά την δημιουργία του συνδέσμου εγγραφής");
};

serverRoutes.validateRegisterLink.func = ({ ctx: _ctx, slug }) => {
	return execTryCatch(async T => {
		const [{ exp_date }] = await T.executeQuery<Pick<SysUserRegisterLink, "exp_date">>("SELECT exp_date FROM sys_user_register_links WHERE link = ? LIMIT 1", slug);
		if (!exp_date) throw new Error("Invalid Link");
		if (exp_date < Date.now()) {
			await T.executeQuery("DELETE FROM sys_user_register_links WHERE link = ?", slug);
			throw new Error("Invalid Link");
		}
		return { isValid: true };
	}, "Σφάλμα κατά τον έλεγχο του συνδέσμου εγγραφής");
};

export const SysUsersServerRoutes = serverRoutes;
