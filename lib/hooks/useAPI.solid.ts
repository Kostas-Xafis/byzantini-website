import { batch, createEffect, createSignal, untrack } from "solid-js";
import { API as api, type APIArgs, APIEndpoints, type APIRes } from "../routes/index.client";
import type { SetStoreFunction } from "solid-js/store";
import { parse } from "valibot";
export type APIStore = {
	[K in keyof typeof APIEndpoints]?: Extract<APIRes[K], { res: "data" }>["data"];
};

export const API = api;

// IMPORTANT: The useAPI can be called from the server or the client.
// To accurately determine the URL, I prepend the website url to the request when called from the server.
const URL = "";

// Astro version
export const useAPI = async <T extends keyof typeof APIEndpoints>(setStore: SetStoreFunction<APIStore>, endpoint: T, req: APIArgs[T]) => {
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
		const json = (await res.json()) as APIRes[T];
		if ("error" in json) {
			console.error(json.error);
			setStore(endpoint, json.error);
			throw new Error(JSON.stringify(json.error));
		}
		if ("message" in json) {
			console.log(json.message);
			setStore(json.message as any);
			return { message: json.message };
		}
		setStore(endpoint, json.data as any);
		return { data: json.data as any };
	} catch (err) {
		setStore(endpoint, err as any);
		console.error(err);
		throw new Error(JSON.stringify(err as {}));
	}
};

export const createHydration = (func: () => void) => {
	const [hydrate, setHydrate] = createSignal<boolean>(false, { equals: (prev, next) => false });
	createEffect(() => {
		hydrate();
		untrack(() => batch(func));
	});
	return setHydrate;
};

const convertUrlFromArgs = (url: string, args: any) => {
	let newUrl = url.slice();
	url.split("/")
		.filter(part => part.startsWith("["))
		.forEach(part => {
			const [name, _] = part.slice(1, -1).split(":");
			newUrl = newUrl.replace(part, args[name]);
		});
	return newUrl;
};
