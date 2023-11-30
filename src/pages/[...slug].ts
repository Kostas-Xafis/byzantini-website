import type { APIContext } from "astro";
import { Bucket } from "../../lib/bucket";

export async function GET(context: APIContext) {
	const url = context.params.slug as string;
	const file = await Bucket.get(context, url);
	if (!file) return context.redirect("/404");

	if ("byteLength" in file) return new Response(file, { status: 200 });
	else return new Response(await file.arrayBuffer(), { status: 200 });
}
