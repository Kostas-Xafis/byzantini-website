import { API, APIEndpoints, type APIArgs, type APIEndpointNames, type APIResponse } from "@routes/index.client";
import { convertToUrlFromArgs, getOriginFromContext } from "@utilities/url";
import type { APIContext } from "astro";
import type { z } from "astro/zod";
import { assertOwnProp } from "../utils.server";
export { API };

// Astro version — Phase 4 envelope: `{ data }` | `{ message }` | `{ error }` with proper status codes.
export const useAPI = async <T extends APIEndpointNames>(endpoint: T, req?: APIArgs[T], ctx?: APIContext) => {
	// useAPI of astro can be called both in a server and client context
	const origin = getOriginFromContext(ctx);
	const Route = APIEndpoints[endpoint];
	try {
		let fetcher: any = undefined;
		if (req === undefined) {
			fetcher = fetch(`${origin}/api${Route.path}`, { method: Route.method });
		} else {
			assertOwnProp(req, "RequestObject");
			assertOwnProp(req, "UrlArgs");
			if (Route.validation) {
				(Route.validation as z.ZodTypeAny).parse(req.RequestObject);
			}
			const { RequestObject } = req;
			const body = (RequestObject instanceof Blob ? RequestObject : (RequestObject && JSON.stringify(RequestObject)) || null) as any;
			fetcher = fetch(`${origin}/api${convertToUrlFromArgs(Route.path, req.UrlArgs)}`, {
				method: Route.method,
				headers: {
					"Content-Type": (RequestObject instanceof Blob && RequestObject.type) || "application/json",
				},
				body,
			});
		}
		const response = (await (await fetcher).json()) as any;
		if (response && typeof response === "object" && "error" in response) {
			throw new Error(response.error);
		}
		if (response && typeof response === "object" && "message" in response) {
			return { message: response.message };
		}
		return { data: (response as any)?.data as APIResponse[T] };
	} catch (err) {
		console.error(err);
		throw err;
	}
};
