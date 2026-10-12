/**
 * scripts/lib/portBundle.ts — the Turso → D1 data bundle and the target-side
 * primitives that verify, wipe, migrate and load it.
 *
 * This is the single implementation behind every port CLI:
 *   scripts/exportTurso.ts  — the low-level bundle/apply/verify/wipe tool;
 *   scripts/portD1.ts       — the one-command "rebuild a target from Turso" flow.
 * Keeping the bundle format, the digest, the wipe and the load in one place is
 * what makes those two agree by construction instead of by discipline.
 *
 * ⚠ TURSO IS READ-ONLY. Every Turso connection opened here goes through
 * `connectTurso()`, which wraps the libSQL client in a guard that refuses any
 * statement that is not a read (`SELECT` / `PRAGMA` / `WITH` / `EXPLAIN`). The
 * port is one-way: Turso is the source of truth until the final cutover and is
 * never written to by this tooling.
 *
 * Bundle layout, under `dbSnapshots/turso-export/<UTC stamp>/` (gitignored):
 *   manifest.json — per-table row count, column list and canonical SHA-256 digest;
 *   data.sql      — the same rows as INSERT statements (readable, sqlite3-replayable);
 *   data.jsonl    — the same rows as machine-readable JSON (what `--from` reads).
 *
 * The digest is a SHA-256 over the canonical JSON of every row (columns in
 * schema order, rows sorted), computed by the SAME function on both sides, so a
 * matching digest means the values are identical — not merely the row counts.
 */
import { createClient, type Client } from "@libsql/client";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseEnvFile } from "../../lib/utilities/envFile";
import {
	d1ExportArgs,
	d1ExportHint,
	migrationsApplyArgs,
	migrationsApplyHint,
	REPO_ROOT,
	type D1Client,
	type D1Param,
	type D1Target,
	type SqlStatement,
	type TargetName,
} from "./d1";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/**
 * Never ported by default: `query_logs` is 5.5k rows of diagnostics emitted by
 * the retired Turso runtime; the rest are SQLite/D1 internals that belong to
 * whichever database happens to hold them.
 */
export const DEFAULT_EXCLUDED = ["query_logs", "sqlite_sequence", "sqlite_stat1", "_cf_KV", "d1_migrations"];

/**
 * The Turso tables that `0003_drop_registrations.sql` removes, and that the
 * pupil register is built from. They are ported like any other table into a
 * pre-0003 target, but a target that has finished the migrations must not carry
 * them — `registrations` is read from the bundle instead (see scripts/lib/pupilsRun.ts).
 */
export const LEGACY_TABLES = ["registrations", "total_registrations"] as const;

/** Where bundles live. */
export const BUNDLE_ROOT = path.join(REPO_ROOT, "dbSnapshots/turso-export");

export const formatRows = (count: number) => count.toLocaleString("en-US");

/** A table filter as the CLIs spell it: repeatable `--exclude` / `--include`. */
export type TableFilter = { exclude: Set<string>; include: Set<string> };

/** Applies `--exclude` / `--include`, with `--include` winning. */
export function filterPlans(plans: TablePlan[], filter: TableFilter): TablePlan[] {
	return plans.filter((plan) => !filter.exclude.has(plan.name) || filter.include.has(plan.name));
}

/** Adds the default exclusions to a filter unless a table was re-included. */
export function withDefaults(filter: TableFilter): TableFilter {
	const exclude = new Set(filter.exclude);
	for (const name of DEFAULT_EXCLUDED) if (!filter.include.has(name)) exclude.add(name);
	return { exclude, include: filter.include };
}

// ---------------------------------------------------------------------------
// Value canonicalisation
// ---------------------------------------------------------------------------

export type Row = Record<string, unknown>;

/** Normalises a libSQL / D1 value into something JSON-comparable on both sides. */
export function canonical(value: unknown): unknown {
	if (value === null || value === undefined) return null;
	if (typeof value === "bigint") return Number(value);
	if (typeof value === "boolean") return value ? 1 : 0;
	if (value instanceof Uint8Array) return `blob:${Buffer.from(value).toString("base64")}`;
	if (value instanceof ArrayBuffer) return `blob:${Buffer.from(new Uint8Array(value)).toString("base64")}`;
	return value;
}

