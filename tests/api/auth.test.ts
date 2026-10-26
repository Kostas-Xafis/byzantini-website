/**
 * Admin sign-in API (lib/api/routes/authentication.ts): password sign-in, multi-device sessions,
 * the account routes and the OAuth entry points that do not need a real provider.
 *
 * A fresh admin is invited, signs up, signs in on a second "device", changes the password and is then
 * deleted, so the harness admin (`useTestAPI`) is never signed out.
 */
import { Random as R } from "@lib/random";
import { type APIResponse } from "@lib/routes/index.client";
import { expect, test } from "bun:test";
import { z } from "astro/zod";
import { sha256Hex } from "@lib/auth/passwords";
import { withLocalDb } from "../localDb";
import { rawAPI } from "../rawAPI";
import { expectBody, getJson, sessionCookieOf, testEnv, useTestAPI } from "../testHelpers";

const login = (email: string, password: string) => rawAPI("POST", "/auth/login", { email, password });

test("--auth-- a wrong password or unknown email is refused", async () => {
	const { TEST_EMAIL } = testEnv;
	for (const res of [await login(TEST_EMAIL!, "definitely-not-the-password"), await login(R.email(), "whatever-123")]) {
		const json = await getJson<APIResponse["Authentication.userLogin"]>(res);
		expect(json.data).toEqual({ isValid: false });
		expect(sessionCookieOf(res)).toBeUndefined();
	}
});

test("--auth-- email is case-insensitive and a second sign-in keeps the first session", async () => {
	const { TEST_EMAIL, TEST_PASSWORD } = testEnv;
	// Make sure the harness session exists before signing in again.
	await getJson(await useTestAPI("Authentication.me"));
	const res = await login(TEST_EMAIL!.toUpperCase(), TEST_PASSWORD!);
	const json = await getJson<APIResponse["Authentication.userLogin"]>(res);
	expect(json.data.isValid).toBe(true);
	expect("session_id" in json.data).toBe(false);
	const second = sessionCookieOf(res)!;
	expect(second).toBeDefined();

	// The harness (first) session still works.
	await getJson(await useTestAPI("Authentication.me"));
	// Clean up the second one.
	expect((await rawAPI("POST", "/auth/logout", undefined, second)).status).toBe(200);
	expect((await rawAPI("GET", "/auth/me", undefined, second)).status).toBe(401);
	await getJson(await useTestAPI("Authentication.me"));
});

test("--auth-- me describes the signed-in admin", async () => {
	const json = await getJson<APIResponse["Authentication.me"]>(await useTestAPI("Authentication.me"));
	expectBody(
		json,
		z.object({
			id: z.number(),
			email: z.string(),
			role: z.enum(["sysadmin", "owner", "secretary"]),
			permissions: z.object({ queryLogs: z.boolean(), feeCatalog: z.boolean(), deleteAdmins: z.boolean(), manageRoles: z.boolean() }),
			hasPassword: z.literal(true),
			identities: z.array(z.object({ id: z.string(), label: z.string() })),
			providers: z.array(z.object({ id: z.string(), label: z.string() })),
		}),
	);
	expect(json.data.email.toLowerCase()).toBe(testEnv.TEST_EMAIL!.toLowerCase());
});

test("--auth-- account routes need a session", async () => {
	for (const [method, path] of [
		["GET", "/auth/me"],
		["GET", "/auth/sessions"],
		["DELETE", "/auth/sessions"],
		["DELETE", "/auth/identities/google"],
	] as const) {
		const res = await rawAPI(method, path);
		expect(res.status, `${method} ${path} → ${res.status}: ${await res.text()}`).toBe(401);
	}
	const res = await rawAPI("POST", "/auth/password", { new_password: "12345678" });
	expect(res.status, `POST /auth/password → ${res.status}: ${await res.text()}`).toBe(401);
});

test("--auth-- providers lists the enabled sign-in providers", async () => {
	const json = await getJson<APIResponse["Authentication.providers"]>(await rawAPI("GET", "/auth/providers"));
	expectBody(json, z.array(z.object({ id: z.enum(["google", "apple", "microsoft"]), label: z.string() })));
});

