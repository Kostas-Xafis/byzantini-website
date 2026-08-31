import { z } from "astro/zod";
import type { SysUserRegisterLink, SysUsers } from "@_types/entities";
import { Random as R } from "@lib/random";
import { createSessionId, generateShaKey } from "@utilities/authentication";
import { executeQuery, questionMarks } from "@lib/utils.server";
import { z_LoginCredentials, z_SysUsers } from "@lib/api/schemas";
import { APIServer, handlerResult } from "./APIServer";
import { COOKIE } from "./cookies";
import { authenticateMiddleware } from "./middleware/authenticate";

/**
 * SysUsers — Phase 4 route group (contracts + handlers in one place).
 * Ported from lib/routes/sysusers.client|server.ts.
 *
 * Route keys (get, getById, getBySid, delete, registerSysUser,
 * createRegisterLink, validateRegisterLink) match the old client file exactly.
 *
 * NOTE: `getById`/`delete` read a JSON array body (`number[]`); the new system
 * only parses `body` when a schema is present, so a `z_IdArray` schema is added
 * (the old `validation: undefined` did not stop the handler from reading the
 * raw body). The Greek texts/messages are preserved byte-for-byte.
 */

const SYSUSER_OWNER_EMAIL = "koxafis@gmail.com";

const z_IdArray = z.array(z.number().int().min(0, "Μη έγκυρο id"));

/** Invite-email contract for `createRegisterLink` (was `v_SysUserInviteEmail`). */
const z_SysUserInviteEmail = z.object({
	email: z.email("Μη έγκυρο email"),
});

const z_RegisterSysUserResponse = z.object({
	session_id: z.string(),
	id: z.number().int(),
	email: z.email("Μη έγκυρο email"),
	avatar_url: z.string().nullable(),
});

