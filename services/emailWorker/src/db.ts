/**
 * DB access for the campaign CLI — Cloudflare D1, executed through
 * `wrangler d1 execute` (the same tooling the site's bindings use, with the
 * user's existing `wrangler login` OAuth — no API token, no server).
 *
 * Replaces the old libSQL/Turso connection: the databases are the site's D1
 * bindings — `byzantini-db` (production) and `byzantini-db-preview` (dev).
 * The "sqlite-prod"/"sqlite-dev" CLI names are kept so the campaign code
 * (queries.ts, removeSuppressed.ts) is unchanged.
 *
 * Requires: a logged-in wrangler (`wrangler login`) with access to the
 * databases. No CLOUDFLARE_API_TOKEN needed.
 */

import path from "node:path";

type DBType = "sqlite-prod" | "sqlite-dev" | null;

export interface D1Row {
	[key: string]: unknown;
}

export interface D1ExecuteResult {
	rows: D1Row[];
	rowsAffected: number;
}

export interface DbConnection {
	execute(query: { sql: string; args?: (string | number | boolean | null)[] }): Promise<D1ExecuteResult>;
}

// Defaults mirror the database names pinned in the website repo's wrangler.jsonc.
const D1_PROD_DATABASE_NAME_DEFAULT = "byzantini-db";
const D1_DEV_DATABASE_NAME_DEFAULT = "byzantini-db-preview";

/** Inlines `?` placeholders as SQL literals (values come from internal code, not users). */
function bindLiteral(sql: string, args: (string | number | boolean | null)[]): string {
	let i = 0;
	return sql.replace(/\?/g, () => {
		const value = args[i++];
		if (value === null || value === undefined) return "NULL";
		if (typeof value === "number") return String(value);
		if (typeof value === "boolean") return value ? "1" : "0";
		return `'${String(value).replaceAll("'", "''")}'`;
	});
}

export function createDbConnection(type?: DBType): DbConnection {
	const {
		// Optional overrides; default to the pinned wrangler.jsonc database names.
		D1_PROD_DATABASE_NAME,
		D1_DEV_DATABASE_NAME,
		// Connector type (legacy env); only applies when no type is given.
		CONNECTOR,
	} = process.env;

	const resolved: DBType = type ?? (CONNECTOR === "sqlite-prod" ? "sqlite-prod" : "sqlite-dev");
	const isProd = resolved === "sqlite-prod";
	const databaseName = isProd
		? D1_PROD_DATABASE_NAME ?? D1_PROD_DATABASE_NAME_DEFAULT
		: D1_DEV_DATABASE_NAME ?? D1_DEV_DATABASE_NAME_DEFAULT;

	const wranglerBin = path.resolve(import.meta.dir, "../node_modules/wrangler/bin/wrangler.js");

	return {
		async execute({ sql, args = [] }) {
			// stderr, not stdout: this is a progress note, and stdout has to stay
			// machine-readable for commands like `campaign --stats --json`.
			console.error(`wrangler d1 execute ${databaseName} (${isProd ? "production" : "preview"})…`);
			const command = bindLiteral(sql, args);
			const proc = Bun.spawn({
				cmd: ["node", wranglerBin, "d1", "execute", databaseName, "--remote", "--command", command, "--json"],
				stdout: "pipe",
				stderr: "pipe",
			});
			const [stdout, stderr] = (await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])) as [
				string,
				string,
			];
			const exitCode = await proc.exited;

			if (exitCode !== 0) {
				throw new Error(`wrangler d1 execute failed (exit ${exitCode}): ${stderr.trim() || stdout.trim()}`);
			}
			const json = JSON.parse(stdout) as { results?: D1Row[]; meta?: { changes?: number } }[];
			const first = json[0] ?? {};
			return { rows: first.results ?? [], rowsAffected: first.meta?.changes ?? 0 };
		},
	};
}
