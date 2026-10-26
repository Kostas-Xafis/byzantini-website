/**
 * Direct, best-effort access to the local dev D1 database (the miniflare SQLite file the dev server
 * uses), for test bookkeeping the API cannot do: snapshotting ids before a run, cleaning up after it,
 * and picking fixture values that are not taken yet. Every helper degrades gracefully when the file is
 * not there (e.g. `VITE_URL` points at another machine).
 */
import { Database } from "bun:sqlite";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { Random as R } from "../lib/random";

const D1_DIR = path.resolve(import.meta.dir, "../.wrangler/state/v3/d1/miniflare-D1DatabaseObject");

/** The site's database among the miniflare files: the one with a `pupils` table. */
function findSiteDb(): string | null {
	if (!existsSync(D1_DIR)) return null;
	const files = readdirSync(D1_DIR)
		.filter((name) => name.endsWith(".sqlite") && !name.startsWith("metadata"))
		.map((name) => path.join(D1_DIR, name))
		.filter((file) => statSync(file).size > 0);
	for (const file of files) {
		const db = new Database(file, { readonly: true });
		try {
			if (db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'pupils'").get()) return file;
		} finally {
			db.close();
		}
	}
	return null;
}

/** Runs `fn` against the local dev database; null when it is not reachable. */
export function withLocalDb<T>(fn: (db: Database) => T): T | null {
	const file = findSiteDb();
	if (!file) return null;
	const db = new Database(file);
	try {
		return fn(db);
	} finally {
		db.close();
	}
}

/**
 * Test pupils live in ΑΜ 9000–9999 and are named «Δοκιμαστικός Μαθητής», which is what
 * `bun run dev:clean` (scripts/cleanDevTestData.ts) matches. Keep the two in sync.
 */
export const TEST_AM_RANGE = [9000, 9999] as const;

const handedOut = new Set<number>();
let taken: Set<number> | null = null;

/**
 * An ΑΜ in the test range that no pupil has yet, and that this test process has not handed out.
 *
 * A random ΑΜ used to collide with fixtures left by earlier runs (or a real pupil): the public form then
 * saw an existing pupil with another ΑΜΚΑ and answered 409, failing the suite intermittently. The used
 * ΑΜs are read once per process; ΑΜs handed out since are tracked here.
 */
export function uniqueTestAm(): number {
	taken ??= new Set(
		withLocalDb((db) => (db.query("SELECT am FROM pupils WHERE am BETWEEN ? AND ?").all(...TEST_AM_RANGE) as { am: number }[]).map((row) => row.am)) ?? [],
	);
	const [lo, hi] = TEST_AM_RANGE;
	const free: number[] = [];
	for (let am = lo; am <= hi; am++) if (!taken.has(am) && !handedOut.has(am)) free.push(am);
	if (free.length === 0) throw new Error(`No free test ΑΜ in ${lo}–${hi}: run \`bun run dev:clean\` to remove old test pupils`);
	const am = free[R.int(0, free.length - 1)]!;
	handedOut.add(am);
	return am;
}
