import { runtimeEnv } from "@env/runtime";
import type { MiddlewareFunction } from "../APIServer";
import { APIServer, HTTP } from "../APIServer";

/**
 * Per-client rate limit for the public routes that can be abused by a script:
 * the registration form, the ΑΜ + ΑΜΚΑ lookup and the admin login.
 * Backed by the `PUBLIC_LIMITER` binding (wrangler.jsonc — 10 requests / 60 s per key),
 * keyed by route + client IP.
 *
 * Requests without `CF-Connecting-IP` never reached the Cloudflare edge (local dev,
 * the API tests, in-process SSR calls), so they are not limited. A missing binding
 * fails open: the routes keep working, just unthrottled.
 */
export const rateLimitMiddleware =
	(scope: string): MiddlewareFunction =>
	async ({ request }) => {
		const ip = request.headers.get("CF-Connecting-IP");
		const limiter = runtimeEnv?.PUBLIC_LIMITER as RateLimit | undefined;
		if (!ip || !limiter) return;
		const { success } = await limiter.limit({ key: `${scope}:${ip}` });
		if (!success) return APIServer.jsonError("Πάρα πολλές προσπάθειες. Δοκιμάστε ξανά σε ένα λεπτό.", HTTP.TOO_MANY_REQUESTS);
	};
