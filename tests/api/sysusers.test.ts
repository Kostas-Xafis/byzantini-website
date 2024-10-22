import { array, literal, number, object, pick, string } from "valibot";
import { Random as R } from "../../lib/random";
import { APIResponse } from "../../lib/routes/index.client";
import { SysUsers, v_SysUsers } from "../../types/entities";
import { chain, expectBody, getJson, test, useTestAPI } from "../testHelpers";

const label = (str: string) => {
	return "--sysusers-- " + str;
};

const sysUsersSimple = pick(v_SysUsers, ["id", "email", "privilege"]);


function sysUsersTest() {
	const sysUser = {
		email: R.email(),
		password: R.string(8, "a-Z-9")
	} as SysUsers;
	let newSysUserLink: string | null;
	let newSysUserId: number | null;

	chain([
		label("POST /sys/register"), async () => {
			const res = await useTestAPI("SysUsers.createRegisterLink");

			const json = await getJson<APIResponse["SysUsers.createRegisterLink"]>(res);
			expectBody(json, object({ link: string() }));

			newSysUserLink = json.data.link;
		}],
		[label("POST /sys/register/validate/[link:string]"), async () => {
			const res = await useTestAPI("SysUsers.validateRegisterLink", {
				UrlArgs: { link: newSysUserLink as string }
			});

			const json = await getJson<APIResponse["SysUsers.validateRegisterLink"]>(res);
			expectBody(json, object({ isValid: literal(true) }));
		}],
		[label("POST /sys/register/[link:string]"), async () => {
			const res = await useTestAPI("SysUsers.registerSysUser", {
				RequestObject: sysUser,
				UrlArgs: { link: newSysUserLink as string }
			});

			const json = await getJson<APIResponse["SysUsers.registerSysUser"]>(res);
			expectBody(json, object({ session_id: string(), id: number() }));

			newSysUserId = json.data.id;
		}],
		[
			label("GET /sys/[id:number]"), async () => {
				const res = await useTestAPI("SysUsers.getById", {
					RequestObject: [newSysUserId as number]
				});

				const json = await getJson<APIResponse["SysUsers.getById"]>(res);
				expectBody(json, sysUsersSimple);
			}],
		[
			label("DELETE /sys"), async () => {
				const res = await useTestAPI("SysUsers.delete", {
					RequestObject: [newSysUserId as number]
				});

				const json = await getJson<APIResponse["SysUsers.delete"]>(res);
				expectBody(json, "User/s deleted successfully");
			}]
	);
}

sysUsersTest();

test(label("GET /sys"), async () => {
	const res = await useTestAPI("SysUsers.get");

	const json = await getJson<APIResponse["SysUsers.get"]>(res);
	expectBody(json, array(sysUsersSimple));
});

test(label("GET /sys/sid"), async () => {
	const res = await useTestAPI("SysUsers.getBySid");

	const json = await getJson<APIResponse["SysUsers.getBySid"]>(res);
	expectBody(json, sysUsersSimple);
});
