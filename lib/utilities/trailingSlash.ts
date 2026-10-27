/**
 * Trailing-slash policy: every public HTML page lives at the URL that ENDS with a slash (`/kathigites/`).
 *
 * Prerendered pages already get that from Cloudflare's static assets (307 to the slash version); on-demand
 * pages answer both forms, so `src/middleware.ts` 301s the no-slash one using `trailingSlashRedirect`.
 * (Astro's `trailingSlash: "always"` is not used: it also applies to endpoints — `/api/*`, the bucket catch-all,
 * the sitemaps — and 404s the no-slash form in dev instead of redirecting.)
 * `canonicalPath` is the same rule for `<link rel="canonical">` / `og:url` (components/headers/Links.astro).
 */

/** Areas that are not public pages: they keep whatever path they were linked with (APIs, auth callbacks, emailed tokens). */
const EXCLUDED_PREFIXES = ["/api", "/admin", "/login", "/oauth2callback", "/unsubscribe", "/.well-known"];

/** Framework error pages rendered through a rewrite — never redirect them. */
const ERROR_PAGES = new Set(["/404", "/500"]);

/**
 * Announcement titles are the last segment of their URL and may hold dots ("π. Χρίστου", "25.3"), so nothing
 * under this folder is ever a file.
 */
const NO_FILES_UNDER = "/sxoli/anakoinoseis/";

/**
 * `/logo.png`, `/sitemap-0.xml`, `/kathigites/cv/x.pdf`: the last segment ends in a short ASCII extension, so it
 * is a file. (A dot followed by a space or Greek letters — "π. Χρίστου" — is not an extension.)
 */
function isFilePath(pathname: string): boolean {
	return !pathname.startsWith(NO_FILES_UNDER) && /\.[A-Za-z0-9]{1,8}$/.test(pathname);
}

function isExcludedArea(pathname: string): boolean {
	return EXCLUDED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"));
}

/** Whether `pathname` is a page path that should end with a slash (and does not yet). */
function needsTrailingSlash(pathname: string): boolean {
	if (!pathname.startsWith("/") || pathname.endsWith("/")) return false;
	if (isFilePath(pathname) || ERROR_PAGES.has(pathname) || isExcludedArea(pathname)) return false;
	return true;
}

/**
 * The URL to 301 to, or `null` when the request is fine as it is. Only GET/HEAD of page paths are redirected:
 * the query string is kept, other methods (form posts) are never bounced, and the target is always absolute on
 * the request's own origin (a `//host` path can never turn into an open redirect).
 */
export function trailingSlashRedirect(method: string, url: URL): string | null {
	if (method !== "GET" && method !== "HEAD") return null;
	if (!needsTrailingSlash(url.pathname)) return null;
	return `${url.origin}${url.pathname}/${url.search}`;
}

/** The canonical form of a page path: slash-terminated, files and excluded areas untouched. Query/fragment are not handled here. */
export function canonicalPath(pathname: string): string {
	return needsTrailingSlash(pathname) ? pathname + "/" : pathname;
}
