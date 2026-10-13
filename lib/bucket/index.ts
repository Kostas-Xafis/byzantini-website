import type { R2Bucket, R2Object } from "@cloudflare/workers-types";
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
 *
 * Every method is context-free: the binding comes from the runtime env, so
 * callers pass only keys and data.
 */

export class Bucket {
	/** R2 binding accessor (throws outside the Workers runtime or when wrangler.jsonc lacks the binding). */
	static getS3Bucket(): R2Bucket {
		const bucket = runtimeEnv?.S3_BUCKET as R2Bucket | undefined;
		if (!bucket) throw new Error("R2 binding 'S3_BUCKET' is not available");
		return bucket;
	}

	/** Every key in the bucket. R2 returns at most 1000 keys per call, so this follows the cursor until the listing ends. */
	static async list() {
		const S3 = Bucket.getS3Bucket();
		const keys: string[] = [];
		let cursor: string | undefined;
		do {
			const page = await S3.list({ cursor });
			for (const { key } of page.objects) keys.push(key);
			cursor = page.truncated ? page.cursor : undefined;
		} while (cursor);
		return keys;
	}

	static get(filename: string) {
		return Bucket.getS3Bucket().get(filename);
	}

	static put(file: ArrayBuffer | string, filename: string, filetype: string) {
		return Bucket.getS3Bucket().put(filename, file, { httpMetadata: { contentType: filetype } });
	}

	static delete(filename: string) {
		return Bucket.getS3Bucket().delete(filename);
	}

	/**
	 * Renames `srcFile` to `destFile`: writes the copy first and deletes the source only once the copy is stored, so a
	 * failed write never loses the file. The copy keeps the source's `httpMetadata` (content type as uploaded, caching)
	 * and `customMetadata`. Resolves to the new object, or `null` when the source does not exist; moving a key onto
	 * itself is a no-op (copy-then-delete would delete the only copy).
	 */
	static async move(srcFile: string, destFile: string): Promise<R2Object | null> {
		const S3 = Bucket.getS3Bucket();
		if (srcFile === destFile) return S3.head(srcFile);

		const file = await S3.get(srcFile);
		if (!file) return null;

		const moved = await S3.put(destFile, await file.arrayBuffer(), { httpMetadata: file.httpMetadata, customMetadata: file.customMetadata });
		await S3.delete(srcFile);
		return moved;
	}
}
