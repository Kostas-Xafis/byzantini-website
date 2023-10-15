import type { APIContext } from "astro";
import { Bucket } from "../../../../lib/bucket";
import { isDevFromURL } from "../../../../lib/utils.client";

const cvPrefix = "kathigites/cv/";
export async function GET(context: APIContext) {
	const url = cvPrefix + context.params.slug;

	if (isDevFromURL(context.url)) {
		const data = await fetch(import.meta.env.S3_OPEN_BUCKET_URL + url);
		return new Response(await data.arrayBuffer(), { status: 200 });
	}

	const file = await Bucket.get(context, url);
	if (file === null) return new Response("Not found", { status: 404 });
	return new Response(await file.arrayBuffer(), { status: 200, headers: { "Content-Type": "application/pdf" } });
}