/** SHA-256 over the canonical JSON of every row, sorted so storage order is irrelevant. */
export function digestRows(rows: Row[], columns: string[]): string {
	const lines = rows.map((row) => JSON.stringify(columns.map((column) => canonical(row[column]))));
	lines.sort();
	return `sha256:${createHash("sha256").update(lines.join("\n")).digest("hex")}`;
}

/** SQL literal for the human-readable dump. The live apply binds parameters instead. */
export function sqlLiteral(value: unknown): string {
	const normalised = canonical(value);
	if (normalised === null) return "NULL";
	if (typeof normalised === "number") return Number.isFinite(normalised) ? String(normalised) : "NULL";
	if (typeof normalised === "string" && normalised.startsWith("blob:")) return `X'${Buffer.from(normalised.slice(5), "base64").toString("hex")}'`;
	return `'${String(normalised).replaceAll("'", "''")}'`;
}

export function quoteIdent(name: string): string {
	return `"${name.replaceAll('"', '""')}"`;
}

/** Binds a value for the D1 REST API (numbers, strings and null only). */
export function toParam(value: unknown): D1Param {
	const normalised = canonical(value);
	if (normalised === null) return null;
	if (typeof normalised === "number") return Number.isFinite(normalised) ? normalised : null;
	if (typeof normalised === "string") {
		if (normalised.startsWith("blob:")) throw new Error("BLOB columns are not supported by the D1 parameter binding used here");
		return normalised;
	}
	throw new Error(`Unsupported value type '${typeof normalised}'`);
}

// ---------------------------------------------------------------------------
// Turso source (READ-ONLY — the guard below is not optional)
// ---------------------------------------------------------------------------

/**
 * A libSQL client narrowed to reads. `executeRead` is the only entry point, and
 * it throws before the statement reaches Turso when it is not a read.
 */
export type TursoReadClient = {
	executeRead(sql: string, args?: (string | number | null)[]): Promise<{ rows: Row[]; columns: string[] }>;
	close(): void;
};

const READ_ONLY_STATEMENT = /^\s*(?:SELECT|PRAGMA|WITH|EXPLAIN|VALUES)\b/i;

/** Wraps a libSQL client so no statement can ever write to Turso. */
function readOnlyGuard(client: Client): TursoReadClient {
	return {
		async executeRead(sql, args) {
			if (!READ_ONLY_STATEMENT.test(sql)) {
				throw new Error(`Refusing to run a non-read statement against Turso (the port is one-way): ${sql.slice(0, 120)}`);
			}
			const result = await client.execute(args && args.length ? { sql, args } : sql);
			return { rows: result.rows as unknown as Row[], columns: result.columns as string[] };
		},
		close: () => client.close(),
	};
}

/**
 * Opens Turso read-only. Credentials come from `.env` (then `.dev.vars`) and are
 * never printed; only the host is ever shown.
 */
export function connectTurso(): { client: TursoReadClient; label: string } {
	const envSource = [".env", ".dev.vars"].find((file) => existsSync(path.join(REPO_ROOT, file)));
	if (!envSource) throw new Error("Missing .env (TURSO_DB_URL / TURSO_DB_TOKEN)");
	const vars = parseEnvFile(readFileSync(path.join(REPO_ROOT, envSource), "utf8"));
	if (!vars.TURSO_DB_URL || !vars.TURSO_DB_TOKEN) throw new Error(`Missing TURSO_DB_URL / TURSO_DB_TOKEN in ${envSource}`);
	return { client: readOnlyGuard(createClient({ url: vars.TURSO_DB_URL, authToken: vars.TURSO_DB_TOKEN })), label: maskUrl(vars.TURSO_DB_URL) };
}

/** `libsql://my-db-org.turso.io` → `my-db-org.turso.io` (host only, never a token). */
export function maskUrl(url: string): string {
	try {
		return new URL(url.replace(/^libsql:/, "https:")).host;
	} catch {
		return "(turso)";
	}
}

