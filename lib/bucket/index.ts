import type { R2Bucket } from "@cloudflare/workers-types";
import type { APIContext } from "astro";
import { MIMETypeMap, isProduction } from "../utils.server";
import { Env } from "@env/env";
import { runtimeEnv } from "@env/runtime";

/**
 * Storage access.
 *
 * - Production: the R2 binding `S3_BUCKET` via `cloudflare:workers` env
 *   (@astrojs/cloudflare v14 no longer exposes `locals.runtime.env`).
 * - Development: a local HTTP bucket server (`bun run bucket:serve`, default
 *   `http://127.0.0.1:4567`, serving the `bucket/latest` folder) shared by the
 *   workerd dev runtime AND the Bun test process, so writes and reads stay
 *   consistent across both. This replaces the old S3-compatible endpoint +
 *   AWS SDK (the SDK cannot be loaded inside the workerd dev runtime).
 */

const devBucketUrl = () => Env.env.DEV_BUCKET_URL || "http://127.0.0.1:4567";

const devUrl = (filename: string) =>
	`${devBucketUrl()}/${filename.split("/").map(encodeURIComponent).join("/")}`;

// Development functions — local HTTP store.
// `bucketName` is kept for call-site compatibility (single store in dev).
export class Bucket {
	static getS3Bucket(_ctx: APIContext): R2Bucket {
		return runtimeEnv?.S3_BUCKET as any as R2Bucket;
	}

	static async listDev(_bucketName?: string) {
		const res = await fetch(`${devBucketUrl()}/_list`);
		return (await res.json()) as string[];
	}

	static async getDev(filename: string, _bucketName?: string) {
		const res = await fetch(devUrl(filename));
		if (res.status === 404) return null;
		if (!res.ok) throw new Error(`Dev bucket GET failed (${res.status}) for ${filename}`);
		return res.arrayBuffer();
	}

	static async putDev(file: ArrayBuffer | string, filename: string, filetype = "application/octet-stream", _bucketName?: string) {
		await fetch(devUrl(filename), {
			method: "PUT",
			headers: { "content-type": filetype },
			body: typeof file === "string" ? new TextEncoder().encode(file) : new Uint8Array(file),
		});
	}

	static async deleteDev(filename: string, _bucketName?: string) {
		await fetch(devUrl(filename), { method: "DELETE" });
	}

	static async moveDev(srcFile: string, destFile: string, MIMEType: string, _bucketName?: string) {
		const file = await Bucket.getDev(srcFile);
		if (!file) return null;

		return Promise.all([Bucket.putDev(file, destFile, MIMEType), Bucket.deleteDev(srcFile)]);
	}

	// API (dev/prod dispatch kept for stability)
	static async list(context: APIContext) {
		if (!isProduction()) return await Bucket.listDev();
		const S3 = Bucket.getS3Bucket(context);
		const list = await S3.list();
		return list.objects.map(({ key }) => key);
	}

	static get(context: APIContext, filename: string) {
		if (!isProduction()) return Bucket.getDev(filename);
		const S3 = Bucket.getS3Bucket(context);
		return S3.get(filename);
	}

	static put(context: APIContext, file: ArrayBuffer | string, filename: string, filetype: string) {
		if (!isProduction()) return Bucket.putDev(file, filename, filetype);
		const S3 = Bucket.getS3Bucket(context);
		return S3.put(filename, file, { httpMetadata: { contentType: filetype } });
	}

	static delete(context: APIContext, filename: string) {
		if (!isProduction()) return Bucket.deleteDev(filename);
		const S3 = Bucket.getS3Bucket(context);
		return S3.delete(filename);
	}

	static async move(context: APIContext, srcFile: string, destFile: string) {
		const fileType = srcFile.split(".").at(-1);
		if (!fileType) throw Error("Invalid filetype");
		const MIMEType = MIMETypeMap[fileType] || "application/octet-stream";

		if (!isProduction()) return Bucket.moveDev(srcFile, destFile, MIMEType);

		const S3 = Bucket.getS3Bucket(context);
		const file = await S3.get(srcFile);
		if (!file) return null;

		return Promise.all([S3.put(destFile, await file.arrayBuffer(), { httpMetadata: { contentType: MIMEType } }), S3.delete(srcFile)]);
	}
}
