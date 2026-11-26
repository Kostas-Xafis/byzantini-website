#!/usr/bin/env bun
/**
 * announcementsFormat.ts — one-off pass that gives the announcements written before the text format
 * (lib/announcements/format.ts) their headings, lists, bold dates and links.
 *
 * The text lives in scripts/data/announcementsFormatted.json (`{ id, title, content, original_content, links? }[]`):
 * `content` is the formatted text, `original_content` the text it replaces, word for word the same apart from
 * the marks (and a few typographic fixes: a stray hyphenation, missing full stops, «…» quotes). An entry with
 * `links` also replaces the YouTube-links field (announcement 35 kept a non-video link there; it moved into
 * the text).
 *
 * Usage:
 *   bun scripts/announcementsFormat.ts                       # dry run against the LOCAL D1: what would change
 *   bun scripts/announcementsFormat.ts --apply               # write them to the LOCAL D1 (wrangler d1 execute DB --local)
 *   bun scripts/announcementsFormat.ts --remote-sql <file>   # only WRITE a SQL file for the owner to run against production
 *
 * Production (run by the owner, never by this script or an agent):
 *   bun run db:replicate                                      # back up first
 *   bun scripts/announcementsFormat.ts --remote-sql /tmp/announcementsFormat.prod.sql
 *   bunx wrangler d1 execute DB --remote --file /tmp/announcementsFormat.prod.sql
 * Every statement matches `id` AND the exact original text, so an announcement the secretaries edited in the
 * meantime (or one that does not exist) is skipped, never overwritten. Running it twice changes nothing.
 *
 * This script never executes anything against a remote database. Values are written as single-quote-escaped
 * SQL string literals (the text is data, never concatenated into SQL as code).
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

type Entry = { id: number; title: string; content: string; original_content: string; links?: string };

const REPO_ROOT = path.resolve(import.meta.dir, "..");
const DATA_FILE = path.join(REPO_ROOT, "scripts/data/announcementsFormatted.json");

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const remoteIdx = args.indexOf("--remote-sql");
const remoteFile = remoteIdx >= 0 ? args[remoteIdx + 1] : undefined;
if (remoteIdx >= 0 && (!remoteFile || remoteFile.startsWith("--"))) {
	console.error("--remote-sql needs a file path");
	process.exit(1);
}

const entries = JSON.parse(readFileSync(DATA_FILE, "utf8")) as Entry[];

const sqlString = (value: string) => `'${value.replace(/'/g, "''")}'`;
const updateStatement = (e: Entry) =>
	`UPDATE announcements SET content = ${sqlString(e.content)}` +
	(e.links !== undefined ? `, links = ${sqlString(e.links)}` : "") +
	` WHERE id = ${Number(e.id)} AND content = ${sqlString(e.original_content)};`;

if (remoteFile) {
	const header = [
		"-- Announcement formatting pass (scripts/announcementsFormat.ts).",
		"--   bunx wrangler d1 execute DB --remote --file <this file>",
		`-- ${entries.length} statements; each matches id AND the exact original text (edited announcements are skipped).`,
		"",
	];
	writeFileSync(remoteFile, [...header, ...entries.map(updateStatement), ""].join("\n"));
	console.log(`Wrote ${entries.length} statements to ${remoteFile} — nothing was executed.`);
	process.exit(0);
}

function wrangler(extra: string[]) {
	const proc = Bun.spawnSync(["bunx", "wrangler", "d1", "execute", "DB", "--local", ...extra], { cwd: REPO_ROOT, stdout: "pipe", stderr: "pipe" });
	if (proc.exitCode !== 0) throw new Error(`wrangler failed: ${proc.stderr.toString() || proc.stdout.toString()}`);
	return proc.stdout.toString();
}

const current = (JSON.parse(wrangler(["--json", "--command", "SELECT id, content FROM announcements"])) as any[])[0].results as {
	id: number;
	content: string;
}[];
const byId = new Map(current.map((a) => [a.id, a.content]));

const toWrite: Entry[] = [];
for (const e of entries) {
	const existing = byId.get(e.id);
	let status: string;
	if (existing === undefined) status = "skip: no such announcement in the local DB";
	else if (existing === e.content) status = "already formatted";
	else if (existing !== e.original_content) status = "skip: the text was edited since (left as it is)";
	else {
		status = "would format";
		toWrite.push(e);
	}
	console.log(`${String(e.id).padStart(4)}  ${e.title.trim().slice(0, 60).padEnd(60)} ${status}`);
}

console.log(`\n${toWrite.length} of ${entries.length} announcements ${apply ? "to write" : "would be written"}.`);
if (!apply) {
	console.log("Dry run — pass --apply to write them to the local D1.");
	process.exit(0);
}
if (!toWrite.length) process.exit(0);

const dir = mkdtempSync(path.join(tmpdir(), "announcements-format-"));
const file = path.join(dir, "announcements.sql");
writeFileSync(file, toWrite.map(updateStatement).join("\n") + "\n");
wrangler(["--file", file]);
console.log(`Formatted ${toWrite.length} announcements in the local D1.`);
