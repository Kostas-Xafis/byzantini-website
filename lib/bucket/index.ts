import type { R2Bucket } from "@cloudflare/workers-types"
import { getRuntime } from "@astrojs/cloudflare/runtime"

export class Bucket {

    static async put(request: Request, file: ArrayBuffer, filename: string, filetype: string) {
        const { S3_BUCKET } = (getRuntime(request).env as { S3_BUCKET: R2Bucket });
        await S3_BUCKET.put(filename, file, { httpMetadata: { "contentType": filetype } });
    };

    static async get(request: Request, filename: string) {
        const { S3_BUCKET } = (getRuntime(request).env as { S3_BUCKET: R2Bucket });
        const file = await S3_BUCKET.get(filename);
        return file;
    };

    static async delete(request: Request, filename: string) {
        const { S3_BUCKET } = (getRuntime(request).env as { S3_BUCKET: R2Bucket });
        await S3_BUCKET.delete(filename);
    };

}