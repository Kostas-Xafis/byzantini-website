import type { APIContext } from "astro";
import { Bucket } from "../../../lib/bucket";

export async function GET(context: APIContext) {
	const fileName = "announcements/" + decodeURI(context.params.slug as string);
	const file = await Bucket.get(context, fileName);
	if (file === null) return new Response("Not found", { status: 404 });
	return new Response(await file.arrayBuffer(), { status: 200 });
}
