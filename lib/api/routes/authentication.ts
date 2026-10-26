import type { SysUserIdentity, SysUsers } from "@_types/entities";
import { getEnv } from "@env/env";
import { OAUTH_FLOW_TTL_MS, openOAuthFlow, sealOAuthFlow, z_OAuthIntent, type OAuthFlow } from "@lib/auth/oauthFlow";
import { PERMISSIONS, ROLES, permissionsOf } from "@lib/auth/roles";
import { hasPassword, hashPassword, sha256Hex, timingSafeEqual, verifyPassword } from "@lib/auth/passwords";
import { enabledProviders, getProvider, isProviderId, providerInfo, type ProviderId, type ProviderProfile } from "@lib/auth/providers";
import { listSessions, revokeSession, revokeUserSessions } from "@lib/auth/sessions";
import { z_LoginCredentials, z_NewPassword } from "@lib/api/schemas";
import { getDb, type Transaction } from "@lib/db";
import { Random as R } from "@lib/random";
import { executeQuery } from "@lib/utils.server";
import { ADMIN_HOME, LOGIN_PATH, isSafeRedirectTarget } from "@utilities/redirect";
import { generateCodeVerifier, generateState } from "arctic";
import { z } from "astro/zod";
import { APIError } from "./APIError";
import { APIServer, handlerResult } from "./APIServer";
import { COOKIE, type CookieOptions, type ServerCookies } from "./cookies";
import { authenticateMiddleware, currentSession, startSession } from "./middleware/authenticate";
import { rateLimitMiddleware } from "./middleware/rateLimit";
import { sendAutomatedEmail } from "./emailService";
import { consumeRegisterLink, findRegisterLink } from "./sysusers";

/**
 * Authentication — admin sign-in, sessions and sign-in providers.
 *
 * - Password sign-in (`userLogin`): PBKDF2 hashes (lib/auth/passwords.ts), legacy SHA-256 hashes are
 *   upgraded on the next successful sign-in.
 * - Sessions (lib/auth/sessions.ts): one row per device; signing out ends only the current device.
 * - Providers (lib/auth/providers.ts — Google, Apple, Microsoft): `oauthStart` → provider →
 *   `/oauth2callback[/<provider>]` page → `oauthCallback`, with three intents: `login`, `signup`
 *   (an invite link) and `link` (connect the provider to the signed-in admin, «Ο λογαριασμός μου»).
 *   Accounts are matched on the provider's account id, never on the email it reports.
 */

/** Admin page with the account settings (connected providers, password, devices). */
export const ACCOUNT_PATH = "/admin/account";

const z_UserLoginRes = z.union([z.object({ isValid: z.literal(true), email: z.string() }), z.object({ isValid: z.literal(false) })]);

const z_ProviderInfo = z.object({ id: z.string(), label: z.string() });

const z_MeRes = z.object({
	id: z.number(),
	email: z.string(),
	role: z.enum(ROLES),
	/** What this admin may use (lib/auth/roles.ts) — the UI hides the rest. */
	permissions: z.object(
		Object.fromEntries(Object.keys(PERMISSIONS).map((permission) => [permission, z.boolean()])) as Record<keyof typeof PERMISSIONS, z.ZodBoolean>,
	),
	avatar_url: z.string().nullable(),
	hasPassword: z.boolean(),
	sessionMethod: z.string(),
	identities: z.array(
		z_ProviderInfo.extend({
			email: z.string().nullable(),
			created_at: z.number(),
			last_used_at: z.number().nullable(),
		}),
	),
	/** Providers enabled in this environment. */
	providers: z.array(z_ProviderInfo),
});

const z_OAuthStartReq = z.object({
	intent: z_OAuthIntent,
	/** Invite link (`signup`). */
	link: z.string().optional(),
	/** `/admin…` path to land on after a `login` (validated; anything else is ignored). */
	redirect: z.string().optional(),
});

