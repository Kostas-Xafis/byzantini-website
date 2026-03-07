import type { SysUserRegisterLink, SysUsers } from "@_types/entities";
import { Env } from "@env/env";
import { google } from "@utilities/Google";
import { authentication, createSessionId, generateShaKey } from "@utilities/authentication";
import { deepCopy } from "@utilities/objects";
import { decodeIdToken, generateCodeVerifier, generateState, type OAuth2Tokens } from "arctic";
import { execTryCatch, getUsedBody } from "../utils.server";
import { AuthenticationRoutes } from "./authentication.client";

const serverRoutes = deepCopy(AuthenticationRoutes);

serverRoutes.userLogin.func = ({ ctx }) => {
	return execTryCatch(async T => {
		const credentials = getUsedBody(ctx) || await ctx.request.json();
		const [sysUser] = await T.executeQuery<SysUsers>("SELECT * FROM sys_users WHERE email = ? LIMIT 1", [credentials.email]);
		if (!sysUser) return { isValid: false };

		const [hash, salt] = sysUser.password.split(":");
		const key = (await generateShaKey(credentials.password, salt)).split(":")[0];
		const isValid = key === hash;
		if (!isValid) return { isValid };

		const { session_exp_date, session_id } = createSessionId();
		await T.executeQuery("UPDATE sys_users SET session_id = ?, session_exp_date = ? WHERE email = ?", [
			session_id,
			session_exp_date,
			credentials.email
		]);
		return { isValid, session_id, email: credentials.email, avatar_url: null };
	}, "Σφάλμα κατά την είσοδο");
};

serverRoutes.userLogout.func = ({ ctx }) => {
	return execTryCatch(async T => {
		const { sid } = getUsedBody(ctx) || await ctx.request.json();
		await T.executeQuery("UPDATE sys_users SET session_id = NULL, session_exp_date = NULL WHERE session_id = ?", [sid]);
		return "Logged out";
	});
};

serverRoutes.authenticateSession.func = ({ ctx }) => {
	return execTryCatch(async () => {
		const isAuthenticated = await authentication(ctx);
		return { isValid: isAuthenticated };
	});
};
serverRoutes.getGoogleOAuthState.func = ({ ctx }) => {
	return execTryCatch(async () => {
		const state = generateState();
		const codeVerifier = generateCodeVerifier();
		const url = google(ctx).createAuthorizationURL(state, codeVerifier, ["openid", "profile", "email"]);
		ctx.cookies.set("google_oauth_state", state, {
			path: "/",
			secure: Env.env.PROD,
			httpOnly: true,
			maxAge: 60 * 10, // 10 minutes
			sameSite: "lax"
		});
		ctx.cookies.set("google_code_verifier", codeVerifier, {
			path: "/",
			secure: Env.env.PROD,
			httpOnly: true,
			maxAge: 60 * 10, // 10 minutes
			sameSite: "lax"
		});
		return { OAuthUrl: url.toString() };
	});
};

serverRoutes.getGoogleOAuthStateForSignup.func = ({ ctx, slug }) => {
	return execTryCatch(async T => {
		const { link } = slug;
		const [linkCheck] = await T.executeQuery<SysUserRegisterLink>(
			"SELECT * FROM sys_user_register_links WHERE link = ? LIMIT 1",
			[link],
		);
		if (!linkCheck || linkCheck.exp_date < Date.now()) {
			throw new Error("Invalid Link");
		}

		const state = generateState();
		const codeVerifier = generateCodeVerifier();
		const url = google(ctx).createAuthorizationURL(state, codeVerifier, ["openid", "profile", "email"]);

		ctx.cookies.set("google_oauth_state", state, {
			path: "/",
			secure: Env.env.PROD,
			httpOnly: true,
			maxAge: 60 * 10,
			sameSite: "lax",
		});
		ctx.cookies.set("google_code_verifier", codeVerifier, {
			path: "/",
			secure: Env.env.PROD,
			httpOnly: true,
			maxAge: 60 * 10,
			sameSite: "lax",
		});
		ctx.cookies.set("google_signup_link", link, {
			path: "/",
			secure: Env.env.PROD,
			httpOnly: true,
			maxAge: 60 * 10,
			sameSite: "lax",
		});

		return { OAuthUrl: url.toString() };
	});
};

serverRoutes.oauthCallback.func = ({ ctx }) => {
	return execTryCatch(async T => {
		const url = new URL(ctx.request.url);
		const code = url.searchParams.get("code");
		const state = url.searchParams.get("state");
		const storedState = ctx.cookies.get("google_oauth_state")?.value;
		const codeVerifier = ctx.cookies.get("google_code_verifier")?.value;
		const signupLink = ctx.cookies.get("google_signup_link")?.value;

		// console.log("OAuth Callback Invoked");
		// console.log("Received code:", code);
		// console.log("Received state:", state);
		// console.log("Stored state:", storedState);
		// console.log("Code verifier:", codeVerifier);

		if (!code || !state || !storedState || state !== storedState || !codeVerifier) {
			return { error: "Invalid request", isValid: false };
		}

		if (state !== storedState) {
			return { error: "State mismatch", isValid: false };
		}

		let tokens: OAuth2Tokens;
		try {
			tokens = await google(ctx).validateAuthorizationCode(code, codeVerifier);
		} catch (e) {
			// Invalid code or client credentials
			return { error: "Invalid authorization code", isValid: false };
		}
		const claims = decodeIdToken(tokens.idToken()) as { sub: string; name?: string; email?: string; picture?: string; };
		const googleEmail = claims.email;
		const avatarUrl = claims.picture || null;

		if (!googleEmail) {
			return { error: "No email found in Google account", isValid: false };
		}

		// Check if user exists with this email
		const [existingUser] = await T.executeQuery<SysUsers>("SELECT * FROM sys_users WHERE email = ? LIMIT 1", [googleEmail]);

		if (!existingUser && signupLink) {
			const [linkCheck] = await T.executeQuery<SysUserRegisterLink>(
				"SELECT * FROM sys_user_register_links WHERE link = ? LIMIT 1",
				[signupLink],
			);
			if (!linkCheck || linkCheck.exp_date < Date.now()) {
				return { error: "Invalid Link", isValid: false };
			}

			const randomPassword = `${claims.sub}:${Date.now()}`;
			const key = await generateShaKey(randomPassword);
			await T.executeQuery(
				"INSERT INTO sys_users (email, password, session_id, session_exp_date) VALUES (???)",
				{ email: googleEmail, password: key, ...createSessionId() },
			);
		}

		if (!existingUser && !signupLink) {
			return { error: "No user found with this email", isValid: false };
		}

		// Create session for the user
		const { session_exp_date, session_id } = createSessionId();
		await T.executeQuery("UPDATE sys_users SET session_id = ?, session_exp_date = ? WHERE email = ?", [
			session_id,
			session_exp_date,
			googleEmail
		]);

		// Clear OAuth cookies
		ctx.cookies.delete("google_oauth_state", { path: "/" });
		ctx.cookies.delete("google_code_verifier", { path: "/" });
		ctx.cookies.delete("google_signup_link", { path: "/" });

		return { isValid: true, session_id, email: googleEmail, avatar_url: avatarUrl };
	}, "Σφάλμα κατά την είσοδο με Google");
};

export const AuthenticationServerRoutes = serverRoutes;
