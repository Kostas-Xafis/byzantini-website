#!/usr/bin/env bun
/**
 * exportTurso.ts — Turso (libSQL) → Cloudflare D1 data port, with verification.
 *
 * The low-level tool. The bundle format, the digest, the wipe, the migration
 * replay and the load all live in `scripts/lib/portBundle.ts`, which is also what
 * `scripts/portD1.ts` (the one-command, all-targets flow) uses — so the two
 * cannot drift apart. Everything here is also available as a single command:
 *
 *   bun run port --db local|preview|prod        # export → wipe → migrate → load → pupils
 *
 * Three modes, all driven by the same export plan:
 *
 *   export (default)  Read every table from Turso and write an auditable bundle
 *                     to `dbSnapshots/turso-export/<stamp>/`:
 *                       manifest.json — per-table row counts, column lists and a
 *                                       canonical SHA-256 digest of the data
 *                       data.sql      — the same rows as INSERT statements
 *                                       (human-readable, replayable with sqlite3)
 *                       data.jsonl    — machine-readable rows, used by --from
 *                     Nothing is written to D1.
 *
 *   --verify          Read-only. Compare the D1 target against the bundle (or
 *                     against live Turso) per table: row count + digest + schema.
 *                     This is the answer to "did the port actually land?".
 *
 *   --apply           Load the bundle into D1 (local / preview / prod): DELETE
 *                     the target table's rows, then INSERT every exported row
 *                     through parameterised statements (never string-concatenated
 *                     SQL), then re-verify count + digest.
 *
 *   --apply --wipe    Start the target from scratch first: drop EVERY table
 *                     (d1_migrations included), re-run `wrangler d1 migrations
 *                     apply`, then load. Add --dry-run to print the plan only.
 *
 * ⚠ `--wipe` erases the pupil register (`pupils`, `pupil_enrollments`) and a
 * Turso bundle cannot restore it — `bun run port` can, because it regenerates
 * the register from the bundle's `registrations` rows. Use `--wipe` here only
 * for a target whose pupils you do not need. See docs/D1_PORT_RUNBOOK.md §8.
 *
 * Turso is READ-ONLY: every statement sent to it is checked to be a read first.
 *
 * Usage:
 *   bun scripts/exportTurso.ts                          # export + schema check
 *   bun scripts/exportTurso.ts --verify                 # drift report vs prod D1
 *   bun scripts/exportTurso.ts --verify --db preview
 *   bun scripts/exportTurso.ts --apply --db prod --yes-prod
 *   bun scripts/exportTurso.ts --apply --db local --local-file .wrangler/.../x.sqlite
 *   bun scripts/exportTurso.ts --from latest --apply --db preview
 *   bun scripts/exportTurso.ts --from <stamp> --apply --db prod --yes-prod
 *   bun scripts/exportTurso.ts --apply --wipe --dry-run --db preview --from latest
 *
 * Values are never printed (names, emails, ΑΜΚΑ, tokens); only counts, digests
 * and table/column names appear in the output.
 */
import path from "node:path";
import { findLocalDbFile, migrationsApplyHint, openTarget, REPO_ROOT, type D1Client, type TargetName } from "./lib/d1";
import {
	applyMigrations,
	comparePlans,
	connectTurso,
	defaultBundleDir,
	filterPlans,
	formatRows,
	listTargetTables,
	listWipeTargets,
	loadPlans,
	printCompare,
	readBundle,
	readTursoTables,
	reportSchema,
	resolveBundleDir,
	wipeTarget,
	withDefaults,
	writeBundle,
	type Manifest,
	type TableFilter,
	type TablePlan,
} from "./lib/portBundle";

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

type Args = {
	mode: "export" | "verify" | "apply";
	db: TargetName;
	localFile: string | null;
	yesProd: boolean;
	wipe: boolean;
	allowPupilLoss: boolean;
	dryRun: boolean;
	outDir: string | null;
	fromDir: string | null;
	exclude: Set<string>;
	include: Set<string>;
	limit: number | null;
	replace: boolean;
	verbose: boolean;
};

