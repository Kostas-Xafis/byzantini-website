/**
 * Login-return plumbing (`?redirect_url=`).
 *
 * Admin deep links are shareable — `/admin/pupils?q=<query>`, `/admin/books?search=<query>&col=3`,
 * `/admin/registrations?year=2024&search=<query>` — but the dashboard guard
 * (`AdminLayout`) sends a logged-out visitor to the bare `/login`, so the query
 * they were sent for was lost and they landed on the dashboard home instead.
 *
 * The gate now remembers the requested URL: `AdminLayout` redirects to
 * `/login?redirect_url=<path+query>` and the login screen navigates back there
 * after a successful sign-in. A provider sign-in (Google, Apple, Microsoft)
 * leaves the site and comes back on `/oauth2callback`, which cannot see the
 * login URL, so the server keeps the target in the signed OAuth flow cookie
 * (lib/auth/oauthFlow.ts) and the callback hands it back.
 *
 * Everything a visitor can put in `redirect_url` is attacker-controlled, so
 * targets are validated before they ever reach `window.location`: only
 * same-site `/admin` paths are accepted (see `isSafeRedirectTarget`).
 */

/** Dashboard home — where a sign-in lands when nothing was requested. */
export const ADMIN_HOME = "/admin";
/** The sign-in screen that receives `?redirect_url=`. */
export const LOGIN_PATH = "/login";
/** Query parameter carrying the requested URL through the sign-in screen. */
export const REDIRECT_PARAM = "redirect_url";
/** Query strings are not unbounded; real admin deep links are far shorter. */
const MAX_TARGET_LENGTH = 512;

/**
 * Whether `value` may be used as a post-login destination.
 *
 * Accepted: an absolute path into the dashboard (`/admin`, `/admin/pupils?q=…`).
 * Rejected: anything that could leave the site — protocol-relative (`//host`),
 * backslash-disguised (`/\host`, which browsers read as `//host`), absolute
 * URLs (`https://host`), `javascript:` — plus whitespace/control characters and
 * oversized values.
 */
export function isSafeRedirectTarget(value: unknown): value is string {
	if (typeof value !== "string" || value.length === 0 || value.length > MAX_TARGET_LENGTH) return false;
	if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return false;
	if (/[\u0000-\u001f\u007f\s]/.test(value)) return false;
	// The sign-in screen only ever serves the dashboard: `/admin`, `/admin/…`,
	// with any query string or hash (ignored while reading the path).
	const path = value.split(/[?#]/, 1)[0];
	return path === ADMIN_HOME || path.startsWith(`${ADMIN_HOME}/`);
}

/**
 * The validated `redirect_url` of a query string (`"?redirect_url=…"` or
 * `"redirect_url=…"`), or `null` when it is absent, malformed or unsafe.
 */
export function readRedirectTarget(search: string): string | null {
	const value = new URLSearchParams(search).get(REDIRECT_PARAM);
	return isSafeRedirectTarget(value) ? value : null;
}

/**
 * Path + query + hash currently in the address bar — the URL worth returning to.
 * The argument is injectable so this stays a pure function in tests.
 */
export function currentRedirectTarget(location: { pathname: string; search: string; hash?: string } = window.location): string {
	return `${location.pathname}${location.search}${location.hash ?? ""}`;
}

/**
 * `/login?redirect_url=<encoded target>` — or the bare `/login` when there is
 * nothing (valid) to return to.
 */
export function buildLoginUrl(target?: string | null): string {
	if (!isSafeRedirectTarget(target) || target === ADMIN_HOME) return LOGIN_PATH;
	return `${LOGIN_PATH}?${REDIRECT_PARAM}=${encodeURIComponent(target)}`;
}
