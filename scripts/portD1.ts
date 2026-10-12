#!/usr/bin/env bun
/**
 * portD1.ts — the ONE command that reproduces the Turso → Cloudflare D1 port.
 *
 *   Extract (latest or backed-up Turso data)
 *          ↓
 *   Wipe + reload each D1 target (local / preview / prod)
 *          ↓
 *   Generate the pupil register from the extracted data, apply every migration
 *          ↓
 *   Verify counts, digests and the pupil invariants
 *
 * Why this exists: the port used to be four commands in a specific order, with a
 * trap in the middle — `wrangler d1 migrations apply` runs 0002 AND 0003, and
 * 0003 drops `registrations`, the table the pupil backfill reads. Applying the
 * migrations before the backfill therefore destroys the source rows, and wiping a
 * target (which replays every migration) made the register unrecoverable,
 * because a Turso bundle contains no `pupils` table.
 *
 * This script removes the ordering problem instead of documenting it: the pupil
 * register is built from the bundle's `registrations` rows BEFORE anything is
 * written, using the same pure planner as scripts/migratePupils.ts. The target is
 * then wiped, migrated in one pass, loaded, and handed the generated pupil rows.
 * The legacy table never has to exist in the target, so there is no window in
 * which it can be dropped too early.
 *
 * Turso is READ-ONLY here: every statement sent to it is checked to be a read.
 *
 * Usage:
 *   bun scripts/portD1.ts                                  # extract → rebuild local
 *   bun scripts/portD1.ts --db preview
 *   bun scripts/portD1.ts --db prod --yes-prod
 *   bun scripts/portD1.ts --all --yes-prod                 # local + preview + prod
 *   bun scripts/portD1.ts --from latest --db local         # reuse the newest bundle
 *   bun scripts/portD1.ts --from 2026-09-29T07-09-12-108Z --db preview
 *   bun scripts/portD1.ts --dry-run --all                  # plan only, writes nothing
 *   bun scripts/portD1.ts --verify-only --db preview       # compare, no writes
 *
 * Values are never printed (names, emails, ΑΜΚΑ, tokens); only counts, digests
 * and table/column names appear in the output.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { findLocalDbFile, migrationsApplyHint, openTarget, REPO_ROOT, resolveTarget, type TargetName } from "./lib/d1";
import {
	applyMigrations,
	comparePlans,
	connectTurso,
	defaultBundleDir,
	exportTargetToFile,
	formatRows,
	listTargetTables,
	listWipeTargets,
	loadPlans,
	printCompare,
	readBundle,
	readTursoTables,
	resolveBundleDir,
	wipeTarget,
	withDefaults,
	writeBundle,
	LEGACY_TABLES,
	type CompareResult,
	type LoadedBundle,
	type Manifest,
	type TableFilter,
	type TablePlan,
} from "./lib/portBundle";
import {
	applyRun,
	EMPTY_EXISTING,
	LEGACY_PLAN_TABLE,
	legacyRowsFromPlan,
	planRun,
	printBackfillReport,
	printPupilVerification,
	renderRunSql,
	summarize,
	verifyPupils,
	type BackfillRun,
	type PupilVerification,
} from "./lib/pupilsRun";

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

const TARGETS: TargetName[] = ["local", "preview", "prod"];

type Args = {
	from: string | null;
	out: string | null;
	targets: TargetName[];
	yesProd: boolean;
	dryRun: boolean;
	verifyOnly: boolean;
	backup: boolean;
	reportDir: string | null;
	exclude: Set<string>;
	include: Set<string>;
	limit: number | null;
	verbose: boolean;
};

function parseArgs(argv: string[]): Args {
	const args: Args = {
		from: null,
		out: null,
		targets: ["local"],
		yesProd: false,
		dryRun: false,
		verifyOnly: false,
		backup: true,
		reportDir: null,
		exclude: new Set(),
		include: new Set(),
		limit: null,
		verbose: false,
	};
	const requested: TargetName[] = [];
	let all = false;
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]!;
		switch (arg) {
			case "--all":
				all = true;
				break;
			case "--yes-prod":
				args.yesProd = true;
				break;
			case "--dry-run":
				args.dryRun = true;
				break;
			case "--verify-only":
				args.verifyOnly = true;
				break;
			case "--no-backup":
				args.backup = false;
				break;
			case "--verbose":
				args.verbose = true;
				break;
			case "--db": {
				const value = argv[++i];
				if (!value) throw new Error("--db expects 'local', 'preview' or 'prod'");
				for (const name of value.split(",")) {
					const trimmed = name.trim();
					if (trimmed !== "local" && trimmed !== "preview" && trimmed !== "prod") {
						throw new Error(`--db expects 'local', 'preview' or 'prod' (comma-separated allowed), got '${trimmed}'`);
					}
					requested.push(trimmed);
				}
				break;
			}
			case "--from": {
				const value = argv[++i];
				if (!value) throw new Error("--from expects an export directory, a stamp, or 'latest'");
				args.from = value;
				break;
			}
			case "--out": {
				const value = argv[++i];
				if (!value) throw new Error("--out expects a directory");
				args.out = path.resolve(value);
				break;
			}
			case "--report": {
				const value = argv[++i];
				if (!value) throw new Error("--report expects a directory");
				args.reportDir = path.resolve(value);
				break;
			}
			case "--exclude": {
				const value = argv[++i];
				if (!value) throw new Error("--exclude expects a table name");
				args.exclude.add(value);
				break;
			}
			case "--include": {
				const value = argv[++i];
				if (!value) throw new Error("--include expects a table name");
				args.include.add(value);
				break;
			}
			case "--limit": {
				const value = Number(argv[++i]);
				if (!Number.isInteger(value) || value <= 0) throw new Error("--limit expects a positive integer");
				args.limit = value;
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

	const chosen = new Set<TargetName>(all ? TARGETS : requested.length ? requested : ["local"]);
	args.targets = TARGETS.filter((name) => chosen.has(name));
	if (args.dryRun && args.verifyOnly) throw new Error("Pass either --dry-run or --verify-only, not both.");
	return args;
}

function printUsage() {
	console.log(`Usage: bun scripts/portD1.ts [options]

Rebuilds D1 targets from Turso in one continuous, repeatable flow:
  extract → wipe → migrate → load → pupil register → verify

Targets:
  --db <name>          local | preview | prod (repeatable or comma-separated)
                       (default: local)
  --all                shorthand for --db local,preview,prod

Source data:
  --from <dir|stamp|latest>   reuse an existing bundle instead of reading Turso
  --out <dir>                 where a fresh export is written
  --limit <n>                 at most n rows per table (export smoke test only)
  --exclude <table>           skip a table (repeatable; also filters a --from bundle)
  --include <table>           force-include a default-excluded table (repeatable)

Safety:
  --yes-prod           required to write to prod (--all skips prod without it)
  --dry-run            print the whole plan — nothing is wiped, migrated or written
  --verify-only        no writes: compare each target against the bundle
  --no-backup          skip the automatic pre-wipe \`wrangler d1 export\` of a
                       remote target (backups land in dbSnapshots/backups/)
  --report <dir>       report directory (default dbSnapshots/port-reports/<stamp>)
  --verbose            per-table output
  -h, --help           this text

Every run is a full rebuild: the target is wiped, the migrations are replayed
from 0001 and the data is loaded from the bundle, so re-running is always safe and
always converges to the same result. The pupil register is regenerated from the
bundle's \`registrations\` rows by the same pure planner as scripts/migratePupils.ts.

Turso is READ-ONLY: the tool refuses to send it anything but a read.`);
}

// ---------------------------------------------------------------------------
// Stage 1 — extract
// ---------------------------------------------------------------------------

const filter = (args: Args): TableFilter => withDefaults({ exclude: args.exclude, include: args.include });

function assertBundleUsable(plans: TablePlan[]): TablePlan {
	const legacy = plans.find((plan) => plan.name === LEGACY_PLAN_TABLE);
	if (!legacy) {
		throw new Error(
			`The bundle has no '${LEGACY_PLAN_TABLE}' table, so the pupil register cannot be generated from it.\n` +
				`  It was exported with --exclude ${LEGACY_PLAN_TABLE} (or an older default). Re-export without that flag.`,
		);
	}
	return legacy;
}

type Extracted = LoadedBundle & { written: boolean };

async function extract(args: Args): Promise<Extracted> {
	if (args.from) {
		const dir = resolveBundleDir(args.from);
		const bundle = readBundle(dir, filter(args));
		assertBundleUsable(bundle.plans);
		return { ...bundle, written: false };
	}

	const { client, label } = connectTurso();
	try {
		console.log(`Turso : ${label}`);
		const { plans, skipped } = await readTursoTables(client, filter(args), args.limit);
		assertBundleUsable(plans);
		const manifest: Manifest = {
			generatedAt: new Date().toISOString(),
			source: label,
			excluded: skipped,
			limit: args.limit,
			tables: plans.map((plan) => ({ name: plan.name, rows: plan.rows.length, columns: plan.columns, digest: plan.digest })),
			totalRows: plans.reduce((sum, plan) => sum + plan.rows.length, 0),
		};
		const dir = args.out ?? defaultBundleDir(manifest.generatedAt);
		// A dry run reads Turso and plans, but writes nothing anywhere — not even a
		// bundle, so the "writes nothing" promise stays literal.
		if (args.dryRun) return { dir, manifest, plans, skipped, written: false };
		writeBundle(dir, manifest, plans);
		return { dir, manifest, plans, skipped, written: true };
	} finally {
		client.close();
	}
}

// ---------------------------------------------------------------------------
// Stage 2 — rebuild one target
// ---------------------------------------------------------------------------

type TargetResult = {
	name: TargetName;
	label: string;
	status: "ok" | "failed" | "skipped";
	backup: string | null;
	dropped: number;
	rowsWritten: number;
	compare: CompareResult | null;
	pupils: PupilVerification | null;
	error: string | null;
};

function describeTarget(name: TargetName): string {
	try {
		return resolveTarget(name).label;
	} catch {
		return name;
	}
}

/** True when the local miniflare store exists yet (a fresh checkout has none). */
function localStoreExists(): boolean {
	try {
		findLocalDbFile();
		return true;
	} catch {
		return false;
	}
}

