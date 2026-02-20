import type { DefaultEndpointResponse } from "@_types/routes";
import { API, APIEndpoints, type APIArgs, type APIEndpointNames, type APIResponse } from "@routes/index.client";
import { convertToUrlFromArgs, getOriginFromContext } from "@utilities/url";
import type { APIContext } from "astro";
import { parse } from "valibot";
import { assertOwnProp } from "../utils.server";
export { API };

// Astro version
export const useAPI = async<T extends APIEndpointNames>(endpoint: T, req?: APIArgs[T], ctx?: APIContext) => {
	// useAPI of astro can be called both in a server and client context
	const origin = getOriginFromContext(ctx);
	const Route = APIEndpoints[endpoint];
	try {
		let fetcher: any = undefined;
		if (req === undefined) {
			const url = `${origin}/api${Route.path}`;
			console.log("===============\nFetching:", url, "\n===============");
			fetcher = fetch(url, { method: Route.method });
		} else {
			assertOwnProp(req, "RequestObject");
			assertOwnProp(req, "UrlArgs");
			if ("validation" in Route && Route.validation) {
				parse(Route.validation, req.RequestObject);
			}
			const { RequestObject } = req;
			const body = (RequestObject instanceof Blob ? RequestObject : (RequestObject && JSON.stringify(RequestObject)) || null) as any;
			const url = `${origin}/api${convertToUrlFromArgs(Route.path, req.UrlArgs)}`;
			console.log("===============\nFetching:", url, "\n===============");
			fetcher = fetch(url, {
				method: Route.method,
				headers: {
					"Content-Type": (RequestObject instanceof Blob && RequestObject.type) || "application/json"
				},
				body
			});
		}
		const response = (await (await fetcher).json()) as DefaultEndpointResponse;
		if (response.res.type === "error") {
			throw new Error(response.res.error);
		} else if (response.res.type === "message") {
			return { message: response.res.message };
		} else {
			return { data: response.res.data as APIResponse[T] };
		}
	} catch (err) {
		console.error(err);
		throw err;
	}
};