const z_OAuthCallbackReq = z.object({
	code: z.string().optional(),
	state: z.string().optional(),
	/** Set by the provider when the user cancelled or the request was refused. */
	error: z.string().optional(),
});

const z_OAuthCallbackRes = z.union([
	z.object({ ok: z.literal(true), redirect: z.string() }),
	/** `back`: where the "try again" link of the callback page leads (login, the invite, or the account page). */
	z.object({ ok: z.literal(false), error: z.string(), back: z.string() }),
]);

const z_SessionsRes = z.array(
	z.object({
		id: z.string(),
		method: z.string(),
		created_at: z.number(),
		last_seen_at: z.number(),
		expires_at: z.number(),
		user_agent: z.string().nullable(),
		current: z.boolean(),
	}),
);

const flowSecret = () => {
	const { SECRET } = getEnv();
	if (!SECRET) throw new Error("SECRET is not set");
	return SECRET;
};

/**
 * Apple returns with a cross-site POST, which only carries `SameSite=None` cookies (and those must be
 * `Secure`). The others return with a top-level GET redirect, for which `Lax` is enough.
 */
const flowCookieOptions = (formPost: boolean): CookieOptions => ({
	httpOnly: true,
	maxAge: OAUTH_FLOW_TTL_MS / 1000,
	sameSite: formPost ? "None" : "Lax",
	...(formPost ? { secure: true } : {}),
});

async function loadUser(userId: number) {
	const [user] = await executeQuery<Pick<SysUsers, "id" | "email" | "password" | "role">>(
		"SELECT id, email, password, role FROM sys_users WHERE id = ? LIMIT 1",
		[userId],
	);
	if (!user) throw APIError.notFound("Ο χρήστης δεν βρέθηκε");
	return user;
}

const identitiesOf = (userId: number) =>
	executeQuery<Pick<SysUserIdentity, "provider" | "email" | "avatar_url" | "created_at" | "last_used_at">>(
		"SELECT provider, email, avatar_url, created_at, last_used_at FROM sys_user_identities WHERE user_id = ? ORDER BY created_at",
		[userId],
	);

const findIdentity = async (provider: ProviderId, subject: string) =>
	(
		await executeQuery<Pick<SysUserIdentity, "id" | "user_id">>("SELECT id, user_id FROM sys_user_identities WHERE provider = ? AND subject = ? LIMIT 1", [
			provider,
			subject,
		])
	)[0];

const INSERT_IDENTITY =
	"INSERT INTO sys_user_identities (user_id, provider, subject, email, avatar_url, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, ?)";

async function insertIdentity(userId: number, provider: ProviderId, profile: ProviderProfile) {
	const now = Date.now();
	await executeQuery(INSERT_IDENTITY, [userId, provider, profile.subject, profile.email, profile.avatarUrl, now, now]);
	// An explicit Google connection replaces the pre-0008 match-by-email.
	if (provider === "google") await executeQuery("UPDATE sys_users SET google_email_match = 0 WHERE id = ?", [userId]);
}

/** The provider may change the email/avatar it reports; keep the displayed copy current. */
const touchIdentity = (id: number, profile: ProviderProfile) =>
	executeQuery("UPDATE sys_user_identities SET email = ?, avatar_url = ?, last_used_at = ? WHERE id = ?", [profile.email, profile.avatarUrl, Date.now(), id]);

type FlowContext = { flow: OAuthFlow; profile: ProviderProfile; provider: ProviderId; label: string; cookies: ServerCookies; request: Request; T: Transaction };