async function rebuildTarget(name: TargetName, bundlePlans: TablePlan[], run: BackfillRun, args: Args, bundleLabel: string): Promise<TargetResult> {
	const label = describeTarget(name);
	const result: TargetResult = { name, label, status: "failed", backup: null, dropped: 0, rowsWritten: 0, compare: null, pupils: null, error: null };

	console.log(`\n${"─".repeat(78)}\n▶ ${name.toUpperCase()} — ${label}`);

	try {
		if (args.verifyOnly) {
			const target = openTarget(name);
			try {
				result.compare = await comparePlans(target, bundlePlans, bundleLabel);
				printCompare(result.compare);
				result.pupils = await verifyPupils(target, run);
				printPupilVerification(result.pupils);
			} finally {
				target.close();
			}
			result.status = result.compare.ok && result.pupils.ok ? "ok" : "failed";
			return result;
		}

		// Pre-wipe backup (remote targets only — the local store is regenerable).
		if (args.backup && name !== "local") {
			const stamp = new Date().toISOString().replace(/[:.]/g, "-");
			const file = path.join(REPO_ROOT, "dbSnapshots/backups", `${resolveTarget(name).databaseName}-pre-port.${stamp}.sql`);
			if (await exportTargetToFile(resolveTarget(name), file)) result.backup = file;
		}

		// A fresh checkout has no local miniflare store: nothing to wipe, and
		// `migrations apply --local` below creates it.
		if (name === "local" && !localStoreExists()) {
			console.log("\nNo local D1 store yet — the migrations below will create it.");
		} else {
			const target = openTarget(name);
			try {
				const plan = listWipeTargets(await listTargetTables(target));
				console.log(`\nWiping ${plan.length} table(s)…`);
				if (args.verbose) for (const table of plan) console.log(`  drop ${table}`);
				const wiped = await wipeTarget(target);
				result.dropped = wiped.dropped.length;
				console.log(`✓ Dropped ${wiped.dropped.length} table(s)${wiped.kept.length ? ` (kept ${wiped.kept.join(", ")})` : ""}.`);
			} finally {
				target.close();
			}
		}

		// Migrations run with no open handle, so the local store can be rebuilt
		// underneath us; the target is re-resolved afterwards.
		await applyMigrations(resolveTarget(name));

		const reopened = openTarget(name);
		try {
			console.log(`\nLoading bundle into ${reopened.target.label}`);
			result.rowsWritten = await loadPlans(reopened, bundlePlans, { replace: true, verbose: args.verbose });
			console.log(`\nWrote ${formatRows(result.rowsWritten)} row(s) across ${bundlePlans.length} table(s).`);

			console.log(`\nWriting the pupil register (${formatRows(run.insertPupils)} pupil(s), ${formatRows(run.insertEnrollments)} enrollment(s))…`);
			const changes = await applyRun(reopened, run, {
				onProgress: (done, total) => {
					if (process.stdout.isTTY && total > 200 && done < total) process.stdout.write(`\r  ${done}/${total} statement(s)   `);
				},
			});
			if (process.stdout.isTTY) process.stdout.write("\r");
			console.log(`✓ Pupil register written — ${formatRows(changes)} row(s) affected.`);

			result.compare = await comparePlans(reopened, bundlePlans, bundleLabel);
			printCompare(result.compare);
			result.pupils = await verifyPupils(reopened, run);
			printPupilVerification(result.pupils);
		} finally {
			reopened.close();
		}

		result.status = result.compare?.ok && result.pupils?.ok ? "ok" : "failed";
		return result;
	} catch (error) {
		result.error = error instanceof Error ? error.message : String(error);
		console.error(`\n✗ ${name.toUpperCase()} failed: ${result.error}`);
		return result;
	}
}

