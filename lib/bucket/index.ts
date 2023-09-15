import type { R2Bucket } from "@cloudflare/workers-types"
import type { APIContext } from "astro";

export class Bucket {
    static async put(context: APIContext, file: ArrayBuffer, filename: string, filetype: string) {
        const { S3_BUCKET } = context.locals.runtime.env as unknown as { S3_BUCKET: R2Bucket };
        await S3_BUCKET.put(filename, file, { httpMetadata: { "contentType": filetype } });
    };

    static async get(context: APIContext, filename: string) {
        const { S3_BUCKET } = context.locals.runtime.env as unknown as { S3_BUCKET: R2Bucket };
        const file = await S3_BUCKET.get(filename);
        return file;
    };

    static async delete(context: APIContext, filename: string) {
        const { S3_BUCKET } = context.locals.runtime.env as unknown as { S3_BUCKET: R2Bucket };
        await S3_BUCKET.delete(filename);
    };
}