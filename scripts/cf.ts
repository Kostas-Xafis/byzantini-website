#!/usr/bin/env bun
/**
 * Cloudflare helper — adapted from Isokratis (scripts/cf.ts).
 *
 * Usage: `bun run cf <command> [args...]` (no args → interactive chooser)
 *
 * Deploys use the adapter-generated worker config:
 *   wrangler deploy --config dist/server/wrangler.json
 * (build produces dist/server/entry.mjs + dist/client; the generated config
 * carries bindings once real resource ids are pinned in wrangler.jsonc —
 * see docs/PHASE6_DEPLOY.md).
 */
import { rm } from "node:fs/promises";

type Command = {
	name: string;
	environment?: "local" | "remote";
	description: string;
	run: (args: string[]) => Promise<number>;
};

const database = "byzantini-db";
const deployConfig = "dist/server/wrangler.json";

async function run(command: string, args: string[] = []): Promise<number> {
	const child = Bun.spawn([command, ...args], {
		stdin: "inherit",
		stdout: "inherit",
		stderr: "inherit",
	});
	return (await child.exited) ?? 1;
}

async function build(): Promise<number> {
	console.log("Building the project...");
	return run("bun", ["run", "build"]);
}

/**
 * Post-build: derive the preview deploy config from the adapter-generated
 * dist/server/wrangler.json (the build wipes dist/server, so this must run
 * AFTER the build — see why in docs/MIGRATION_SPEC.md).
 */
function generatePreviewDeployConfig(): boolean {
	try {
		const fs = require("node:fs");
		const source = JSON.parse(fs.readFileSync(deployConfig, "utf8"));
		source.name = "byzantini-website-preview";
		for (const d1 of source.d1_databases ?? []) {
			d1.database_id = "7f9a62e7-e72c-4f3b-8e81-4f81ffa86c5d";
			d1.database_name = "byzantini-db-preview";
		}
		for (const r2 of source.r2_buckets ?? []) {
			r2.bucket_name = "byzantini-bucket-dev";
		}
		source.preview_urls = false;
		fs.writeFileSync("dist/server/wrangler.preview.generated.json", JSON.stringify(source, null, 2));
		return true;
	} catch (error) {
		console.error("Could not generate the preview deploy config:", error);
		return false;
	}
}

async function buildThenWrangler(args: string[]): Promise<number> {
	const buildExitCode = await build();
	if (buildExitCode !== 0) return buildExitCode;
	return run("wrangler", args);
}

function printHelp(): void {
	console.log(`
Cloudflare helper

Usage:
  bun run cf                     Choose an action interactively
  bun run cf <command> [options] Execute an action directly

Commands:
  Worker:
    dev (local) [args...]        Build + run the built worker locally (wrangler dev)
    deploy (remote) [args...]    Build and deploy (uses the generated worker config)
    deploy:preview (remote) [args...] Alias of deploy until preview resources are wired

  Worker tools:
    types [args...]              Generate Wrangler types
    tail (remote) [args...]      Tail Worker logs

  D1 database:
    d1:create (remote)           Create the ${database} database
    d1:delete (remote)           Delete the ${database} database
    d1:migrate:local (local)     Apply D1 migrations locally
    d1:migrate:deploy (remote)   Apply D1 migrations to the remote database
    d1:wipe (local)              Wipe the local D1 database and re-apply migrations
    d1:query (remote) <sql>      Execute SQL against the remote database
    d1:query:local (local) <sql> Execute SQL against the local database
    d1:export (remote) [path]    Export the remote database (default dbSnapshots/d1-export.sql)

Examples:
  bun run cf
  bun run cf deploy
  bun run cf d1:query "SELECT COUNT(*) FROM registrations"
  bun run cf tail --format=json
`);
}

function confirm(question: string): boolean {
	const answer = prompt(`${question} [y/N] `);
	return answer?.trim().toLowerCase() === "y";
}

