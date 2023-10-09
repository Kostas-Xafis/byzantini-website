import type { APIContext } from "astro";
import { Bucket } from "../../lib/bucket";
import { isDevFromURL } from "../../lib/utils.client";

export async function GET(context: APIContext) {
	const url = context.params.slug as string;
	console.log(url);
	if (isDevFromURL(context.url)) {
		return new Response(await (await fetch(await import.meta.env.S3_OPEN_BUCKET_URL + url)).arrayBuffer(), { status: 200 });
	}

	const file = await Bucket.get(context, url);
	if (file === null) return new Response("Not found", { status: 404 });
	return new Response(await file.arrayBuffer(), { status: 200 });
}
