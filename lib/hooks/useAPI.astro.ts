import { parse } from "valibot";
import { APIEndpoints, API, type APIEndpointNames, type APIArgs, type APIResponse } from "../routes/index.client";
import { convertUrlFromArgs } from "../utils.client";
import type { DefaultEndpointResponse } from "../../types/routes";
import { assertOwnProp } from "../utils.server";
export { API };

// IMPORTANT: The useAPI can be called from the server or the client.
// To accurately determine the URL, I prepend the website url to the request when called from the server.
const URL = (import.meta.env.URL as string) ?? "";


// Astro version
export const useAPI = async<T extends APIEndpointNames>(endpoint: T, req?: APIArgs[T]) => {
	const Route = APIEndpoints[endpoint];
	try {
		let fetcher: any = undefined;
		if (req === undefined) {
			const url = URL + "/api" + Route.path;
			fetcher = fetch(url, { method: Route.method });
		} else {
			assertOwnProp(req, "RequestObject");
			assertOwnProp(req, "UrlArgs");
			if ("validation" in Route && Route.validation) {
				parse(Route.validation, req.RequestObject);
			}
			const { RequestObject } = req;
			const body = (RequestObject instanceof Blob ? RequestObject : (RequestObject && JSON.stringify(RequestObject)) || null) as any;
			fetcher = fetch(URL + "/api" + convertUrlFromArgs(Route.path, req.UrlArgs), {
				method: Route.method,
				headers: {
					"Content-Type": (RequestObject instanceof Blob && RequestObject.type) || "application/json"
				},
				body
			});
		}
		const response = (await (await fetcher).json()) as DefaultEndpointResponse;
		if (response.res.type === "error") {
			console.error(response.res.error);
			throw new Error(JSON.stringify(response.res.error));
		} else if (response.res.type === "message") {
			return { message: response.res.message };
		} else {
			return { data: response.res.data as APIResponse[T] };
		}
	} catch (err) {
		console.error(err);
		throw new Error(JSON.stringify(err as {}));
	}
};
