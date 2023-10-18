import { parse } from "valibot";
import { API, APIEndpoints, type APIArgs, type APIRes } from "../routes/index.client";
import { convertUrlFromArgs } from "../utils.client";
type APIEndpointKey = keyof typeof APIEndpoints;
export type APIStore = {
	[K in APIEndpointKey]?: Extract<APIRes[K]["res"], { type: "data"; }>["data"];
};
type APIStoreValue<Key extends keyof APIStore> = APIStore[Key];


export { API };

// IMPORTANT: The useAPI can be called from the server or the client.
// To accurately determine the URL, I prepend the website url to the request when called from the server.
const URL = (import.meta.env.URL as string) ?? "";

// Astro version
export const useAPI = async<T extends APIEndpointKey>(endpoint: T, req: APIArgs[T]) => {
	const Route = APIEndpoints[endpoint];
	if ("validation" in Route && Route.validation && req.RequestObject) {
		parse(Route.validation, req.RequestObject);
	}
	const url = URL + "/api" + (req.UrlArgs ? convertUrlFromArgs(Route.path, req.UrlArgs) : Route.path);
	const { RequestObject } = req;
	const body = RequestObject instanceof Blob ? RequestObject : (RequestObject && JSON.stringify(RequestObject)) || null;
	try {
		const res = await fetch(url, {
			method: Route.method,
			headers: {
				"Content-Type": (RequestObject instanceof Blob && RequestObject.type) || "application/json"
			},
			body
		});
		const { res: response } = (await res.json()) as APIRes[T];
		if ("error" in response) {
			console.error(response.error);
			throw new Error(JSON.stringify(response.error));
		}
		if ("message" in response) {
			return { message: response.message };
		}
		return { data: response.data as APIStoreValue<T> };
	} catch (err) {
		console.error(err);
		throw new Error(JSON.stringify(err as {}));
	}
};
