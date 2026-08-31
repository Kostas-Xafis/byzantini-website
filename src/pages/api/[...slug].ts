import "@lib/api/routes/index";
import { APIServer } from "@lib/api/routes/APIServer";

export const prerender = false;

/**
 * Single API entrypoint — Phase 4 (Isokratis-style dispatch).
 * `APIServer.handle` matches method + path against the registered route
 * instances, runs middleware, validates the body and calls the handler.
 */
export async function ALL({ request }: { request: Request }) {
	return APIServer.handle(request, "/api");
}
