#!/usr/bin/env bun
/**
 * cleanDevTestData.ts — remove the rows the API test suite leaves behind.
 *
 * The tests write real rows (that is the point: they exercise live routes), so
 * after `bun run test` the local dev database holds fixtures such as pupils
 * with ΑΜ 9000-9999 ("Δοκιμαστικός Μαθητής"), a couple of test payments and
 * `pupils.test.*@example.com` newsletter subscriptions. They pollute the admin
 * UI and the counts, so this script removes them and re-derives the
 * `total_enrollments` counter.
 *
 * Local only — it never talks to Cloudflare.
 *
 * Usage:
 *   bun scripts/cleanDevTestData.ts            # report what would be removed
 *   bun scripts/cleanDevTestData.ts --apply    # remove it
 */
import { Database } from "bun:sqlite";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dir, "..");
const D1_STATE_DIR = path.join(REPO_ROOT, ".wrangler/state/v3/d1/miniflare-D1DatabaseObject");

/** Fixtures the test suite creates. Keep in sync with tests/api/*.test.ts. */
const TEST_PUPIL_WHERE = "am BETWEEN 9000 AND 9999 AND last_name = 'Μαθητής' AND first_name = 'Δοκιμαστικός'";
const TEST_EMAIL_LIKE = ["pupils.test.%@example.com", "test.%example.com"];

function findDbFile(): string {
	if (!existsSync(D1_STATE_DIR)) throw new Error(`Local D1 directory not found: ${D1_STATE_DIR}`);
	const files = readdirSync(D1_STATE_DIR)
		.filter((name) => name.endsWith(".sqlite") && !name.startsWith("metadata"))
		.map((name) => path.join(D1_STATE_DIR, name))
		.filter((file) => statSync(file).size > 0)
		.sort((a, b) => statSync(b).size - statSync(a).size);
	if (files.length === 0) throw new Error(`No .sqlite file found in ${D1_STATE_DIR}`);
	return files[0]!;
}

const apply = process.argv.includes("--apply");
const dbFile = findDbFile();
const db = new Database(dbFile);

const emailFilter = TEST_EMAIL_LIKE.map(() => "email LIKE ?").join(" OR ");
const counts = {
	pupils: (db.query(`SELECT COUNT(*) AS c FROM pupils WHERE ${TEST_PUPIL_WHERE}`).get() as { c: number }).c,
	enrollments: (
		db.query(`SELECT COUNT(*) AS c FROM pupil_enrollments WHERE pupil_id IN (SELECT id FROM pupils WHERE ${TEST_PUPIL_WHERE})`).get() as {
			c: number;
		}
	).c,
	subscriptions: (db.query(`SELECT COUNT(*) AS c FROM email_subscriptions WHERE ${emailFilter}`).get(...TEST_EMAIL_LIKE) as { c: number }).c,
};

console.log(`Database: ${dbFile}`);
console.log(`Mode    : ${apply ? "APPLY" : "DRY RUN"}`);
console.log(`  test pupils        : ${counts.pupils}`);
console.log(`  test enrollments   : ${counts.enrollments}`);
console.log(`  test subscriptions : ${counts.subscriptions}`);

if (!apply) {
	console.log("\nDRY RUN — nothing removed. Re-run with --apply.");
	db.close();
	process.exit(0);
}

const tx = db.transaction(() => {
	db.run(`DELETE FROM pupil_enrollments WHERE pupil_id IN (SELECT id FROM pupils WHERE ${TEST_PUPIL_WHERE})`);
	db.run(`DELETE FROM pupils WHERE ${TEST_PUPIL_WHERE}`);
	db.run(`DELETE FROM email_subscriptions WHERE ${emailFilter}`, TEST_EMAIL_LIKE);
	db.run("UPDATE total_enrollments SET amount = (SELECT COUNT(*) FROM pupil_enrollments)");
});
tx();

const after = db.query("SELECT (SELECT COUNT(*) FROM pupils) pupils, (SELECT COUNT(*) FROM pupil_enrollments) enrollments, (SELECT amount FROM total_enrollments) counter").get() as {
	pupils: number;
	enrollments: number;
	counter: number;
};
db.close();
console.log(`\nDone. pupils=${after.pupils} enrollments=${after.enrollments} counter=${after.counter}`);
