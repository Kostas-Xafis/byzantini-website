import { Bucket } from "@lib/bucket";
import { isInlineType, isPublicBucketKey } from "@lib/bucket/publicFiles";
import type { APIContext } from "astro";
export const prerender = false;

/** Public files from the R2 bucket (posters, announcement images, CVs, …) — see lib/bucket/publicFiles.ts. */
export async function GET(ctx: APIContext) {
	const rawUrl = ctx.params.slug as string;
	const url = (() => {
		try {
			return decodeURIComponent(rawUrl);
		} catch {
			return rawUrl;
		}
	})();
	if (!isPublicBucketKey(url)) return ctx.rewrite("/404");
	try {
		const file = await Bucket.get(url);
		if (!file) return ctx.rewrite("/404");

		const headers = new Headers();
		file.writeHttpMetadata(headers);
		headers.set("ETag", file.httpEtag);
		headers.set("X-Content-Type-Options", "nosniff");
		if (!isInlineType(file.httpMetadata?.contentType)) {
			headers.set("Content-Disposition", "attachment");
			headers.set("Content-Security-Policy", "default-src 'none'; sandbox");
		}
		return new Response(await file.arrayBuffer(), { status: 200, headers });
	} catch {
		return ctx.rewrite("/404");
	}
}
