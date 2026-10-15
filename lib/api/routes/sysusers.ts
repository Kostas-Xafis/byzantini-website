import type { SysUserRegisterLink, SysUsers } from "@_types/entities";
import { hashPassword } from "@lib/auth/passwords";
import { ROLE_LABELS } from "@lib/auth/roles";
import { forgetUserSessions } from "@lib/auth/sessions";
import { z_IdArray, z_SignupCredentials, z_SysUsers } from "@lib/api/schemas";
import { Random as R } from "@lib/random";
import { getDb, type Transaction } from "@lib/db";
import { executeQuery, questionMarks } from "@lib/utils.server";
import { z } from "astro/zod";
import { APIError } from "./APIError";
import { APIServer, handlerResult } from "./APIServer";
import { COOKIE } from "./cookies";
import { sendAutomatedEmail } from "./emailService";
import { authenticateMiddleware, currentSession, requirePermission, startSession } from "./middleware/authenticate";

/**
 * SysUsers — Phase 4 route group (contracts + handlers in one place).
 * Ported from lib/routes/sysusers.client|server.ts.
 *
 * Route keys (get, getById, getBySid, delete, registerSysUser,
 * createRegisterLink, validateRegisterLink) match the old client file exactly.
 *
 * NOTE: `getById`/`delete` read a JSON array body (`number[]`), validated by
 * the shared `z_IdArray` (at least one id). The Greek texts/messages are
 * preserved byte-for-byte.
 */

/** Invite-email contract for `createRegisterLink` (was `v_SysUserInviteEmail`). */
const z_SysUserInviteEmail = z.object({
	email: z.email("Μη έγκυρο email"),
});

