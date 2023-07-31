import { API as api, APIArgs, APIEndpoints, APIRes } from "../routes/index.client";

type Endpoint = typeof APIEndpoints;

export const API = api;

// Astro version
export const useAPI = async <T extends keyof Endpoint>(endpoint: T, req: APIArgs[T]) => {
	let route = APIEndpoints[endpoint];
	const url = "http://localhost:3000/api" + (req.UrlArgs ? convertUrlFromArgs(route.path, req.UrlArgs) : route.path);
	const { RequestObject } = req;
	delete req.UrlArgs;
	delete req.RequestObject;
	try {
		const res = await fetch(url, {
			method: route.method,
			body: RequestObject ? JSON.stringify(RequestObject) : null
		});
		const json = (await res.json()) as APIRes[T];
		return json;
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
