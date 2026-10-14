import { getEnv } from "@env/env";
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
		// Token via getEnv() (dev: `.env`; prod: the CF secret, which wins in the merge).
		const authToken = getEnv().PDF_SERVICE_AUTH_TOKEN;
		if (!service || !authToken) return APIServer.jsonError("Unauthorized access to the PDF service", HTTP.INTERNAL_SERVER_ERROR);

		let upstream: Response;
		let pdf: ArrayBuffer;
		try {
			upstream = await service.fetch("https://pdf-service.internal/", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${authToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(body),
			});
			// Buffered (not streamed through): a worker killed mid-response (e.g. "exceeded CPU time
			// limit") must become an error here, not a 200 with an empty body saved as a blank .pdf.
			pdf = await upstream.arrayBuffer();
		} catch (e) {
			// PDF worker not running / unreachable (e.g. missing local dev session) or aborted.
			console.error("PDF service call failed:", e);
			return APIServer.jsonError("Η υπηρεσία δημιουργίας PDF δεν είναι διαθέσιμη", HTTP.BAD_GATEWAY);
		}

		const isPdf = upstream.ok && pdf.byteLength > 0 && (upstream.headers.get("Content-Type") ?? "").startsWith("application/pdf");
		if (!isPdf) {
			const detail = upstream.ok ? `empty or non-PDF body (${pdf.byteLength} bytes)` : new TextDecoder().decode(pdf).slice(0, 200);
			console.error(`PDF service answered ${upstream.status}: ${detail}`, { requestId: upstream.headers.get("X-Request-Id") });
			return APIServer.jsonError("Αποτυχία δημιουργίας του PDF", HTTP.BAD_GATEWAY);
		}

		return new Response(pdf, {
			headers: {
				"Content-Type": "application/pdf",
				"Cache-Control": "no-store",
			},
		});
	}),
};
