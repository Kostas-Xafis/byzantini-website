import { Env } from "@env/env";
import { z } from "astro/zod";
import { APIServer, HTTP } from "./APIServer";
import { authenticateMiddleware } from "./middleware/authenticate";

/**
 * Pdf — service-binding proxy for registration-form PDF generation.
 *
 * The old flow posted straight from the browser to the PDF worker's public URL
 * (`VITE_PDF_SERVICE_URL`) with `Authorization: Bearer <session_id>`, and the
 * worker validated that session with an HTTP back-call to the site. With the
 * worker reached through a service binding (worker↔worker only), the browser
 * now posts here (same-origin, session cookie) and this route proxies to the
 * `PDF_SERVICE` binding. The worker authenticates the internal call with the
 * shared `PDF_SERVICE_AUTH_TOKEN` secret — no HTTP back-call anywhere.
 */

// Loose structural check only — the PDF worker validates the payload in depth
// (request type, isMultiple shape, ...) and answers with the PDF bytes.
const pdfReqSchema = z.object({
	type: z.literal("registration"),
	request: z.any(),
});

export const pdfRoutes = {
	generate: new APIServer({ method: "POST", path: "/pdf", schema: pdfReqSchema }, [authenticateMiddleware], async ({ body, env }) => {
		const service = (env ?? {})["PDF_SERVICE"] as Fetcher | undefined;
		// Token via the merged Env.env (dev: `.env`; prod: the CF secret, which
		// wins in the merge), with the raw runtime env as fallback.
		const authToken = (Env.env.PDF_SERVICE_AUTH_TOKEN ?? (env ?? {})["PDF_SERVICE_AUTH_TOKEN"]) as string | undefined;
		if (!service || !authToken) return APIServer.jsonError("Unauthorized access to the PDF service", HTTP.INTERNAL_SERVER_ERROR);

		let upstream: Response;
		try {
			upstream = await service.fetch("https://pdf-service.internal/", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${authToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(body),
			});
		} catch (e) {
			// PDF worker not running / unreachable (e.g. missing local dev session).
			console.error("PDF service call failed:", e);
			return APIServer.jsonError("PDF service unavailable", HTTP.BAD_GATEWAY);
		}

		// Pass the worker's response through as-is (PDF bytes or its text error).
		return new Response(upstream.body, {
			status: upstream.status,
			headers: {
				"Content-Type": upstream.headers.get("Content-Type") ?? "application/octet-stream",
				"Cache-Control": "no-store",
			},
		});
	}),
};
