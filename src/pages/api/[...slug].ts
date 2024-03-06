import type { APIContext } from "astro";
import { matchRoute } from "../../../lib/routes/index.server";
import type { RemovePartial } from "../../../types/helpers";
import type { AnyEndpoint, HTTPMethods } from "../../../types/routes";

export const prerender = false;

const generateResponse = (ctx: APIContext, route: RemovePartial<AnyEndpoint, "func">, urlSlug: string[]) => {
	let { func, path } = route;
	if (route.hasUrlParams === false) return func({ ctx, slug: {} });
	const slugData = {} as any;
	path.split("/")
		.slice(1)
		.forEach((part, i) => {
			if (!part.startsWith("[")) return;
			const [name, type] = part.slice(1, -1).split(":");
			if (type === "number") slugData[name] = Number(urlSlug[i]);
			else slugData[name] = urlSlug[i];
		});
	return func({ ctx, slug: slugData });
};

const ResponseWrap = async (ctx: APIContext, route: RemovePartial<AnyEndpoint, "func">, urlSlug: string[]) => {
	for (const middleware of (route.middleware ?? [])) {
		const response = await middleware(ctx);
		if (response) return response;
	}
	const res = await generateResponse(ctx, route, urlSlug);
	if ("error" in res) return new Response(JSON.stringify(res), { status: 500 });
	return new Response(JSON.stringify(res), { status: 200 });
};

const RequestTemplate = function (ctx: APIContext) {
	const slug = ctx.params.slug?.split("/") ?? [];
	const route = matchRoute(slug, ctx.request.method.toUpperCase() as HTTPMethods);
	if (!route) return ctx.redirect("/404");
	return ResponseWrap(ctx, route, slug);
};

export async function ALL(context: APIContext) {
	return await RequestTemplate(context);
}
