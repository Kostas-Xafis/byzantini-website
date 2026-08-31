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
 *           downloads it into `bucket/latest/` (the folder `bucket:serve`
 *           exposes in dev). Downloads run 8 at a time (REPLICATE_CONCURRENCY)
 *           and are resumable: files already present with the exact size are
 *           skipped, stale local files are pruned (mirror semantics).
 *           Afterwards the whole bucket is snapshotted to `bucket/YY-MM-DD/`
 *           (the old `replication.server.ts` archival convention).
 *
 * Usage:
 *   bun scripts/replicate.ts                     # both
 *   bun scripts/replicate.ts --db                # database only
 *   bun scripts/replicate.ts --bucket            # bucket only
 *   bun scripts/replicate.ts --bucket byzantini-bucket-dev   # custom bucket
 *
 * After a DB replication the dev server must be restarted (workerd keeps the
 * old store open); the bucket server picks the new files up per-request.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { homedir } from "node:os";

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
	execFileSync(
		"bunx",
		["wrangler", "d1", "export", "byzantini-db", "--remote", "--output", join(ROOT, "dbSnapshots/dev-snapshot.sql")],
		{ stdio: "inherit" },
	);
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
	const candidates = [
		join(homedir(), ".wrangler/config/default.toml"),
		join(homedir(), ".config/.wrangler/config/default.toml"),
	];
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
		const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET}/objects?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
		const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
		const j = (await res.json()) as any;
		const objs = (Array.isArray(j.result) ? j.result : j.result?.objects ?? []) as any[];
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
	const CONCURRENCY = Number(process.env.REPLICATE_CONCURRENCY || 8);
	let next = 0;

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
				const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET}/objects/${key}`, {
					headers: { Authorization: `Bearer ${token}` },
				});
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const bytes = Buffer.from(await res.arrayBuffer());
				await mkdir(dirname(dest), { recursive: true });
				await writeFile(dest, bytes);
				done++;
				if (process.env.REPLICATE_VERBOSE) console.log(`  ${key}`);
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
}

// ─── Main ─────────────────────────────────────────────────────────────────────

if (doDb) await replicateDb();
if (doBucket) await replicateBucket();
console.log("Done.");