const commands: Command[] = [
	{
		name: "dev",
		environment: "local",
		description: "Build + run the built worker locally (wrangler dev)",
		run: (args) => buildThenWrangler(["dev", "--config", deployConfig, "--persist-to", ".wrangler/state", ...args]),
	},
	{
		name: "deploy",
		environment: "remote",
		description: "Build and deploy (uses the generated worker config)",
		run: (args) => buildThenWrangler(["deploy", "--config", deployConfig, ...args]),
	},
	{
		name: "deploy:preview",
		environment: "remote",
		description: "Build + generate the preview deploy config + deploy",
		run: async (args) => {
			const buildExitCode = await build();
			if (buildExitCode !== 0) return buildExitCode;
			const ok = generatePreviewDeployConfig();
			if (!ok) return 1;
			return run("wrangler", ["deploy", "--config", "dist/server/wrangler.preview.generated.json", ...args]);
		},
	},
	{
		name: "types",
		description: "Generate Wrangler types",
		run: (args) => run("wrangler", ["types", ...args]),
	},
	{
		name: "tail",
		environment: "remote",
		description: "Tail Worker logs",
		run: (args) => run("wrangler", ["tail", ...args]),
	},
	{
		name: "d1:create",
		environment: "remote",
		description: `Create the ${database} database`,
		run: (args) => run("wrangler", ["d1", "create", database, ...args]),
	},
	{
		name: "d1:delete",
		environment: "remote",
		description: `Delete the ${database} database (asks for confirmation)`,
		run: async (args) => {
			if (!confirm(`Delete ${database}? This cannot be undone.`)) {
				console.log("Cancelled.");
				return 0;
			}
			return run("wrangler", ["d1", "delete", database, ...args]);
		},
	},
	{
		name: "d1:migrate:local",
		environment: "local",
		description: "Apply D1 migrations locally",
		run: (args) => run("wrangler", ["d1", "migrations", "apply", database, "--local", "--persist-to", ".wrangler/state", ...args]),
	},
	{
		name: "d1:migrate:deploy",
		environment: "remote",
		description: "Apply D1 migrations to the remote database",
		run: (args) => run("wrangler", ["d1", "migrations", "apply", database, "--remote", ...args]),
	},
	{
		name: "d1:wipe",
		environment: "local",
		description: "Wipe the local D1 database and re-apply migrations",
		run: wipeLocalDatabase,
	},
	{
		name: "d1:query",
		environment: "remote",
		description: "Execute SQL against the remote database",
		run: (args) => runQuery(false, args),
	},
	{
		name: "d1:query:local",
		environment: "local",
		description: "Execute SQL against the local database",
		run: (args) => runQuery(true, args),
	},
	{
		name: "d1:export",
		environment: "remote",
		description: "Export the remote database",
		run: (args) => run("wrangler", ["d1", "export", database, "--remote", "--output", args[0] || "dbSnapshots/d1-export.sql", ...args.slice(1)]),
	},
];

const commandGroups = [
	{ title: "Worker", commands: ["dev", "deploy", "deploy:preview"] },
	{ title: "Worker tools", commands: ["types", "tail"] },
	{ title: "D1 database", commands: ["d1:create", "d1:delete"] },
	{ title: "D1 migrations", commands: ["d1:migrate:local", "d1:migrate:deploy", "d1:wipe"] },
	{ title: "D1 queries", commands: ["d1:query", "d1:query:local", "d1:export"] },
];

async function wipeLocalDatabase(args: string[]): Promise<number> {
	if (!confirm(`Wipe the local ${database} database and re-apply migrations?`)) {
		console.log("Cancelled.");
		return 0;
	}
	const localD1State = ".wrangler/state/v3/d1";
	console.log(`Removing local D1 state from ${localD1State}...`);
	try {
		await rm(localD1State, { force: true, recursive: true });
	} catch (error) {
		console.error("Could not remove the local D1 state.", error);
		return 1;
	}
	console.log("Re-applying local migrations...");
	return run("wrangler", ["d1", "migrations", "apply", database, "--local", "--persist-to", ".wrangler/state", ...args]);
}

async function runQuery(local: boolean, args: string[]): Promise<number> {
	let sql = args[0];
	if (!sql) {
		sql = prompt("SQL query: ")?.trim() ?? "";
	}
	if (!sql || sql.startsWith("-")) {
		console.error(`Missing SQL query. Usage: bun run cf d1:query${local ? ":local" : ""} "SELECT ..."`);
		return 1;
	}
	const extraArgs = args.slice(1);
	const localArgs = local ? ["--local", "--persist-to", ".wrangler/state"] : [];
	return run("wrangler", ["d1", "execute", database, ...localArgs, "--command", sql, ...extraArgs]);
}

async function chooseCommand(): Promise<string | undefined> {
	console.log("\nCloudflare helper - choose an action:");
	let option = 1;
	for (const group of commandGroups) {
		console.log(`\n${group.title}`);
		for (const commandName of group.commands) {
			const command = commands.find(({ name }) => name === commandName);
			if (!command) continue;
			const environment = command.environment ? ` (${command.environment})` : "";
			const displayName = `${command.name}${environment}`;
			console.log(`  ${option}) ${displayName.padEnd(28)} ${command.description}`);
			option += 1;
		}
	}
	console.log("\nh) help");
	console.log("  q) quit");
	const choice = prompt("\nSelect an action: ")?.trim().toLowerCase();
	if (!choice || choice === "q") return undefined;
	if (choice === "h") {
		printHelp();
		return undefined;
	}
	const index = Number(choice) - 1;
	return Number.isInteger(index) && index >= 0 && index < commands.length ? commands[index].name : undefined;
}

async function main(): Promise<number> {
	const [requestedCommand, ...args] = process.argv.slice(2);
	const commandName = requestedCommand ?? (await chooseCommand());
	if (!commandName) {
		if (requestedCommand) {
			console.error("Unknown command. Run `bun run cf --help` for usage.");
			return 1;
		}
		return 0;
	}
	if (commandName === "help" || commandName === "--help" || commandName === "-h") {
		printHelp();
		return 0;
	}
	if (commandName.startsWith("d1:query") || commandName === "d1:export") {
		const commandsMap = new Map(commands.map((c) => [c.name, c]));
		const command = commandsMap.get(commandName);
		return command ? command.run(args) : 1;
	}
	const command = commands.find(({ name }) => name === commandName);
	if (!command) {
		console.error(`Unknown command: ${commandName}. Run \`bun run cf --help\` for usage.`);
		return 1;
	}
	return command.run(args);
}

export {};

process.exit(await main());