function parseArgs(argv: string[]): Args {
	const args: Args = {
		mode: "export",
		db: "prod",
		localFile: null,
		yesProd: false,
		wipe: false,
		allowPupilLoss: false,
		dryRun: false,
		outDir: null,
		fromDir: null,
		exclude: new Set(),
		include: new Set(),
		limit: null,
		replace: true,
		verbose: false,
	};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]!;
		switch (arg) {
			case "--verify":
				args.mode = "verify";
				break;
			case "--apply":
				args.mode = "apply";
				break;
			case "--yes-prod":
				args.yesProd = true;
				break;
			case "--wipe":
				args.wipe = true;
				break;
			case "--allow-pupil-loss":
				args.allowPupilLoss = true;
				break;
			case "--dry-run":
				args.dryRun = true;
				break;
			case "--no-replace":
				args.replace = false;
				break;
			case "--verbose":
				args.verbose = true;
				break;
			case "--db": {
				const value = argv[++i];
				if (value !== "local" && value !== "preview" && value !== "prod") throw new Error(`--db expects 'local', 'preview' or 'prod', got '${value}'`);
				args.db = value;
				break;
			}
			case "--local-file": {
				const value = argv[++i];
				if (!value) throw new Error("--local-file expects a path");
				args.localFile = value;
				break;
			}
			case "--out": {
				const value = argv[++i];
				if (!value) throw new Error("--out expects a directory");
				args.outDir = path.resolve(value);
				break;
			}
			case "--from": {
				const value = argv[++i];
				if (!value) throw new Error("--from expects an export directory, a stamp, or 'latest'");
				args.fromDir = value;
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
	if (args.dryRun && !args.wipe) throw new Error("--dry-run only means something with --wipe.");
	return args;
}

function printUsage() {
	console.log(`Usage: bun scripts/exportTurso.ts [options]

Modes (default: export):
  (none)              export Turso → dbSnapshots/turso-export/<stamp>/
  --verify            read-only comparison of the D1 target against Turso
  --apply             load the export into D1

Options:
  --db local|preview|prod   D1 target                       (default: prod)
  --local-file <path>       explicit SQLite file for --db local
  --yes-prod                required for writes to --db prod
  --wipe                    DESTRUCTIVE: drop EVERY table in the target, including
                            d1_migrations, then re-apply the migrations so the
                            target is empty and back at schema 0003. Requires
                            --apply; --dry-run prints the plan without dropping.
                            ⚠ It also erases the pupil register, which a Turso
                            bundle cannot restore — use \`bun run port\` instead.
  --allow-pupil-loss        acknowledge that --wipe destroys the pupil register
                            (refused by default when the target has pupil rows)
  --dry-run                 with --wipe: list what would be dropped, write nothing
  --out <dir>               export directory (default dbSnapshots/turso-export/<stamp>)
  --from <dir|stamp|latest> reuse an existing bundle instead of reading Turso
  --exclude <table>         skip a table (repeatable; also filters a --from bundle)
  --include <table>         force-include a default-excluded table (repeatable)
  --limit <n>               at most n rows per table (smoke tests; export only)
  --no-replace              append instead of replacing the target rows
  --verbose                 per-table output
  -h, --help                this text

For the full "rebuild a target from Turso" flow (wipe → migrate → load → pupil
backfill → verify) use:  bun run port --db local|preview|prod

The migrate-first trap (read docs/D1_PORT_RUNBOOK.md §3 before --wipe):
  \`migrations apply\` runs 0002 AND 0003; 0003 drops \`registrations\`, the table
  the pupil backfill reads. So a wiped target must be re-filled by
  scripts/migratePupils.ts, not by porting a bundle that still contains
  \`registrations\`.`);
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const filter = (args: Args): TableFilter => withDefaults({ exclude: args.exclude, include: args.include });

function targetHint(target: D1Client): string {
	return `Apply the migrations first: ${migrationsApplyHint(target.target)}`;
}

function ensureProdAllowed(args: Args): void {
	if (args.db === "prod" && !args.yesProd) throw new Error("Refusing to write to production without --yes-prod.");
}

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

async function runExport(args: Args, target: D1Client): Promise<{ dir: string; manifest: Manifest; plans: TablePlan[] }> {
	const { client, label } = connectTurso();
	try {
		console.log(`Turso : ${label}`);
		const { plans, skipped } = await readTursoTables(client, filter(args), args.limit);
		console.log(
			`Tables: ${plans.length} exported${skipped.length ? `, ${skipped.length} skipped (${skipped.join(", ")})` : ""}${args.limit ? `, limited to ${args.limit} row(s)/table` : ""}\n`,
		);

		const manifest: Manifest = {
			generatedAt: new Date().toISOString(),
			source: label,
			excluded: skipped,
			limit: args.limit,
			tables: plans.map((plan) => ({ name: plan.name, rows: plan.rows.length, columns: plan.columns, digest: plan.digest })),
			totalRows: plans.reduce((sum, plan) => sum + plan.rows.length, 0),
		};

		const dir = args.outDir ?? defaultBundleDir(manifest.generatedAt);
		writeBundle(dir, manifest, plans);

		const width = Math.max(12, ...plans.map((plan) => plan.name.length));
		console.log(`${"table".padEnd(width)}  ${"rows".padStart(9)}  digest`);
		for (const table of manifest.tables) {
			console.log(`${table.name.padEnd(width)}  ${formatRows(table.rows).padStart(9)}  ${table.digest.slice(7, 19)}`);
		}
		console.log(`\nTotal : ${formatRows(manifest.totalRows)} row(s) from ${plans.length} table(s)`);
		console.log(`Bundle: ${path.relative(REPO_ROOT, dir)}/`);

		// The target is about to be rebuilt from scratch, so comparing against its
		// current schema would only report the tables the wipe removes.
		if (args.wipe) console.log(`\nSchema check skipped (--wipe ${args.dryRun ? "would rebuild" : "rebuilds"} the target schema).`);
		else await reportSchema(target, plans, false, targetHint(target));
		return { dir, manifest, plans };
	} finally {
		client.close();
	}
}

async function runVerify(target: D1Client, plans: TablePlan[], sourceLabel: string): Promise<boolean> {
	const result = await comparePlans(target, plans, sourceLabel);
	printCompare(result);
	return result.ok;
}

async function runWipe(target: D1Client, args: Args): Promise<void> {
	// Guard BEFORE anything is dropped: a wipe destroys the pupil register, and
	// the Turso bundle that follows cannot put it back.
	const pupils = await pupilRows(target);
	if (pupils !== null && pupils > 0 && !args.allowPupilLoss) {
		throw new Error(
			`Refusing to wipe: ${target.target.label} holds ${pupils.toLocaleString("en-US")} pupil row(s), and a Turso bundle cannot restore them.\n` +
				`  Rebuild the target instead:  bun run port --db ${args.db}${args.db === "prod" ? " --yes-prod" : ""}\n` +
				`  (it wipes, re-applies the migrations, loads Turso and regenerates the pupil register.)\n` +
				`  If losing the register IS what you want, re-run with --allow-pupil-loss.`,
		);
	}

	const tables = listWipeTargets(await listTargetTables(target));
	if (tables.length === 0) {
		console.log(`\n--wipe: nothing to drop on ${target.target.label}.`);
	} else {
		console.log(`\nWiping ${target.target.label}`);
		for (const table of tables) console.log(`  drop ${table}`);
	}

	await wipeTarget(target);
	console.log(`✓ Dropped ${tables.length} table(s).`);

	await applyMigrations(target.target);

	// `wrangler d1 migrations apply --local` always rebuilds the miniflare store,
	// which is not the same file as an explicit --local-file. Say so here rather
	// than letting the apply step fail on a schema check that cannot pass.
	if (target.target.kind === "local" && path.resolve(target.target.localFile!) !== path.resolve(findLocalDbFile())) {
		throw new Error(
			`Wiped ${target.target.localFile}, but \`migrations apply --local\` restores the standard dev store, not this copy.\n` +
				`  Drop --local-file to wipe the real dev database, or re-create this copy from the dev store after the migrations.`,
		);
	}
}

/**
 * A target whose pupil register would be destroyed by the wipe.
 *
 * `--wipe` drops `pupils` / `pupil_enrollments`, and the bundle that gets loaded
 * afterwards comes from Turso — which has no such tables. Without this guard the
 * register is simply gone (docs/D1_PORT_RUNBOOK.md §8 used to call the wipe
 * "trap-free"; it is not). `bun run port` is the flow that rebuilds it, because
 * it regenerates the register from the bundle's `registrations` rows.
 */
async function pupilRows(target: D1Client): Promise<number | null> {
	try {
		const [row] = await target.query<{ n: number }>("SELECT COUNT(*) AS n FROM pupils");
		return Number(row?.n ?? 0);
	} catch {
		return null; // no pupils table — nothing to lose
	}
}

/**
 * `--apply --wipe --dry-run`: the plan only, and NO writes at all. The wipe is
 * skipped *and* so is the load — a dry run that printed the drop plan and then
 * loaded the data anyway would be the worst of both worlds.
 */
async function printWipePlan(target: D1Client, plans: TablePlan[]): Promise<void> {
	const existing = await listTargetTables(target);
	const tables = listWipeTargets(existing);
	const kept = [...existing].filter((name) => !tables.includes(name)).sort((a, b) => a.localeCompare(b));

	console.log(`\nDRY RUN — would wipe ${target.target.label}`);
	if (tables.length === 0) console.log("  (nothing to drop)");
	for (const table of tables) console.log(`  drop ${table}`);
	if (kept.length) console.log(`  keep ${kept.join(", ")}`);
	console.log(`  then re-apply migrations (${migrationsApplyHint(target.target)})`);

	const total = plans.reduce((sum, plan) => sum + plan.rows.length, 0);
	console.log(`\nDRY RUN — would then load ${formatRows(total)} row(s) across ${plans.length} table(s):`);
	const width = Math.max(12, ...plans.map((plan) => plan.name.length));
	for (const plan of plans) console.log(`  ${plan.name.padEnd(width)}  ${formatRows(plan.rows.length).padStart(9)} row(s)`);
	console.log(`\nDRY RUN — nothing dropped, nothing written. Re-run without --dry-run to wipe and load.`);
}

async function runApply(args: Args, target: D1Client, plans: TablePlan[], sourceLabel: string): Promise<void> {
	ensureProdAllowed(args);
	if (args.limit) throw new Error("--limit is for export smoke tests only; refusing to apply a partial export.");
	if (target.target.kind === "remote") {
		console.log(`\nTarget: ${target.target.label}`);
		console.log(`Mode  : ${args.replace ? "REPLACE (delete the target rows, then insert)" : "APPEND (insert only)"}`);
	}
	await reportSchema(target, plans, true, targetHint(target));

	const inserted = await loadPlans(target, plans, { replace: args.replace, verbose: args.verbose });
	console.log(`\nWrote ${formatRows(inserted)} row(s) across ${plans.length} table(s).`);

	const ok = await runVerify(target, plans, sourceLabel);
	if (!ok) throw new Error("Post-apply verification FAILED — the target does not match the export.");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.mode === "apply" && args.limit) throw new Error("--limit is for export smoke tests only; refusing to apply a partial export.");
	// A wipe leaves the target with no schema, so it is only meaningful as the
	// first half of a load. Refuse it on its own instead of destroying a target.
	if (args.wipe && args.mode !== "apply") throw new Error("--wipe requires --apply (it drops every table: see docs/D1_PORT_RUNBOOK.md §8).");

	console.log(`Mode  : ${args.mode.toUpperCase()}`);
	console.log(
		`Target: ${args.db}${args.mode === "export" ? " (schema check only, nothing written)" : ""}${args.wipe ? ` [--wipe${args.dryRun ? " --dry-run" : ""}]` : ""}\n`,
	);

	if (args.fromDir) {
		const dir = resolveBundleDir(args.fromDir);
		const { manifest, plans, skipped } = readBundle(dir, filter(args));
		if (plans.length === 0) throw new Error(`--exclude left no table to port from ${dir}.`);
		if (args.mode === "apply" && manifest.limit) {
			throw new Error(`Bundle was exported with --limit ${manifest.limit}; refusing to apply a partial export.`);
		}
		console.log(
			`Bundle: ${path.relative(REPO_ROOT, dir)}/ — ${formatRows(plans.reduce((sum, plan) => sum + plan.rows.length, 0))} row(s), generated ${manifest.generatedAt} from ${manifest.source}`,
		);
		if (skipped.length) console.log(`Skipped by --exclude: ${skipped.join(", ")}`);
		console.log("");
		const target = openTarget(args.db, { localFile: args.localFile ?? undefined });
		try {
			const label = `bundle ${manifest.generatedAt}`;
			if (args.mode === "apply") {
				if (args.dryRun) {
					await printWipePlan(target, plans);
					return;
				}
				if (args.wipe) await runWipe(target, args);
				await runApply(args, target, plans, label);
			} else {
				await runVerify(target, plans, label);
			}
		} finally {
			target.close();
		}
		return;
	}

	if (args.mode === "verify") {
		const { client, label } = connectTurso();
		try {
			const all = await readTursoTables(client, filter(args));
			const plans = filterPlans(all.plans, filter(args));
			const skipped = [...all.skipped, ...all.plans.filter((plan) => !plans.includes(plan)).map((plan) => plan.name)];
			if (plans.length === 0) throw new Error("--exclude left no table to compare.");
			console.log(`Turso : ${label} (${plans.length} table(s)${skipped.length ? `, ${skipped.length} skipped` : ""})\n`);
			const target = openTarget(args.db, { localFile: args.localFile ?? undefined });
			try {
				await runVerify(target, plans, "live Turso");
			} finally {
				target.close();
			}
		} finally {
			client.close();
		}
		return;
	}

	const target = openTarget(args.db, { localFile: args.localFile ?? undefined });
	try {
		const { dir, plans, manifest } = await runExport(args, target);
		if (args.mode === "apply") {
			if (args.dryRun) {
				await printWipePlan(target, plans);
				return;
			}
			if (args.wipe) await runWipe(target, args);
			await runApply(args, target, plans, `export ${manifest.generatedAt}`);
			return;
		}
		const relative = path.relative(REPO_ROOT, dir);
		console.log(`\nNext  : bun scripts/exportTurso.ts --from ${relative} --apply --db ${args.db}${args.db === "prod" ? " --yes-prod" : ""}`);
		console.log(`Port  : bun run port --db ${args.db}${args.db === "prod" ? " --yes-prod" : ""}   # same, plus the pupil register`);
	} finally {
		target.close();
	}
}

try {
	await main();
} catch (error) {
	console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
}
