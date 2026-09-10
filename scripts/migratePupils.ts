#!/usr/bin/env bun
/**
 * migratePupils.ts — one-time (but re-runnable) backfill of the pupil register.
 *
 * Moves the legacy `registrations` rows into the new `pupils` +
 * `pupil_enrollments` tables created by migrations/0002_pupils.sql.
 *
 *   registrations row ──► pupils            (identity, one per person)
 *                     └─► pupil_enrollments (one per year / class / instrument)
 *
 * Design rules (docs/PUPILS_MIGRATION.md §2, D2/D5/Q1/Q6):
 *   • ΑΜ is the key, but it is NOT trusted blindly. 128 ΑΜ carry more than one
 *     name in the data, so every cluster is PROVE-OR-SPLIT: a name variant is
 *     merged only when ΑΜΚΑ, cellphone or email prove it is the same person;
 *     otherwise it becomes a suffix split (111, 111-1, 111-2).
 *   • '000' / '000 - Αναμονή' / '999 - Αναμονή' are orphans. They are first
 *     re-united with a real pupil when identity keys prove it (only 6 of the 62
 *     '000' rows can be), otherwise they get a review code (000-1, 000-2, …)
 *     and needs_review = 1.
 *   • Unparseable ΑΜ (7/9 digits) are orphans too, with the raw value kept in
 *     review_note.
 *   • A pupil's fields come from their LATEST row, back-filled from older rows.
 *   • registration_url becomes permanent on the pupil; duplicates are dropped
 *     and flagged rather than silently assigned.
 *
 * Usage:
 *   bun scripts/migratePupils.ts                      # dry run, local dev DB
 *   bun scripts/migratePupils.ts --verbose            # dry run + sample rows
 *   bun scripts/migratePupils.ts --report out.json    # dry run + JSON report
 *   bun scripts/migratePupils.ts --apply              # write to the local dev DB
 *   bun scripts/migratePupils.ts --db prod --yes-prod --apply   # (tomorrow)
 *
 * Local mode talks straight to the miniflare SQLite file (fast, transactional).
 * `--db prod` goes through `wrangler d1 execute --remote`, exactly like
 * services/emailWorker/src/db.ts, and refuses to run without --yes-prod.
 */
import { Database } from "bun:sqlite";
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, rmSync, statSync, writeFileSync, writeSync } from "node:fs";
import path from "node:path";
import {
	canonicalClassYear,
	isMissingClassYear,
	normalizeAmka,
	normalizeEmail,
	normalizePhone,
	normalizeText,
	parseAm,
	personIdentityKeys,
	personNameKey,
	type PersonKey,
} from "../lib/pupils/normalize";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(import.meta.dir, "..");
const D1_STATE_DIR = path.join(REPO_ROOT, ".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
const D1_PROD_DB = process.env.D1_PROD_DATABASE_NAME ?? "byzantini-db";
const WRANGLER_BIN = path.join(REPO_ROOT, "node_modules/wrangler/bin/wrangler.js");

type Args = {
	apply: boolean;
	db: "local" | "prod";
	yesProd: boolean;
	verbose: boolean;
	reportPath: string | null;
};

function parseArgs(argv: string[]): Args {
	const args: Args = { apply: false, db: "local", yesProd: false, verbose: false, reportPath: null };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]!;
		switch (arg) {
			case "--apply":
				args.apply = true;
				break;
			case "--verbose":
				args.verbose = true;
				break;
			case "--yes-prod":
				args.yesProd = true;
				break;
			case "--db": {
				const value = argv[++i];
				if (value !== "local" && value !== "prod") throw new Error(`--db expects 'local' or 'prod', got '${value}'`);
				args.db = value;
				break;
			}
			case "--report": {
				const value = argv[++i];
				if (!value) throw new Error("--report expects a file path");
				args.reportPath = path.resolve(value);
				break;
			}
			case "--help":
			case "-h":
				printUsage();
				process.exit(0);
				break;
			default:
				throw new Error(`Unknown argument '${arg}' (try --help)`);
		}
	}
	return args;
}

function printUsage() {
	console.log(`Usage: bun scripts/migratePupils.ts [options]

  --apply             write the backfill (default is a dry run)
  --db local|prod     target database (default: local)
  --yes-prod          required together with --db prod
  --report <file>     also write a JSON report to <file>
  --verbose           print sample rows for every issue found
  -h, --help          this text`);
}

// ---------------------------------------------------------------------------
// Legacy row shape
// ---------------------------------------------------------------------------

