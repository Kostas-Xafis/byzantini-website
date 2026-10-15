import { defineMiddleware } from "astro:middleware";
import { isForbiddenCrossOriginRequest } from "@utilities/originCheck";
import { securityHeadersFor, withSecurityHeaders } from "@utilities/securityHeaders";
import { recordServerError } from "@lib/errors/record.server";

/**
 * - Cross-site form-submission guard (Astro's `security.checkOrigin` plus one exemption — see lib/utilities/originCheck.ts).
 * - Security headers on every on-demand response (lib/utilities/securityHeaders.ts; prerendered pages: public/_headers).
 * - A page that crashes is recorded in «Σφάλματα» (lib/errors/record.server.ts) before Astro renders its error
 *   page; API errors never reach here (APIServer answers them and records its own).
 */
export const onRequest = defineMiddleware(async (context, next) => {
	if (isForbiddenCrossOriginRequest(context.request, context.url, context.isPrerendered)) {
		return new Response(`Cross-site ${context.request.method} form submissions are forbidden`, { status: 403 });
	}
	let response: Response;
	try {
		response = await next();
	} catch (error) {
		if (!context.isPrerendered) await recordServerError({ source: `page ${context.url.pathname}`, status: 500, error, host: context.url.host });
		throw error;
	}
	return withSecurityHeaders(response, securityHeadersFor(context.url, import.meta.env.DEV));
});
