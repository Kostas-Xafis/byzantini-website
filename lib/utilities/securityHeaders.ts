/**
 * Security headers (docs/IMPROVEMENTS.md S3), applied by `src/middleware.ts` to every on-demand response and,
 * for the prerendered pages served straight from static assets, by `public/_headers` (kept in sync by
 * tests/unit/securityHeaders.test.ts).
 *
 * - Every page: no MIME sniffing, a conservative referrer, no camera/microphone/… , framing only by the site
 *   itself, HSTS on https.
 * - The dashboard and the sign-in pages (`STRICT_CSP_PATHS`) also get an enforced Content-Security-Policy that
 *   lists exactly what they load: the site, jsDelivr / cdnjs (Chart.js, client-zip, xlsx, print-js, pdf.js and
 *   its worker), Google Fonts, Cloudflare Web Analytics, provider avatars (any https image), blob:/data: for
 *   generated PDFs and previews. Inline scripts stay allowed — Astro and the theme bootstrap emit them.
 *   Loading something new from another origin there means adding it below.
 * - The public site gets no source restrictions yet (maps, YouTube and social embeds would need an inventory).
 */

/** Path prefixes that get the strict policy. */
export const STRICT_CSP_PATHS = ["/admin", "/login", "/oauth2callback"] as const;

const CDN = "https://cdn.jsdelivr.net https://cdnjs.cloudflare.com";

export const STRICT_CSP = [
	"default-src 'self'",
	`script-src 'self' 'unsafe-inline' ${CDN} https://static.cloudflareinsights.com`,
	"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
	"font-src 'self' data: https://fonts.gstatic.com",
	"img-src 'self' data: blob: https:",
	`connect-src 'self' ${CDN} https://cloudflareinsights.com`,
	`worker-src 'self' blob: ${CDN}`,
	"frame-src 'self' blob:",
	"object-src 'none'",
	"base-uri 'self'",
	"form-action 'self'",
	"frame-ancestors 'none'",
].join("; ");

/** The public site: no source restrictions, only what cannot break a page. */
export const BASELINE_CSP = "frame-ancestors 'self'; base-uri 'self'; object-src 'none'";

export const BASELINE_HEADERS: Record<string, string> = {
	"X-Content-Type-Options": "nosniff",
	"Referrer-Policy": "strict-origin-when-cross-origin",
	"Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
	"X-Frame-Options": "SAMEORIGIN",
};

export const HSTS = "max-age=31536000";

export function usesStrictCsp(pathname: string): boolean {
	return STRICT_CSP_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"));
}

/**
 * The headers for a response to `url`. `dev` relaxes the strict policy just enough for Vite (its HMR
 * websocket); everything else is identical, so dev shows what production will block.
 */
export function securityHeadersFor(url: URL, dev = false): Record<string, string> {
	const strict = usesStrictCsp(url.pathname);
	let csp = strict ? STRICT_CSP : BASELINE_CSP;
	if (strict && dev) csp = csp.replace("connect-src 'self'", "connect-src 'self' ws: wss:");
	return {
		...BASELINE_HEADERS,
		...(strict ? { "X-Frame-Options": "DENY" } : {}),
		"Content-Security-Policy": csp,
		...(url.protocol === "https:" && !dev ? { "Strict-Transport-Security": HSTS } : {}),
	};
}

/**
 * Adds the headers to `response` without replacing any it already set (e.g. the bucket route's sandbox CSP).
 * Responses with immutable headers are copied first.
 */
export function withSecurityHeaders(response: Response, headers: Record<string, string>): Response {
	let target = response;
	try {
		for (const [name, value] of Object.entries(headers)) if (!target.headers.has(name)) target.headers.set(name, value);
	} catch {
		target = new Response(response.body, response);
		for (const [name, value] of Object.entries(headers)) if (!target.headers.has(name)) target.headers.set(name, value);
	}
	return target;
}