test("--auth-- oauthStart refuses unknown providers and links without a session", async () => {
	expect((await rawAPI("POST", "/auth/oauth/github", { intent: "login" })).status).toBe(404);

	const providers = (await getJson<APIResponse["Authentication.providers"]>(await rawAPI("GET", "/auth/providers"))).data;
	if (providers.length === 0) return; // no provider configured in this environment
	const provider = providers[0].id;
	expect((await rawAPI("POST", `/auth/oauth/${provider}`, { intent: "link" })).status).toBe(401);
	expect((await rawAPI("POST", `/auth/oauth/${provider}`, { intent: "signup", link: "no-such-invite" })).status).toBe(410);

	const res = await rawAPI("POST", `/auth/oauth/${provider}`, { intent: "login", redirect: "/admin/pupils" });
	const json = await getJson<APIResponse["Authentication.oauthStart"]>(res);
	const url = new URL(json.data.OAuthUrl);
	expect(url.protocol).toBe("https:");
	expect(url.searchParams.get("state")).toBeTruthy();
	expect(res.headers.getSetCookie().some((c) => c.startsWith("oauth_flow=") && /HttpOnly/i.test(c))).toBe(true);
});

test("--auth-- oauthCallback without a flow, or cancelled, fails cleanly", async () => {
	const stale = await getJson<APIResponse["Authentication.oauthCallback"]>(await rawAPI("POST", "/auth/oauth/google/callback", { code: "x", state: "y" }));
	expect(stale.data).toMatchObject({ ok: false, back: "/login" });

	const cancelled = await getJson<APIResponse["Authentication.oauthCallback"]>(
		await rawAPI("POST", "/auth/oauth/google/callback", { error: "access_denied" }),
	);
	expect(cancelled.data).toEqual({ ok: false, error: "Η σύνδεση ακυρώθηκε.", back: "/login" });
});

