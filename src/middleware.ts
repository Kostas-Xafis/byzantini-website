import { defineMiddleware } from "astro:middleware";
import { isForbiddenCrossOriginRequest } from "@utilities/originCheck";
import { securityHeadersFor, withSecurityHeaders } from "@utilities/securityHeaders";

/**
 * - Cross-site form-submission guard (Astro's `security.checkOrigin` plus one exemption — see lib/utilities/originCheck.ts).
 * - Security headers on every on-demand response (lib/utilities/securityHeaders.ts; prerendered pages: public/_headers).
 */
export const onRequest = defineMiddleware(async (context, next) => {
	if (isForbiddenCrossOriginRequest(context.request, context.url, context.isPrerendered)) {
		return new Response(`Cross-site ${context.request.method} form submissions are forbidden`, { status: 403 });
	}
	const response = await next();
	return withSecurityHeaders(response, securityHeadersFor(context.url, import.meta.env.DEV));
});
