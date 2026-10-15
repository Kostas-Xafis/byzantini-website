/**
 * Role-based access (lib/auth/roles.ts, migration 0008 `sys_users.role`).
 *
 * The harness admin (`useTestAPI`, TEST_EMAIL) is the sysadmin. The suite invites fresh admins, which
 * always start as secretaries, checks what each role may do through the real routes, promotes one to
 * owner, and deletes them all at the end.
 */
import { Random as R } from "@lib/random";
import { type APIResponse } from "@lib/routes/index.client";
import { afterAll, expect, test } from "bun:test";
import { rawAPI } from "../rawAPI";
import { getJson, sessionCookieOf, useTestAPI } from "../testHelpers";

const created: number[] = [];

/** Invites + signs up a new admin; returns their id and session cookie. */
async function newAdmin() {
	const email = R.email();
	const password = R.string(12, "a-Z-9");
	const invite = await getJson<APIResponse["SysUsers.createRegisterLink"]>(await useTestAPI("SysUsers.createRegisterLink", { RequestObject: { email } }));
	const signup = await rawAPI("POST", `/sys/register/${invite.data.link}`, { email, password });
	const json = await getJson<APIResponse["SysUsers.registerSysUser"]>(signup);
	created.push(json.data.id);
	return { id: json.data.id as number, cookie: sessionCookieOf(signup)! };
}

const status = async (method: string, path: string, cookie: string, body?: unknown) => {
	const res = await rawAPI(method, path, body, cookie);
	return `${method} ${path} → ${res.status}${res.status >= 400 ? `: ${await res.text()}` : ""}`;
};
const expectStatus = async (method: string, path: string, cookie: string, expected: number, body?: unknown) =>
	expect(await status(method, path, cookie, body)).toStartWith(`${method} ${path} → ${expected}`);

const SCHOOL_YEAR = "2026-2027";

afterAll(async () => {
	if (created.length) await useTestAPI("SysUsers.delete", { RequestObject: created });
});

test("--roles-- the harness admin is the sysadmin and may do everything", async () => {
	const me = (await getJson<APIResponse["Authentication.me"]>(await useTestAPI("Authentication.me"))).data;
	expect(me.role).toBe("sysadmin");
	expect(me.permissions).toEqual({ queryLogs: true, feeCatalog: true, deleteAdmins: true, manageRoles: true, activityLog: true });
	await getJson(await useTestAPI("QueryLogs.get"));
	await getJson(await useTestAPI("FeeCatalog.getYears"));
});

test("--roles-- an invited admin is a secretary: no query logs, fee catalog, deletion or roles", async () => {
	const secretary = await newAdmin();
	const me = (await getJson<APIResponse["Authentication.me"]>(await rawAPI("GET", "/auth/me", undefined, secretary.cookie))).data;
	expect(me.role).toBe("secretary");
	expect(me.permissions).toEqual({ queryLogs: false, feeCatalog: false, deleteAdmins: false, manageRoles: false, activityLog: false });

	await expectStatus("GET", "/query-logs", secretary.cookie, 403);
	await expectStatus("POST", "/activity", secretary.cookie, 403, {});
	await expectStatus("GET", "/fee-catalogs", secretary.cookie, 403);
	await expectStatus("GET", `/fee-catalogs/${SCHOOL_YEAR}`, secretary.cookie, 403);
	// Not even their own account.
	await expectStatus("DELETE", "/sys", secretary.cookie, 403, [secretary.id]);
	await expectStatus("PUT", "/sys/role", secretary.cookie, 403, { id: secretary.id, role: "owner" });

	// Everything else stays open.
	await expectStatus("GET", "/sys", secretary.cookie, 200);
	await expectStatus("GET", "/pupils/years", secretary.cookie, 200);
	await expectStatus("GET", "/auth/sessions", secretary.cookie, 200);
});

test("--roles-- the sysadmin promotes a secretary to owner; the owner gets the fee catalog and deletion", async () => {
	const owner = await newAdmin();
	const victim = await newAdmin();
	const sysadmin = (await getJson<APIResponse["Authentication.me"]>(await useTestAPI("Authentication.me"))).data;

	const promoted = await getJson<APIResponse["SysUsers.setRole"]>(await useTestAPI("SysUsers.setRole", { RequestObject: { id: owner.id, role: "owner" } }));
	expect(promoted.data.role).toBe("owner");

	const me = (await getJson<APIResponse["Authentication.me"]>(await rawAPI("GET", "/auth/me", undefined, owner.cookie))).data;
	expect(me.permissions).toEqual({ queryLogs: false, feeCatalog: true, deleteAdmins: true, manageRoles: false, activityLog: true });
	await expectStatus("GET", "/fee-catalogs", owner.cookie, 200);
	await expectStatus("GET", "/query-logs", owner.cookie, 403);
	await expectStatus("POST", "/activity", owner.cookie, 200, {});
	await expectStatus("PUT", "/sys/role", owner.cookie, 403, { id: victim.id, role: "owner" });

	// The owner may delete a secretary, but not the sysadmin.
	await expectStatus("DELETE", "/sys", owner.cookie, 403, [sysadmin.id]);
	await expectStatus("DELETE", "/sys", owner.cookie, 200, [victim.id]);
	expect((await rawAPI("GET", "/auth/me", undefined, victim.cookie)).status).toBe(401);
});

test("--roles-- role changes are guarded", async () => {
	const sysadmin = (await getJson<APIResponse["Authentication.me"]>(await useTestAPI("Authentication.me"))).data;
	// Nobody changes their own role (so a sysadmin always remains).
	expect((await useTestAPI("SysUsers.setRole", { RequestObject: { id: sysadmin.id, role: "secretary" } })).status).toBe(400);
	// Unknown admin.
	expect((await useTestAPI("SysUsers.setRole", { RequestObject: { id: 99_999_999, role: "owner" } })).status).toBe(404);

	// A second sysadmin is possible, and the server refuses roles that do not exist.
	const second = await newAdmin();
	await getJson(await useTestAPI("SysUsers.setRole", { RequestObject: { id: second.id, role: "sysadmin" } }));
	await expectStatus("PUT", "/sys/role", second.cookie, 400, { id: sysadmin.id, role: "admin" });
	await expectStatus("GET", "/query-logs", second.cookie, 200);
});

test("--roles-- the last sysadmin cannot be deleted", async () => {
	const sysadmin = (await getJson<APIResponse["Authentication.me"]>(await useTestAPI("Authentication.me"))).data;
	const all = (await getJson<APIResponse["SysUsers.get"]>(await useTestAPI("SysUsers.get"))).data;
	const sysadmins = all.filter((user: { role: string }) => user.role === "sysadmin").map((user: { id: number }) => user.id);
	// Deleting every sysadmin at once (the harness one and the one the previous test promoted) is refused.
	expect((await useTestAPI("SysUsers.delete", { RequestObject: sysadmins })).status).toBe(400);
	// Still signed in.
	await getJson(await useTestAPI("Authentication.me"));
	expect(sysadmins).toContain(sysadmin.id);
});
