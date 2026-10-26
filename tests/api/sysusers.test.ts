import type { SysUsers } from "@_types/entities";
import { z_SysUsers } from "@lib/api/schemas";
import { Random as R } from "@lib/random";
import { type APIResponse } from "@lib/routes/index.client";
import { expect, test } from "bun:test";
import { z } from "astro/zod";
import { sha256Hex } from "@lib/auth/passwords";
import { withLocalDb } from "../localDb";
import { rawAPI } from "../rawAPI";
import { expectBody, getJson, sessionCookieOf, testEnv, useTestAPI } from "../testHelpers";

const sysUsersSimple = z_SysUsers.pick({ id: true, email: true });

function sysUsersTest() {
	const sysUser = {
		email: R.email(),
		password: R.string(8, "a-Z-9"),
	} as SysUsers;
	let newSysUserLink: string | null;
	let newSysUserId: number | null;

	test("--sysusers-- #1", async () => {
		const res = await useTestAPI("SysUsers.createRegisterLink", {
			RequestObject: { email: sysUser.email },
		});

		const json = await getJson<APIResponse["SysUsers.createRegisterLink"]>(res);
		expectBody(json, z.object({ link: z.string() }));

		newSysUserLink = json.data.link;
	});
	test("--sysusers-- #2", async () => {
		const res = await useTestAPI("SysUsers.validateRegisterLink", {
			UrlArgs: { link: newSysUserLink as string },
		});

		const json = await getJson<APIResponse["SysUsers.validateRegisterLink"]>(res);
		expectBody(json, z.object({ isValid: z.literal(true) }));
	});
	test("--sysusers-- #2b invite rejects a different email", async () => {
		const res = await useTestAPI("SysUsers.registerSysUser", {
			RequestObject: { email: R.email(), password: sysUser.password },
			UrlArgs: { link: newSysUserLink as string },
		});
		expect(res.status).not.toBe(200);
		expectBody(await res.json(), undefined, true);
	});
	test("--sysusers-- #3", async () => {
		const res = await useTestAPI("SysUsers.registerSysUser", {
			RequestObject: sysUser,
			UrlArgs: { link: newSysUserLink as string },
		});

		const json = await getJson<APIResponse["SysUsers.registerSysUser"]>(res);
		expectBody(json, z.object({ id: z.number(), email: z.string() }));
		expect(sessionCookieOf(res)).toBeDefined();

		newSysUserId = json.data.id;
	});
	test("--sysusers-- #3b invite cannot be used twice", async () => {
		const res = await useTestAPI("SysUsers.registerSysUser", {
			RequestObject: sysUser,
			UrlArgs: { link: newSysUserLink as string },
		});
		expect(res.status).not.toBe(200);
		expectBody(await res.json(), undefined, true);

		const check = await useTestAPI("SysUsers.validateRegisterLink", { UrlArgs: { link: newSysUserLink as string } });
		const checkJson = await getJson<APIResponse["SysUsers.validateRegisterLink"]>(check);
		expectBody(checkJson, z.object({ isValid: z.literal(false) }));
	});
	test("--sysusers-- #4", async () => {
		const res = await useTestAPI("SysUsers.getById", {
			RequestObject: [newSysUserId as number],
		});

		const json = await getJson<APIResponse["SysUsers.getById"]>(res);
		expectBody(json, sysUsersSimple);
	});
	test("--sysusers-- #5", async () => {
		const res = await useTestAPI("SysUsers.delete", {
			RequestObject: [newSysUserId as number],
		});

		const json = await getJson<APIResponse["SysUsers.delete"]>(res);
		expectBody(json, "User/s deleted successfully");
	});
}

sysUsersTest();

test("GET /sys", async () => {
	const res = await useTestAPI("SysUsers.get");

	const json = await getJson<APIResponse["SysUsers.get"]>(res);
	expectBody(json, z.array(sysUsersSimple));
});

test("GET /sys/sid", async () => {
	const res = await useTestAPI("SysUsers.getBySid");

	const json = await getJson<APIResponse["SysUsers.getBySid"]>(res);
	expectBody(json, sysUsersSimple);
});