/** Dependency order so parents are inserted before the rows that reference them. */
function orderByDependencies(nodes: string[], edges: Map<string, Set<string>>): string[] {
	const ordered: string[] = [];
	const state = new Map<string, "visiting" | "done">();
	const visit = (node: string) => {
		if (state.has(node)) return;
		state.set(node, "visiting");
		for (const dependency of edges.get(node) ?? []) if (dependency !== node) visit(dependency);
		state.set(node, "done");
		ordered.push(node);
	};
	for (const node of nodes) visit(node);
	return ordered;
}

async function listTursoTables(client: TursoReadClient, filter: TableFilter): Promise<{ order: string[]; skipped: string[] }> {
	const { rows } = await client.executeRead(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`);
	const all = rows.map((row) => String(row.name));
	const names = all.filter((name) => !filter.exclude.has(name) || filter.include.has(name));

	const edges = new Map<string, Set<string>>();
	for (const name of names) {
		const fks = await client.executeRead(`PRAGMA foreign_key_list(${quoteIdent(name)})`);
		const set = new Set<string>();
		for (const fk of fks.rows) {
			const parent = String(fk.table);
			if (parent !== name && names.includes(parent)) set.add(parent);
		}
		edges.set(name, set);
	}
	return { order: orderByDependencies(names, edges), skipped: all.filter((name) => !names.includes(name)) };
}

export type TablePlan = { name: string; columns: string[]; rows: Row[]; digest: string };

async function readTable(client: TursoReadClient, name: string, limit: number | null): Promise<TablePlan> {
	const meta = await client.executeRead(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`, [name]);
	const isWithoutRowid = /WITHOUT\s+ROWID/i.test(String(meta.rows[0]?.sql ?? ""));
	const order = isWithoutRowid ? "" : " ORDER BY rowid";
	const suffix = limit ? ` LIMIT ${Math.trunc(limit)}` : "";
	const result = await client.executeRead(`SELECT * FROM ${quoteIdent(name)}${order}${suffix}`);
	return { name, columns: result.columns, rows: result.rows, digest: digestRows(result.rows, result.columns) };
}

/**
 * Reads every non-excluded Turso table, in dependency order. Rows keep the
 * table's `rowid` order, which is what the pupil backfill relies on (the CLI
 * equivalent is `ORDER BY id`).
 */
export async function readTursoTables(
	client: TursoReadClient,
	filter: TableFilter,
	limit: number | null = null,
): Promise<{ plans: TablePlan[]; skipped: string[] }> {
	const { order, skipped } = await listTursoTables(client, filter);
	const plans: TablePlan[] = [];
	for (const name of order) plans.push(await readTable(client, name, limit));
	return { plans, skipped };
}

// ---------------------------------------------------------------------------
// Bundle
// ---------------------------------------------------------------------------

export type ManifestTable = { name: string; rows: number; columns: string[]; digest: string };
export type Manifest = {
	generatedAt: string;
	source: string;
	excluded: string[];
	limit: number | null;
	tables: ManifestTable[];
	totalRows: number;
};

export function bundlePaths(dir: string) {
	return { dir, manifest: path.join(dir, "manifest.json"), sql: path.join(dir, "data.sql"), jsonl: path.join(dir, "data.jsonl") };
}

export function writeBundle(dir: string, manifest: Manifest, plans: TablePlan[]): void {
	mkdirSync(dir, { recursive: true });
	const paths = bundlePaths(dir);

	const sqlLines: string[] = [
		"-- Turso → D1 data export. DATA ONLY: the target schema comes from migrations/.",
		`-- Generated ${manifest.generatedAt} from ${manifest.source}.`,
		"-- Values here are literals for review/replay; --apply binds parameters instead.",
		"",
	];
	const jsonlLines: string[] = [];
	for (const plan of plans) {
		sqlLines.push(`-- ${plan.name}: ${plan.rows.length} row(s) ${plan.digest}`);
		for (const row of plan.rows) {
			const values = plan.columns.map((column) => sqlLiteral(row[column])).join(", ");
			sqlLines.push(`INSERT INTO ${quoteIdent(plan.name)} (${plan.columns.map(quoteIdent).join(", ")}) VALUES (${values});`);
		}
		sqlLines.push("");
		for (const row of plan.rows) jsonlLines.push(JSON.stringify({ t: plan.name, v: plan.columns.map((column) => canonical(row[column])) }));
	}

	writeFileSync(paths.sql, sqlLines.join("\n"), "utf8");
	writeFileSync(paths.jsonl, jsonlLines.join("\n") + "\n", "utf8");
	writeFileSync(paths.manifest, JSON.stringify(manifest, null, 2), "utf8");
}

