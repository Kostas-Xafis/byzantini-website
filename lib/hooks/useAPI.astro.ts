import { parse } from "valibot";
import type { DefaultEndpointResponse } from "../../types/routes";
import { API, APIEndpoints, type APIArgs, type APIEndpointNames, type APIResponse } from "../routes/index.client";
import { convertToUrlFromArgs } from "../utilities/url";
import { assertOwnProp } from "../utils.server";
export { API };

// IMPORTANT: The useAPI can be called from the server or the client.
// To accurately determine the URL, I prepend the website url to the request when called from the server.
const { VITE_URL = "" } = import.meta.env;


// Astro version
export const useAPI = async<T extends APIEndpointNames>(endpoint: T, req?: APIArgs[T]) => {
	const Route = APIEndpoints[endpoint];
	try {
		let fetcher: any = undefined;
		if (req === undefined) {
			const url = VITE_URL + "/api" + Route.path;
			fetcher = fetch(url, { method: Route.method });
		} else {
			assertOwnProp(req, "RequestObject");
			assertOwnProp(req, "UrlArgs");
			if ("validation" in Route && Route.validation) {
				parse(Route.validation, req.RequestObject);
			}
			const { RequestObject } = req;
			const body = (RequestObject instanceof Blob ? RequestObject : (RequestObject && JSON.stringify(RequestObject)) || null) as any;
			fetcher = fetch(VITE_URL + "/api" + convertToUrlFromArgs(Route.path, req.UrlArgs), {
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
