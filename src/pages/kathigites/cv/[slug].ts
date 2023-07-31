import type { APIContext } from "astro";
import { bucketFileDownload } from "../../../../lib/bucket/fileDownload";

export const prerender = false;

export async function get(context: APIContext) {
	const url = context.params.slug as string;
	const file = await bucketFileDownload(url);
	return new Response(file, { status: 200, headers: { "Content-Type": "application/pdf" } });
}