export type LoadedBundle = { dir: string; manifest: Manifest; plans: TablePlan[]; skipped: string[] };

/**
 * Reads a bundle back. The same `--exclude` / `--include` flags apply to a
 * `--from` bundle as to a live export, so a table can be dropped from a load
 * without re-exporting.
 */
export function readBundle(dir: string, filter: TableFilter): LoadedBundle {
	const paths = bundlePaths(dir);
	if (!existsSync(paths.manifest) || !existsSync(paths.jsonl)) throw new Error(`No export bundle in ${dir} (expected manifest.json + data.jsonl)`);
	const manifest = JSON.parse(readFileSync(paths.manifest, "utf8")) as Manifest;
	const columnsByTable = new Map(manifest.tables.map((table) => [table.name, table.columns]));
	const rowsByTable = new Map<string, Row[]>();
	for (const line of readFileSync(paths.jsonl, "utf8").split("\n")) {
		if (!line.trim()) continue;
		const entry = JSON.parse(line) as { t: string; v: unknown[] };
		const columns = columnsByTable.get(entry.t);
		if (!columns) throw new Error(`Bundle lists rows for unknown table '${entry.t}'`);
		const row: Row = {};
		columns.forEach((column, index) => (row[column] = entry.v[index]));
		const bucket = rowsByTable.get(entry.t);
		if (bucket) bucket.push(row);
		else rowsByTable.set(entry.t, [row]);
	}
	const plans: TablePlan[] = manifest.tables.map((table) => ({
		name: table.name,
		columns: table.columns,
		rows: rowsByTable.get(table.name) ?? [],
		digest: table.digest,
	}));
	const kept = new Set(filterPlans(plans, filter).map((plan) => plan.name));
	return {
		dir,
		manifest,
		plans: plans.filter((plan) => kept.has(plan.name)),
		skipped: plans.filter((plan) => !kept.has(plan.name)).map((plan) => plan.name),
	};
}

/** Every bundle directory, newest first. */
export function listBundles(): string[] {
	if (!existsSync(BUNDLE_ROOT)) return [];
	return readdirSync(BUNDLE_ROOT)
		.filter((name) => existsSync(path.join(BUNDLE_ROOT, name, "manifest.json")))
		.sort()
		.reverse()
		.map((name) => path.join(BUNDLE_ROOT, name));
}

export function latestBundleDir(): string {
	const [newest] = listBundles();
	if (!newest) throw new Error(`No export bundle under ${path.relative(REPO_ROOT, BUNDLE_ROOT)}/ — run the export first.`);
	return newest;
}

/**
 * Resolves what `--from` means: `latest`, a bare stamp directory name, or a
 * path. Accepting the stamp alone keeps the common case short:
 * `--from 2026-09-29T07-09-12-108Z`.
 */
export function resolveBundleDir(spec: string): string {
	if (spec === "latest") return latestBundleDir();
	const direct = path.resolve(spec);
	if (existsSync(path.join(direct, "manifest.json"))) return direct;
	const byStamp = path.join(BUNDLE_ROOT, spec);
	if (existsSync(path.join(byStamp, "manifest.json"))) return byStamp;
	const available = listBundles().map((dir) => `    ${path.basename(dir)}`);
	throw new Error(
		`No export bundle at '${spec}'.` +
			(available.length
				? `\n  Available (newest first):\n${available.join("\n")}`
				: `\n  None exist yet under ${path.relative(REPO_ROOT, BUNDLE_ROOT)}/.`),
	);
}

