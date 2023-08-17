import { API as api, APIArgs, APIEndpoints, APIRes } from "../routes/index.client";
import { parse } from "valibot";

type Endpoint = typeof APIEndpoints;

const URL = (import.meta.env.URL as string) ?? "";

export const API = api;

// Astro version
export const useAPI = async <T extends keyof Endpoint>(endpoint: T, req: APIArgs[T]) => {
	const Route = APIEndpoints[endpoint];
	if ("validation" in Route && Route.validation && req.RequestObject) {
		parse(Route.validation, req.RequestObject);
	}
	let route = APIEndpoints[endpoint];
	const url = URL + "/api" + (req.UrlArgs ? convertUrlFromArgs(route.path, req.UrlArgs) : route.path);
	const { RequestObject } = req;
	delete req.UrlArgs;
	delete req.RequestObject;
	try {
		const res = await fetch(url, {
			method: route.method,
			body: RequestObject ? JSON.stringify(RequestObject) : null
		});
		const json = (await res.json()) as APIRes[T];
		if ("error" in json) return { error: json.error };
		if ("message" in json) return { message: json.message };
		return { data: json.data as any };
	} catch (error) {
		return { error };
	}
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
