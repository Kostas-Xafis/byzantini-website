#!/usr/bin/env bun
/**
 * teacherBios.ts — load the short public biographies (`teachers.bio`, migration
 * 0009) shown on the teacher pages (/kathigites/<slug>/).
 *
 * The text lives in scripts/data/teacherBios.json (`{ id, fullname, bio, words }[]`).
 * Each bio is a hand-written 150-200 word summary of the professional facts of the
 * teacher's CV (studies, diplomas, teachers, posts, ensembles, recordings,
 * publications) — never the whole CV, and nothing personal (birth, family, address,
 * phone, ΑΜΚΑ, military service, non-music jobs). Teachers with a very thin CV have
 * a shorter bio (see `words`).
 *
 * Usage:
 *   bun scripts/teacherBios.ts                       # dry run: word counts + what would change (local DB)
 *   bun scripts/teacherBios.ts --apply               # write the bios to the LOCAL D1 (wrangler d1 execute DB --local)
 *   bun scripts/teacherBios.ts --remote-sql <file>   # only WRITE a SQL file for the owner to run against production
 *   bun scripts/teacherBios.ts --force               # also overwrite a bio that differs from the JSON (default: only empty ones)
 *   bun scripts/teacherBios.ts --only 71,72 ...      # limit any of the above to these teacher ids (e.g. one new teacher)
 *
 * Adding a bio for a new teacher: see docs/TEACHER_BIOS.md.
 *
 * Production (run by the owner, never by this script or an agent):
 *   bunx wrangler d1 migrations apply DB --remote           # 0009_teacher_bio.sql (adds the column) — run first
 *   bun scripts/teacherBios.ts --remote-sql /tmp/teacherBios.prod.sql
 *   bunx wrangler d1 execute DB --remote --file /tmp/teacherBios.prod.sql
 * (back up first: `bun run db:replicate`). Every statement matches `id` AND `fullname`, so a
 * teacher that was renamed or deleted in production is skipped, never overwritten by mistake,
 * and — unless `--force` — only fills an EMPTY bio, so a text the secretaries edited in the
 * admin («Σύντομο βιογραφικό») is never replaced by the JSON.
 *
 * This script never executes anything against a remote database. Values are written as
 * single-quote-escaped SQL string literals (the text is data, never concatenated into SQL
 * as code).
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

type BioRow = { id: number; fullname: string; bio: string; words: number };

const REPO_ROOT = path.resolve(import.meta.dir, "..");
const DATA_FILE = path.join(REPO_ROOT, "scripts/data/teacherBios.json");

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const force = args.includes("--force");
const onlyIdx = args.indexOf("--only");
const only = onlyIdx >= 0 ? new Set((args[onlyIdx + 1] ?? "").split(",").map(Number).filter(Number.isInteger)) : undefined;
if (only && only.size === 0) {
	console.error("--only needs a comma-separated list of teacher ids");
	process.exit(1);
}
const remoteIdx = args.indexOf("--remote-sql");
const remoteFile = remoteIdx >= 0 ? args[remoteIdx + 1] : undefined;
if (remoteIdx >= 0 && (!remoteFile || remoteFile.startsWith("--"))) {
	console.error("--remote-sql needs a file path");
	process.exit(1);
}

const rows: BioRow[] = (JSON.parse(readFileSync(DATA_FILE, "utf8")) as BioRow[]).filter((row) => !only || only.has(row.id));
if (only && rows.length !== only.size) console.warn(`--only: ${only.size - rows.length} id(s) have no entry in ${path.relative(REPO_ROOT, DATA_FILE)}`);
const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

const sqlString = (value: string) => `'${value.replace(/'/g, "''")}'`;
// `onlyEmpty`: never replace a bio someone already wrote (production may hold admin edits the JSON doesn't know).
const updateStatement = (row: BioRow, onlyEmpty = false) =>
	`UPDATE teachers SET bio = ${sqlString(row.bio)} WHERE id = ${Number(row.id)} AND fullname = ${sqlString(row.fullname)}` +
	(onlyEmpty ? " AND (bio IS NULL OR bio = '')" : "") +
	";";

if (remoteFile) {
	const header = [
		"-- Teacher bios (scripts/teacherBios.ts). Run AFTER migrations/0009_teacher_bio.sql:",
		"--   bunx wrangler d1 execute DB --remote --file <this file>",
		`-- ${rows.length} statements; each matches id AND fullname${force ? "" : " and only fills an empty bio"}.`,
		"",
	];
	writeFileSync(remoteFile, [...header, ...rows.map((row) => updateStatement(row, !force)), ""].join("\n"));
	console.log(`Wrote ${rows.length} statements to ${remoteFile} — nothing was executed.`);
	process.exit(0);
}

function wrangler(extra: string[]) {
	const proc = Bun.spawnSync(["bunx", "wrangler", "d1", "execute", "DB", "--local", ...extra], { cwd: REPO_ROOT, stdout: "pipe", stderr: "pipe" });
	if (proc.exitCode !== 0) throw new Error(`wrangler failed: ${proc.stderr.toString() || proc.stdout.toString()}`);
	return proc.stdout.toString();
}

const current = (JSON.parse(wrangler(["--json", "--command", "SELECT id, fullname, bio FROM teachers"])) as any[])[0].results as {
	id: number;
	fullname: string;
	bio: string | null;
}[];
const byId = new Map(current.map((t) => [t.id, t]));

const toWrite: BioRow[] = [];
for (const row of rows) {
	const words = countWords(row.bio);
	const flag = words < 150 ? "  (short)" : words > 200 ? "  (OVER 200)" : "";
	const existing = byId.get(row.id);
	let status: string;
	if (!existing) status = "skip: no such teacher in the local DB";
	else if (existing.fullname !== row.fullname) status = "skip: name differs";
	else if (existing.bio === row.bio) status = "unchanged";
	else if (existing.bio && !force) status = "skip: has a different bio (use --force)";
	else {
		status = existing.bio ? "would overwrite" : "would set";
		toWrite.push(row);
	}
	console.log(`${String(row.id).padStart(4)}  ${String(words).padStart(3)} words${flag.padEnd(14)} ${row.fullname.trim().padEnd(34)} ${status}`);
}

console.log(`\n${toWrite.length} of ${rows.length} bios ${apply ? "to write" : "would be written"}.`);
if (!apply) {
	console.log("Dry run — pass --apply to write them to the local D1.");
	process.exit(0);
}
if (!toWrite.length) process.exit(0);

const dir = mkdtempSync(path.join(tmpdir(), "teacher-bios-"));
const file = path.join(dir, "bios.sql");
writeFileSync(file, toWrite.map((row) => updateStatement(row)).join("\n") + "\n");
wrangler(["--file", file]);
console.log(`Applied ${toWrite.length} bios to the local D1.`);