/** The bundle's default output directory: a UTC stamp, filesystem-safe. */
export function defaultBundleDir(generatedAt: string): string {
	return path.join(BUNDLE_ROOT, generatedAt.replace(/[:.]/g, "-"));
}

// ---------------------------------------------------------------------------
// Target introspection
// ---------------------------------------------------------------------------

export async function listTargetTables(target: D1Client): Promise<Set<string>> {
	const rows = await target.query<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table'`);
	return new Set(rows.map((row) => String(row.name)));
}

export async function targetColumns(target: D1Client, table: string): Promise<string[]> {
	const rows = await target.query<{ name: string }>(`SELECT name FROM pragma_table_info(?)`, [table]);
	return rows.map((row) => String(row.name));
}

export type SchemaProblem = { table: string; detail: string };

/** Compares the export's columns against the target; empty array means compatible. */
export async function schemaProblems(target: D1Client, plans: TablePlan[]): Promise<SchemaProblem[]> {
	const targetTables = await listTargetTables(target);
	const problems: SchemaProblem[] = [];
	for (const plan of plans) {
		if (!targetTables.has(plan.name)) {
			problems.push({ table: plan.name, detail: "table does not exist in the target" });
			continue;
		}
		const columns = await targetColumns(target, plan.name);
		const missing = plan.columns.filter((column) => !columns.includes(column));
		const extra = columns.filter((column) => !plan.columns.includes(column));
		if (missing.length) problems.push({ table: plan.name, detail: `target is missing column(s): ${missing.join(", ")}` });
		if (extra.length) problems.push({ table: plan.name, detail: `target has extra column(s): ${extra.join(", ")}` });
	}
	return problems;
}

export async function reportSchema(target: D1Client, plans: TablePlan[], strict: boolean, hint: string): Promise<void> {
	const problems = await schemaProblems(target, plans);
	if (problems.length === 0) {
		console.log(`✓ Schema check: all ${plans.length} table(s) and columns match ${target.target.label}`);
		return;
	}
	console.log(`\n✗ Schema check against ${target.target.label}:`);
	for (const problem of problems) console.log(`    ${problem.table}: ${problem.detail}`);
	if (strict) throw new Error(`Target schema does not match the export. ${hint}`);
	console.log(`  (export is still valid; ${hint})`);
}

// ---------------------------------------------------------------------------
// Verification (row count + canonical digest + schema shape)
// ---------------------------------------------------------------------------

export type CompareRow = { table: string; sourceRows: number; targetRows: number; result: string; matches: boolean; ignored: string[] };
export type CompareResult = { target: string; sourceLabel: string; ok: boolean; rows: CompareRow[]; problems: SchemaProblem[] };

/**
 * Columns that the running application rewrites, so a target legitimately
 * diverges from the bundle without anything being wrong. They are still written
 * by a load (a re-import would log the current admin session out) — they are
 * only ignored when COMPARING, so `port:verify` does not report the drift the
 * runbook already documents as expected (docs/D1_PORT_RUNBOOK.md §7).
 */
export const VOLATILE_COLUMNS: Record<string, string[]> = { sys_users: ["session_id", "session_exp_date"] };

/**
 * Read-only. Compares the bundle (or live Turso) against a target per table:
 * row count + digest over the shared columns + schema shape.
 */
