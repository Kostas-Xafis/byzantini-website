import { defineMiddleware } from "astro:middleware";
import { isForbiddenCrossOriginRequest } from "@utilities/originCheck";
import { securityHeadersFor, withSecurityHeaders } from "@utilities/securityHeaders";
import { trailingSlashRedirect } from "@utilities/trailingSlash";
import { recordServerError } from "@lib/errors/record.server";

/**
 * - Cross-site form-submission guard (Astro's `security.checkOrigin` plus one exemption — see lib/utilities/originCheck.ts).
 * - Trailing-slash policy: a no-slash page URL answers 301 to the slash one (lib/utilities/trailingSlash.ts).
 * - Security headers on every on-demand response (lib/utilities/securityHeaders.ts; prerendered pages: public/_headers).
 * - A page that crashes is recorded in «Σφάλματα» (lib/errors/record.server.ts) before Astro renders its error
 *   page; API errors never reach here (APIServer answers them and records its own).
 */
export const onRequest = defineMiddleware(async (context, next) => {
	if (isForbiddenCrossOriginRequest(context.request, context.url, context.isPrerendered)) {
		return new Response(`Cross-site ${context.request.method} form submissions are forbidden`, { status: 403 });
	}
	// Prerendered pages are served by Cloudflare's static assets (which add the slash themselves) and are built
	// here at their own paths — redirect only on-demand pages (and everything in dev, to see what production does).
	if (!context.isPrerendered || import.meta.env.DEV) {
		const location = trailingSlashRedirect(context.request.method, context.url);
		if (location) {
			return withSecurityHeaders(
				new Response(null, { status: 301, headers: { Location: location, "Cache-Control": "public, max-age=3600" } }),
				securityHeadersFor(context.url, import.meta.env.DEV),
			);
		}
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
