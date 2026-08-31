/**
 * Typed server-side cookie helper (ported from Isokratis).
 *
 * Pending set/delete operations are applied to the response via `apply()`
 * (called automatically by APIServer.handle).
 */

export const COOKIE_EXPIRES = 7; // days — matches the app's 7-day sessions

export const COOKIE = {
	sessionId: "session_id",
} as const;
export type CookieName = (typeof COOKIE)[keyof typeof COOKIE];

export type CookieOptions = {
	expires?: number;
	path?: string;
	sameSite?: "Strict" | "Lax" | "None";
	secure?: boolean;
	httpOnly?: boolean;
	maxAge?: number;
};

interface PendingSet {
	value: string;
	options?: CookieOptions;
}

export class ServerCookies {
	private requestHeaders: Headers;
	private pendingSets = new Map<CookieName, PendingSet>();
	private pendingDeletes = new Map<CookieName, string>();
	private allCookies: Record<string, string>;

	constructor(request: Request) {
		this.requestHeaders = request.headers;
		this.allCookies = this.#parseCookies(request);
	}

	get(name: CookieName): string {
		return this.allCookies[name] ?? "";
	}

	getAll(): Record<string, string> {
		return this.allCookies;
	}

	#parseCookies(request: Request): Record<string, string> {
		const cookieHeader = request.headers.get("Cookie");
		if (!cookieHeader) return {};
		const result: Record<string, string> = {};
		for (const cookie of cookieHeader.split(";")) {
			const trimmed = cookie.trim();
			const eqIdx = trimmed.indexOf("=");
			if (eqIdx === -1) continue;
			result[trimmed.substring(0, eqIdx)] = trimmed.substring(eqIdx + 1);
		}
		return result;
	}

	set(name: CookieName, value: string | number | boolean, options?: CookieOptions): void {
		this.pendingSets.set(name, { value: String(value), options });
		this.pendingDeletes.delete(name);
	}

	delete(name: CookieName, path = "/"): void {
		this.pendingDeletes.set(name, path);
		this.pendingSets.delete(name);
	}

	apply(response: Response): Response {
		if (this.pendingSets.size === 0 && this.pendingDeletes.size === 0) return response;

		for (const [name, entry] of this.pendingSets) {
			response.headers.append("Set-Cookie", buildSetCookie(name, entry.value, entry.options));
		}
		for (const [name, path] of this.pendingDeletes) {
			response.headers.append("Set-Cookie", `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${path}`);
		}
		return response;
	}
}

function buildSetCookie(name: string, value: string, options?: CookieOptions): string {
	const {
		expires = COOKIE_EXPIRES,
		path = "/",
		sameSite = "Strict",
		secure = false,
		httpOnly = false,
		maxAge,
	} = options ?? {};

	const parts: string[] = [`${name}=${value}`];
	if (maxAge !== undefined) {
		parts.push(`Max-Age=${maxAge}`);
	} else if (expires > 0) {
		const d = new Date();
		d.setTime(d.getTime() + expires * 24 * 60 * 60 * 1000);
		parts.push(`Expires=${d.toUTCString()}`);
	}
	parts.push(`Path=${path}`);
	parts.push(`SameSite=${sameSite}`);
	if (secure) parts.push("Secure");
	if (httpOnly) parts.push("HttpOnly");
	return parts.join("; ");
}
