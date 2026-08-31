import { API, APIEndpoints, type APIArgs, type APIEndpointNames, type APIResponse } from "@routes/index.client";
import { convertToUrlFromArgs, getOriginFromContext } from "@utilities/url";
import type { APIContext } from "astro";
import type { z } from "astro/zod";
import { assertOwnProp } from "../utils.server";
import { APIServer } from "@lib/api/routes/APIServer";
export { API };

/**
 * Astro version — Phase 4 envelope: `{ data }` | `{ message }` | `{ error }` with proper status codes.
 *
 * Server-side calls are dispatched IN-PROCESS (APIServer.handle) instead of
 * self-fetching the worker's own origin — on the real edge a Worker fetching
 * its own hostname is rejected with Cloudflare error 1042, which broke every
 * SSR page on the deployment (fine locally, broken on the edge).
 */
export const useAPI = async <T extends APIEndpointNames>(endpoint: T, req?: APIArgs[T], ctx?: APIContext) => {
	// useAPI of astro can be called both in a server and client context
	const origin = getOriginFromContext(ctx);
	const Route = APIEndpoints[endpoint];
	try {
		const url = `${origin}/api${convertToUrlFromArgs(Route.path, (req as any)?.UrlArgs ?? {})}`;
		let body: BodyInit | null = null;
		let headers: Record<string, string> = {};

		if (req !== undefined) {
			assertOwnProp(req, "RequestObject");
			assertOwnProp(req, "UrlArgs");
			if (Route.validation) {
				(Route.validation as z.ZodTypeAny).parse(req.RequestObject);
			}
			const { RequestObject } = req;
			body = (RequestObject instanceof Blob ? RequestObject : (RequestObject && JSON.stringify(RequestObject)) || null) as any;
			headers["Content-Type"] = (RequestObject instanceof Blob && RequestObject.type) || "application/json";
		}

		// Server-side (ctx present): dispatch in-process — self-fetching the
		// worker's own origin is rejected on the edge (CF error 1042).
		const response = ctx ? await inProcessCall(url, ctx, Route.method, headers, body) : await fetch(url, { method: Route.method, headers, body });

		const json = (await response.json()) as any;
		if (json && typeof json === "object" && "error" in json) {
			throw new Error(json.error);
		}
		if (json && typeof json === "object" && "message" in json) {
			return { message: json.message };
		}
		return { data: (json as any)?.data as APIResponse[T] };
	} catch (err) {
		console.error(err);
		throw err;
	}
};

/**
 * Server-side: dispatch through the route registry directly (no network).
 * Synthetic request carries the request cookies so auth'd endpoints work.
 */
async function inProcessCall(url: string, ctx: APIContext, method: string, headers: Record<string, string>, body: BodyInit | null) {
	const request = new Request(`http://in-process${new URL(url).pathname}${new URL(url).search}`, {
		method,
		headers: {
			...headers,
			cookie: ctx.request.headers.get("cookie") ?? "",
			origin: "http://in-process",
		},
		body,
	});
	const response = await APIServer.handle(request, "/api");
	// APIServer may redirect (route not found) — surface a JSON error instead of
	// letting the caller parse an HTML 404.
	if (!response.ok && response.headers.get("content-type")?.includes("json")) return response;
	if (!response.ok) throw new Error(`API call failed with status ${response.status}`);
	return response;
}
