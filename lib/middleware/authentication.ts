import type { SysUser } from "../../types/entities";
import { executeQuery } from "../utils";

export async function authentication(req: Request) {
	const cookies = req.headers.get("cookie");
	if (!cookies) {
		return new Response("Unauthorized", { status: 401 });
	}
	let cookie = "" as string | undefined;
	if (cookies.indexOf(";") === -1) cookie = cookies;
	else
		cookie = cookies
			.replace(" ", "")
			.split(";")
			.find(cookie => cookie.startsWith("session_id"));
	if (!cookie) return new Response("Unauthorized", { status: 401 });

	const session_id = cookie.split("=")[1];
	const [user] = await executeQuery<SysUser>("SELECT * FROM sys_users WHERE session_id = ? LIMIT 1", [session_id]);
	const isValid = user !== undefined;
	if (!isValid) return new Response("Unauthorized", { status: 401 });
}
