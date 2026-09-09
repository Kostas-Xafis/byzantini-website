#!/usr/bin/env bun
/**
 * Dev data replication — pulls the PRODUCTION data (remote D1 + R2 bucket)
 * into the local dev stores so `bun run dev` serves the most recent data.
 *
 * Replaces the old `getData/replicate.ts` + `lib/routes/replication.server.ts`
 * (Turso → `dbSnapshots/` + S3 prod → `bucket/<date>` → `bucket/latest`).
 *
 * What it does:
 *  1. DB:   `wrangler d1 export <prod> --remote` → `dbSnapshots/dev-snapshot.sql`
 *           → wipes `.wrangler/state/v3/d1` and replays the SQL locally
 *           (the store the workerd dev runtime reads).
 *  2. Bucket: lists every object of the prod R2 bucket via the Cloudflare API
 *           (the wrangler OAuth token already in ~/.wrangler/config) and
 *           downloads it into `bucket/latest/` (cache + mirror). Downloads run
 *           at high concurrency (default 32, REPLICATE_CONCURRENCY to tune)
 *           and are resumable: files
 *           already present with the exact size are skipped, stale local files
 *           are pruned. The dated snapshot `bucket/YY-MM-DD/` keeps the
 *           archival convention.
 *  3. Local R2: the mirror is imported into the dev runtime's local R2
 *           emulation (`.wrangler/state/v3/r2` — wiped first, exactly like the
 *           D1 step wipes `.wrangler/state/v3/d1`) through a Miniflare
 *           instance, so the site's `S3_BUCKET` binding serves the same data.
 *           Restart the dev server afterwards (workerd keeps its store open).
 *
 * Usage:
 *   bun scripts/replicate.ts                     # both
 *   bun scripts/replicate.ts --db                # database only
 *   bun scripts/replicate.ts --bucket            # bucket only (mirror + archive + local R2 seed)
 *   bun scripts/replicate.ts --bucket byzantini-bucket-dev   # mirror + archive only (no R2 seed: the dev binding targets byzantini-bucket)
 *
 * After a DB/R2 replication the dev server must be restarted (workerd keeps
 * the old store open).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { cp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { homedir } from "node:os";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";

const args = process.argv.slice(2);
const bucketFlagIndex = args.indexOf("--bucket");
const doDb = args.includes("--db") || bucketFlagIndex === -1;
const doBucket = bucketFlagIndex !== -1 || !args.includes("--db");
const BUCKET = bucketFlagIndex !== -1 ? (args[bucketFlagIndex + 1] ?? "byzantini-bucket") : "byzantini-bucket";

const ACCOUNT_ID = "6b75328f1167f45e0a0028b85aaa4191"; // byzantini Cloudflare account
const ROOT = process.cwd();

// ─── DB ────────────────────────────────────────────────────────────────────────

async function replicateDb() {
	console.log("▶ Exporting remote D1 → dbSnapshots/dev-snapshot.sql ...");
	execFileSync("bunx", ["wrangler", "d1", "export", "byzantini-db", "--remote", "--output", join(ROOT, "dbSnapshots/dev-snapshot.sql")], {
		stdio: "inherit",
	});
	const size = (await readFile(join(ROOT, "dbSnapshots/dev-snapshot.sql"), "utf8")).length;
	console.log(`  exported ok (${(size / 1e6).toFixed(1)} MB)`);

	console.log("▶ Wiping local D1 state (.wrangler/state/v3/d1) ...");
	await rm(join(ROOT, ".wrangler/state/v3/d1"), { force: true, recursive: true });

	console.log("▶ Importing snapshot into the local D1 ...");
	execFileSync(
		"bunx",
		["wrangler", "d1", "execute", "byzantini-db", "--local", "--persist-to", ".wrangler/state", "--file", join(ROOT, "dbSnapshots/dev-snapshot.sql")],
		{ stdio: "inherit" },
	);
	console.log("✔ DB replicated");
}

// ─── Bucket ────────────────────────────────────────────────────────────────────

function wranglerToken(): string {
	const candidates = [join(homedir(), ".wrangler/config/default.toml"), join(homedir(), ".config/.wrangler/config/default.toml")];
	for (const path of candidates) {
		try {
			const m = readFileSync(path, "utf8").match(/oauth_token\s*=\s*"([^"]+)"/);
			if (m) return m[1];
		} catch {
			/* try next */
		}
	}
	throw new Error("wrangler OAuth token not found in ~/.wrangler/config/default.toml");
}

