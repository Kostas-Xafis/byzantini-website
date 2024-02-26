import type { APIContext } from "astro";
import { executeQuery } from "./utils.server";
import type { SysUsers } from "../types/entities";
import { createHash } from "node:crypto";

export async function generateShaKey(key: string, salt?: string) {
	salt = salt || randomHex();
	const hmac = createHash("sha256");
	hmac.update(key + (await import.meta.env.SECRET));
	hmac.update(salt);
	return hmac.digest("hex").toString() + ":" + salt;
}

// This class is used to authenticate a user by his session id
// and therefore avoid querying the database for every request
class AuthCache {
	private cache = new Map<string, number>();
	private timeout = 1000 * 60 * 60 * 12;

	constructor() { }

	invalidate(key: string) {
		if (this.cache.has(key)) {
			const time = this.cache.get(key) as number;
			if (Date.now() - time > this.timeout) {
				this.cache.delete(key);
			}
		}
	}

	has(key: string) {
		this.invalidate(key);
		return this.cache.has(key);
	}

	set(key: string) {
		this.cache.set(key, Date.now());
	}

	delete(key: string) {
		this.cache.delete(key);
	}
}

const small_cache = new AuthCache();

const hexLookup = "0123456789abcdef";
export function randomHex(size = 16) {
	let hex = "";
	for (let j = 0; j < size; j++) {
		hex += hexLookup[Math.floor(Math.random() * 16)];
	}
	return hex;
};

export const createSessionId = (size = 32) => {
	let session_id = "";
	for (let j = 0; j < size; j++) {
		session_id += hexLookup[Math.floor(Math.random() * 16)];
	}
	return { session_id, session_exp_date: Date.now() + 1000 * 60 * 60 * 24 * 7 };
};

export const getSessionId = (req: Request) => {
	const cookies = req.headers.get("cookie");
	if (!cookies) return null;
	let cookie = "" as string | undefined;
	if (cookies.indexOf(";") === -1) { cookie = cookies; }
	else {
		cookie = cookies
			.replace(" ", "")
			.split(";")
			.find(cookie => cookie.startsWith("session_id"));
	}

	if (!cookie) return null;
	return cookie.split("=")[1];
};

export async function authentication(ctx: APIContext) {
	const session_id = getSessionId(ctx.request);
	if (!session_id) return false;
	if (small_cache.has(session_id)) {
		return true;
	}
	const [user] = await executeQuery<SysUsers>("SELECT * FROM sys_users WHERE session_id = ? LIMIT 1", [session_id]);
	const isValid = user !== undefined;
	if (isValid) small_cache.set(session_id);
	else small_cache.delete(session_id);

	return isValid;
}
