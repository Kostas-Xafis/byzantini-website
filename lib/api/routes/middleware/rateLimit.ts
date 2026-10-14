import { getEnv } from "@env/env";
import { runtimeEnv } from "@env/runtime";
import type { MiddlewareFunction } from "../APIServer";
import { APIServer, HTTP } from "../APIServer";

/**
 * Per-client rate limit for the public routes that can be abused by a script:
 * the registration form, the ΑΜ + ΑΜΚΑ lookup and the admin login.
 * Backed by the `PUBLIC_LIMITER` binding (wrangler.jsonc — 10 requests / 60 s per key),
 * keyed by route + client IP.
 *
 * Requests that never reached the Cloudflare edge are not limited: no `CF-Connecting-IP`
 * (in-process SSR calls) or a loopback one (the local dev runtime sets the header to the
 * loopback address; the edge never does). Set `RATE_LIMIT_LOCAL=1` in `.env` to limit local
 * requests too, when testing the limiter itself. A missing binding fails open: the routes
 * keep working, just unthrottled.
 */
const isLoopback = (ip: string) => ip === "::1" || ip.startsWith("127.") || ip.startsWith("::ffff:127.");

export const rateLimitMiddleware =
	(scope: string): MiddlewareFunction =>
	async ({ request }) => {
		const ip = request.headers.get("CF-Connecting-IP");
		const limiter = runtimeEnv?.PUBLIC_LIMITER as RateLimit | undefined;
		if (!ip || !limiter) return;
		if (isLoopback(ip) && (getEnv() as Record<string, unknown>).RATE_LIMIT_LOCAL !== "1") return;
		const { success } = await limiter.limit({ key: `${scope}:${ip}` });
		if (!success) return APIServer.jsonError("Πάρα πολλές προσπάθειες. Δοκιμάστε ξανά σε ένα λεπτό.", HTTP.TOO_MANY_REQUESTS);
	};
