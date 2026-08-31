import { z } from "astro/zod";
import type { SysUserRegisterLink, SysUsers } from "@_types/entities";
import { z_LoginCredentials } from "@lib/api/schemas";
import { createSessionId, generateShaKey, isSessionValid } from "@utilities/authentication";
import { google } from "@utilities/Google";
import { decodeIdToken, generateCodeVerifier, generateState, type OAuth2Tokens } from "arctic";
import { APIServer, handlerResult } from "./APIServer";
import { COOKIE } from "./cookies";
import { authenticateMiddleware } from "./middleware/authenticate";

/**
 * Authentication — Phase 4 route group (contracts + handlers in one place).
 * Ported from lib/routes/authentication.client|server.ts.
 *
 * Route keys follow the old client file EXACTLY so app components keep working:
 * authenticateSession, userLogin, userLogout, getGoogleOAuthState,
 * getGoogleOAuthStateForSignup, oauthCallback.
 */

const z_LogoutReq = z.object({
	sid: z.string().min(1, "Μη έγκυρο sid"),
});

const z_UserLoginRes = z.union([
	z.object({
		isValid: z.literal(true),
		session_id: z.string(),
		email: z.string(),
		avatar_url: z.string().nullable(),
	}),
	z.object({
		isValid: z.literal(false),
	}),
]);

const z_OAuthCallbackRes = z.union([
	z.object({
		isValid: z.literal(true),
		session_id: z.string(),
		email: z.string(),
		avatar_url: z.string().nullable(),
	}),
	z.object({
		isValid: z.literal(false),
		error: z.string(),
	}),
]);

const z_OAuthStateRes = z.object({
	OAuthUrl: z.string(),
});

/** OAuth needs the request origin for the redirect URI; build a minimal context for `google()`. */
const oauthOrigin = (request: Request) => ({ url: new URL(request.url) } as any);

