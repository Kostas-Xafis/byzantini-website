import type { APIContext } from "astro";
import { Bucket } from "../../../lib/bucket";
import { isDevFromURL } from "../../../lib/utils.client";

export async function GET(context: APIContext) {
	if (isDevFromURL(context.url)) return new Response("", { status: 200 });
	const url = context.params.slug as string;
	const file = await Bucket.get(url);
	if (file === null) return new Response("Not found", { status: 404 });
	return new Response(await file.arrayBuffer(), { status: 200 });
}
