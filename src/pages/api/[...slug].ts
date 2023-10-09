import type { AnyObjectSchema, Context, EndpointRoute, HTTPMethods } from "../../../types/routes";
import { matchRoute } from "../../../lib/routes/index.server";

export const prerender = false;

const generateResponse = async (ctx: Context, route: EndpointRoute<any, any | AnyObjectSchema, any>, urlSlug: string[]) => {
	let { func, path } = route;
	if (route.hasUrlParams === false) return await func(ctx, {});
	const slugData = {} as any;
	path.split("/")
		.slice(1)
		.forEach((part, i) => {
			if (!part.startsWith("[")) return;
			const [name, type] = part.slice(1, -1).split(":");
			if (type === "number") slugData[name] = Number(urlSlug[i]);
			else slugData[name] = urlSlug[i];
		});
	return await func(ctx, slugData);
};

const ResponseWrap = async (ctx: Context, route: EndpointRoute<any, any | AnyObjectSchema, any>, urlSlug: string[]) => {
	for (const middleware of route.middleware ?? []) {
		const response = await middleware(ctx);
		if (response) return response;
	}
	const res = await generateResponse(ctx, route, urlSlug);
	if ("error" in res) return new Response(JSON.stringify(res), { status: 500 });
	return new Response(JSON.stringify(res), { status: 200 });
};

const RequestTemplate = async function (ctx: Context) {
	const slug = ctx.params.slug?.split("/") ?? [];
	const route = matchRoute(slug, ctx.request.method.toUpperCase() as HTTPMethods);
	if (!route) return { status: 404, body: "Not Found" };
	return await ResponseWrap(ctx, route, slug);
};

export async function ALL(context: Context) {
	return await RequestTemplate(context);
}
