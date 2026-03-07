import { v_SysUsers, type SysUsers } from "@_types/entities";
import { Random as R } from "@lib/random";
import { type APIResponse } from "@lib/routes/index.client";
import { chain, test } from "tests/TestChain";
import { array, literal, number, object, pick, string } from "valibot";
import { expectBody, getJson, useTestAPI } from "../testHelpers";

const sysUsersSimple = pick(v_SysUsers, ["id", "email"]);

function sysUsersTest() {
	const sysUser = {
		email: R.email(),
		password: R.string(8, "a-Z-9")
	} as SysUsers;
	let newSysUserLink: string | null;
	let newSysUserId: number | null;

	chain("--sysusers--",
		async () => {
			const res = await useTestAPI("SysUsers.createRegisterLink", {
				RequestObject: { email: sysUser.email }
			});

			const json = await getJson<APIResponse["SysUsers.createRegisterLink"]>(res);
			expectBody(json, object({ link: string() }));

			newSysUserLink = json.data.link;
		},
		async () => {
			const res = await useTestAPI("SysUsers.validateRegisterLink", {
				UrlArgs: { link: newSysUserLink as string }
			});

			const json = await getJson<APIResponse["SysUsers.validateRegisterLink"]>(res);
			expectBody(json, object({ isValid: literal(true) }));
		},
		async () => {
			const res = await useTestAPI("SysUsers.registerSysUser", {
				RequestObject: sysUser,
				UrlArgs: { link: newSysUserLink as string }
			});

			const json = await getJson<APIResponse["SysUsers.registerSysUser"]>(res);
			expectBody(json, object({ session_id: string(), id: number() }));

			newSysUserId = json.data.id;
		},
		async () => {
			const res = await useTestAPI("SysUsers.getById", {
				RequestObject: [newSysUserId as number]
			});

			const json = await getJson<APIResponse["SysUsers.getById"]>(res);
			expectBody(json, sysUsersSimple);
		},
		async () => {
			const res = await useTestAPI("SysUsers.delete", {
				RequestObject: [newSysUserId as number]
			});

			const json = await getJson<APIResponse["SysUsers.delete"]>(res);
			expectBody(json, "User/s deleted successfully");
		}
	);
}

sysUsersTest();

test("GET /sys", async () => {
	const res = await useTestAPI("SysUsers.get");

	const json = await getJson<APIResponse["SysUsers.get"]>(res);
	expectBody(json, array(sysUsersSimple));
});

test("GET /sys/sid", async () => {
	const res = await useTestAPI("SysUsers.getBySid");

	const json = await getJson<APIResponse["SysUsers.getBySid"]>(res);
	expectBody(json, sysUsersSimple);
});
