/**
 * Unit tests for lib/bucket/index.ts — `Bucket.list` pagination and the
 * `Bucket.copy`/`Bucket.move` contract (copy first, delete after, metadata kept).
 *
 * The R2 binding is replaced by a small in-memory fake through
 * `spyOn(Bucket, "getS3Bucket")`, so these tests need no workerd, no dev
 * server and no env file.
 */
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import type { R2Bucket, R2HTTPMetadata } from "@cloudflare/workers-types";
import { Bucket } from "@lib/bucket";

type Stored = { body: ArrayBuffer; httpMetadata?: R2HTTPMetadata; customMetadata?: Record<string, string> };

/** Just enough of R2Bucket for Bucket: list pages of `pageSize` keys, and records every call. */
class FakeR2 {
	objects = new Map<string, Stored>();
	calls: string[] = [];
	pageSize = 2;
	failPut = false;

	async list({ cursor }: { cursor?: string } = {}) {
		this.calls.push(`list ${cursor ?? ""}`.trim());
		const keys = [...this.objects.keys()].sort();
		const start = cursor ? Number(cursor) : 0;
		const end = Math.min(start + this.pageSize, keys.length);
		const objects = keys.slice(start, end).map((key) => ({ key }));
		return end < keys.length ? { objects, truncated: true, cursor: String(end) } : { objects, truncated: false };
	}
	async head(key: string) {
		this.calls.push(`head ${key}`);
		return this.objects.has(key) ? { key } : null;
	}
	async get(key: string) {
		this.calls.push(`get ${key}`);
		const stored = this.objects.get(key);
		if (!stored) return null;
		return { key, httpMetadata: stored.httpMetadata, customMetadata: stored.customMetadata, arrayBuffer: async () => stored.body };
	}
	async put(key: string, body: ArrayBuffer, options: Omit<Stored, "body"> = {}) {
		this.calls.push(`put ${key}`);
		if (this.failPut) throw new Error("put failed");
		this.objects.set(key, { body, ...options });
		return { key };
	}
	async delete(key: string) {
		this.calls.push(`delete ${key}`);
		this.objects.delete(key);
	}
}

const bytes = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;
const text = (buffer: ArrayBuffer) => new TextDecoder().decode(buffer);

let r2: FakeR2;
beforeEach(() => {
	r2 = new FakeR2();
	spyOn(Bucket, "getS3Bucket").mockImplementation(() => r2 as unknown as R2Bucket);
});
afterEach(() => {
	mock.restore();
});

test("getS3Bucket throws a clear error when the binding is missing (no workerd under bun test)", () => {
	mock.restore();
	expect(() => Bucket.getS3Bucket()).toThrow("R2 binding 'S3_BUCKET' is not available");
});

test("list follows the cursor past the first page", async () => {
	for (const key of ["a", "b", "c", "d", "e"]) r2.objects.set(key, { body: bytes(key) });
	expect(await Bucket.list()).toEqual(["a", "b", "c", "d", "e"]);
	expect(r2.calls).toEqual(["list", "list 2", "list 4"]);
});

test("move copies first, deletes the source after, and keeps the source's metadata", async () => {
	const httpMetadata = { contentType: "image/jfif", cacheControl: "max-age=60" };
	r2.objects.set("kathigites/picture/Old.jpg", { body: bytes("picture"), httpMetadata, customMetadata: { by: "admin" } });

	const moved = await Bucket.move("kathigites/picture/Old.jpg", "kathigites/picture/New.jpg");

	expect(moved?.key).toBe("kathigites/picture/New.jpg");
	expect(r2.calls).toEqual(["get kathigites/picture/Old.jpg", "put kathigites/picture/New.jpg", "delete kathigites/picture/Old.jpg"]);
	expect(r2.objects.has("kathigites/picture/Old.jpg")).toBe(false);
	const stored = r2.objects.get("kathigites/picture/New.jpg")!;
	expect(text(stored.body)).toBe("picture");
	expect(stored.httpMetadata).toEqual(httpMetadata);
	expect(stored.customMetadata).toEqual({ by: "admin" });
});

test("move keeps the source when the copy fails", async () => {
	r2.objects.set("kathigites/cv/Old.pdf", { body: bytes("cv") });
	r2.failPut = true;

	await expect(Bucket.move("kathigites/cv/Old.pdf", "kathigites/cv/New.pdf")).rejects.toThrow("put failed");
	expect(r2.calls).not.toContain("delete kathigites/cv/Old.pdf");
	expect(text(r2.objects.get("kathigites/cv/Old.pdf")!.body)).toBe("cv");
});

test("move onto the same key is a no-op (copy-then-delete would delete the only copy)", async () => {
	r2.objects.set("kathigites/cv/Γ. Παπαδόπουλος.pdf", { body: bytes("cv") });

	expect(await Bucket.move("kathigites/cv/Γ. Παπαδόπουλος.pdf", "kathigites/cv/Γ. Παπαδόπουλος.pdf")).not.toBeNull();
	expect(r2.calls).toEqual(["head kathigites/cv/Γ. Παπαδόπουλος.pdf"]);
	expect(r2.objects.has("kathigites/cv/Γ. Παπαδόπουλος.pdf")).toBe(true);
});

test("move resolves to null and writes nothing when the source is missing", async () => {
	expect(await Bucket.move("missing.pdf", "other.pdf")).toBeNull();
	expect(r2.calls).toEqual(["get missing.pdf"]);
});

test("copy writes the copy with the source's metadata and keeps the source", async () => {
	const httpMetadata = { contentType: "image/png" };
	r2.objects.set("spoudastiria/Old-mgz4k2q1.png", { body: bytes("image"), httpMetadata });

	const copied = await Bucket.copy("spoudastiria/Old-mgz4k2q1.png", "spoudastiria/New-mgz4k2q2.png");

	expect(copied?.key).toBe("spoudastiria/New-mgz4k2q2.png");
	expect(r2.calls).toEqual(["get spoudastiria/Old-mgz4k2q1.png", "put spoudastiria/New-mgz4k2q2.png"]);
	expect(r2.objects.has("spoudastiria/Old-mgz4k2q1.png")).toBe(true);
	expect(r2.objects.get("spoudastiria/New-mgz4k2q2.png")!.httpMetadata).toEqual(httpMetadata);
	expect(await Bucket.copy("missing.png", "other.png")).toBeNull();
});
