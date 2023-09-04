import type { APIContext } from "astro";
import type { AnyObjectSchema, EndpointRoute, HTTPMethods } from "../../../types/routes";
import { matchRoute } from "../../../lib/routes/index.server";

export const prerender = false;

const generateResponse = async (request: Request, route: EndpointRoute<any, any | AnyObjectSchema, any>, urlSlug: string[]) => {
	let { func, path } = route;
	if (route.hasUrlParams === false) return await func(request, {});
	const slugData = {} as any;
	path.split("/")
		.slice(1)
		.forEach((part, i) => {
			if (!part.startsWith("[")) return;
			const [name, type] = part.slice(1, -1).split(":");
			if (type === "number") slugData[name] = Number(urlSlug[i]);
			else slugData[name] = urlSlug[i];
		});
	return await func(request, slugData);
};

const ResponseWrap = async (request: Request, route: EndpointRoute<any, any | AnyObjectSchema, any>, urlSlug: string[]) => {
	for (const middleware of route.middleware ?? []) {
		const response = await middleware(request);
		if (response) return response;
	}
	const res = await generateResponse(request, route, urlSlug);
	return new Response(JSON.stringify(res), { status: 200 });
};

const RequestTemplate = async function ({ params, request }: APIContext) {
	const slug = params.slug?.split("/") ?? [];
	const route = matchRoute(slug, request.method.toUpperCase() as HTTPMethods);
	if (!route) return { status: 404, body: "Not Found" };
	return await ResponseWrap(request, route, slug);
};

export async function ALL(context: APIContext) {
	return await RequestTemplate(context);
}
