import type { SysUserRegisterLink, SysUsers } from "@_types/entities";
import { isOwnerEmail } from "@env/ownerEmail";
import { z_LoginCredentials, z_SysUsers } from "@lib/api/schemas";
import { Random as R } from "@lib/random";
import type { Transaction } from "@lib/db";
import { executeQuery, questionMarks } from "@lib/utils.server";
import { createSessionId, generateShaKey } from "@utilities/authentication";
import { z } from "astro/zod";
import { APIServer, handlerResult } from "./APIServer";
import { COOKIE, SESSION_COOKIE_OPTIONS } from "./cookies";
import { sendAutomatedEmail } from "./emailService";
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

/**
 * Uses up an unexpired invite issued for `email`. A single `DELETE … RETURNING`
 * statement, so the same link can never create two accounts (no transaction needed).
 */
export async function consumeRegisterLink(T: Transaction, link: string, email: string): Promise<boolean> {
	const consumed = await T.executeQuery<Pick<SysUserRegisterLink, "link">>(
		"DELETE FROM sys_user_register_links WHERE link = ? AND email = ? COLLATE NOCASE AND exp_date >= ? RETURNING link",
		[link, email, Date.now()],
	);
	return consumed.length === 1;
}

/** The invite behind `link`, or undefined when it does not exist or has expired. */
export async function findRegisterLink(T: Transaction, link: string): Promise<SysUserRegisterLink | undefined> {
	const [invite] = await T.executeQuery<SysUserRegisterLink>("SELECT * FROM sys_user_register_links WHERE link = ? LIMIT 1", [link]);
	if (!invite?.email || invite.exp_date < Date.now()) return undefined;
	return invite;
}

export const sysusersRoutes = {
	get: new APIServer({ method: "GET", path: "/sys", responseSchema: z.array(z_SysUsers.pick({ id: true, email: true })) }, [authenticateMiddleware], () =>
		handlerResult(() => executeQuery<Pick<SysUsers, "id" | "email">>("SELECT id, email FROM sys_users"), "Σφάλμα κατά την ανάκτηση των χρηστών"),
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
	delete: new APIServer({ method: "DELETE", path: "/sys", schema: z_IdArray }, [authenticateMiddleware], ({ body, cookies }) =>
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

			if (!isOwnerEmail(self.email)) {
				throw new Error("Δεν έχετε δικαίωμα διαγραφής άλλων διαχειριστών");
			}

			if (ids.length === 1) await T.executeQuery("DELETE FROM sys_users WHERE id = ?", [ids[0]]);
			else await T.executeQuery(`DELETE FROM sys_users WHERE id IN (${questionMarks(ids)})`, ids);
			return "User/s deleted successfully";
		}, "Σφάλμα κατά την διαγραφή των διαχειριστών"),
	),
	registerSysUser: new APIServer(
		{ method: "POST", path: "/sys/register/[link:string]", schema: z_LoginCredentials, responseSchema: z_RegisterSysUserResponse },
		({ params, body, cookies }) =>
			handlerResult(async (T) => {
				const { email, password } = body;
				const [existingUser] = await T.executeQuery<Pick<SysUsers, "id">>("SELECT id FROM sys_users WHERE email = ? COLLATE NOCASE LIMIT 1", [email]);
				if (existingUser) throw new Error("Ο χρήστης υπάρχει ήδη");
				// The link must have been issued for this email; it is used up here.
				if (!(await consumeRegisterLink(T, params.link, email))) throw new Error("Invalid Link");

				const key = await generateShaKey(password);

				const args = { email, password: key, ...createSessionId() };
				const { insertId } = await T.executeQuery("INSERT INTO sys_users (email, password, session_id, session_exp_date) VALUES (???)", args);
				cookies.set(COOKIE.sessionId, args.session_id, SESSION_COOKIE_OPTIONS);
				return { id: insertId, session_id: args.session_id, email, avatar_url: null };
			}, "Σφάλμα κατά την εγγραφή του χρήστη"),
	),
	createRegisterLink: new APIServer(
		{ method: "POST", path: "/sys/register", schema: z_SysUserInviteEmail, responseSchema: z.object({ link: z.string() }) },
		[authenticateMiddleware],
		({ body, request, env }) =>
			handlerResult(async (T) => {
				const { email } = body;
				const [existingUser] = await T.executeQuery<Pick<SysUsers, "id">>("SELECT id FROM sys_users WHERE email = ? COLLATE NOCASE LIMIT 1", [email]);
				if (existingUser) throw new Error("Ο χρήστης υπάρχει ήδη");

				const link = R.link(64);
				// 24 hours expiration
				const exp_date = Date.now() + 1000 * 60 * 60 * 24;
				await T.executeQuery("DELETE FROM sys_user_register_links WHERE exp_date < ?", [Date.now()]);
				await T.executeQuery("INSERT INTO sys_user_register_links (link, exp_date, email) VALUES (?, ?, ?)", [link, exp_date, email]);

				const signupLink = `${new URL(request.url).origin}/admin/signup/${link}`;
				await sendAutomatedEmail(env, {
					to: email,
					subject: "Πρόσκληση διαχειριστή",
					htmlTemplateName: "sysuser_register_link.html",
					templateData: { token: signupLink },
				});

				return { link };
			}, "Σφάλμα κατά την δημιουργία του συνδέσμου εγγραφής"),
	),
	validateRegisterLink: new APIServer(
		{
			method: "POST",
			path: "/sys/register/validate/[link:string]",
			responseSchema: z.object({ isValid: z.boolean(), email: z.email().optional() }),
		},
		({ params }) =>
			handlerResult(async (T) => {
				const invite = await findRegisterLink(T, params.link);
				return invite ? { isValid: true, email: invite.email ?? undefined } : { isValid: false };
			}, "Σφάλμα κατά τον έλεγχο του συνδέσμου εγγραφής"),
	),
};