export const authenticationRoutes = {
	authenticateSession: new APIServer(
		{ method: "POST", path: "/auth/session", responseSchema: z.object({ isValid: z.boolean() }) },
		[authenticateMiddleware],
		({ cookies }) =>
			handlerResult(async () => {
				const sessionId = cookies.get(COOKIE.sessionId);
				const isAuthenticated = sessionId ? await isSessionValid(sessionId) : false;
				return { isValid: isAuthenticated };
			}),
	),
	userLogin: new APIServer(
		{ method: "POST", path: "/auth/login", schema: z_LoginCredentials, responseSchema: z_UserLoginRes },
		[],
		({ body, cookies }) =>
			handlerResult(
				async (T) => {
					const credentials = body;
					const [sysUser] = await T.executeQuery<SysUsers>("SELECT * FROM sys_users WHERE email = ? LIMIT 1", [
						credentials.email,
					]);
					if (!sysUser) return { isValid: false };

					const [hash, salt] = sysUser.password.split(":");
					const key = (await generateShaKey(credentials.password, salt)).split(":")[0];
					const isValid = key === hash;
					if (!isValid) return { isValid };

					const { session_exp_date, session_id } = createSessionId();
					await T.executeQuery("UPDATE sys_users SET session_id = ?, session_exp_date = ? WHERE email = ?", [
						session_id,
						session_exp_date,
						credentials.email,
					]);
					cookies.set(COOKIE.sessionId, session_id);
					return { isValid, session_id, email: credentials.email, avatar_url: null };
				},
				"Σφάλμα κατά την είσοδο",
			),
	),
	userLogout: new APIServer(
		{ method: "POST", path: "/auth/logout", schema: z_LogoutReq },
		[authenticateMiddleware],
		({ body, cookies }) =>
			handlerResult(async (T) => {
				const { sid } = body;
				await T.executeQuery("UPDATE sys_users SET session_id = NULL, session_exp_date = NULL WHERE session_id = ?", [sid]);
				cookies.delete(COOKIE.sessionId);
				return "Logged out";
			}),
	),
	getGoogleOAuthState: new APIServer(
		{ method: "GET", path: "/auth/google", responseSchema: z_OAuthStateRes },
		[],
		({ request, cookies, env }) =>
			handlerResult(async () => {
				const state = generateState();
				const codeVerifier = generateCodeVerifier();
				const url = google(oauthOrigin(request)).createAuthorizationURL(state, codeVerifier, ["openid", "profile", "email"]);
				cookies.set("google_oauth_state" as any, state, {
					path: "/",
					secure: env?.PROD,
					httpOnly: true,
					maxAge: 60 * 10, // 10 minutes
					sameSite: "Lax",
				});
				cookies.set("google_code_verifier" as any, codeVerifier, {
					path: "/",
					secure: env?.PROD,
					httpOnly: true,
					maxAge: 60 * 10, // 10 minutes
					sameSite: "Lax",
				});
				return { OAuthUrl: url.toString() };
			}),
	),
	getGoogleOAuthStateForSignup: new APIServer(
		{ method: "GET", path: "/auth/google/signup/[link:string]", responseSchema: z_OAuthStateRes },
		[],
		({ params, request, cookies, env }) =>
			handlerResult(async (T) => {
				const { link } = params;
				const [linkCheck] = await T.executeQuery<SysUserRegisterLink>("SELECT * FROM sys_user_register_links WHERE link = ? LIMIT 1", [link]);
				if (!linkCheck || linkCheck.exp_date < Date.now()) {
					throw new Error("Invalid Link");
				}

				const state = generateState();
				const codeVerifier = generateCodeVerifier();
				const url = google(oauthOrigin(request)).createAuthorizationURL(state, codeVerifier, ["openid", "profile", "email"]);

				cookies.set("google_oauth_state" as any, state, {
					path: "/",
					secure: env?.PROD,
					httpOnly: true,
					maxAge: 60 * 10,
					sameSite: "Lax",
				});
				cookies.set("google_code_verifier" as any, codeVerifier, {
					path: "/",
					secure: env?.PROD,
					httpOnly: true,
					maxAge: 60 * 10,
					sameSite: "Lax",
				});
				cookies.set("google_signup_link" as any, link, {
					path: "/",
					secure: env?.PROD,
					httpOnly: true,
					maxAge: 60 * 10,
					sameSite: "Lax",
				});

				return { OAuthUrl: url.toString() };
			}),
	),
	oauthCallback: new APIServer(
		{ method: "GET", path: "/auth/google/callback", responseSchema: z_OAuthCallbackRes },
		[],
		({ request, cookies }) =>
			handlerResult(
				async (T) => {
					const url = new URL(request.url);
					const code = url.searchParams.get("code");
					const state = url.searchParams.get("state");
					const storedState = cookies.get("google_oauth_state" as any);
					const codeVerifier = cookies.get("google_code_verifier" as any);
					const signupLink = cookies.get("google_signup_link" as any);

					if (!code || !state || !storedState || state !== storedState || !codeVerifier) {
						return { error: "Invalid request", isValid: false };
					}

					if (state !== storedState) {
						return { error: "State mismatch", isValid: false };
					}

					let tokens: OAuth2Tokens;
					try {
						tokens = await google(oauthOrigin(request)).validateAuthorizationCode(code, codeVerifier);
					} catch (e) {
						// Invalid code or client credentials
						return { error: "Invalid authorization code", isValid: false };
					}
					const claims = decodeIdToken(tokens.idToken()) as { sub: string; name?: string; email?: string; picture?: string };
					const googleEmail = claims.email;
					const avatarUrl = claims.picture || null;

					if (!googleEmail) {
						return { error: "No email found in Google account", isValid: false };
					}

					// Check if user exists with this email
					const [existingUser] = await T.executeQuery<SysUsers>("SELECT * FROM sys_users WHERE email = ? LIMIT 1", [googleEmail]);

					if (!existingUser && signupLink) {
						const [linkCheck] = await T.executeQuery<SysUserRegisterLink>("SELECT * FROM sys_user_register_links WHERE link = ? LIMIT 1", [signupLink]);
						if (!linkCheck || linkCheck.exp_date < Date.now()) {
							return { error: "Invalid Link", isValid: false };
						}

						const randomPassword = `${claims.sub}:${Date.now()}`;
						const key = await generateShaKey(randomPassword);
						await T.executeQuery("INSERT INTO sys_users (email, password, session_id, session_exp_date) VALUES (???)", {
							email: googleEmail,
							password: key,
							...createSessionId(),
						});
					}

					if (!existingUser && !signupLink) {
						return { error: "No user found with this email", isValid: false };
					}

					// Create session for the user
					const { session_exp_date, session_id } = createSessionId();
					await T.executeQuery("UPDATE sys_users SET session_id = ?, session_exp_date = ? WHERE email = ?", [session_id, session_exp_date, googleEmail]);

					// Clear OAuth cookies
					cookies.delete("google_oauth_state" as any, "/");
					cookies.delete("google_code_verifier" as any, "/");
					cookies.delete("google_signup_link" as any, "/");

					cookies.set(COOKIE.sessionId, session_id);

					return { isValid: true, session_id, email: googleEmail, avatar_url: avatarUrl };
				},
				"Σφάλμα κατά την είσοδο με Google",
			),
	),
};
