import type { SysUserRegisterLink, SysUsers } from "@_types/entities";
import { Env } from "@env/env";
import { Random as R } from "@lib/random";
import { createSessionId, generateShaKey, getSessionId } from "@utilities/authentication";
import { deepCopy } from "@utilities/objects";
import { getOriginFromContext } from "@utilities/url";
import { execTryCatch, executeQuery, getUsedBody, questionMarks } from "../utils.server";
import { SysUsersRoutes } from "./sysusers.client";

const SYSUSER_OWNER_EMAIL = "koxafis@gmail.com";

const serverRoutes = deepCopy(SysUsersRoutes);

serverRoutes.get.func = ({ ctx }) => {
	return execTryCatch(() => executeQuery<Pick<SysUsers, "id" | "email">>("SELECT id, email FROM sys_users"), "Σφάλμα κατά την ανάκτηση των χρηστών");
};

serverRoutes.getById.func = ({ ctx }) => {
	return execTryCatch(async () => {
		const [id] = getUsedBody(ctx) || await ctx.request.json();
		const [user] = await executeQuery<Pick<SysUsers, "id" | "email">>("SELECT id, email FROM sys_users WHERE id = ? LIMIT 1", [id]);

		if (!user) throw Error("User not found");
		return user;
	});
};

serverRoutes.getBySid.func = ({ ctx }) => {
	return execTryCatch(async () => {
		const session_id = getSessionId(ctx) as string;
		const [user] = await executeQuery<Pick<SysUsers, "id" | "email">>("SELECT id, email FROM sys_users WHERE session_id = ? LIMIT 1", [session_id]);
		return user;
	});
};

serverRoutes.delete.func = ({ ctx }) => {
	return execTryCatch(async T => {
		let body = (getUsedBody(ctx) || await ctx.request.json()) as number[];
		const session_id = getSessionId(ctx) as string;
		const [self] = await T.executeQuery<Pick<SysUsers, "id" | "email">>("SELECT id, email FROM sys_users WHERE session_id = ? LIMIT 1", [session_id]);
		if (!self) throw new Error("User not found");

		body = [...new Set(body.map(Number).filter(id => Number.isInteger(id) && id > 0))];

		if (body.includes(self.id)) {
			body = body.filter(userId => userId !== self.id);
			await T.executeQuery("DELETE FROM sys_users WHERE id = ?", [self.id]);
			if (body.length === 0) return "Deleted self successfully";
		}

		if (self.email !== SYSUSER_OWNER_EMAIL) {
			throw new Error("Δεν έχετε δικαίωμα διαγραφής άλλων διαχειριστών");
		}

		if (body.length === 1) await T.executeQuery("DELETE FROM sys_users WHERE id = ?", [body[0]]);
		else await T.executeQuery(`DELETE FROM sys_users WHERE id IN (${questionMarks(body)})`, body);
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

		const args = { email, password: key, ...createSessionId() };
		const { insertId } = await T.executeQuery("INSERT INTO sys_users (email, password, session_id, session_exp_date) VALUES (???)", args);
		return { id: insertId, session_id: args.session_id, email, avatar_url: null };
	}, "Σφάλμα κατά την εγγραφή του χρήστη");
};

serverRoutes.createRegisterLink.func = ({ ctx }) => {
	return execTryCatch(async T => {
		const { email } = (getUsedBody(ctx) || await ctx.request.json()) as { email: string; };
		const [existingUser] = await T.executeQuery<Pick<SysUsers, "id">>("SELECT id FROM sys_users WHERE email = ? LIMIT 1", [email]);
		if (existingUser) throw new Error("Ο χρήστης υπάρχει ήδη");

		const link = R.link(64);
		// 24 hours expiration
		const exp_date = Date.now() + 1000 * 60 * 60 * 24;
		await T.executeQuery("INSERT INTO sys_user_register_links (link, exp_date) VALUES (?, ?)", [link, exp_date]);

		// if (isProduction()) {
		const {
			AUTOMATED_EMAILS_SERVICE_URL: service_url,
			AUTOMATED_EMAILS_SERVICE_AUTH_TOKEN: authToken
		} = Env.env;
		if (!service_url || !authToken) throw Error("Unauthorized access to the email service");
		const signupLink = `${getOriginFromContext(ctx)}/admin/signup/${link}`;
		await fetch(service_url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify({
				authToken,
				to: email,
				subject: "Πρόσκληση διαχειριστή",
				htmlTemplateName: "sysuser_register_link.html",
				templateData: { token: signupLink }
			})
		});

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
