import { defineMiddleware } from "astro:middleware";
import { isForbiddenCrossOriginRequest } from "@utilities/originCheck";

/** Cross-site form-submission guard (Astro's `security.checkOrigin` plus one exemption — see lib/utilities/originCheck.ts). */
export const onRequest = defineMiddleware((context, next) => {
	if (isForbiddenCrossOriginRequest(context.request, context.url, context.isPrerendered)) {
		return new Response(`Cross-site ${context.request.method} form submissions are forbidden`, { status: 403 });
	}
	return next();
});
