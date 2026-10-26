import { Bucket } from "@lib/bucket";
import { isInlineType, isPublicBucketKey, isThumbSourceType, thumbnailKey, thumbnailWidth } from "@lib/bucket/publicFiles";
import { resizeImageToWidth } from "@lib/images";
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

	// Resized teacher photo (`?w=320|480|640`); falls back to the original below.
	const width = thumbnailWidth(ctx.url.searchParams.get("w"));
	const thumbKey = width && thumbnailKey(url, width);
	if (width && thumbKey) {
		try {
			const thumb = await serveThumbnail(url, thumbKey, width);
			if (thumb) return thumb;
		} catch (error) {
			console.error("Thumbnail failed for", url, error);
		}
	}

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

/**
 * The stored `width` variant of a picture, generated on the first request. `null` → serve the original (it is
 * missing, is not a resizable type, or the Images binding is unavailable). A variant older than its source (the
 * same name uploaded again) is regenerated; one whose source is gone is deleted, never served.
 */
async function serveThumbnail(key: string, thumbKey: string, width: number): Promise<Response | null> {
	const [source, stored] = await Promise.all([Bucket.getS3Bucket().head(key), Bucket.get(thumbKey)]);
	if (!source) {
		if (stored) await Bucket.delete(thumbKey);
		return null;
	}
	const sourceType = source.httpMetadata?.contentType;
	if (!isThumbSourceType(sourceType)) return null;

	let body: ArrayBuffer, contentType: string, etag: string;
	if (stored && stored.uploaded >= source.uploaded && isInlineType(stored.httpMetadata?.contentType)) {
		body = await stored.arrayBuffer();
		contentType = stored.httpMetadata!.contentType!;
		etag = stored.httpEtag;
	} else {
		const original = await Bucket.get(key);
		if (!original) return null;
		const resized = await resizeImageToWidth(await original.arrayBuffer(), sourceType!, width);
		if (!resized) return null;
		const saved = await Bucket.put(resized.bytes, thumbKey, resized.contentType);
		({ bytes: body, contentType } = resized);
		etag = saved?.httpEtag ?? original.httpEtag;
	}

	return new Response(body, {
		status: 200,
		headers: {
			"Content-Type": contentType,
			ETag: etag,
			"X-Content-Type-Options": "nosniff",
			// Every upload gets a new file name, so a variant's URL never changes content.
			"Cache-Control": "public, max-age=31536000, immutable",
		},
	});
}