const z_RegisterSysUserResponse = z.object({
	id: z.number().int(),
	email: z.email("Μη έγκυρο email"),
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

/** Deletes admins with their sessions and connected accounts, in one batch. */
async function deleteSysUsers(ids: number[]) {
	if (ids.length === 0) return;
	const marks = questionMarks(ids);
	const db = getDb();
	await db.batch([
		db.prepare(`DELETE FROM sys_user_sessions WHERE user_id IN (${marks})`).bind(...ids),
		db.prepare(`DELETE FROM sys_user_identities WHERE user_id IN (${marks})`).bind(...ids),
		db.prepare(`DELETE FROM sys_users WHERE id IN (${marks})`).bind(...ids),
	]);
	for (const id of ids) forgetUserSessions(id);
}

const z_SysUserRow = z_SysUsers.pick({ id: true, email: true, role: true });
type SysUserRow = Pick<SysUsers, "id" | "email" | "role">;

export const sysusersRoutes = {
	get: new APIServer({ method: "GET", path: "/sys", responseSchema: z.array(z_SysUserRow) }, [authenticateMiddleware], () =>
		handlerResult(() => executeQuery<SysUserRow>("SELECT id, email, role FROM sys_users"), "Σφάλμα κατά την ανάκτηση των χρηστών"),
	),
	getById: new APIServer({ method: "POST", path: "/sys/id", schema: z_IdArray, responseSchema: z_SysUserRow }, [authenticateMiddleware], ({ body }) =>
		handlerResult(async () => {
			const [id] = body;
			const [user] = await executeQuery<SysUserRow>("SELECT id, email, role FROM sys_users WHERE id = ? LIMIT 1", [id]);

			if (!user) throw APIError.notFound("Ο χρήστης δεν βρέθηκε");
			return user;
		}),
	),
	getBySid: new APIServer({ method: "GET", path: "/sys/sid", responseSchema: z_SysUserRow }, [authenticateMiddleware], ({ cookies }) =>
		handlerResult(async () => {
			const { userId: id, email, role } = await currentSession(cookies);
			return { id, email, role };
		}),
	),
	/**
	 * Deletes admins, own account included (sysadmin and owner only). Only a sysadmin may delete a
	 * sysadmin, and at least one sysadmin always remains.
	 */
	delete: new APIServer(
		{ method: "DELETE", path: "/sys", schema: z_IdArray },
		[authenticateMiddleware, requirePermission("deleteAdmins")],
		({ body, cookies }) =>
			handlerResult(async () => {
				const self = await currentSession(cookies);
				const ids = [...new Set(body.filter((id) => id > 0))];
				if (ids.length === 0) throw APIError.badRequest("Δεν επιλέχθηκε καμία εγγραφή");

				const targets = await executeQuery<SysUserRow>(`SELECT id, email, role FROM sys_users WHERE id IN (${questionMarks(ids)})`, ids);
				if (targets.length === 0) throw APIError.notFound("Ο χρήστης δεν βρέθηκε");
				if (self.role !== "sysadmin" && targets.some((user) => user.role === "sysadmin")) {
					throw APIError.forbidden(`Μόνο ο ${ROLE_LABELS.sysadmin} μπορεί να διαγράψει λογαριασμό ${ROLE_LABELS.sysadmin}`);
				}
				const [{ remaining }] = await executeQuery<{ remaining: number }>(
					`SELECT COUNT(*) AS remaining FROM sys_users WHERE role = 'sysadmin' AND id NOT IN (${questionMarks(ids)})`,
					ids,
				);
				if (remaining === 0) throw APIError.badRequest(`Πρέπει να παραμείνει τουλάχιστον ένας ${ROLE_LABELS.sysadmin}`);

				await deleteSysUsers(targets.map((user) => user.id));
				if (targets.some((user) => user.id === self.userId)) {
					cookies.delete(COOKIE.sessionId);
					if (targets.length === 1) return "Deleted self successfully";
				}
				return "User/s deleted successfully";
			}, "Σφάλμα κατά τη διαγραφή των διαχειριστών"),
	),
	/** Changes an admin's role (sysadmin only). Nobody changes their own role, so a sysadmin always remains. */
	setRole: new APIServer(
		{ method: "PUT", path: "/sys/role", schema: z_SysUserRow.pick({ id: true, role: true }), responseSchema: z_SysUserRow },
		[authenticateMiddleware, requirePermission("manageRoles")],
		({ body, cookies }) =>
			handlerResult(async () => {
				const self = await currentSession(cookies);
				if (body.id === self.userId) throw APIError.badRequest("Δεν μπορείτε να αλλάξετε τον δικό σας ρόλο");
				const [user] = await executeQuery<SysUserRow>("SELECT id, email, role FROM sys_users WHERE id = ? LIMIT 1", [body.id]);
				if (!user) throw APIError.notFound("Ο χρήστης δεν βρέθηκε");
				await executeQuery("UPDATE sys_users SET role = ? WHERE id = ?", [body.role, user.id]);
				// This isolate sees the new role at once; others within the session cache window.
				forgetUserSessions(user.id);
				return { ...user, role: body.role };
			}, "Σφάλμα κατά την αλλαγή ρόλου"),
	),
	registerSysUser: new APIServer(
		{ method: "POST", path: "/sys/register/[link:string]", schema: z_SignupCredentials, responseSchema: z_RegisterSysUserResponse },
		({ params, body, cookies, request }) =>
			handlerResult(async (T) => {
				const { email, password } = body;
				const [existingUser] = await T.executeQuery<Pick<SysUsers, "id">>("SELECT id FROM sys_users WHERE email = ? COLLATE NOCASE LIMIT 1", [email]);
				if (existingUser) throw APIError.conflict("Ο χρήστης υπάρχει ήδη");
				// The link must have been issued for this email; it is used up here.
				if (!(await consumeRegisterLink(T, params.link, email))) throw APIError.gone("Ο σύνδεσμος εγγραφής δεν είναι έγκυρος ή έχει λήξει");

				const { insertId } = await T.executeQuery("INSERT INTO sys_users (email, password, google_email_match, role) VALUES (?, ?, 0, 'secretary')", [
					email,
					await hashPassword(password),
				]);
				await startSession(cookies, request, insertId, "password");
				return { id: insertId, email };
			}, "Σφάλμα κατά την εγγραφή του χρήστη"),
	),
	createRegisterLink: new APIServer(
		{ method: "POST", path: "/sys/register", schema: z_SysUserInviteEmail, responseSchema: z.object({ link: z.string() }) },
		[authenticateMiddleware],
		({ body, request, env }) =>
			handlerResult(async (T) => {
				const { email } = body;
				const [existingUser] = await T.executeQuery<Pick<SysUsers, "id">>("SELECT id FROM sys_users WHERE email = ? COLLATE NOCASE LIMIT 1", [email]);
				if (existingUser) throw APIError.conflict("Ο χρήστης υπάρχει ήδη");

				const link = R.link(64);
				// 24 hours expiration
				const exp_date = Date.now() + 1000 * 60 * 60 * 24;
				// Expired invites, and any earlier invite to the same address (only the newest link works).
				await T.executeQuery("DELETE FROM sys_user_register_links WHERE exp_date < ? OR email = ? COLLATE NOCASE", [Date.now(), email]);
				await T.executeQuery("INSERT INTO sys_user_register_links (link, exp_date, email) VALUES (?, ?, ?)", [link, exp_date, email]);

				const signupLink = `${new URL(request.url).origin}/admin/signup/${link}`;
				await sendAutomatedEmail(env, {
					to: email,
					subject: "Πρόσκληση διαχειριστή",
					htmlTemplateName: "sysuser_register_link.html",
					templateData: { token: signupLink },
				});

				return { link };
			}, "Σφάλμα κατά τη δημιουργία του συνδέσμου εγγραφής"),
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