// ---------------------------------------------------------------------------
// «Εκκρεμείς προσκλήσεις»: list, resend, revoke (needs the emails worker).
// ---------------------------------------------------------------------------
const INVALID_LINK = "Ο σύνδεσμος εγγραφής δεν είναι έγκυρος ή έχει λήξει";
const isValid = async (link: string) =>
	(await getJson<APIResponse["SysUsers.validateRegisterLink"]>(await useTestAPI("SysUsers.validateRegisterLink", { UrlArgs: { link } }))).data.isValid;
const pendingInvite = async (email: string) =>
	(await getJson<APIResponse["SysUsers.getInvites"]>(await useTestAPI("SysUsers.getInvites"))).data.find(
		(invite: { email: string }) => invite.email === email,
	);
const signUp = (link: string, email: string) => rawAPI("POST", `/sys/register/${link}`, { email, password: R.string(12, "a-Z-9") });

test("--invites-- invite → listed → resend replaces the link → revoke", async () => {
	const email = R.email();
	const first = await getJson<APIResponse["SysUsers.createRegisterLink"]>(await useTestAPI("SysUsers.createRegisterLink", { RequestObject: { email } }));

	const listed = await pendingInvite(email);
	expect(listed).toEqual({ email, invited_by: testEnv.TEST_EMAIL!, created_at: expect.any(Number), expires_at: first.data.expires_at });
	expect(listed!.expires_at - listed!.created_at).toBe(24 * 60 * 60 * 1000);

	// Only the link's SHA-256 is stored.
	const stored = withLocalDb((db) => db.query("SELECT id FROM sys_user_register_links WHERE email = ?").all(email) as { id: string }[]);
	if (stored) expect(stored).toEqual([{ id: await sha256Hex(first.data.link) }]);

	await Bun.sleep(5);
	const resent = await getJson<APIResponse["SysUsers.resendInvite"]>(await useTestAPI("SysUsers.resendInvite", { RequestObject: { email } }));
	expect(resent.data.link).not.toBe(first.data.link);
	expect(resent.data.expires_at).toBeGreaterThan(first.data.expires_at);
	expect((await pendingInvite(email))!.expires_at).toBe(resent.data.expires_at);
	expect(await isValid(first.data.link)).toBe(false);
	expect(await isValid(resent.data.link)).toBe(true);

	const revoked = await getJson<APIResponse["SysUsers.revokeInvite"]>(await useTestAPI("SysUsers.revokeInvite", { RequestObject: { email } }));
	expectBody(revoked, "Η πρόσκληση ακυρώθηκε");
	expect(await pendingInvite(email)).toBeUndefined();
	expect(await isValid(resent.data.link)).toBe(false);

	const signup = await signUp(resent.data.link, email);
	expect(signup.status).toBe(410);
	expect((await signup.json()).error ?? "").toBe(INVALID_LINK);
});

test("--invites-- an expired invite is not listed and cannot be used", async () => {
	const email = R.email();
	const { data } = await getJson<APIResponse["SysUsers.createRegisterLink"]>(await useTestAPI("SysUsers.createRegisterLink", { RequestObject: { email } }));
	const expired = withLocalDb((db) => db.run("UPDATE sys_user_register_links SET expires_at = ? WHERE email = ?", [Date.now() - 1, email]));
	if (!expired) return; // no local dev DB to age the invite in

	expect(await pendingInvite(email)).toBeUndefined();
	const signup = await signUp(data.link, email);
	expect(signup.status).toBe(410);
	expect((await signup.json()).error ?? "").toBe(INVALID_LINK);
	await useTestAPI("SysUsers.revokeInvite", { RequestObject: { email } });
});

test("--invites-- resend / revoke of an unknown invite answer 404; anonymous callers 401", async () => {
	const email = R.email();
	expect((await useTestAPI("SysUsers.resendInvite", { RequestObject: { email } })).status).toBe(404);
	expect((await useTestAPI("SysUsers.revokeInvite", { RequestObject: { email } })).status).toBe(404);
	expect((await rawAPI("GET", "/sys/invites")).status).toBe(401);
	expect((await rawAPI("POST", "/sys/invites/resend", { email })).status).toBe(401);
	expect((await rawAPI("DELETE", "/sys/invites", { email })).status).toBe(401);
});
