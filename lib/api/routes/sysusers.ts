import type { SysUserRegisterLink, SysUsers } from "@_types/entities";
import { hashPassword, sha256Hex } from "@lib/auth/passwords";
import { ROLE_LABELS } from "@lib/auth/roles";
import { forgetUserSessions } from "@lib/auth/sessions";
import { z_IdArray, z_PendingInvite, z_SignupCredentials, z_SysUsers } from "@lib/api/schemas";
import { Random as R } from "@lib/random";
import { getDb, type Transaction } from "@lib/db";
import { executeQuery, questionMarks } from "@lib/utils.server";
import { z } from "astro/zod";
import { APIError } from "./APIError";
import { APIServer, handlerResult, type RouteContext } from "./APIServer";
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

/** How long an invite link works. */
const INVITE_TTL_MS = 1000 * 60 * 60 * 24;

/*
 * Invite links are stored like sessions and reset links: only their SHA-256 (`id`), so a database dump
 * holds no usable link. One pending invite per email — a new invite or a resend replaces the old link.
 */

/**
 * Uses up an unexpired invite issued for `email`. A single `DELETE … RETURNING`
 * statement, so the same link can never create two accounts (no transaction needed).
 */
export async function consumeRegisterLink(T: Transaction, link: string, email: string): Promise<boolean> {
	const consumed = await T.executeQuery<Pick<SysUserRegisterLink, "id">>(
		"DELETE FROM sys_user_register_links WHERE id = ? AND email = ? COLLATE NOCASE AND expires_at >= ? RETURNING id",
		[await sha256Hex(link), email, Date.now()],
	);
	return consumed.length === 1;
}

/** The invite behind `link`, or undefined when it does not exist or has expired. */
export async function findRegisterLink(T: Transaction, link: string): Promise<SysUserRegisterLink | undefined> {
	const [invite] = await T.executeQuery<SysUserRegisterLink>("SELECT * FROM sys_user_register_links WHERE id = ? LIMIT 1", [await sha256Hex(link)]);
	if (!invite || invite.expires_at < Date.now()) return undefined;
	return invite;
}

/**
 * Issues a fresh 24-hour invite link for `email` (replacing any earlier one, which stops working) and emails it.
 * Returns the link and its expiry.
 */
async function issueInvite(T: Transaction, { request, env, cookies }: Pick<RouteContext<string, undefined>, "request" | "env" | "cookies">, email: string) {
	const [existingUser] = await T.executeQuery<Pick<SysUsers, "id">>("SELECT id FROM sys_users WHERE email = ? COLLATE NOCASE LIMIT 1", [email]);
	if (existingUser) throw APIError.conflict("Ο χρήστης υπάρχει ήδη");

	const { email: invitedBy } = await currentSession(cookies);
	const link = R.link(64);
	const now = Date.now();
	const expires_at = now + INVITE_TTL_MS;
	// Expired invites, and any earlier invite to the same address (only the newest link works).
	await T.executeQuery("DELETE FROM sys_user_register_links WHERE expires_at < ? OR email = ? COLLATE NOCASE", [now, email]);
	await T.executeQuery("INSERT INTO sys_user_register_links (id, email, invited_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?)", [
		await sha256Hex(link),
		email,
		invitedBy,
		now,
		expires_at,
	]);

	await sendAutomatedEmail(env, {
		to: email,
		subject: "Πρόσκληση διαχειριστή",
		htmlTemplateName: "sysuser_register_link.html",
		templateData: { token: `${new URL(request.url).origin}/admin/signup/${link}` },
	});
	return { link, expires_at };
}

const z_IssuedInvite = z.object({ link: z.string(), expires_at: z.number().int() });

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
		{ method: "POST", path: "/sys/register", schema: z_SysUserInviteEmail, responseSchema: z_IssuedInvite },
		[authenticateMiddleware],
		(ctx) => handlerResult((T) => issueInvite(T, ctx, ctx.body.email), "Σφάλμα κατά τη δημιουργία του συνδέσμου εγγραφής"),
	),
	/** «Εκκρεμείς προσκλήσεις»: unexpired invites, newest first — never the link (only its hash is stored). */
	getInvites: new APIServer({ method: "GET", path: "/sys/invites", responseSchema: z.array(z_PendingInvite) }, [authenticateMiddleware], () =>
		handlerResult(
			() =>
				executeQuery<z.infer<typeof z_PendingInvite>>(
					"SELECT email, invited_by, created_at, expires_at FROM sys_user_register_links WHERE expires_at >= ? ORDER BY created_at DESC",
					[Date.now()],
				),
			"Σφάλμα κατά την ανάκτηση των προσκλήσεων",
		),
	),
	/** «Επαναποστολή»: a new link (the old one stops working) and another 24 hours. */
	resendInvite: new APIServer(
		{ method: "POST", path: "/sys/invites/resend", schema: z_SysUserInviteEmail, responseSchema: z_IssuedInvite },
		[authenticateMiddleware],
		(ctx) =>
			handlerResult(async (T) => {
				const [invite] = await T.executeQuery<{ email: string }>("SELECT email FROM sys_user_register_links WHERE email = ? COLLATE NOCASE LIMIT 1", [
					ctx.body.email,
				]);
				if (!invite) throw APIError.notFound("Η πρόσκληση δεν βρέθηκε");
				return issueInvite(T, ctx, invite.email);
			}, "Σφάλμα κατά την επαναποστολή της πρόσκλησης"),
	),
	/** «Ακύρωση»: the invite's link stops working at once. */
	revokeInvite: new APIServer({ method: "DELETE", path: "/sys/invites", schema: z_SysUserInviteEmail }, [authenticateMiddleware], ({ body }) =>
		handlerResult(async () => {
			const removed = await executeQuery<{ id: string }>("DELETE FROM sys_user_register_links WHERE email = ? COLLATE NOCASE RETURNING id", [body.email]);
			if (removed.length === 0) throw APIError.notFound("Η πρόσκληση δεν βρέθηκε");
			return "Η πρόσκληση ακυρώθηκε";
		}, "Σφάλμα κατά την ακύρωση της πρόσκλησης"),
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
				return invite ? { isValid: true, email: invite.email } : { isValid: false };
			}, "Σφάλμα κατά τον έλεγχο του συνδέσμου εγγραφής"),
	),
};