type LegacyRow = {
	id: number;
	am: string | null;
	amka: string | null;
	last_name: string | null;
	first_name: string | null;
	fathers_name: string | null;
	birth_date: number | null;
	road: string | null;
	number: number | null;
	tk: number | null;
	region: string | null;
	telephone: string | null;
	cellphone: string | null;
	email: string | null;
	registration_year: string | null;
	class_year: string | null;
	class_id: number | null;
	teacher_id: number | null;
	instrument_id: number | null;
	date: number | null;
	payment_amount: number | null;
	total_payment: number | null;
	payment_date: number | null;
	pass: number | null;
	registration_url: string | null;
};

const LEGACY_COLUMNS = [
	"id",
	"am",
	"amka",
	"last_name",
	"first_name",
	"fathers_name",
	"birth_date",
	"road",
	"number",
	"tk",
	"region",
	"telephone",
	"cellphone",
	"email",
	"registration_year",
	"class_year",
	"class_id",
	"teacher_id",
	"instrument_id",
	"date",
	"payment_amount",
	"total_payment",
	"payment_date",
	"pass",
	"registration_url",
] as const;

// ---------------------------------------------------------------------------
// DB access
// ---------------------------------------------------------------------------

/** Reads rows: direct SQLite for the local miniflare DB, wrangler for prod. */
interface RowSource {
	selectAll(sql: string): LegacyRow[];
	select(sql: string): Record<string, unknown>[];
	describe: string;
}

/** Writes rows: one transaction locally, one `--file` batch for prod. */
interface RowSink {
	exec(statements: string[]): void;
	describe: string;
}

function findLocalDbFile(): string {
	if (!existsSync(D1_STATE_DIR)) throw new Error(`Local D1 directory not found: ${D1_STATE_DIR}`);
	const candidates = readdirSync(D1_STATE_DIR)
		.filter((name) => name.endsWith(".sqlite"))
		.map((name) => path.join(D1_STATE_DIR, name))
		.filter((file) => statSync(file).size > 0);
	if (candidates.length === 0) throw new Error(`No .sqlite file found in ${D1_STATE_DIR}`);
	candidates.sort((a, b) => statSync(b).size - statSync(a).size);
	return candidates[0]!;
}

function createLocalSource(): { source: RowSource; sink: RowSink; db: Database } {
	const file = findLocalDbFile();
	// NOTE: do not pass { readonly: false } — bun:sqlite rejects it with
	// SQLITE_MISUSE; the default mode is already read-write.
	const db = new Database(file);
	// MIGRATE_LOG_SQL=<file> writes every statement as it executes — the audit
	// trail used to prove the batch is correct (see the last_insert_rowid note
	// on buildStatements).
	const log = process.env.MIGRATE_LOG_SQL ? openSync(process.env.MIGRATE_LOG_SQL, "w") : null;
	return {
		db,
		source: {
			describe: file,
			selectAll: (sql) => db.query(sql).all() as LegacyRow[],
			select: (sql) => db.query(sql).all() as Record<string, unknown>[],
		},
		sink: {
			describe: file,
			exec: (statements) => {
				const run = db.transaction((sql: string) => {
					db.run(sql);
					if (log !== null) writeSync(log, sql + "\n");
				});
				for (const sql of statements) run(sql);
				if (log !== null) closeSync(log);
			},
		},
	};
}

/** Inlines `?`-free SQL built by us; values are escaped by sqlLiteral(). */
function createRemoteSource(databaseName: string): { source: RowSource; sink: RowSink } {
	const runWrangler = (sql: string, useFile: boolean): { rows: Record<string, unknown>[]; changes: number } => {
		const tmpFile = path.join(REPO_ROOT, `.wrangler/tmp-migrate-pupils-${Date.now()}.sql`);
		let cmd: string[];
		if (useFile) {
			mkdirSync(path.dirname(tmpFile), { recursive: true });
			writeFileSync(tmpFile, sql, "utf8");
			cmd = ["node", WRANGLER_BIN, "d1", "execute", databaseName, "--remote", "--file", tmpFile, "--json"];
		} else {
			cmd = ["node", WRANGLER_BIN, "d1", "execute", databaseName, "--remote", "--command", sql, "--json"];
		}
		const proc = Bun.spawnSync({ cmd, cwd: REPO_ROOT, stdout: "pipe", stderr: "pipe" });
		const stdout = proc.stdout.toString();
		const stderr = proc.stderr.toString();
		if (useFile && existsSync(tmpFile)) {
			try {
				rmSync(tmpFile, { force: true });
			} catch {}
		}
		if (proc.exitCode !== 0) throw new Error(`wrangler d1 execute failed (exit ${proc.exitCode}): ${stderr.trim() || stdout.trim()}`);
		const parsed = JSON.parse(stdout) as { results?: Record<string, unknown>[]; meta?: { changes?: number } }[];
		const first = parsed[0] ?? {};
		return { rows: first.results ?? [], changes: first.meta?.changes ?? 0 };
	};

	return {
		source: {
			describe: `${databaseName} (remote)`,
			selectAll: (sql) => runWrangler(sql, false).rows as LegacyRow[],
			select: (sql) => runWrangler(sql, false).rows,
		},
		sink: {
			describe: `${databaseName} (remote, via --file)`,
			exec: (statements) => {
				runWrangler(statements.join("\n"), true);
			},
		},
	};
}

