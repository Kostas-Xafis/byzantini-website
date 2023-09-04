import type { SysUsers } from "../../types/entities";
import { executeQuery } from "../utils.server";
import type { APIContext } from "astro";

export const getSessionId = (req: Request) => {
	const cookies = req.headers.get("cookie");
	if (!cookies) return null
	let cookie = "" as string | undefined;
	if (cookies.indexOf(";") === -1) cookie = cookies;
	else
		cookie = cookies
			.replace(" ", "")
			.split(";")
			.find(cookie => cookie.startsWith("session_id"));
	if (!cookie) return null;
	return cookie.split("=")[1];
}

export async function authentication(ctx: APIContext) {
	const session_id = getSessionId(ctx.request);
	if (!session_id) return new Response("Unauthorized", { status: 401 });
	const [user] = await executeQuery<SysUsers>("SELECT * FROM sys_users WHERE session_id = ? LIMIT 1", [session_id]);
	const isValid = user !== undefined;
	if (!isValid) return new Response("Unauthorized", { status: 401 });
}
