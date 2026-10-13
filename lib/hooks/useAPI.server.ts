// Importing the registry registers every route instance, so in-process dispatch can find them even when
// the `/api/[...slug]` page module has not been loaded in this isolate yet.
import "@lib/api/routes";
import { APIServer } from "@lib/api/routes/APIServer";
import { buildAPIRequest, readAPIResponse } from "@lib/api/transport";
import { API, APIEndpoints, type APIArgs, type APIEndpointNames, type APIResponse } from "@routes/index.client";
import type { APIContext } from "astro";

export { API };

/** `{ data }` or `{ message }`, shaped so frontmatter can read `res.data` / `res.message` directly. */
export type ServerAPIResult<T> = { data: T; message?: undefined } | { message: string; data?: undefined };

/**
 * SERVER ONLY — calls an internal API route from Astro frontmatter (SSR pages, endpoints).
 *
 * The call is dispatched IN-PROCESS through `APIServer.handle` instead of `fetch`ing the worker's own
 * origin: on the real edge a Worker fetching its own hostname is rejected with Cloudflare error 1042,
 * which broke every SSR page on the deployment (it works locally, in miniflare, so it is easy to
 * reintroduce). The synthetic request carries the incoming request's cookies, so authenticated
 * endpoints see the caller's session.
 *
 * Browser code must use `apiCall` (`@hooks/apiCall`) — this module pulls in the whole route registry.
 *
 * @throws `APIRequestError` when the route answers with a non-2xx status or an `{ error }` envelope.
 */
export async function useAPI<T extends APIEndpointNames>(
	endpoint: T,
	req: APIArgs[T] | undefined,
	ctx: Pick<APIContext, "request">,
): Promise<ServerAPIResult<APIResponse[T]>> {
	const { path, init } = buildAPIRequest(APIEndpoints[endpoint], req);
	const headers = new Headers(init.headers);
	headers.set("cookie", ctx.request.headers.get("cookie") ?? "");
	// Like a browser call, the request names an origin (the synthetic one; Astro's checkOrigin only guards real incoming requests).
	headers.set("origin", "http://in-process");
	try {
		const response = await APIServer.handle(new Request(`http://in-process/api${path}`, { ...init, headers }), "/api");
		return (await readAPIResponse<APIResponse[T]>(response)) as ServerAPIResult<APIResponse[T]>;
	} catch (err) {
		console.error(`[useAPI] ${endpoint}:`, err);
		throw err;
	}
}