export async function comparePlans(target: D1Client, plans: TablePlan[], sourceLabel: string): Promise<CompareResult> {
	const targetTables = await listTargetTables(target);
	const rows: CompareRow[] = [];
	const problems = await schemaProblems(target, plans);

	for (const plan of plans) {
		if (!targetTables.has(plan.name)) {
			rows.push({ table: plan.name, sourceRows: plan.rows.length, targetRows: 0, result: "✗ table not in target", matches: false, ignored: [] });
			continue;
		}
		const columns = await targetColumns(target, plan.name);
		const present = plan.columns.filter((column) => columns.includes(column));
		const ignored = VOLATILE_COLUMNS[plan.name] ?? [];
		const shared = present.filter((column) => !ignored.includes(column));
		// Shape is judged on every column both sides declare, not on the compared
		// subset, so skipping a volatile column cannot pass a narrower table.
		const sameShape = present.length === plan.columns.length && columns.length === plan.columns.length;
		const targetRows = await target.query<Row>(`SELECT ${shared.map(quoteIdent).join(", ")} FROM ${quoteIdent(plan.name)}`);
		const sourceRows = plan.rows.map((row) => Object.fromEntries(shared.map((column) => [column, row[column]])));
		const sourceDigest = digestRows(sourceRows, shared);
		const targetDigest = digestRows(targetRows, shared);
		const countsMatch = plan.rows.length === targetRows.length;
		const matches = countsMatch && sourceDigest === targetDigest && sameShape;
		const result = matches
			? ignored.length
				? "✓ identical (volatile columns skipped)"
				: "✓ identical"
			: !sameShape
				? "✗ schema differs"
				: countsMatch
					? "✗ content differs"
					: `${targetRows.length > plan.rows.length ? "+" : ""}${targetRows.length - plan.rows.length} rows`;
		rows.push({ table: plan.name, sourceRows: plan.rows.length, targetRows: targetRows.length, result, matches, ignored });
	}

	return { target: target.target.label, sourceLabel, ok: rows.every((row) => row.matches), rows, problems };
}

export function printCompare(result: CompareResult): void {
	console.log(`\nComparing ${result.sourceLabel} against ${result.target}\n`);
	const width = Math.max(12, ...result.rows.map((row) => row.table.length));
	console.log(`${"table".padEnd(width)}  ${"source".padStart(9)}  ${"target".padStart(9)}  result`);
	for (const row of result.rows) {
		console.log(`${row.table.padEnd(width)}  ${formatRows(row.sourceRows).padStart(9)}  ${formatRows(row.targetRows).padStart(9)}  ${row.result}`);
	}
	for (const row of result.rows) {
		if (row.ignored.length) console.log(`  note: ${row.table}.${row.ignored.join(", ")} ignored — the app rewrites them at runtime.`);
	}
	console.log(result.ok ? "\n✓ Target matches the source on every table." : "\n✗ Differences found (run --apply to converge).");
}

// ---------------------------------------------------------------------------
// Wipe + migrate
// ---------------------------------------------------------------------------

/**
 * Tables `--wipe` never drops: SQLite's own bookkeeping (`sqlite_%`) and the
 * Cloudflare-owned internals that are not part of this schema (`_cf_KV`,
 * `_cf_METADATA`). Every table the migrations or the runtime created is fair
 * game — `d1_migrations` included, so the target forgets which migrations it has
 * seen and `migrations apply` replays them all from 0001.
 */
export const WIPE_KEEP = ["_cf_KV", "_cf_METADATA"];

export function listWipeTargets(existing: Set<string>): string[] {
	return [...existing].filter((name) => !name.startsWith("sqlite_") && !WIPE_KEEP.includes(name)).sort((a, b) => a.localeCompare(b));
}

/**
 * Drops EVERY table in the target (plus `d1_migrations`). It does not re-apply
 * the migrations — the caller runs `applyMigrations()` next, usually after
 * closing and re-opening its client so nothing holds the old schema open.
 *
 * `d1_migrations` goes too: it is written by the migration process, so leaving it
 * behind would make `migrations apply` report "no migrations to apply" against an
 * empty database — a silent lie.
 */
export async function wipeTarget(target: D1Client): Promise<{ dropped: string[]; kept: string[] }> {
	const before = await listTargetTables(target);
	const dropped = listWipeTargets(before);
	const kept = [...before].filter((name) => !dropped.includes(name)).sort((a, b) => a.localeCompare(b));

	// The batch is built from freshly read names, then re-read and diffed, so a
	// table created in between is reported instead of silently surviving.
	await target.batch(listWipeTargets(await listTargetTables(target)).map((table) => ({ sql: `DROP TABLE IF EXISTS ${quoteIdent(table)}` })));
	// `d1_migrations` is dropped by the batch above when it exists; deleting its
	// rows only matters for a target where it somehow survived. Re-read rather
	// than trusting the pre-wipe snapshot: that snapshot is stale by now.
	if ((await listTargetTables(target)).has("d1_migrations")) await target.batch([{ sql: `DELETE FROM d1_migrations` }]);
	const survivors = listWipeTargets(await listTargetTables(target));
	if (survivors.length) throw new Error(`--wipe left ${survivors.length} table(s) behind: ${survivors.join(", ")}`);

	return { dropped, kept };
}