export const sysusersRoutes = {
	get: new APIServer(
		{ method: "GET", path: "/sys", responseSchema: z.array(z_SysUsers.pick({ id: true, email: true })) },
		[authenticateMiddleware],
		() =>
			handlerResult(
				() => executeQuery<Pick<SysUsers, "id" | "email">>("SELECT id, email FROM sys_users"),
				"Σφάλμα κατά την ανάκτηση των χρηστών",
			),
	),
	getById: new APIServer(
		{ method: "POST", path: "/sys/id", schema: z_IdArray, responseSchema: z_SysUsers.pick({ id: true, email: true }) },
		[authenticateMiddleware],
		({ body }) =>
			handlerResult(async () => {
				const [id] = body as number[];
				const [user] = await executeQuery<Pick<SysUsers, "id" | "email">>("SELECT id, email FROM sys_users WHERE id = ? LIMIT 1", [id]);

				if (!user) throw Error("User not found");
				return user;
			}),
	),
	getBySid: new APIServer(
		{ method: "GET", path: "/sys/sid", responseSchema: z_SysUsers.pick({ id: true, email: true }) },
		[authenticateMiddleware],
		({ cookies }) =>
			handlerResult(async () => {
				const session_id = cookies.get(COOKIE.sessionId);
				const [user] = await executeQuery<Pick<SysUsers, "id" | "email">>("SELECT id, email FROM sys_users WHERE session_id = ? LIMIT 1", [session_id]);
				return user;
			}),
	),
	delete: new APIServer(
		{ method: "DELETE", path: "/sys", schema: z_IdArray },
		[authenticateMiddleware],
		({ body, cookies }) =>
			handlerResult(async (T) => {
				const session_id = cookies.get(COOKIE.sessionId);
				const [self] = await T.executeQuery<Pick<SysUsers, "id" | "email">>("SELECT id, email FROM sys_users WHERE session_id = ? LIMIT 1", [session_id]);
				if (!self) throw new Error("User not found");

				let ids = [...new Set((body as number[]).map(Number).filter((id) => Number.isInteger(id) && id > 0))];

				if (ids.includes(self.id)) {
					ids = ids.filter((userId) => userId !== self.id);
					await T.executeQuery("DELETE FROM sys_users WHERE id = ?", [self.id]);
					if (ids.length === 0) return "Deleted self successfully";
				}

				if (self.email !== SYSUSER_OWNER_EMAIL) {
					throw new Error("Δεν έχετε δικαίωμα διαγραφής άλλων διαχειριστών");
				}

				if (ids.length === 1) await T.executeQuery("DELETE FROM sys_users WHERE id = ?", [ids[0]]);
				else await T.executeQuery(`DELETE FROM sys_users WHERE id IN (${questionMarks(ids)})`, ids);
				return "User/s deleted successfully";
			}, "Σφάλμα κατά την διαγραφή των διαχειριστών"),
	),
	registerSysUser: new APIServer(
		{ method: "POST", path: "/sys/register/[link:string]", schema: z_LoginCredentials, responseSchema: z_RegisterSysUserResponse },
		({ params, body }) =>
			handlerResult(async (T) => {
				const linkCheck = await T.executeQuery<SysUserRegisterLink>("SELECT * FROM sys_user_register_links WHERE link = ?", [params.link]);
				if (linkCheck.length === 0) {
					throw new Error("Invalid Link");
				} else if (linkCheck[0].exp_date < Date.now()) {
					await T.executeQuery("DELETE FROM sys_user_register_links WHERE link = ?", [params.link]);
					throw new Error("Invalid Link");
				}

				const { email, password } = body;
				const key = await generateShaKey(password);

				const args = { email, password: key, ...createSessionId() };
				const { insertId } = await T.executeQuery("INSERT INTO sys_users (email, password, session_id, session_exp_date) VALUES (???)", args);
				return { id: insertId, session_id: args.session_id, email, avatar_url: null };
			}, "Σφάλμα κατά την εγγραφή του χρήστη"),
	),
	createRegisterLink: new APIServer(
		{ method: "POST", path: "/sys/register", schema: z_SysUserInviteEmail, responseSchema: z.object({ link: z.string() }) },
		[authenticateMiddleware],
		({ body, request, env }) =>
			handlerResult(async (T) => {
				const { email } = body;
				const [existingUser] = await T.executeQuery<Pick<SysUsers, "id">>("SELECT id FROM sys_users WHERE email = ? LIMIT 1", [email]);
				if (existingUser) throw new Error("Ο χρήστης υπάρχει ήδη");

				const link = R.link(64);
				// 24 hours expiration
				const exp_date = Date.now() + 1000 * 60 * 60 * 24;
				await T.executeQuery("INSERT INTO sys_user_register_links (link, exp_date) VALUES (?, ?)", [link, exp_date]);

				const { AUTOMATED_EMAILS_SERVICE_URL: service_url, AUTOMATED_EMAILS_SERVICE_AUTH_TOKEN: authToken } = env ?? {};
				if (!service_url || !authToken) throw Error("Unauthorized access to the email service");
				const signupLink = `${new URL(request.url).origin}/admin/signup/${link}`;
				await fetch(service_url, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						authToken,
						to: email,
						subject: "Πρόσκληση διαχειριστή",
						htmlTemplateName: "sysuser_register_link.html",
						templateData: { token: signupLink },
					}),
				});

				return { link };
			}, "Σφάλμα κατά την δημιουργία του συνδέσμου εγγραφής"),
	),
	validateRegisterLink: new APIServer(
		{ method: "POST", path: "/sys/register/validate/[link:string]", responseSchema: z.object({ isValid: z.boolean() }) },
		({ params }) =>
			handlerResult(async (T) => {
				const [{ exp_date }] = await T.executeQuery<Pick<SysUserRegisterLink, "exp_date">>(
					"SELECT exp_date FROM sys_user_register_links WHERE link = ? LIMIT 1",
					[params.link],
				);
				if (!exp_date) throw new Error("Invalid Link");
				if (exp_date < Date.now()) {
					await T.executeQuery("DELETE FROM sys_user_register_links WHERE link = ?", [params.link]);
					throw new Error("Invalid Link");
				}
				return { isValid: true };
			}, "Σφάλμα κατά τον έλεγχο του συνδέσμου εγγραφής"),
	),
};
