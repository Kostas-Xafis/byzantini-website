import type { APIContext } from "astro";
import { Bucket } from "../../lib/bucket";
import { isDevFromURL } from "../../lib/utils.client";

export async function GET(context: APIContext) {
	const url = context.params.slug as string;
	if (isDevFromURL(context.url)) {
		const bucketFetch = await fetch(await import.meta.env.S3_OPEN_BUCKET_URL + url);
		if (bucketFetch.status === 404) return context.redirect("/404");
		return new Response(await bucketFetch.arrayBuffer(), { status: 200 });
	}

	const file = await Bucket.get(context, url);
	console.log(file);
	if (file === null) return context.redirect("/404");
	return new Response(await file.arrayBuffer(), { status: 200 });
}