test("--auth-- a new admin: signup, two devices, password change, sign-out", async () => {
	const email = R.email();
	const password = R.string(12, "a-Z-9");
	const invite = await getJson<APIResponse["SysUsers.createRegisterLink"]>(await useTestAPI("SysUsers.createRegisterLink", { RequestObject: { email } }));
	const link = invite.data.link as string;

	// Too-short passwords are refused before the invite is used up.
	expect((await rawAPI("POST", `/sys/register/${link}`, { email, password: "short" })).status).toBe(400);

	const signup = await rawAPI("POST", `/sys/register/${link}`, { email, password });
	const created = await getJson<APIResponse["SysUsers.registerSysUser"]>(signup);
	const deviceA = sessionCookieOf(signup)!;
	expect(deviceA).toBeDefined();

	try {
		const me = await getJson<APIResponse["Authentication.me"]>(await rawAPI("GET", "/auth/me", undefined, deviceA));
		expect(me.data).toMatchObject({ id: created.data.id, hasPassword: true, role: "secretary", identities: [] });

		// A second device.
		const second = await login(email, password);
		expect((await getJson<APIResponse["Authentication.userLogin"]>(second)).data.isValid).toBe(true);
		const deviceB = sessionCookieOf(second)!;
		const sessions = await getJson<APIResponse["Authentication.sessions"]>(await rawAPI("GET", "/auth/sessions", undefined, deviceA));
		expect(sessions.data).toHaveLength(2);
		expect(sessions.data.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
		expect(JSON.stringify(sessions.data)).not.toContain(deviceA); // only hashes leave the server

		// Nothing to disconnect; the only way in cannot be removed either.
		expect((await rawAPI("DELETE", "/auth/identities/google", undefined, deviceA)).status).toBe(404);

		// Changing the password signs the other device out. Only the new password is asked, however old the session:
		// age device A's session by an hour first.
		withLocalDb((db) => db.run("UPDATE sys_user_sessions SET created_at = ? WHERE user_id = ?", [Date.now() - 60 * 60 * 1000, created.data.id]));
		const newPassword = R.string(12, "a-Z-9");
		expect((await rawAPI("POST", "/auth/password", { new_password: "short" }, deviceA)).status).toBe(400);
		expect((await rawAPI("POST", "/auth/password", { new_password: newPassword }, deviceA)).status).toBe(200);
		expect((await rawAPI("GET", "/auth/me", undefined, deviceB)).status).toBe(401);
		expect((await getJson<APIResponse["Authentication.userLogin"]>(await login(email, password))).data.isValid).toBe(false);
		const third = await login(email, newPassword);
		expect((await getJson<APIResponse["Authentication.userLogin"]>(third)).data.isValid).toBe(true);
		const deviceC = sessionCookieOf(third)!;

		// «Αποσύνδεση από όλες τις άλλες συσκευές» from A ends C, keeps A.
		expect((await rawAPI("DELETE", "/auth/sessions", undefined, deviceA)).status).toBe(200);
		expect((await rawAPI("GET", "/auth/me", undefined, deviceC)).status).toBe(401);
		expect((await rawAPI("GET", "/auth/me", undefined, deviceA)).status).toBe(200);

		// Signing out one device by id.
		const [current] = (await getJson<APIResponse["Authentication.sessions"]>(await rawAPI("GET", "/auth/sessions", undefined, deviceA))).data;
		expect((await rawAPI("DELETE", `/auth/sessions/${current.id}`, undefined, deviceA)).status).toBe(200);
		expect((await rawAPI("GET", "/auth/me", undefined, deviceA)).status).toBe(401);
	} finally {
		await getJson(await useTestAPI("SysUsers.delete", { RequestObject: [created.data.id] }));
	}
});

// ---------------------------------------------------------------------------
// «Ξέχασα τον κωδικό» (password reset by email)
// ---------------------------------------------------------------------------

/** Plants a reset link for `userId` straight in the local dev DB (the real one only travels by email). */
async function plantResetToken(userId: number, expiresInMs = 60_000) {
	const token = R.string(40, "a-Z-9");
	const id = await sha256Hex(token);
	const planted = withLocalDb((db) =>
		db.run("INSERT INTO sys_user_password_resets (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)", [
			id,
			userId,
			Date.now(),
			Date.now() + expiresInMs,
		]),
	);
	return planted ? token : null;
}

test("--auth-- a reset request answers the same whether or not the email is an admin", async () => {
	const unknown = await getJson<APIResponse["Authentication.requestPasswordReset"]>(await rawAPI("POST", "/auth/password-reset", { email: R.email() }));
	const known = await getJson<APIResponse["Authentication.requestPasswordReset"]>(
		await rawAPI("POST", "/auth/password-reset", { email: testEnv.TEST_EMAIL!.toUpperCase() }),
	);
	expect(unknown.message).toBeString();
	expect(known.message).toBe(unknown.message);
	expect((await rawAPI("POST", "/auth/password-reset", { email: "not-an-email" })).status).toBe(400);
});

test("--auth-- a reset link sets a new password once, signs every device out and this one in", async () => {
	const email = R.email();
	const password = R.string(12, "a-Z-9");
	const invite = await getJson<APIResponse["SysUsers.createRegisterLink"]>(await useTestAPI("SysUsers.createRegisterLink", { RequestObject: { email } }));
	const signup = await rawAPI("POST", `/sys/register/${invite.data.link}`, { email, password });
	const created = await getJson<APIResponse["SysUsers.registerSysUser"]>(signup);
	const oldDevice = sessionCookieOf(signup)!;
	try {
		const token = await plantResetToken(created.data.id);
		if (!token) return; // local dev DB not reachable from the tests

		const valid = await getJson<APIResponse["Authentication.validatePasswordReset"]>(await rawAPI("GET", `/auth/password-reset/${token}`));
		expect(valid.data).toEqual({ isValid: true, email });
		expect((await rawAPI("POST", `/auth/password-reset/${token}`, { password: "short" })).status).toBe(400);

		const newPassword = R.string(12, "a-Z-9");
		const reset = await rawAPI("POST", `/auth/password-reset/${token}`, { password: newPassword });
		expect((await getJson<APIResponse["Authentication.resetPassword"]>(reset)).data).toEqual({ email });
		const newDevice = sessionCookieOf(reset)!;
		expect(newDevice).toBeDefined();
		expect((await rawAPI("GET", "/auth/me", undefined, oldDevice)).status).toBe(401);
		expect((await rawAPI("GET", "/auth/me", undefined, newDevice)).status).toBe(200);
		expect((await getJson<APIResponse["Authentication.userLogin"]>(await login(email, password))).data.isValid).toBe(false);
		expect((await getJson<APIResponse["Authentication.userLogin"]>(await login(email, newPassword))).data.isValid).toBe(true);

		// Used up.
		expect((await rawAPI("POST", `/auth/password-reset/${token}`, { password: R.string(12, "a-Z-9") })).status).toBe(410);
		expect((await getJson<APIResponse["Authentication.validatePasswordReset"]>(await rawAPI("GET", `/auth/password-reset/${token}`))).data).toEqual({
			isValid: false,
		});

		// An expired link never works.
		const expired = (await plantResetToken(created.data.id, -1000))!;
		expect((await getJson<APIResponse["Authentication.validatePasswordReset"]>(await rawAPI("GET", `/auth/password-reset/${expired}`))).data.isValid).toBe(
			false,
		);
		expect((await rawAPI("POST", `/auth/password-reset/${expired}`, { password: R.string(12, "a-Z-9") })).status).toBe(410);
	} finally {
		await getJson(await useTestAPI("SysUsers.delete", { RequestObject: [created.data.id] }));
	}
});
