/**
 * Cross-site form-submission guard — Astro's `security.checkOrigin`, re-implemented so that ONE path can
 * be exempted (astro.config.mjs turns the built-in check off; src/middleware.ts applies this one).
 *
 * The exemption: Sign in with Apple returns with a cross-site form POST from appleid.apple.com
 * (`response_mode=form_post`) to `/oauth2callback/apple`. That request is still bound to the browser that
 * started it by the signed `oauth_flow` cookie and its `state` (lib/auth/oauthFlow.ts).
 *
 * Same rule as Astro: on-demand routes reject non-GET/HEAD/OPTIONS requests from another origin when they
 * carry a form-like content type (or none at all).
 */
const CROSS_SITE_POST_ALLOWED = new Set(["/oauth2callback/apple"]);
const FORM_CONTENT_TYPES = ["application/x-www-form-urlencoded", "multipart/form-data", "text/plain"];
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isForbiddenCrossOriginRequest(request: Request, url: URL, isPrerendered: boolean): boolean {
	if (isPrerendered || SAFE_METHODS.has(request.method)) return false;
	if (CROSS_SITE_POST_ALLOWED.has(url.pathname.replace(/\/$/, ""))) return false;
	const isSameOrigin = request.headers.get("origin") === url.origin;
	const contentType = request.headers.get("content-type");
	if (contentType === null) return !isSameOrigin;
	const formLike = FORM_CONTENT_TYPES.some((type) => contentType.toLowerCase().includes(type));
	return formLike && !isSameOrigin;
}
