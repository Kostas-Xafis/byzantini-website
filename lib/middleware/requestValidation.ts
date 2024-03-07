import type { APIContext } from "astro";
import { parse } from "valibot";
import type { AnyObjectSchema } from "../../types/routes";
import { getUsedBody } from "../utils.server";

export function requestValidation(validation: () => AnyObjectSchema) {
	return async function (ctx: APIContext) {
		const body = getUsedBody(ctx) || await ctx.request.json();
		// validation is a function because it messes up the type of rendering because I am using the same variable for client and server rendering
		try {
			parse(validation(), body);
		} catch (err) {
			return new Response("Invalid request body shape: " + JSON.stringify(err), { status: 400 });
		}
		// @ts-ignore
		ctx.request.json = () => body;
	};
}