/** `login`: the provider account must already be connected to an admin. */
async function oauthLogin({ flow, profile, provider, label, cookies, request }: FlowContext) {
	let identity = await findIdentity(provider, profile.subject);
	if (!identity && provider === "google" && profile.emailVerified && profile.email) {
		// Admins who used Google before migration 0008 were matched by email: adopt their Google account once.
		const [legacy] = await executeQuery<Pick<SysUsers, "id">>(
			"SELECT id FROM sys_users WHERE email = ? COLLATE NOCASE AND google_email_match = 1 LIMIT 1",
			[profile.email],
		);
		if (legacy) {
			await insertIdentity(legacy.id, provider, profile);
			identity = await findIdentity(provider, profile.subject);
		}
	}
	if (!identity) {
		throw APIError.notFound(
			`Ο λογαριασμός ${label} δεν είναι συνδεδεμένος με κανέναν διαχειριστή. Συνδεθείτε με τον κωδικό σας και συνδέστε τον από «Ο λογαριασμός μου».`,
		);
	}
	await touchIdentity(identity.id, profile);
	await startSession(cookies, request, identity.user_id, provider);
	return flow.redirect && isSafeRedirectTarget(flow.redirect) ? flow.redirect : ADMIN_HOME;
}

/** `signup`: create the invited admin with this provider account as their way in. */
async function oauthSignup({ flow, profile, provider, label, cookies, request, T }: FlowContext) {
	if (!flow.link) throw APIError.badRequest("Λείπει η πρόσκληση");
	if (!profile.email) throw APIError.badRequest(`Ο λογαριασμός ${label} δεν έδωσε διεύθυνση email.`);
	if (await findIdentity(provider, profile.subject)) {
		throw APIError.conflict(`Αυτός ο λογαριασμός ${label} είναι ήδη συνδεδεμένος με διαχειριστή. Χρησιμοποιήστε τη σελίδα εισόδου.`);
	}
	const [existing] = await executeQuery<Pick<SysUsers, "id">>("SELECT id FROM sys_users WHERE email = ? COLLATE NOCASE LIMIT 1", [profile.email]);
	if (existing) throw APIError.conflict("Ο χρήστης υπάρχει ήδη");
	if (!(await consumeRegisterLink(T, flow.link, profile.email))) {
		throw APIError.gone(
			`Η πρόσκληση δεν είναι έγκυρη, έχει λήξει ή στάλθηκε σε άλλο email από αυτό του λογαριασμού ${label} (${profile.email}). ` +
				"Εγγραφείτε με κωδικό ή με λογαριασμό που έχει το email της πρόσκλησης.",
		);
	}
	// The admin and their identity in one batch: never an account without a way to sign in.
	const now = Date.now();
	const db = getDb();
	await db.batch([
		db.prepare("INSERT INTO sys_users (email, password, google_email_match, role) VALUES (?, '', 0, 'secretary')").bind(profile.email),
		db
			.prepare(
				"INSERT INTO sys_user_identities (user_id, provider, subject, email, avatar_url, created_at, last_used_at) SELECT id, ?, ?, ?, ?, ?, ? FROM sys_users WHERE email = ? COLLATE NOCASE",
			)
			.bind(provider, profile.subject, profile.email, profile.avatarUrl, now, now, profile.email),
	]);
	const [created] = await executeQuery<Pick<SysUsers, "id">>("SELECT id FROM sys_users WHERE email = ? COLLATE NOCASE LIMIT 1", [profile.email]);
	await startSession(cookies, request, created.id, provider);
	return ADMIN_HOME;
}

/** `link`: connect the provider account to the admin who started the flow. */
async function oauthLink({ flow, profile, provider, label }: FlowContext) {
	if (!flow.userId) throw APIError.badRequest("Λείπει ο διαχειριστής");
	const user = await loadUser(flow.userId);
	const identity = await findIdentity(provider, profile.subject);
	if (identity && identity.user_id !== user.id) throw APIError.conflict(`Αυτός ο λογαριασμός ${label} είναι ήδη συνδεδεμένος με άλλον διαχειριστή.`);
	if (identity) {
		await touchIdentity(identity.id, profile);
	} else {
		const [sameProvider] = await executeQuery<{ found: number }>("SELECT 1 AS found FROM sys_user_identities WHERE user_id = ? AND provider = ? LIMIT 1", [
			user.id,
			provider,
		]);
		if (sameProvider) throw APIError.conflict(`Έχετε ήδη συνδέσει λογαριασμό ${label}. Αποσυνδέστε τον πρώτα.`);
		await insertIdentity(user.id, provider, profile);
	}
	return `${ACCOUNT_PATH}?linked=${provider}`;
}

