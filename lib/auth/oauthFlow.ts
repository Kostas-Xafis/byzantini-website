import { z } from "astro/zod";
import { timingSafeEqual } from "./passwords";

/**
 * The state of one OAuth round trip (sign-in, invite signup or connecting a provider), kept in the
 * short-lived HttpOnly `oauth_flow` cookie between `Authentication.oauthStart` and the callback.
 *
 * It is HMAC-signed with `SECRET`: the cookie carries the admin id for the "link" intent and the
 * post-login redirect, and a tampered cookie must not be able to attach a provider account to someone
 * else. (The session cookie cannot be used for that: it is `SameSite=Strict`, so the browser does not
 * send it on the provider's redirect back to the site.)
 *
 * Pure functions (the key is a parameter) so the unit tests need no env.
 */

export const OAUTH_FLOW_TTL_MS = 1000 * 60 * 10;

export const z_OAuthIntent = z.enum(["login", "signup", "link"]);
export type OAuthIntent = z.infer<typeof z_OAuthIntent>;

const z_OAuthFlow = z.object({
	provider: z.string(),
	state: z.string().min(16),
	codeVerifier: z.string(),
	intent: z_OAuthIntent,
	/** Invite link (signup). */
	link: z.string().optional(),
	/** The signed-in admin (link). */
	userId: z.number().int().optional(),
	/** Validated `/admin…` path to land on after sign-in. */
	redirect: z.string().optional(),
	expiresAt: z.number(),
});
export type OAuthFlow = z.infer<typeof z_OAuthFlow>;

const encoder = new TextEncoder();

const base64url = (bytes: Uint8Array) =>
	btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
const fromBase64url = (text: string) => {
	const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
	return Uint8Array.from(binary, (c) => c.charCodeAt(0));
};

async function hmac(payload: string, secret: string): Promise<string> {
	const key = await crypto.subtle.importKey("raw", encoder.encode(`oauth_flow:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	return base64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload))));
}

export async function sealOAuthFlow(flow: OAuthFlow, secret: string): Promise<string> {
	if (!secret) throw new Error("SECRET is required to sign the OAuth flow cookie");
	const payload = base64url(encoder.encode(JSON.stringify(flow)));
	return `${payload}.${await hmac(payload, secret)}`;
}

/** The flow in `cookie`, or null when it is missing, tampered with, malformed or expired. */
export async function openOAuthFlow(cookie: string | null | undefined, secret: string, now = Date.now()): Promise<OAuthFlow | null> {
	if (!cookie || !secret) return null;
	const [payload, signature, extra] = cookie.split(".");
	if (!payload || !signature || extra !== undefined) return null;
	if (!timingSafeEqual(await hmac(payload, secret), signature)) return null;
	try {
		const parsed = z_OAuthFlow.safeParse(JSON.parse(new TextDecoder().decode(fromBase64url(payload))));
		if (!parsed.success || parsed.data.expiresAt < now) return null;
		return parsed.data;
	} catch {
		return null;
	}
}
