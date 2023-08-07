import type { APIContext } from "astro";
import { Bucket } from "../../../../lib/bucket";

export async function get(context: APIContext) {
	const url = context.params.slug as string;
	const file = await Bucket.get(context.request, url);
	if (file === null) return new Response("Not found", { status: 404 });
	return new Response(await file.arrayBuffer(), { status: 200 });
}
