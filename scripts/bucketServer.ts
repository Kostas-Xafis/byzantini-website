#!/usr/bin/env bun
/**
 * Local dev bucket server — serves the `bucket/latest` folder over plain HTTP
 * (GET/PUT/DELETE/_list) so BOTH the workerd dev runtime and the Bun test
 * process see one consistent store.
 *
 * This replaces the old S3-compatible dev endpoint (which required the AWS SDK;
 * the SDK cannot be loaded inside the workerd dev runtime). The protocol is the
 * subset the app needs — see `lib/bucket/index.ts`.
 *
 * Usage: `bun run bucket:serve` (auto-started by `bun run dev`).
 */
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

const root = process.env.DEV_BUCKET_LOCATION || join(process.cwd(), "bucket", "latest");
const port = Number(process.env.DEV_BUCKET_PORT || 4567);

async function listFiles(dir: string, base = ""): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
	const files: string[] = [];
	for (const entry of entries) {
		const rel = base ? `${base}/${entry.name}` : entry.name;
		if (entry.isDirectory()) files.push(...(await listFiles(join(dir, entry.name), rel)));
		else files.push(rel);
	}
	return files;
}

const server = Bun.serve({
	hostname: "127.0.0.1",
	port,
	async fetch(req) {
		const url = new URL(req.url);
		if (process.env.BUCKET_DEBUG) console.log("[bucket] ", req.method, url.pathname);
		const key = decodeURIComponent(url.pathname.slice(1));

		if (req.method === "GET" && (key === "" || key === "_list")) {
			return Response.json(await listFiles(root));
		}

		if (req.method === "GET") {
			const data = await readFile(join(root, key)).catch(() => null);
			if (!data) return new Response(null, { status: 404 });
			return new Response(data);
		}

		if (req.method === "PUT") {
			const target = join(root, key);
			await mkdir(dirname(target), { recursive: true });
			await writeFile(target, new Uint8Array(await req.arrayBuffer()));
			return new Response("ok", { status: 200 });
		}

		if (req.method === "DELETE") {
			await unlink(join(root, key)).catch(() => {});
			return new Response(null, { status: 204 });
		}

		return new Response(null, { status: 405, headers: { allow: "GET, PUT, DELETE" } });
	},
});

console.log(`[bucket:serve] ${root} → http://127.0.0.1:${server.port}`);