// ---------------------------------------------------------------------------
// Stage 3 — report
// ---------------------------------------------------------------------------

function writeReport(dir: string, args: Args, bundle: LoadedBundle, run: BackfillRun, results: TargetResult[]): void {
	mkdirSync(dir, { recursive: true });
	const summary = summarize(run);
	const report = {
		generatedAt: new Date().toISOString(),
		mode: args.verifyOnly ? "verify-only" : args.dryRun ? "dry-run" : "apply",
		bundle: {
			dir: path.relative(REPO_ROOT, bundle.dir),
			generatedAt: bundle.manifest.generatedAt,
			source: bundle.manifest.source,
			tables: bundle.plans.length,
			rows: bundle.plans.reduce((sum, plan) => sum + plan.rows.length, 0),
			excluded: bundle.manifest.excluded,
		},
		pupilBackfill: {
			legacyRows: run.legacy.length,
			pupils: run.insertPupils,
			enrollments: run.insertEnrollments,
			statements: run.statementCount,
			stats: run.plan.stats,
			perYear: Object.fromEntries([...summary.perYear.entries()].sort()),
			issues: [...summary.issueCounts.entries()].map(([code, count]) => ({ code, count })),
		},
		targets: results.map((result) => ({
			name: result.name,
			label: result.label,
			status: result.status,
			backup: result.backup ? path.relative(REPO_ROOT, result.backup) : null,
			dropped: result.dropped,
			rowsWritten: result.rowsWritten,
			error: result.error,
			compare: result.compare,
			pupils: result.pupils,
		})),
	};
	writeFileSync(path.join(dir, "report.json"), JSON.stringify(report, null, 2), "utf8");
	// The generated pupil queries, exactly as applied — the reviewable artifact.
	writeFileSync(path.join(dir, "pupils-backfill.sql"), renderRunSql(run), "utf8");
	console.log(`\nReport : ${path.relative(REPO_ROOT, dir)}/report.json`);
	console.log(`Pupils : ${path.relative(REPO_ROOT, dir)}/pupils-backfill.sql`);
}

