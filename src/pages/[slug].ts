import type { APIContext } from "astro";
import { Bucket } from "../../lib/bucket";
import { isDevFromURL } from "../../lib/utils.client";
import { useAPI } from "../../lib/hooks/useAPI.astro.ts";

export async function GET(context: APIContext) {
    const url = context.params.slug as string;
    if (isDevFromURL(context.url)) {
        return new Response(await (await fetch(await import.meta.env.S3_OPEN_BUCKET_URL + url)).arrayBuffer(), { status: 200 });
    }

    const file = await Bucket.get(context, url);
    if (file === null) return new Response("Not found", { status: 404 });
    return new Response(await file.arrayBuffer(), { status: 200 });
}

export async function POST(context: APIContext) {
    const url = context.params.slug as string;
    console.log({ url })
    if (url === "subscribe") {
        const { error, message } = await useAPI("Registrations.emailSubscribe", { RequestObject: (await context.request.json()) as { email: string } });
        if (error) return new Response("Ανεπιτυχής εγγραφή", { status: 500 });
        return new Response(message, { status: 200 });
    }
}