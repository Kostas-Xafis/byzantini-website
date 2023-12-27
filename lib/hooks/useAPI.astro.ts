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

function assertOwnPropCheat<X extends {}, Y extends PropertyKey>(obj: X, prop: Y): asserts obj is X & Record<Y, unknown> { }

// Astro version
export const useAPI = async<T extends APIEndpointKey>(endpoint: T, req?: APIArgs[T]) => {
	const Route = APIEndpoints[endpoint];
	try {
		let fetcher: ReturnType<typeof fetch> | undefined = undefined;
		if (req === undefined) {
			const url = URL + "/api" + Route.path;
			fetcher = fetch(url, { method: Route.method });
		} else {
			assertOwnPropCheat(req, "RequestObject");
			assertOwnPropCheat(req, "UrlArgs");
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
		const res = await fetcher;
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