/** «Ξέχασα τον κωδικό» links live this long and work once. */
const PASSWORD_RESET_TTL_MS = 1000 * 60 * 60;
/** The same answer whether or not the email belongs to an admin, so the form cannot be used to find admins. */
const PASSWORD_RESET_SENT = "Αν υπάρχει λογαριασμός με αυτό το email, θα λάβετε σε λίγα λεπτά σύνδεσμο για νέο κωδικό. Ελέγξτε και τα ανεπιθύμητα.";
const PASSWORD_RESET_GONE = "Ο σύνδεσμος έληξε ή έχει ήδη χρησιμοποιηθεί. Ζητήστε νέο από τη σελίδα εισόδου.";
export const PASSWORD_RESET_PATH = "/login/reset";

/** The admin behind an unexpired reset link, or undefined. */
async function findPasswordReset(token: string) {
	const [row] = await executeQuery<{ user_id: number; email: string }>(
		"SELECT r.user_id, u.email FROM sys_user_password_resets r JOIN sys_users u ON u.id = r.user_id WHERE r.id = ? AND r.expires_at > ? LIMIT 1",
		[await sha256Hex(token), Date.now()],
	);
	return row;
}

export const authenticationRoutes = {
	authenticateSession: new APIServer(
		{ method: "POST", path: "/auth/session", responseSchema: z.object({ isValid: z.boolean() }) },
		[authenticateMiddleware],
		() => handlerResult(async () => ({ isValid: true })),
	),
	userLogin: new APIServer(
		{ method: "POST", path: "/auth/login", schema: z_LoginCredentials, responseSchema: z_UserLoginRes },
		[rateLimitMiddleware("login")],
		({ body, cookies, request }) =>
			handlerResult(async () => {
				const [user] = await executeQuery<Pick<SysUsers, "id" | "email" | "password">>(
					"SELECT id, email, password FROM sys_users WHERE email = ? COLLATE NOCASE LIMIT 1",
					[body.email],
				);
				// Unknown emails go through a full hash too, so timing does not reveal who is an admin.
				const check = await verifyPassword(body.password, user?.password ?? "");
				if (!user || !check.valid) return { isValid: false as const };
				if (check.needsRehash) await executeQuery("UPDATE sys_users SET password = ? WHERE id = ?", [await hashPassword(body.password), user.id]);

				await startSession(cookies, request, user.id, "password");
				return { isValid: true as const, email: user.email };
			}, "Σφάλμα κατά την είσοδο"),
	),
	userLogout: new APIServer({ method: "POST", path: "/auth/logout" }, [authenticateMiddleware], ({ cookies }) =>
		handlerResult(async () => {
			// The session cookie is HttpOnly — the server reads it; the page cannot.
			const session = await currentSession(cookies);
			await revokeSession(session.id, session.userId);
			cookies.delete(COOKIE.sessionId);
			return "Logged out";
		}),
	),
	me: new APIServer({ method: "GET", path: "/auth/me", responseSchema: z_MeRes }, [authenticateMiddleware], ({ cookies }) =>
		handlerResult(async () => {
			const session = await currentSession(cookies);
			const user = await loadUser(session.userId);
			const identities = await identitiesOf(user.id);
			return {
				id: user.id,
				email: user.email,
				role: user.role,
				permissions: permissionsOf(user.role),
				avatar_url: identities.find((i) => i.avatar_url)?.avatar_url ?? null,
				hasPassword: hasPassword(user.password),
				sessionMethod: session.method,
				identities: identities
					.filter((i) => isProviderId(i.provider))
					.map((i) => ({ ...providerInfo(i.provider), email: i.email, created_at: i.created_at, last_used_at: i.last_used_at })),
				providers: enabledProviders(),
			};
		}, "Σφάλμα κατά την ανάκτηση του λογαριασμού"),
	),
	providers: new APIServer({ method: "GET", path: "/auth/providers", responseSchema: z.array(z_ProviderInfo) }, [], () =>
		handlerResult(async () => enabledProviders()),
	),
	oauthStart: new APIServer(
		{ method: "POST", path: "/auth/oauth/[provider:string]", schema: z_OAuthStartReq, responseSchema: z.object({ OAuthUrl: z.string() }) },
		[rateLimitMiddleware("oauth")],
		({ params, body, cookies, request }) =>
			handlerResult(async (T) => {
				const provider = getProvider(params.provider);
				if (!provider) throw APIError.notFound("Ο πάροχος σύνδεσης δεν είναι διαθέσιμος");

				const flow: OAuthFlow = {
					provider: provider.id,
					state: generateState(),
					codeVerifier: generateCodeVerifier(),
					intent: body.intent,
					expiresAt: Date.now() + OAUTH_FLOW_TTL_MS,
				};
				if (body.intent === "link") {
					flow.userId = (await currentSession(cookies)).userId;
				} else if (body.intent === "signup") {
					if (!body.link || !(await findRegisterLink(T, body.link))) throw APIError.gone("Ο σύνδεσμος εγγραφής δεν είναι έγκυρος ή έχει λήξει");
					flow.link = body.link;
				} else if (isSafeRedirectTarget(body.redirect)) {
					flow.redirect = body.redirect;
				}

				cookies.set(COOKIE.oauthFlow, await sealOAuthFlow(flow, flowSecret()), flowCookieOptions(provider.formPost));
				const url = provider.authorizationURL(new URL(request.url).origin, flow.state, flow.codeVerifier);
				return { OAuthUrl: url.toString() };
			}, "Σφάλμα κατά την έναρξη της σύνδεσης"),
	),
	/**
	 * Finishes an OAuth round trip. Called in-process by the `/oauth2callback[/<provider>]` page with the
	 * provider's query string (or Apple's form post). Failures are answered as `{ ok: false, error, back }`
	 * so the page can show the reason and the right way back.
	 */
	oauthCallback: new APIServer(
		{ method: "POST", path: "/auth/oauth/[provider:string]/callback", schema: z_OAuthCallbackReq, responseSchema: z_OAuthCallbackRes },
		({ params, body, cookies, request }) =>
			handlerResult(async (T) => {
				const flow = await openOAuthFlow(cookies.get(COOKIE.oauthFlow), flowSecret());
				cookies.delete(COOKIE.oauthFlow);
				const back = flow?.intent === "link" ? ACCOUNT_PATH : flow?.intent === "signup" && flow.link ? `/admin/signup/${flow.link}` : LOGIN_PATH;
				const fail = (error: string) => ({ ok: false as const, error, back });

				if (body.error) {
					const cancelled = body.error === "access_denied" || body.error === "user_cancelled_authorize";
					return fail(cancelled ? "Η σύνδεση ακυρώθηκε." : "Ο πάροχος σύνδεσης απέρριψε το αίτημα. Δοκιμάστε ξανά.");
				}
				if (!flow || flow.provider !== params.provider || !body.code || !body.state || !timingSafeEqual(body.state, flow.state)) {
					return fail("Η σύνδεση έληξε ή ξεκίνησε σε άλλο παράθυρο. Δοκιμάστε ξανά.");
				}
				const provider = getProvider(flow.provider);
				if (!provider) return fail("Ο πάροχος σύνδεσης δεν είναι διαθέσιμος.");

				let profile: ProviderProfile;
				try {
					profile = await provider.exchange(new URL(request.url).origin, body.code, flow.codeVerifier);
				} catch (error) {
					console.error(`[auth] ${provider.id} code exchange failed:`, error);
					return fail(`Δεν ήταν δυνατή η επιβεβαίωση με ${provider.label}. Δοκιμάστε ξανά.`);
				}

				const ctx: FlowContext = { flow, profile, provider: provider.id, label: provider.label, cookies, request, T };
				try {
					const redirect = flow.intent === "link" ? await oauthLink(ctx) : flow.intent === "signup" ? await oauthSignup(ctx) : await oauthLogin(ctx);
					return { ok: true as const, redirect };
				} catch (error) {
					if (error instanceof APIError) return fail(error.message);
					throw error;
				}
			}, "Σφάλμα κατά τη σύνδεση"),
	),
	unlinkProvider: new APIServer({ method: "DELETE", path: "/auth/identities/[provider:string]" }, [authenticateMiddleware], ({ params, cookies }) =>
		handlerResult(async () => {
			const session = await currentSession(cookies);
			if (!isProviderId(params.provider)) throw APIError.notFound("Άγνωστος πάροχος σύνδεσης");
			const user = await loadUser(session.userId);
			const identities = await identitiesOf(user.id);
			if (!identities.some((i) => i.provider === params.provider)) throw APIError.notFound("Ο λογαριασμός δεν είναι συνδεδεμένος");
			if (!hasPassword(user.password) && identities.length <= 1) {
				throw APIError.badRequest("Δεν μπορείτε να αφαιρέσετε τον μοναδικό τρόπο εισόδου. Ορίστε πρώτα κωδικό ή συνδέστε άλλον λογαριασμό.");
			}
			await executeQuery("DELETE FROM sys_user_identities WHERE user_id = ? AND provider = ?", [user.id, params.provider]);
			// A disconnected Google account must not come back through the pre-0008 match-by-email.
			if (params.provider === "google") await executeQuery("UPDATE sys_users SET google_email_match = 0 WHERE id = ?", [user.id]);
			return `Ο λογαριασμός ${providerInfo(params.provider).label} αποσυνδέθηκε`;
		}, "Σφάλμα κατά την αποσύνδεση του λογαριασμού"),
	),
	changePassword: new APIServer(
		{ method: "POST", path: "/auth/password", schema: z.object({ new_password: z_NewPassword }) },
		[authenticateMiddleware, rateLimitMiddleware("password")],
		({ body, cookies }) =>
			handlerResult(async () => {
				const session = await currentSession(cookies);
				const user = await loadUser(session.userId);
				await executeQuery("UPDATE sys_users SET password = ? WHERE id = ?", [await hashPassword(body.new_password), user.id]);
				// Whoever knew the old password is signed out everywhere else.
				await revokeUserSessions(user.id, session.id);
				return hasPassword(user.password) ? "Ο κωδικός άλλαξε. Οι άλλες συσκευές αποσυνδέθηκαν." : "Ο κωδικός ορίστηκε";
			}, "Σφάλμα κατά την αλλαγή του κωδικού"),
	),
	sessions: new APIServer({ method: "GET", path: "/auth/sessions", responseSchema: z_SessionsRes }, [authenticateMiddleware], ({ cookies }) =>
		handlerResult(async () => {
			const session = await currentSession(cookies);
			const rows = await listSessions(session.userId);
			return rows.map((row) => ({ ...row, current: row.id === session.id }));
		}, "Σφάλμα κατά την ανάκτηση των συνδέσεων"),
	),
	revokeSession: new APIServer({ method: "DELETE", path: "/auth/sessions/[id:string]" }, [authenticateMiddleware], ({ params, cookies }) =>
		handlerResult(async () => {
			const session = await currentSession(cookies);
			await revokeSession(params.id, session.userId);
			if (params.id === session.id) cookies.delete(COOKIE.sessionId);
			return "Η συσκευή αποσυνδέθηκε";
		}, "Σφάλμα κατά την αποσύνδεση της συσκευής"),
	),
	/**
	 * «Ξέχασα τον κωδικό»: emails a one-time, 1-hour link to set a new password. The answer never says
	 * whether the email belongs to an admin; only the token's SHA-256 is stored.
	 */
	requestPasswordReset: new APIServer(
		{ method: "POST", path: "/auth/password-reset", schema: z.object({ email: z.email("Μη έγκυρο email") }) },
		[rateLimitMiddleware("password-reset")],
		({ body, request, env }) =>
			handlerResult(async () => {
				const [user] = await executeQuery<Pick<SysUsers, "id" | "email">>("SELECT id, email FROM sys_users WHERE email = ? COLLATE NOCASE LIMIT 1", [
					body.email,
				]);
				if (!user) return PASSWORD_RESET_SENT;

				const token = R.link(64);
				const now = Date.now();
				// Only the newest link works; expired ones of anyone are swept on the way.
				await executeQuery("DELETE FROM sys_user_password_resets WHERE user_id = ? OR expires_at < ?", [user.id, now]);
				await executeQuery("INSERT INTO sys_user_password_resets (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)", [
					await sha256Hex(token),
					user.id,
					now,
					now + PASSWORD_RESET_TTL_MS,
				]);
				try {
					await sendAutomatedEmail(env, {
						to: user.email,
						subject: "Επαναφορά κωδικού διαχειριστή",
						htmlTemplateName: "sysuser_password_reset.html",
						templateData: { token: `${new URL(request.url).origin}${PASSWORD_RESET_PATH}/${token}` },
					});
				} catch (error) {
					// Answer the same either way (no account discovery); the log is where a broken email service shows.
					console.error("[auth] password reset email failed:", error);
				}
				return PASSWORD_RESET_SENT;
			}, "Σφάλμα κατά την αποστολή του συνδέσμου"),
	),
	/** Whether a reset link still works (the reset page shows the form or an explanation). */
	validatePasswordReset: new APIServer(
		{ method: "GET", path: "/auth/password-reset/[token:string]", responseSchema: z.object({ isValid: z.boolean(), email: z.string().optional() }) },
		({ params }) =>
			handlerResult(async () => {
				const reset = await findPasswordReset(params.token);
				return reset ? { isValid: true, email: reset.email } : { isValid: false };
			}, "Σφάλμα κατά τον έλεγχο του συνδέσμου"),
	),
	/** Sets the new password from a reset link (used up here), signs every device out and this one in. */
	resetPassword: new APIServer(
		{
			method: "POST",
			path: "/auth/password-reset/[token:string]",
			schema: z.object({ password: z_NewPassword }),
			responseSchema: z.object({ email: z.string() }),
		},
		[rateLimitMiddleware("password-reset")],
		({ params, body, cookies, request }) =>
			handlerResult(async () => {
				// One statement: the same link can never be used twice.
				const [used] = await executeQuery<{ user_id: number }>(
					"DELETE FROM sys_user_password_resets WHERE id = ? AND expires_at > ? RETURNING user_id",
					[await sha256Hex(params.token), Date.now()],
				);
				if (!used) throw APIError.gone(PASSWORD_RESET_GONE);
				const user = await loadUser(used.user_id);
				await executeQuery("UPDATE sys_users SET password = ? WHERE id = ?", [await hashPassword(body.password), user.id]);
				// Whoever knew the old password (or holds an old session) is out.
				await revokeUserSessions(user.id);
				await startSession(cookies, request, user.id, "password");
				return { email: user.email };
			}, "Σφάλμα κατά την αλλαγή του κωδικού"),
	),
	revokeOtherSessions: new APIServer({ method: "DELETE", path: "/auth/sessions" }, [authenticateMiddleware], ({ cookies }) =>
		handlerResult(async () => {
			const session = await currentSession(cookies);
			await revokeUserSessions(session.userId, session.id);
			return "Οι άλλες συσκευές αποσυνδέθηκαν";
		}, "Σφάλμα κατά την αποσύνδεση των συσκευών"),
	),
};