async function listObjects(token: string): Promise<{ key: string; size: number; contentType?: string }[]> {
	const objects: { key: string; size: number; contentType?: string }[] = [];
	let cursor: string | undefined;
	let pages = 0;
	do {
		// The R2 Objects REST API paginates with `per_page` (NOT `limit` — an
		// unknown param makes the API reject the request with success:false).
		const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET}/objects?per_page=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
		const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
		const raw = await res.text();
		let j: any;
		try {
			j = JSON.parse(raw);
		} catch {
			throw new Error(`List objects: invalid JSON response (HTTP ${res.status}). Is ${BUCKET} on the account ${ACCOUNT_ID}?`);
		}
		if (!res.ok || j?.success === false) {
			const detail = (j?.errors ?? []).map((e: any) => `${e.code} ${e.message}`.trim()).join("; ");
			throw new Error(`List objects failed (HTTP ${res.status}): ${detail || raw.slice(0, 300)}`);
		}
		const objs = (Array.isArray(j.result) ? j.result : (j.result?.objects ?? [])) as any[];
		for (const o of objs) objects.push({ key: o.key, size: o.size, contentType: o.http_metadata?.contentType });
		cursor = j.result_info?.cursor;
		pages++;
		if (pages > 500) throw new Error("page guard exceeded while listing bucket");
		process.stdout.write(`\r  listing… ${objects.length} objects`);
	} while (cursor);
	console.log(`\n  ${BUCKET}: ${objects.length} objects, ${(objects.reduce((a, o) => a + o.size, 0) / 1e6).toFixed(1)} MB`);
	return objects;
}

async function replicateBucket() {
	await mkdir(join(ROOT, "bucket/latest"), { recursive: true });

	const token = wranglerToken();
	console.log(`▶ Listing ${BUCKET} ...`);
	const objects = await listObjects(token);
	const targetKeys = new Set(objects.map((o) => o.key));

	// Resume: a file already on disk with the exact size counted as done.
	let done = 0;
	let skipped = 0;
	let failed = 0;
	// Higher concurrency than before: per-request throughput over the REST API
	// is the bottleneck, so more in-flight downloads scale nearly linearly.
	// Tune with REPLICATE_CONCURRENCY (e.g. lower it on weak connections).
	const CONCURRENCY = Number(process.env.REPLICATE_CONCURRENCY || 32);
	let next = 0;

	const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

	async function downloadOne(key: string, size: number): Promise<void> {
		const encodedKey = key.split("/").map(encodeURIComponent).join("/");
		const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET}/objects/${encodedKey}`;

		// Small retry budget for transient 429/5xx at higher concurrency.
		let lastError: unknown;
		for (let attempt = 0; attempt < 3; attempt++) {
			if (attempt > 0) await sleep(400 * 2 ** attempt);
			try {
				const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
				if (!res.ok) {
					const detail = (await res.text()).slice(0, 200);
					lastError = new Error(`HTTP ${res.status}: ${detail}`);
					if (res.status !== 429 && res.status < 500) throw lastError; // no retry on 4xx
					continue;
				}
				if (!res.body) throw new Error("empty response body");
				// Stream straight to disk — no full-body buffer copy.
				const written = await Bun.write(dest, res.body);
				if (written !== size) throw new Error(`size mismatch: expected ${size}, wrote ${written}`);
				done++;
				if (process.env.REPLICATE_VERBOSE) console.log(`  ${key}`);
				return;
			} catch (error) {
				lastError = error;
				// 4xx errors were rethrown above; anything else retries.
			}
		}
		throw lastError instanceof Error ? lastError : new Error("download failed");
	}

	const worker = async () => {
		while (true) {
			const i = next++;
			if (i >= objects.length) return;
			const { key, size } = objects[i];
			const dest = join(ROOT, "bucket/latest", ...key.split("/"));
			try {
				try {
					const stat = await Bun.file(dest).stat();
					if (stat.size === size) {
						skipped++;
						continue;
					}
				} catch {
					/* not on disk yet — download it */
				}
				await mkdir(dirname(dest), { recursive: true });
				await downloadOne(key, size);
			} catch (error) {
				failed++;
				console.error(`  ✗ ${key}: ${(error as Error).message}`);
			}
			if ((done + skipped) % 25 === 0) process.stdout.write(`\r  downloading… ${done + skipped}/${objects.length}`);
		}
	};

	await Promise.all(Array.from({ length: CONCURRENCY }, worker));
	console.log(`\n  downloaded ${done}, already up-to-date ${skipped}${failed ? `, ${failed} FAILED` : ""}`);

	// Prune files that no longer exist remotely (mirror semantics).
	const localFiles: string[] = [];
	const walk = async (dir: string) => {
		for (const entry of await readdir(dir, { withFileTypes: true })) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) await walk(full);
			else localFiles.push(relative(join(ROOT, "bucket/latest"), full).split("\\").join("/"));
		}
	};
	await walk(join(ROOT, "bucket/latest"));
	const stale = localFiles.filter((k) => !targetKeys.has(k));
	for (const k of stale) await rm(join(ROOT, "bucket/latest", ...k.split("/")), { force: true });
	if (stale.length) console.log(`  pruned ${stale.length} stale local file(s)`);

	if (failed) process.exitCode = 1;
	console.log("✔ Bucket replicated");

	// Archival snapshot (old `replication.server.ts` convention): a dated copy
	// under bucket/YY-MM-DD/ so each run leaves a point-in-time backup.
	const date = new Date();
	const stamp = `${String(date.getFullYear()).slice(-2)}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
	const archive = join(ROOT, "bucket", stamp);
	await rm(archive, { force: true, recursive: true });
	await cp(join(ROOT, "bucket/latest"), archive, { recursive: true, force: true });
	console.log(`  archived → bucket/${stamp}/`);

	// Seed the dev runtime's local R2 emulation from the mirror (D1-style).
	await seedLocalR2(join(ROOT, "bucket/latest"), new Map(objects.map((o) => [o.key, o.contentType ?? ""])));
}