// ---------------------------------------------------------------------------
// SQL literal escaping
// ---------------------------------------------------------------------------

function sqlLiteral(value: string | number | null | undefined): string {
	if (value === null || value === undefined) return "NULL";
	if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
	return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlText(value: string | null | undefined): string {
	return sqlLiteral(normalizeText(value));
}

function sqlInt(value: number | null | undefined, fallback = 0): string {
	return sqlLiteral(typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : fallback);
}

// ---------------------------------------------------------------------------
// Clustering
// ---------------------------------------------------------------------------

type ClusterRow = {
	row: LegacyRow;
	nameKey: string;
	identity: PersonKey[];
	am: ReturnType<typeof parseAm>;
};

type SubCluster = {
	nameKey: string;
	rows: ClusterRow[];
};

type PupilCluster = {
	am: number | null;
	/** Set when this row was split off a real ΑΜ (two people shared it). */
	splitFromAm: number | null;
	orphanCode: string;
	orphanReason: string;
	subClusters: SubCluster[];
	needsReview: boolean;
	notes: string[];
};

type IssueCode =
	| "am_zero"
	| "am_waiting"
	| "am_invalid"
	| "am_shared_different_names"
	| "name_merged_by_identity"
	| "name_split_no_identity"
	| "class_year_missing"
	| "class_year_unmapped"
	| "class_id_out_of_range"
	| "registration_url_duplicate"
	| "registration_url_missing"
	| "missing_date";

type Issue = { code: IssueCode; detail: string };

/** Union-find over sub-cluster indexes, merged when they share an identity key. */
function mergeSubClustersBy(subClusters: SubCluster[]): SubCluster[] {
	const parent = subClusters.map((_, index) => index);
	const find = (index: number): number => {
		let root = index;
		while (parent[root] !== root) root = parent[root]!;
		while (parent[index] !== root) {
			const next = parent[index]!;
			parent[index] = root;
			index = next;
		}
		return root;
	};
	const union = (a: number, b: number) => {
		const rootA = find(a);
		const rootB = find(b);
		if (rootA !== rootB) parent[rootB] = rootA;
	};

	const byKey = new Map<string, number>();
	for (let index = 0; index < subClusters.length; index++) {
		for (const key of subClusters[index]!.rows[0]!.identity) {
			const mapKey = `${key.type}:${key.value}`;
			const existing = byKey.get(mapKey);
			if (existing === undefined) byKey.set(mapKey, index);
			else union(existing, index);
		}
	}

	const groups = new Map<number, SubCluster>();
	for (let index = 0; index < subClusters.length; index++) {
		const root = find(index);
		const sub = subClusters[index]!;
		const existing = groups.get(root);
		if (!existing) groups.set(root, { nameKey: sub.nameKey, rows: [...sub.rows] });
		else existing.rows.push(...sub.rows);
	}
	return [...groups.values()].map((group) => ({
		nameKey: group.nameKey,
		rows: group.rows.sort((a, b) => (b.row.date ?? 0) - (a.row.date ?? 0) || b.row.id - a.row.id),
	}));
}

/** Splits one ΑΜ cluster into sub-clusters (by name), then merges by identity. */
function splitAndMerge(rows: ClusterRow[]): { subClusters: SubCluster[]; merged: number; split: number } {
	const byName = new Map<string, ClusterRow[]>();
	for (const row of rows) {
		const key = row.nameKey || `__empty_${row.row.id}`;
		const bucket = byName.get(key);
		if (bucket) bucket.push(row);
		else byName.set(key, [row]);
	}
	const raw = [...byName.entries()].map(([nameKey, bucket]) => ({
		nameKey,
		rows: bucket.sort((a, b) => (b.row.date ?? 0) - (a.row.date ?? 0) || b.row.id - a.row.id),
	}));
	const merged = mergeSubClustersBy(raw);
	return { subClusters: merged, merged: raw.length - merged.length, split: merged.length - 1 };
}

/**
 * Orphans first try to re-unite with a real pupil through identity keys
 * (ΑΜΚΑ → cellphone → email). Rows with no name never merge this way.
 */
function attachOrphans(
	clusters: PupilCluster[],
	orphans: ClusterRow[],
	issues: Issue[],
): { orphans: ClusterRow[]; attached: number } {
	const byIdentity = new Map<string, PupilCluster>();
	for (const cluster of clusters) {
		if (cluster.am === null) continue;
		for (const sub of cluster.subClusters) {
			for (const key of sub.rows[0]!.identity) byIdentity.set(`${key.type}:${key.value}`, cluster);
		}
	}

	const remaining: ClusterRow[] = [];
	let attached = 0;
	for (const orphan of orphans) {
		let target: PupilCluster | undefined;
		let via: PersonKey | undefined;
		for (const key of orphan.identity) {
			const found = byIdentity.get(`${key.type}:${key.value}`);
			if (found) {
				target = found;
				via = key;
				break;
			}
		}
		if (!target || !via) {
			remaining.push(orphan);
			continue;
		}
		target.subClusters.push({ nameKey: orphan.nameKey, rows: [orphan] });
		target.notes.push(`συνενώθηκε με εγγραφή χωρίς ΑΜ (${orphan.am.reason}) μέσω ${via.type}`);
		issues.push({
			code: "name_merged_by_identity",
			detail: `orphan id=${orphan.row.id} (${orphan.am.reason}) → ΑΜ ${target.am} via ${via.type}=${via.value}`,
		});
		attached++;
	}
	return { orphans: remaining, attached };
}

// ---------------------------------------------------------------------------
// Pupil construction
// ---------------------------------------------------------------------------

type BuiltPupil = {
	am: number | null;
	orphanCode: string;
	splitFromAm: number | null;
	needsReview: number;
	reviewNote: string;
	first_name: string;
	last_name: string;
	fathers_name: string;
	birth_date: number;
	road: string;
	number: number;
	tk: number;
	region: string;
	telephone: string;
	cellphone: string;
	email: string;
	amka: string;
	registration_url: string;
	enrollments: BuiltEnrollment[];
};

type BuiltEnrollment = {
	registration_year: string;
	class_id: number;
	class_year: string;
	teacher_id: number;
	instrument_id: number;
	date: number;
	payment_amount: number;
	total_payment: number;
	payment_date: number | null;
	pass: number;
};

/**
 * Latest non-empty value wins; empty values fall back to older rows.
 * `rows` are `ClusterRow`s (the newest first) — the getter receives the raw
 * legacy row, NOT the wrapper.
 */
function pickLatest<T>(rows: ClusterRow[], get: (row: LegacyRow) => T | null | undefined, isEmpty: (value: T) => boolean): T | undefined {
	for (const entry of rows) {
		const value = get(entry.row);
		if (value === null || value === undefined) continue;
		if (isEmpty(value)) continue;
		return value;
	}
	return undefined;
}

function buildPupils(
	clusters: PupilCluster[],
	issues: Issue[],
	stats: Record<string, number>,
): { pupils: BuiltPupil[]; urlConflicts: Map<string, BuiltPupil[]> } {
	const pupils: BuiltPupil[] = [];
	const urlOwners = new Map<string, BuiltPupil[]>();

	for (const cluster of clusters) {
		// Newest row overall drives the pupil record.
		const allRows = cluster.subClusters
			.flatMap((sub) => sub.rows)
			.sort((a, b) => (b.row.date ?? 0) - (a.row.date ?? 0) || b.row.id - a.row.id);
		if (allRows.length === 0) continue;

		const nonEmptyString = (value: string | null | undefined) => normalizeText(value) === "";
		const isZero = (value: number) => !value;

		const amka =
			allRows.map((entry) => normalizeAmka(entry.row.amka)).find((value) => value !== "") ??
			allRows.map((entry) => (entry.row.amka ?? "").trim()).find((value) => value !== "") ??
			"";

		const built: BuiltPupil = {
			am: cluster.am,
			orphanCode: cluster.orphanCode,
			splitFromAm: cluster.splitFromAm,
			needsReview: cluster.needsReview ? 1 : 0,
			reviewNote: cluster.notes.join("; "),
			first_name: normalizeText(pickLatest(allRows, (r) => r.first_name, nonEmptyString) ?? ""),
			last_name: normalizeText(pickLatest(allRows, (r) => r.last_name, nonEmptyString) ?? ""),
			fathers_name: normalizeText(pickLatest(allRows, (r) => r.fathers_name, nonEmptyString) ?? ""),
			birth_date: pickLatest(allRows, (r) => r.birth_date ?? 0, isZero) ?? 0,
			road: normalizeText(pickLatest(allRows, (r) => r.road, nonEmptyString) ?? ""),
			number: pickLatest(allRows, (r) => r.number ?? 0, isZero) ?? 0,
			tk: pickLatest(allRows, (r) => r.tk ?? 0, isZero) ?? 0,
			region: normalizeText(pickLatest(allRows, (r) => r.region, nonEmptyString) ?? ""),
			telephone: normalizeText(pickLatest(allRows, (r) => r.telephone, nonEmptyString) ?? "-") || "-",
			cellphone: normalizeText(pickLatest(allRows, (r) => r.cellphone, nonEmptyString) ?? ""),
			email: normalizeText(pickLatest(allRows, (r) => r.email, nonEmptyString) ?? ""),
			amka,
			registration_url: "",
			enrollments: [],
		};

		// registration_url: newest non-empty value; conflicts are resolved later.
		const url = pickLatest(allRows, (r) => r.registration_url, nonEmptyString);
		if (url) {
			built.registration_url = normalizeText(url);
			const owners = urlOwners.get(built.registration_url);
			if (owners) owners.push(built);
			else urlOwners.set(built.registration_url, [built]);
		} else {
			issues.push({ code: "registration_url_missing", detail: `pupil ${built.am ?? built.orphanCode} (${built.last_name} ${built.first_name})` });
		}

		// Enrollments: one per source row.
		for (const entry of allRows) {
			const row = entry.row;
			const classId = row.class_id ?? 0;
			if (classId < 0 || classId > 2) {
				issues.push({ code: "class_id_out_of_range", detail: `registration id=${row.id} class_id=${classId}` });
			}
			const rawClassYear = row.class_year;
			if (isMissingClassYear(rawClassYear)) {
				issues.push({ code: "class_year_missing", detail: `registration id=${row.id} (${normalizeText(rawClassYear) || "κενό"})` });
			} else if (canonicalClassYear(rawClassYear) === "") {
				issues.push({ code: "class_year_unmapped", detail: `registration id=${row.id} class_year='${normalizeText(rawClassYear)}'` });
			}
			const date = row.date ?? 0;
			if (!date) issues.push({ code: "missing_date", detail: `registration id=${row.id}` });

			built.enrollments.push({
				registration_year: normalizeText(row.registration_year) || "Άγνωστο",
				class_id: classId,
				class_year: canonicalClassYear(rawClassYear) || normalizeText(rawClassYear),
				teacher_id: row.teacher_id ?? -1,
				instrument_id: row.instrument_id ?? 0,
				date,
				payment_amount: row.payment_amount ?? 0,
				total_payment: row.total_payment ?? 0,
				payment_date: row.payment_date ?? null,
				pass: row.pass ? 1 : 0,
			});
		}
		stats.enrollments += built.enrollments.length;
		pupils.push(built);
	}

	return { pupils, urlConflicts: urlOwners };
}

// ---------------------------------------------------------------------------
// SQL generation
// ---------------------------------------------------------------------------

function enrollmentKey(pupilId: number, enrollment: BuiltEnrollment): string {
	return [pupilId, enrollment.registration_year, enrollment.class_id, enrollment.instrument_id, enrollment.date].join("|");
}

/**
 * Emits the INSERT batch.
 *
 * Pupil ids are assigned explicitly (max(id)+1, incrementing) and every
 * enrollment INSERT references its own pupil's id directly.
 *
 * Why not `(SELECT last_insert_rowid())`: replaying the generated batch through
 * the sqlite3 CLI produced 328 enrollments pointing at non-existent pupils, i.e.
 * the subquery did not reliably resolve to the row just inserted. Explicit ids
 * remove the dependency and make the output deterministic and reviewable.
 *
 * `existing` skips pupils already present (idempotent re-runs).
 */
function buildStatements(pupils: BuiltPupil[], existing: { ams: Set<number>; urls: Set<string>; orphanCodes: Set<string>; nextId: number }): string[] {
	const statements: string[] = [];
	let pupilId = existing.nextId;
	for (const pupil of pupils) {
		if (pupil.am !== null && existing.ams.has(pupil.am)) continue;
		if (pupil.orphanCode && existing.orphanCodes.has(pupil.orphanCode)) continue;
		if (pupil.registration_url && existing.urls.has(pupil.registration_url)) continue;
		const id = pupilId++;
		statements.push(
			`INSERT INTO pupils (id, am, orphan_code, split_from_am, first_name, last_name, fathers_name, birth_date, road, number, tk, region, telephone, cellphone, email, amka, registration_url, needs_review, review_note, created_at, updated_at) VALUES (` +
				[
					sqlInt(id),
					sqlLiteral(pupil.am),
					sqlText(pupil.orphanCode),
					sqlLiteral(pupil.splitFromAm),
					sqlText(pupil.first_name),
					sqlText(pupil.last_name),
					sqlText(pupil.fathers_name),
					sqlInt(pupil.birth_date),
					sqlText(pupil.road),
					sqlInt(pupil.number),
					sqlInt(pupil.tk),
					sqlText(pupil.region),
					sqlText(pupil.telephone),
					sqlText(pupil.cellphone),
					sqlText(pupil.email),
					sqlText(pupil.amka),
					sqlText(pupil.registration_url),
					sqlInt(pupil.needsReview),
					sqlText(pupil.reviewNote),
					"CAST(strftime('%s','now') AS INTEGER) * 1000",
					"CAST(strftime('%s','now') AS INTEGER) * 1000",
				].join(", ") +
				`);`,
		);
		for (const enrollment of pupil.enrollments) {
			statements.push(
				`INSERT INTO pupil_enrollments (pupil_id, registration_year, class_id, class_year, teacher_id, instrument_id, date, payment_amount, total_payment, payment_date, pass, source, created_at) VALUES (` +
					[
						sqlInt(id),
						sqlText(enrollment.registration_year),
						sqlInt(enrollment.class_id),
						sqlText(enrollment.class_year),
						sqlInt(enrollment.teacher_id, -1),
						sqlInt(enrollment.instrument_id),
						sqlInt(enrollment.date),
						sqlInt(enrollment.payment_amount),
						sqlInt(enrollment.total_payment),
						sqlLiteral(enrollment.payment_date),
						sqlInt(enrollment.pass),
						sqlText("migration"),
						"CAST(strftime('%s','now') AS INTEGER) * 1000",
					].join(", ") +
					`);`,
			);
		}
	}
	statements.push(`UPDATE total_enrollments SET amount = (SELECT COUNT(*) FROM pupil_enrollments);`);
	return statements;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
	const args = parseArgs(process.argv.slice(2));

	if (args.db === "prod" && !args.yesProd) {
		throw new Error("Refusing to touch production without --yes-prod (see docs/PUPILS_MIGRATION.md, D13).");
	}

	const { source, sink, db } = args.db === "local" ? createLocalSource() : { ...createRemoteSource(D1_PROD_DB), db: null };
	console.log(`Source : ${source.describe}`);
	console.log(`Target : ${sink.describe}`);
	console.log(`Mode   : ${args.apply ? "APPLY" : "DRY RUN"}\n`);

	// --- schema sanity -------------------------------------------------------
	const tables = source.select("SELECT name FROM sqlite_master WHERE type = 'table'");
	const tableNames = new Set(tables.map((row) => String(row.name)));
	const hasLegacy = tableNames.has("registrations");
	for (const required of ["pupils", "pupil_enrollments", "total_enrollments"]) {
		if (!tableNames.has(required)) {
			throw new Error(`Table '${required}' is missing — apply migrations/0002_pupils.sql first.`);
		}
	}
	if (!hasLegacy) {
		console.log("registrations table is already gone — nothing to migrate.");
		return;
	}

	// --- load ----------------------------------------------------------------
	const legacy = source.selectAll(`SELECT ${LEGACY_COLUMNS.join(", ")} FROM registrations ORDER BY id`);
	console.log(`Legacy registrations: ${legacy.length}`);

	const issues: Issue[] = [];
	const stats: Record<string, number> = {
		enrollments: 0,
		validAm: 0,
		orphanZero: 0,
		orphanWaiting: 0,
		amInvalid: 0,
		orphansAttached: 0,
		merges: 0,
		splits: 0,
	};

	const validByAm = new Map<number, ClusterRow[]>();
	const orphanRows: ClusterRow[] = [];

	for (const row of legacy) {
		const am = parseAm(row.am);
		const entry: ClusterRow = { row, nameKey: personNameKey(row), identity: personIdentityKeys(row), am };
		if (am.kind === "valid") {
			stats.validAm++;
			const bucket = validByAm.get(am.am!);
			if (bucket) bucket.push(entry);
			else validByAm.set(am.am!, [entry]);
			continue;
		}
		if (am.kind === "orphan") {
			if (am.reason === "waiting") {
				stats.orphanWaiting++;
				issues.push({ code: "am_waiting", detail: `id=${row.id} am='${am.raw}' (${normalizeText(row.last_name)} ${normalizeText(row.first_name)})` });
			} else {
				stats.orphanZero++;
				issues.push({ code: "am_zero", detail: `id=${row.id} am='${am.raw}' (${normalizeText(row.last_name)} ${normalizeText(row.first_name)})` });
			}
		} else {
			stats.amInvalid++;
			issues.push({ code: "am_invalid", detail: `id=${row.id} am='${am.raw}' reason=${am.reason} (${normalizeText(row.last_name)} ${normalizeText(row.first_name)})` });
		}
		orphanRows.push(entry);
	}

	// --- cluster valid ΑΜs ---------------------------------------------------
	const clusters: PupilCluster[] = [];
	for (const [am, rows] of [...validByAm.entries()].sort((a, b) => a[0] - b[0])) {
		const { subClusters, merged, split } = splitAndMerge(rows);
		stats.merges += merged;
		stats.splits += split;
		if (subClusters.length > 1) {
			issues.push({
				code: "am_shared_different_names",
				detail: `ΑΜ ${am}: ${subClusters.length} ομάδες → ${subClusters.map((s) => s.rows[0]!.row.last_name + " " + s.rows[0]!.row.first_name).join(" | ")}`,
			});
		}
		if (merged > 0) {
			issues.push({ code: "name_merged_by_identity", detail: `ΑΜ ${am}: ${merged} ομάδα(ες) ονόματος συνενώθηκαν μέσω ΑΜΚΑ/τηλεφώνου/email` });
		}
		subClusters
			.sort((a, b) => (b.rows[0]!.row.date ?? 0) - (a.rows[0]!.row.date ?? 0))
			.forEach((sub, index) => {
				clusters.push({
					am: index === 0 ? am : null,
					splitFromAm: index === 0 ? null : am,
					orphanCode: index === 0 ? "" : `${am}-Σ${index}`,
					orphanReason: index === 0 ? "" : "split",
					subClusters: [sub],
					needsReview: index > 0,
					notes: index > 0 ? [`διαχωρίστηκε από ΑΜ ${am} (διαφορετικό πρόσωπο — χρειάζεται έλεγχο)`] : [],
				});
			});
	}

	// --- attach orphans, then code the rest ----------------------------------
	const { orphans, attached } = attachOrphans(clusters, orphanRows, issues);
	stats.orphansAttached = attached;

	const orphansByCode = new Map<string, ClusterRow[]>();
	for (const orphan of orphans) {
		const base = orphan.am.digits || "000";
		const bucket = orphansByCode.get(base);
		if (bucket) bucket.push(orphan);
		else orphansByCode.set(base, [orphan]);
	}
	for (const [base, rows] of [...orphansByCode.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
		const { subClusters } = splitAndMerge(rows);
		subClusters
			.sort((a, b) => (b.rows[0]!.row.date ?? 0) - (a.rows[0]!.row.date ?? 0))
			.forEach((sub, index) => {
				const reason = sub.rows[0]!.am.reason;
				clusters.push({
					am: null,
					splitFromAm: null,
					// 'Ο' marks a true orphan (no usable ΑΜ), 'Σ' a split-off row —
					// the letter keeps the two code families from colliding when a
					// real ΑΜ (999) and a waiting placeholder ('999 - Αναμονή')
					// produce the same numeric base.
					orphanCode: `${base}-Ο${index + 1}`,
					orphanReason: reason,
					subClusters: [sub],
					needsReview: true,
					notes: [
						reason === "waiting"
							? "εκκρεμής εγγραφή (Αναμονή) — χρειάζεται ΑΜ"
							: reason === "zero"
								? "χωρίς ΑΜ (νέα εγγραφή) — χρειάζεται ΑΜ"
								: `μη έγκυρο ΑΜ '${sub.rows[0]!.am.raw}' — χρειάζεται έλεγχο`,
					],
				});
			});
	}

	// --- build rows ----------------------------------------------------------
	const { pupils, urlConflicts } = buildPupils(clusters, issues, stats);

	for (const [url, owners] of urlConflicts) {
		if (owners.length < 2) continue;
		issues.push({
			code: "registration_url_duplicate",
			detail: `${url} → ${owners.map((owner) => owner.am ?? owner.orphanCode).join(", ")}`,
		});
		for (const owner of owners) {
			owner.registration_url = "";
			owner.reviewNote = [owner.reviewNote, `διπλότυπο registration_url (${url})`].filter(Boolean).join("; ");
			owner.needsReview = 1;
		}
	}

	// --- existing target rows (idempotency) ----------------------------------
	// A pupil is considered already imported when its ΑΜ, orphan code or
	// registration_url is present; enrollments ride along with their pupil.
	const existingAms = new Set<number>(
		source
			.select("SELECT am FROM pupils WHERE am IS NOT NULL")
			.map((row) => Number(row.am))
			.filter((value) => Number.isFinite(value)),
	);
	const existingUrls = new Set<string>(
		source
			.select("SELECT registration_url FROM pupils WHERE registration_url <> ''")
			.map((row) => String(row.registration_url)),
	);
	const existingOrphanCodes = new Set<string>(
		source
			.select("SELECT orphan_code FROM pupils WHERE orphan_code <> ''")
			.map((row) => String(row.orphan_code)),
	);
	const nextIdRow = source.select("SELECT COALESCE(MAX(id), 0) + 1 AS next FROM pupils")[0];
	const nextId = Number(nextIdRow?.next ?? 1);

	const statements = buildStatements(pupils, { ams: existingAms, urls: existingUrls, orphanCodes: existingOrphanCodes, nextId });

	// --- report --------------------------------------------------------------
	const perYear = new Map<string, number>();
	for (const pupil of pupils) {
		for (const enrollment of pupil.enrollments) {
			perYear.set(enrollment.registration_year, (perYear.get(enrollment.registration_year) ?? 0) + 1);
		}
	}
	const issueCounts = new Map<IssueCode, number>();
	for (const issue of issues) issueCounts.set(issue.code, (issueCounts.get(issue.code) ?? 0) + 1);

	const insertPupils = statements.filter((sql) => sql.startsWith("INSERT INTO pupils")).length;
	const insertEnrollments = statements.filter((sql) => sql.startsWith("INSERT INTO pupil_enrollments")).length;

	console.log("\n=== ΠΡΟΣΩΠΑ / PUPILS ===");
	console.log(`  Σύνολο προσώπων που θα δημιουργηθούν : ${insertPupils} (${pupils.length} στο σύνολο)`);
	console.log(`  Με έγκυρο ΑΜ                        : ${pupils.filter((p) => p.am !== null).length}`);
	console.log(`  Orphans (000-N, needs_review)       : ${pupils.filter((p) => p.am === null).length}`);
	console.log(`  Orphans που ενώθηκαν με υπαρκτό ΑΜ  : ${stats.orphansAttached}`);
	console.log(`  Συνενώσεις ονομάτων (ίδιο πρόσωπο)  : ${stats.merges}`);
	console.log(`  Διαχωρισμοί (ίδιο ΑΜ, άλλο πρόσωπο) : ${stats.splits}`);

	console.log("\n=== ΕΓΓΡΑΦΕΣ / ENROLLMENTS ===");
	console.log(`  Σύνολο εγγραφών που θα δημιουργηθούν: ${insertEnrollments} (${stats.enrollments} στο σύνολο)`);
	for (const [year, count] of [...perYear.entries()].sort()) {
		console.log(`    ${year}: ${count}`);
	}

	console.log("\n=== ΕΚΚΡΕΜΟΤΗΤΕΣ / ISSUES ===");
	if (issueCounts.size === 0) console.log("  (καμία)");
	for (const [code, count] of [...issueCounts.entries()].sort((a, b) => b[1] - a[1])) {
		console.log(`  ${code.padEnd(28)} ${count}`);
	}

	if (args.verbose) {
		console.log("\n=== ΔΕΙΓΜΑΤΑ / SAMPLES ===");
		for (const code of [...new Set(issues.map((issue) => issue.code))]) {
			const samples = issues.filter((issue) => issue.code === code).slice(0, 8);
			console.log(`\n[${code}]`);
			for (const sample of samples) console.log(`  ${sample.detail}`);
		}
	}

	if (args.reportPath) {
		writeFileSync(
			args.reportPath,
			JSON.stringify(
				{
					generatedAt: new Date().toISOString(),
					source: source.describe,
					target: sink.describe,
					applied: args.apply,
					legacyRows: legacy.length,
					pupils: pupils.length,
					pupilsToInsert: insertPupils,
					enrollments: stats.enrollments,
					enrollmentsToInsert: insertEnrollments,
					stats,
					perYear: Object.fromEntries([...perYear.entries()].sort()),
					issues: [...issueCounts.entries()].map(([code, count]) => ({ code, count })),
					issueDetails: issues,
				},
				null,
				2,
			),
			"utf8",
		);
		console.log(`\nReport written to ${args.reportPath}`);
	}

	if (!args.apply) {
		console.log(`\nDRY RUN — nothing written. Re-run with --apply to write ${statements.length - 1} INSERT statements.`);
		return;
	}

	// MIGRATE_DUMP_SQL=<file> writes the whole batch before it is executed, so it
	// can be replayed with the sqlite3 CLI (used to prove determinism).
	if (process.env.MIGRATE_DUMP_SQL) {
		writeFileSync(process.env.MIGRATE_DUMP_SQL, statements.join("\n"), "utf8");
		console.log(`SQL dumped to ${process.env.MIGRATE_DUMP_SQL}`);
	}

	if (insertPupils === 0 && insertEnrollments === 0) {
		console.log("\nNothing to do — target already populated.");
		return;
	}

	console.log(`\nWriting ${statements.length - 1} INSERT statements…`);
	sink.exec(statements);
	console.log("Done.");
	if (db) db.close();
}

main();
