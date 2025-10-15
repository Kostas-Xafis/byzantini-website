import { Bucket } from "@lib/bucket";
import type { APIContext } from "astro";

export async function GET(ctx: APIContext) {
	const url = ctx.params.slug as string;
	try {
		const file = await Bucket.get(ctx, url);
		if (!file) return ctx.redirect("/404");

		if ("byteLength" in file) return new Response(file, { status: 200 });
		else return new Response(await file.arrayBuffer(), { status: 200 });
	} catch (error: any) {
		return ctx.redirect("/404?url=" + encodeURIComponent(url));
	}
}