/**
 * Wipes the local R2 emulation (`.wrangler/state/v3/r2`) and imports the
 * mirror folder into it through Miniflare, so the site's `S3_BUCKET` binding
 * serves the same bytes in dev. Skipped when the remote bucket is not the one
 * the dev binding serves (custom `--bucket` runs archive only).
 */
export async function seedLocalR2(latestDir: string, contentTypeByKey: Map<string, string>): Promise<void> {
	const DEV_R2_BUCKET = "byzantini-bucket"; // must match the top-level wrangler.jsonc bucket_name
	if (BUCKET !== DEV_R2_BUCKET) {
		console.log(`  (skipping the local R2 seed — remote bucket is '${BUCKET}', the dev binding serves '${DEV_R2_BUCKET}')`);
		return;
	}

	const persistRoot = join(ROOT, ".wrangler", "state", "v3");
	console.log("▶ Wiping local R2 state (.wrangler/state/v3/r2) ...");
	await rm(join(persistRoot, "r2"), { force: true, recursive: true });

	console.log("▶ Importing the mirror into the local R2 emulation (Miniflare) ...");
	// The installed miniflare is a v5 alpha: its `Miniflare` constructor expects
	// the v5-native shape, so options are built in the V4 style and converted —
	// exactly like @cloudflare/vite-plugin does for the dev runtime.
	const mf = new Miniflare(
		convertV4MiniflareOptions({
			workers: [
				{
					name: "r2-seeder",
					modules: true,
					script: "export default { async fetch() { return new Response(null, { status: 200 }); } };",
					r2Buckets: { S3_BUCKET: DEV_R2_BUCKET },
				},
			],
			resourcePersistencePath: persistRoot,
		}),
	);
	try {
		const { S3_BUCKET } = (await mf.getBindings()) as any;
		const keys: string[] = [];
		const walk = async (dir: string) => {
			for (const entry of await readdir(dir, { withFileTypes: true })) {
				const full = join(dir, entry.name);
				if (entry.isDirectory()) await walk(full);
				else keys.push(relative(latestDir, full).split("\\").join("/"));
			}
		};
		await walk(latestDir);

		let done = 0;
		let failed = 0;
		const CONCURRENCY = Number(process.env.REPLICATE_CONCURRENCY || 32);
		let next = 0;
		const worker = async () => {
			while (true) {
				const i = next++;
				if (i >= keys.length) return;
				const key = keys[i];
				try {
					const bytes = await Bun.file(join(latestDir, ...key.split("/"))).arrayBuffer();
					const contentType = contentTypeByKey.get(key);
					await S3_BUCKET.put(key, bytes, contentType ? { httpMetadata: { contentType } } : undefined);
					done++;
					if (process.env.REPLICATE_VERBOSE) console.log(`  r2← ${key}`);
				} catch (error) {
					failed++;
					console.error(`  ✗ r2← ${key}: ${(error as Error).message}`);
				}
				if (done % 100 === 0) process.stdout.write(`\r  seeding… ${done}/${keys.length}`);
			}
		};
		await Promise.all(Array.from({ length: CONCURRENCY }, worker));
		if (failed) process.exitCode = 1;
		console.log(`\n  seeded ${done} object(s) into the local R2${failed ? `, ${failed} FAILED` : ""}`);
	} finally {
		await mf.dispose();
	}
	console.log("✔ Local R2 seeded — restart the dev server so workerd reopens the store.");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

if (import.meta.main) {
	if (doDb) await replicateDb();
	if (doBucket) await replicateBucket();
	console.log("Done.");
}
