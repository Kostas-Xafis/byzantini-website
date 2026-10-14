import type { SysUsers } from "@_types/entities";
import { z_SysUsers } from "@lib/api/schemas";
import { Random as R } from "@lib/random";
import { type APIResponse } from "@lib/routes/index.client";
import { expect, test } from "bun:test";
import { z } from "astro/zod";
import { expectBody, getJson, useTestAPI } from "../testHelpers";

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
		expectBody(json, z.object({ session_id: z.string(), id: z.number() }));

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
