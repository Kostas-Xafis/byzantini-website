import type { R2Bucket } from "@cloudflare/workers-types";
import type { APIContext } from "astro";
import { MIMETypeMap } from "../utils.server";
import { runtimeEnv } from "@env/runtime";

/**
 * Storage access — the R2 binding `S3_BUCKET`, in EVERY environment.
 *
 * - Production: the real R2 bucket via `cloudflare:workers` env
 *   (@astrojs/cloudflare v14 no longer exposes `locals.runtime.env`).
 * - Development: the binding is emulated locally by the Vite-plugin/miniflare
 *   and persisted under `.wrangler/state/v3/r2/<bucket>/` — the same store
 *   `bun run replicate:bucket` wipes and seeds from production (mirroring how
 *   `--db` seeds the local D1 SQLite). Restart the dev server after seeding.
 *
 * The retired dev HTTP store (`bun run bucket:serve`, scripts/bucketServer.ts)
 * is gone: the binding exists in dev exactly like D1's does.
 */

export class Bucket {
	static getS3Bucket(_ctx: APIContext): R2Bucket {
		return runtimeEnv?.S3_BUCKET as any as R2Bucket;
	}

	static async list(context: APIContext) {
		const list = await Bucket.getS3Bucket(context).list();
		return list.objects.map(({ key }) => key);
	}

	static get(context: APIContext, filename: string) {
		return Bucket.getS3Bucket(context).get(filename);
	}

	static put(context: APIContext, file: ArrayBuffer | string, filename: string, filetype: string) {
		const S3 = Bucket.getS3Bucket(context);
		return S3.put(filename, file, { httpMetadata: { contentType: filetype } });
	}

	static delete(context: APIContext, filename: string) {
		return Bucket.getS3Bucket(context).delete(filename);
	}

	static async move(context: APIContext, srcFile: string, destFile: string) {
		const fileType = srcFile.split(".").at(-1);
		if (!fileType) throw Error("Invalid filetype");
		const MIMEType = MIMETypeMap[fileType] || "application/octet-stream";

		const S3 = Bucket.getS3Bucket(context);
		const file = await S3.get(srcFile);
		if (!file) return null;

		return Promise.all([S3.put(destFile, await file.arrayBuffer(), { httpMetadata: { contentType: MIMEType } }), S3.delete(srcFile)]);
	}
}