function printFinal(results: TargetResult[]): void {
	console.log(`\n${"─".repeat(78)}\nSummary\n`);
	const width = Math.max(8, ...results.map((result) => result.name.length));
	console.log(`${"target".padEnd(width)}  ${"status".padEnd(8)}  ${"rows".padStart(9)}  ${"pupils".padStart(8)}  ${"enroll".padStart(8)}`);
	for (const result of results) {
		console.log(
			`${result.name.padEnd(width)}  ${result.status.padEnd(8)}  ${formatRows(result.rowsWritten).padStart(9)}  ${formatRows(result.pupils?.pupils ?? 0).padStart(8)}  ${formatRows(result.pupils?.enrollments ?? 0).padStart(8)}`,
		);
	}
	const failed = results.filter((result) => result.status === "failed");
	console.log(failed.length ? `\n✗ ${failed.length} target(s) failed.` : `\n✓ Every target is loaded and verified.`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
	const args = parseArgs(process.argv.slice(2));

	// prod is write-protected; --all drops it with a visible notice rather than
	// failing the whole run, while an explicit --db prod is an error.
	if (!args.verifyOnly && !args.yesProd && args.targets.includes("prod")) {
		const explicit = args.targets.length === 1;
		if (explicit) throw new Error("Refusing to write to production without --yes-prod.");
		args.targets = args.targets.filter((name) => name !== "prod");
		console.log("⚠ prod skipped — add --yes-prod to include it.\n");
	}
	if (args.limit && !args.dryRun) throw new Error("--limit is for export smoke tests only; refusing to load a partial export.");

	console.log(`Mode   : ${args.verifyOnly ? "VERIFY ONLY" : args.dryRun ? "DRY RUN" : "PORT"}`);
	console.log(`Targets: ${args.targets.join(", ")}`);
	console.log(`Source : ${args.from ? `bundle '${args.from}'` : "live Turso (read-only)"}\n`);

	// --- stage 1: extract ---------------------------------------------------
	const bundle = await extract(args);
	// A bundle exported with --limit is a smoke test; loading it would silently
	// truncate every table. (The CLI flag is caught above; this catches a --from
	// bundle that was limited when it was written.)
	if (bundle.manifest.limit && !args.dryRun) {
		throw new Error(
			`Bundle ${path.relative(REPO_ROOT, bundle.dir)} was exported with --limit ${bundle.manifest.limit}; refusing to load a partial export.\n` +
				`  Re-export it without --limit, or use --dry-run to inspect it.`,
		);
	}
	const legacyPlan = assertBundleUsable(bundle.plans);
	const loadPlans = bundle.plans.filter((plan) => !(LEGACY_TABLES as readonly string[]).includes(plan.name));
	const legacy = legacyRowsFromPlan(legacyPlan);
	const run = planRun(legacy, EMPTY_EXISTING);
	const bundleLabel = `bundle ${bundle.manifest.generatedAt}`;

	console.log(
		`Bundle : ${path.relative(REPO_ROOT, bundle.dir)}/${bundle.written ? "" : " (not written — dry run)"} — ${formatRows(bundle.plans.reduce((sum, plan) => sum + plan.rows.length, 0))} row(s)`,
	);
	if (bundle.skipped.length) console.log(`Skipped: ${bundle.skipped.join(", ")}`);
	console.log(
		`Load   : ${loadPlans.length} table(s); '${LEGACY_PLAN_TABLE}' feeds the pupil register, then 0003 drops it and ${LEGACY_TABLES.filter((table) => table !== LEGACY_PLAN_TABLE).join(", ")}`,
	);

	printBackfillReport(run, [["Source", args.from ? path.relative(REPO_ROOT, bundle.dir) : "live Turso"]], args.verbose);

	if (args.dryRun) {
		for (const name of args.targets) {
			const label = describeTarget(name);
			console.log(`\n${"─".repeat(78)}\n▶ ${name.toUpperCase()} — ${label} (dry run)`);
			const exists = name !== "local" || localStoreExists();
			if (exists) {
				const target = openTarget(name);
				try {
					const drops = listWipeTargets(await listTargetTables(target));
					console.log(`  would drop ${drops.length} table(s): ${drops.join(", ") || "(none)"}`);
				} finally {
					target.close();
				}
			} else {
				console.log("  no local D1 store yet — nothing to drop");
			}
			console.log(`  would re-apply migrations: ${migrationsApplyHint(resolveTarget(name))}`);
			console.log(`  would load ${formatRows(loadPlans.reduce((sum, plan) => sum + plan.rows.length, 0))} row(s) across ${loadPlans.length} table(s)`);
			console.log(`  would write ${formatRows(run.insertPupils)} pupil(s) + ${formatRows(run.insertEnrollments)} enrollment(s)`);
			console.log(`  would verify ${loadPlans.length} table(s) + the pupil invariants`);
		}
		console.log(`\nDRY RUN — nothing wiped, nothing written.`);
		return;
	}

	// --- stage 2: rebuild ---------------------------------------------------
	const results: TargetResult[] = [];
	for (const name of args.targets) results.push(await rebuildTarget(name, loadPlans, run, args, bundleLabel));

	// --- stage 3: report ----------------------------------------------------
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	writeReport(args.reportDir ?? path.join(REPO_ROOT, "dbSnapshots/port-reports", stamp), args, bundle, run, results);
	printFinal(results);

	if (results.some((result) => result.status === "failed")) process.exitCode = 1;
}

try {
	await main();
} catch (error) {
	console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
}