/**
 * Re-runs `wrangler d1 migrations apply` so a wiped target gets its schema back.
 * Spawned rather than reimplemented: the migrations directory, migration order
 * and the applied-version bookkeeping stay wrangler's job, and this is the same
 * command the runbook tells a human to type. stdin is inherited so wrangler's own
 * confirmation prompt still applies.
 */
export async function applyMigrations(target: D1Target): Promise<void> {
	const argv = migrationsApplyArgs(target);
	console.log(`\nApplying migrations: ${migrationsApplyHint(target)}`);
	const child = Bun.spawn(["bunx", ...argv], { cwd: REPO_ROOT, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
	const code = await child.exited;
	if (code !== 0) throw new Error(`Migrations failed (exit ${code}) — the target is EMPTY. Run \`${migrationsApplyHint(target)}\` by hand.`);
	console.log("✓ Migrations applied — the target is at the migrated schema.");
}

/**
 * Dumps a target to `dbSnapshots/backups/…` through `wrangler d1 export` — the
 * rollback anchor before a wipe. Returns the file path, or null when wrangler
 * fails (the caller decides whether that is fatal; a missing backup is not a
 * reason to leave a half-ported database behind).
 */
export async function exportTargetToFile(target: D1Target, output: string): Promise<boolean> {
	mkdirSync(path.dirname(output), { recursive: true });
	const argv = d1ExportArgs(target, output);
	console.log(`\nBacking up: ${d1ExportHint(target, output)}`);
	const child = Bun.spawn(["bunx", ...argv], { cwd: REPO_ROOT, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
	const code = await child.exited;
	if (code !== 0) {
		console.error(`✗ Backup failed (exit ${code}); continuing without it.`);
		return false;
	}
	console.log(`✓ Backup written to ${path.relative(REPO_ROOT, output)}`);
	return true;
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

/**
 * Writes the bundle's rows into the target: DELETE each table's rows (in reverse
 * dependency order, so children go before the parents they reference), then
 * INSERT every row through parameterised statements. Returns rows written.
 */
export async function loadPlans(target: D1Client, plans: TablePlan[], options: { replace?: boolean; verbose?: boolean } = {}): Promise<number> {
	const replace = options.replace ?? true;
	for (const plan of replace ? [...plans].reverse() : []) {
		const deleted = await target.batch([{ sql: `DELETE FROM ${quoteIdent(plan.name)}` }]);
		if (options.verbose) console.log(`  cleared ${plan.name} (${formatRows(deleted)} row(s))`);
	}

	let inserted = 0;
	const progress = (table: string) => (done: number, total: number) => {
		// Only animate on a TTY — piped output would otherwise repeat the line.
		if (process.stdout.isTTY && total > 200 && done < total) process.stdout.write(`\r  ${table}: ${done}/${total} statement(s)   `);
	};
	for (const plan of plans) {
		const statements: SqlStatement[] = plan.rows.map((row) => ({
			sql: `INSERT INTO ${quoteIdent(plan.name)} (${plan.columns.map(quoteIdent).join(", ")}) VALUES (${plan.columns.map(() => "?").join(", ")})`,
			params: plan.columns.map((column) => toParam(row[column])),
		}));
		process.stdout.write(`  ${plan.name.padEnd(24)} `);
		const changes = await target.batch(statements, { onProgress: progress(plan.name) });
		inserted += changes;
		process.stdout.write(`\r  ${plan.name.padEnd(24)} ${formatRows(plan.rows.length).padStart(9)} row(s) → ${formatRows(changes)} written\n`);
	}
	return inserted;
}

/** Convenience: the `TargetName` helpers the CLIs need in one import. */
export type { TargetName };
