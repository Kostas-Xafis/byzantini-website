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
 * The cleansing rules live in scripts/lib/pupilsBackfill.ts (pure, no I/O) and
 * the run — read, plan, write, verify — in scripts/lib/pupilsRun.ts, so the
 * one-command port (scripts/portD1.ts) uses exactly the same engine. This CLI
 * reads `registrations` from the TARGET database; the port reads the same rows
 * from the Turso bundle instead, because a wiped target has no legacy table.
 *
 * Usage:
 *   bun scripts/migratePupils.ts                        # dry run, local dev DB
 *   bun scripts/migratePupils.ts --verbose              # dry run + sample rows
 *   bun scripts/migratePupils.ts --report out.json      # dry run + JSON report
 *   bun scripts/migratePupils.ts --apply                # write to the local dev DB
 *   bun scripts/migratePupils.ts --db prod --yes-prod   # dry run against production
 *   bun scripts/migratePupils.ts --db prod --yes-prod --apply
 *
 * Order of operations for a fresh environment (docs/PUPILS_MIGRATION.md §1):
 *   apply 0002 → run this script --apply → verify the counts → apply 0003.
 * `bun run port --db <target>` does that whole dance in one command, without
 * needing the legacy table in the target at all.
 *
 * Env hooks (auditing the generated batch):
 *   MIGRATE_DUMP_SQL=<file>  write the whole batch (parameters inlined) before it runs
 *   MIGRATE_LOG_SQL=<file>   write each statement as it is executed
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { openTarget, type TargetName } from "./lib/d1";
import { renderStatement } from "./lib/pupilsBackfill";
import {
	applyRun,
	existingPupils,
	planRun,
	preflight,
	printBackfillReport,
	printPupilVerification,
	readLegacyRows,
	renderRunSql,
	verifyPupils,
	writeBackfillReport,
} from "./lib/pupilsRun";

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

type Args = {
	apply: boolean;
	db: TargetName;
	localFile: string | null;
	yesProd: boolean;
	verbose: boolean;
	reportPath: string | null;
};

function parseArgs(argv: string[]): Args {
	const args: Args = { apply: false, db: "local", localFile: null, yesProd: false, verbose: false, reportPath: null };
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

  --apply                 write the backfill (default is a dry run)
  --db local|preview|prod target database (default: local)
  --local-file <path>     explicit miniflare SQLite file for --db local
  --yes-prod              required together with --db prod
  --report <file>         also write a JSON report to <file>
  --verbose               print sample rows for every issue found
  -h, --help              this text

Reads \`registrations\` from the target. To rebuild a whole target from Turso —
including the pupil register — use:  bun run port --db local|preview|prod`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.db === "prod" && !args.yesProd) {
		throw new Error("Refusing to touch production without --yes-prod (see docs/PUPILS_MIGRATION.md, D13).");
	}

	const client = openTarget(args.db, { localFile: args.localFile ?? undefined });
	try {
		console.log(`Source : ${client.target.label}`);
		console.log(`Target : ${client.target.label}`);
		console.log(`Mode   : ${args.apply ? "APPLY" : "DRY RUN"}`);

		const { hasLegacy, appliedMigrations } = await preflight(client);
		if (!hasLegacy) {
			console.log("\nregistrations table is already gone — nothing to migrate.");
			return;
		}

		const legacy = await readLegacyRows(client);
		const run = planRun(legacy, await existingPupils(client));

		printBackfillReport(run, [["Migrations applied on the target", appliedMigrations.length ? appliedMigrations.join(", ") : "(none)"]], args.verbose);
		if (args.reportPath) {
			writeBackfillReport(args.reportPath, run, { target: client.target.label, applied: args.apply });
		}

		if (run.insertPupils === 0) {
			console.log("\nNothing to do — target already populated.");
			return;
		}

		if (!args.apply) {
			console.log(`\nDRY RUN — nothing written. Re-run with --apply to write ${run.statementCount} statement(s).`);
			return;
		}

		// MIGRATE_DUMP_SQL=<file> writes the whole batch before it is executed, so
		// it can be replayed with the sqlite3 CLI (used to prove determinism).
		if (process.env.MIGRATE_DUMP_SQL) {
			writeFileSync(process.env.MIGRATE_DUMP_SQL, renderRunSql(run), "utf8");
			console.log(`SQL dumped to ${process.env.MIGRATE_DUMP_SQL}`);
		}

		// MIGRATE_LOG_SQL=<file> records every statement as it is applied.
		const logPath = process.env.MIGRATE_LOG_SQL;
		const log: string[] = [];
		console.log(`\nWriting ${run.insertPupils} pupil(s) + ${run.insertEnrollments} enrollment(s)…`);
		const changes = await applyRun(client, run, {
			onStatement: logPath ? (sql, params) => log.push(renderStatement({ sql, params })) : undefined,
			onProgress: (done, total) => {
				if (process.stdout.isTTY && total > 200 && done < total) process.stdout.write(`\r  ${done}/${total} statement(s)   `);
			},
		});
		if (process.stdout.isTTY) process.stdout.write("\r");
		if (logPath) {
			writeFileSync(logPath, log.join("\n") + "\n", "utf8");
			console.log(`SQL log written to ${logPath}`);
		}
		console.log(`Done — ${changes} row(s) affected.`);

		// Prove what landed, not just that the writes returned.
		printPupilVerification(await verifyPupils(client, run));
	} finally {
		client.close();
	}
}

try {
	await main();
} catch (error) {
	console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
}
