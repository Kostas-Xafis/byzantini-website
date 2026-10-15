/**
 * Unit tests for the admin sign-in building blocks (lib/auth): password hashing, the signed OAuth flow
 * cookie and the cross-site form guard that lets Sign in with Apple's form POST through. No server, no DB.
 */
import { expect, test } from "bun:test";
import { OAUTH_FLOW_TTL_MS, openOAuthFlow, sealOAuthFlow, type OAuthFlow } from "@lib/auth/oauthFlow";
import { PBKDF2_ITERATIONS, hashPassword, sha256Hex, timingSafeEqual, verifyPassword } from "@lib/auth/passwords";
import { callbackPath, isProviderId } from "@lib/auth/providers";
import { isForbiddenCrossOriginRequest } from "@utilities/originCheck";

const SECRET = "unit-test-secret";

// ---------------------------------------------------------------------------
// Passwords
// ---------------------------------------------------------------------------

test("hashPassword produces a salted PBKDF2 hash that verifies", async () => {
	const a = await hashPassword("σωστός-κωδικός");
	const b = await hashPassword("σωστός-κωδικός");
	expect(a).toStartWith(`pbkdf2$${PBKDF2_ITERATIONS}$`);
	expect(a).not.toBe(b); // random salt
	expect(await verifyPassword("σωστός-κωδικός", a, SECRET)).toEqual({ valid: true, needsRehash: false });
	expect((await verifyPassword("λάθος", a, SECRET)).valid).toBe(false);
});

test("a hash with fewer iterations verifies and asks to be upgraded", async () => {
	const weak = await hashPassword("pw-12345", 1000);
	expect(await verifyPassword("pw-12345", weak, SECRET)).toEqual({ valid: true, needsRehash: true });
});

test("legacy `sha256:salt` hashes still verify (with the same SECRET) and ask to be upgraded", async () => {
	const salt = "abcdef0123456789";
	const legacy = `${await sha256Hex("old-password" + SECRET + salt)}:${salt}`;
	expect(await verifyPassword("old-password", legacy, SECRET)).toEqual({ valid: true, needsRehash: true });
	expect((await verifyPassword("old-password", legacy, "another-secret")).valid).toBe(false);
	expect((await verifyPassword("wrong", legacy, SECRET)).valid).toBe(false);
});

test("an empty or malformed stored password never verifies", async () => {
	expect((await verifyPassword("", "", SECRET)).valid).toBe(false);
	expect((await verifyPassword("x", "", SECRET)).valid).toBe(false);
	expect((await verifyPassword("x", "pbkdf2$abc$$", SECRET)).valid).toBe(false);
	expect((await verifyPassword("x", "no-colon", SECRET)).valid).toBe(false);
});

test("timingSafeEqual compares whole strings", () => {
	expect(timingSafeEqual("abc", "abc")).toBe(true);
	expect(timingSafeEqual("abc", "abd")).toBe(false);
	expect(timingSafeEqual("abc", "abcd")).toBe(false);
	expect(timingSafeEqual("", "")).toBe(true);
});

// ---------------------------------------------------------------------------
// OAuth flow cookie
// ---------------------------------------------------------------------------

const flow = (patch: Partial<OAuthFlow> = {}): OAuthFlow => ({
	provider: "google",
	state: "state-0123456789abcdef",
	codeVerifier: "verifier",
	intent: "link",
	userId: 7,
	expiresAt: Date.now() + OAUTH_FLOW_TTL_MS,
	...patch,
});

test("a sealed flow opens back unchanged", async () => {
	const original = flow({ redirect: "/admin/pupils?q=ά" });
	expect(await openOAuthFlow(await sealOAuthFlow(original, SECRET), SECRET)).toEqual(original);
});

test("a tampered flow (e.g. another admin's id) is rejected", async () => {
	const cookie = await sealOAuthFlow(flow(), SECRET);
	const [, signature] = cookie.split(".");
	const forged = Buffer.from(JSON.stringify(flow({ userId: 1 })))
		.toString("base64url")
		.concat(".", signature);
	expect(await openOAuthFlow(forged, SECRET)).toBeNull();
	expect(await openOAuthFlow(cookie, "another-secret")).toBeNull();
	expect(await openOAuthFlow(cookie + "x", SECRET)).toBeNull();
	expect(await openOAuthFlow(`${cookie}.extra`, SECRET)).toBeNull();
});

test("an expired, empty or garbage flow is rejected", async () => {
	expect(await openOAuthFlow(await sealOAuthFlow(flow({ expiresAt: Date.now() - 1 }), SECRET), SECRET)).toBeNull();
	expect(await openOAuthFlow("", SECRET)).toBeNull();
	expect(await openOAuthFlow(undefined, SECRET)).toBeNull();
	expect(await openOAuthFlow("not-a-cookie", SECRET)).toBeNull();
	await expect(sealOAuthFlow(flow(), "")).rejects.toThrow();
});

// ---------------------------------------------------------------------------
// Providers + cross-site form guard
// ---------------------------------------------------------------------------

test("Google keeps its registered callback; the others get their own", () => {
	expect(callbackPath("google")).toBe("/oauth2callback");
	expect(callbackPath("apple")).toBe("/oauth2callback/apple");
	expect(callbackPath("microsoft")).toBe("/oauth2callback/microsoft");
	expect(isProviderId("apple")).toBe(true);
	expect(isProviderId("github")).toBe(false);
});

const post = (path: string, headers: Record<string, string>) => {
	const url = new URL(path, "https://musicschool-metamorfosi.gr");
	return isForbiddenCrossOriginRequest(new Request(url, { method: "POST", headers }), url, false);
};

test("cross-site form posts are refused, except Apple's callback", () => {
	const form = { "content-type": "application/x-www-form-urlencoded", origin: "https://appleid.apple.com" };
	expect(post("/oauth2callback/apple", form)).toBe(false);
	expect(post("/oauth2callback", form)).toBe(true);
	expect(post("/api/auth/login", form)).toBe(true);
	expect(post("/api/auth/login", { "content-type": "multipart/form-data; boundary=x", origin: "https://evil.example" })).toBe(true);
	// No content type and no origin: refused, as Astro does.
	expect(post("/api/auth/login", {})).toBe(true);
});

test("same-origin posts, JSON posts and safe methods pass", () => {
	expect(post("/api/auth/login", { "content-type": "application/x-www-form-urlencoded", origin: "https://musicschool-metamorfosi.gr" })).toBe(false);
	expect(post("/api/auth/login", { "content-type": "application/json" })).toBe(false);
	const url = new URL("https://musicschool-metamorfosi.gr/admin");
	expect(isForbiddenCrossOriginRequest(new Request(url), url, false)).toBe(false);
	expect(post("/api/auth/login", { "content-type": "text/plain", origin: "https://evil.example" })).toBe(true);
});
