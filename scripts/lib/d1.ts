/**
 * scripts/lib/d1.ts — shared D1 transport for the CLI tooling.
 *
 * CLI tooling (today `scripts/pupilIssuesReport.ts`) reaches the SAME database
 * through two very different doors:
 *
 *   local  — the miniflare SQLite file under `.wrangler/state/v3/d1`, opened
 *            directly with `bun:sqlite` (fast, transactional, no credentials);
 *   remote — the D1 REST API (`/accounts/:id/d1/database/:id/query`), which
 *            accepts either one statement with positional `?` parameters or a
 *            `batch` array of parameterised statements in a single request.
 *
 * The remote path deliberately uses the REST API instead of spawning
 * `wrangler d1 execute` per statement:
 *   • parameterised binding — no hand-rolled SQL literal escaping anywhere;
 *   • a batch of N statements is one HTTP request, so thousands of INSERTs take
 *     seconds instead of thousands of process spawns;
 *   • failures carry the D1 error text (and the offending statement) instead of
 *     a mangled child-process exit code.
 *
 * Credentials are never printed. Resolution order:
 *   token     — CLOUDFLARE_API_TOKEN, else the wrangler OAuth token already on
 *               disk (`~/.wrangler/config/default.toml`), same as scripts/replicate.ts;
 *   account   — CLOUDFLARE_ACCOUNT_ID, else the byzantini account constant below.
 *
 * Database names/ids are read from `wrangler.jsonc` so there is exactly one
 * source of truth for which database a target means.
 */
import { Database } from "bun:sqlite";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export const REPO_ROOT = path.resolve(import.meta.dir, "../..");

/** byzantini Cloudflare account (same constant scripts/replicate.ts uses). */
const DEFAULT_ACCOUNT_ID = "6b75328f1167f45e0a0028b85aaa4191";

/** Miniflare's local D1 store (workerd reads the same files). */
const LOCAL_D1_DIR = path.join(REPO_ROOT, ".wrangler/state/v3/d1/miniflare-D1DatabaseObject");

/** Miniflare bookkeeping file that lives next to the real database. */
const LOCAL_D1_IGNORED = new Set(["metadata.sqlite"]);

/**
 * D1 caps a single request's statement count and body size; stay well under
 * both. One statement per row keeps bound parameters low (D1 allows 100 per
 * statement, our widest INSERT binds 25).
 */
const BATCH_MAX_STATEMENTS = 40;
const BATCH_MAX_BYTES = 400_000;

export type TargetName = "local" | "preview" | "prod";

export type D1Target = {
	name: TargetName;
	kind: "local" | "remote";
	/** Human-readable, safe to print (never contains credentials). */
	label: string;
	databaseName: string;
	databaseId: string | null;
	accountId: string | null;
	/** Set for `local` only. */
	localFile: string | null;
};

export type D1Param = string | number | null;
export type SqlStatement = { sql: string; params?: D1Param[] };

export type BatchOptions = {
	/** Called for every statement just before it is sent (audit logging). */
	onStatement?: (sql: string, params: D1Param[]) => void;
	/** Progress callback, invoked with the number of statements sent so far. */
	onProgress?: (done: number, total: number) => void;
};

export interface D1Client {
	readonly target: D1Target;
	query<T = Record<string, unknown>>(sql: string, params?: D1Param[]): Promise<T[]>;
	/** Executes every statement; returns the total number of affected rows. */
	batch(statements: SqlStatement[], options?: BatchOptions): Promise<number>;
	close(): void;
}

// ---------------------------------------------------------------------------
// wrangler.jsonc (JSONC)
// ---------------------------------------------------------------------------

/** Minimal JSONC reader: strips comments + trailing commas outside strings. */
export function parseJsonc(text: string): unknown {
	let out = "";
	let inString = false;
	let inLine = false;
	let inBlock = false;
	for (let i = 0; i < text.length; i++) {
		const char = text[i]!;
		const next = text[i + 1];
		if (inLine) {
			if (char === "\n") {
				inLine = false;
				out += char;
			}
			continue;
		}
		if (inBlock) {
			if (char === "*" && next === "/") {
				inBlock = false;
				i++;
			}
			continue;
		}
		if (inString) {
			out += char;
			if (char === "\\") {
				out += next ?? "";
				i++;
			} else if (char === '"') {
				inString = false;
			}
			continue;
		}
		if (char === '"') {
			inString = true;
			out += char;
			continue;
		}
		if (char === "/" && next === "/") {
			inLine = true;
			i++;
			continue;
		}
		if (char === "/" && next === "*") {
			inBlock = true;
			i++;
			continue;
		}
		out += char;
	}
	return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

type WranglerD1 = { binding: string; database_name: string; database_id: string };
type WranglerConfig = {
	d1_databases?: WranglerD1[];
	env?: Record<string, { d1_databases?: WranglerD1[] }>;
};

let cachedConfig: WranglerConfig | null = null;

function wranglerConfig(): WranglerConfig {
	if (cachedConfig) return cachedConfig;
	const file = path.join(REPO_ROOT, "wrangler.jsonc");
	if (!existsSync(file)) throw new Error(`wrangler.jsonc not found at ${file}`);
	cachedConfig = parseJsonc(readFileSync(file, "utf8")) as WranglerConfig;
	return cachedConfig;
}

/** The `DB` binding's database for a named environment (top level = prod). */
function configDatabase(name: "prod" | "preview"): WranglerD1 {
	const config = wranglerConfig();
	const list = name === "prod" ? (config.env?.production?.d1_databases ?? config.d1_databases) : config.env?.preview?.d1_databases;
	const entry = list?.find((candidate) => candidate.binding === "DB") ?? list?.[0];
	if (!entry) throw new Error(`No D1 database bound as DB for '${name}' in wrangler.jsonc`);
	return entry;
}

/** The top-level `DB` entry — what `wrangler d1 ... --local` resolves against. */
function topLevelDatabase(): WranglerD1 {
	const config = wranglerConfig();
	const entry = config.d1_databases?.find((candidate) => candidate.binding === "DB") ?? config.d1_databases?.[0];
	if (!entry) throw new Error("No D1 database bound as DB in wrangler.jsonc");
	return entry;
}

/**
 * The top-level `DB` database name — what `wrangler d1 ...` means by "DB",
 * and the name the local miniflare store is keyed by.
 */
export function defaultDatabaseName(): string {
	return topLevelDatabase().database_name;
}

/**
 * The binding a `wrangler d1` command should address a target by.
 *
 * Always the *binding* (`DB`), never the database name: wrangler resolves the
 * positional argument against the selected environment's `d1_databases`, and
 * `env.preview` binds `DB` to a differently-named database (`byzantini-db-preview`),
 * so the top-level name resolves in prod/local but fails under `-e preview`.
 * `local` deliberately uses the top-level entry — the environment would change
 * which local miniflare store the database is keyed by.
 */
export function databaseBinding(name: TargetName): string {
	return (name === "local" ? topLevelDatabase() : configDatabase(name)).binding;
}

// ---------------------------------------------------------------------------
// Target + credentials
// ---------------------------------------------------------------------------

export function findLocalDbFile(override?: string): string {
	if (override) {
		const file = path.resolve(override);
		if (!existsSync(file)) throw new Error(`Local D1 file not found: ${file}`);
		return file;
	}
	if (!existsSync(LOCAL_D1_DIR)) {
		throw new Error(`Local D1 directory not found: ${LOCAL_D1_DIR}\nRun \`bunx wrangler d1 migrations apply DB --local\` first.`);
	}
	const candidates = readdirSync(LOCAL_D1_DIR)
		.filter((name) => name.endsWith(".sqlite") && !LOCAL_D1_IGNORED.has(name))
		.map((name) => path.join(LOCAL_D1_DIR, name))
		.filter((file) => statSync(file).size > 0);
	if (candidates.length === 0) throw new Error(`No .sqlite file found in ${LOCAL_D1_DIR}`);
	candidates.sort((a, b) => statSync(b).size - statSync(a).size);
	return candidates[0]!;
}

export function resolveTarget(name: TargetName, localFile?: string): D1Target {
	if (name === "local") {
		const file = findLocalDbFile(localFile);
		return {
			name,
			kind: "local",
			label: file,
			databaseName: "local",
			databaseId: null,
			accountId: null,
			localFile: file,
		};
	}
	const entry = configDatabase(name);
	const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || DEFAULT_ACCOUNT_ID;
	return {
		name,
		kind: "remote",
		label: `${entry.database_name} (remote ${entry.database_id})`,
		databaseName: entry.database_name,
		databaseId: entry.database_id,
		accountId,
		localFile: null,
	};
}

/**
 * The `wrangler d1 migrations apply` argv for a target, in the same shape the
 * repo's other tooling uses (`scripts/cf.ts`, `scripts/replicate.ts`): the
 * database is addressed by its **binding** and the environment is selected with
 * `-e`, because `wrangler.jsonc` declares a different `DB` database under each
 * named environment.
 *
 * Address it by binding (`DB`), never by database name: `wrangler d1 <cmd>`
 * resolves the positional against the *selected environment's* `d1_databases`
 * list, and `env.preview` binds `DB` to `byzantini-db-preview` — passing the
 * top-level name `byzantini-db` with `-e preview` fails with "Couldn't find a
 * D1 DB with the name or binding 'byzantini-db'". The binding resolves in every
 * environment (verified against wrangler 4.127.1).
 *
 * `-e` is added for preview only. `local` must NOT get one: the environment
 * selects which database the local miniflare store is keyed by, so `-e preview
 * --local` would silently point at a different local SQLite file.
 */
export function migrationsApplyArgs(target: D1Target): string[] {
	return [
		"wrangler",
		"d1",
		"migrations",
		"apply",
		databaseBinding(target.name),
		target.kind === "local" ? "--local" : "--remote",
		...(target.kind === "local" ? ["--persist-to", ".wrangler/state"] : []),
		...(target.name === "preview" ? ["-e", "preview"] : []),
		"-c",
		path.join(REPO_ROOT, "wrangler.jsonc"),
	];
}

/** The command above, as one copy-pasteable line (for logs and docs). */
export function migrationsApplyHint(target: D1Target): string {
	return `bunx ${migrationsApplyArgs(target).join(" ")}`;
}

/**
 * The `wrangler d1 export` argv that dumps a target to a file — the pre-port
 * safety net. Same addressing rule as `migrationsApplyArgs` (binding + `-e` for
 * preview, never the database name).
 */
export function d1ExportArgs(target: D1Target, output: string): string[] {
	return [
		"wrangler",
		"d1",
		"export",
		databaseBinding(target.name),
		target.kind === "local" ? "--local" : "--remote",
		...(target.kind === "local" ? ["--persist-to", ".wrangler/state"] : []),
		...(target.name === "preview" ? ["-e", "preview"] : []),
		"--output",
		output,
		"-c",
		path.join(REPO_ROOT, "wrangler.jsonc"),
	];
}

/** The command above, as one copy-pasteable line (for logs and docs). */
export function d1ExportHint(target: D1Target, output: string): string {
	return `bunx ${d1ExportArgs(target, output).join(" ")}`;
}

/** Never log the returned token. */
function resolveToken(): { token: string; source: string } {
	const fromEnv = process.env.CLOUDFLARE_API_TOKEN?.trim();
	if (fromEnv) return { token: fromEnv, source: "CLOUDFLARE_API_TOKEN" };
	const candidates = [path.join(homedir(), ".wrangler/config/default.toml"), path.join(homedir(), ".config/.wrangler/config/default.toml")];
	for (const file of candidates) {
		try {
			const match = readFileSync(file, "utf8").match(/oauth_token\s*=\s*"([^"]+)"/);
			if (match) return { token: match[1], source: "wrangler login (oauth_token)" };
		} catch {
			/* try the next location */
		}
	}
	throw new Error("No Cloudflare credentials: set CLOUDFLARE_API_TOKEN or run `wrangler login`.");
}

// ---------------------------------------------------------------------------
// Remote client (D1 REST API)
// ---------------------------------------------------------------------------

class RemoteD1 implements D1Client {
	readonly target: D1Target;
	private readonly token: string;
	private readonly tokenSource: string;

	constructor(target: D1Target) {
		this.target = target;
		const credentials = resolveToken();
		this.token = credentials.token;
		this.tokenSource = credentials.source;
	}

	private endpoint(): string {
		return `https://api.cloudflare.com/client/v4/accounts/${this.target.accountId}/d1/database/${this.target.databaseId}/query`;
	}

	private async post(body: unknown, attempt = 0): Promise<{ results: Record<string, unknown>[][]; changes: number }> {
		const maxAttempts = 5;
		let response: Response;
		try {
			response = await fetch(this.endpoint(), {
				method: "POST",
				headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
		} catch (error) {
			if (attempt + 1 < maxAttempts) return this.retry(body, attempt, `network error: ${(error as Error).message}`);
			throw new Error(`D1 request failed after ${maxAttempts} attempts: ${(error as Error).message}`);
		}

		const raw = await response.text();
		if (response.status === 401 || response.status === 403) {
			// Never print the credential itself — only where it came from.
			throw new Error(
				`Cloudflare rejected the credentials from ${this.tokenSource} (HTTP ${response.status}).\n` +
					`  Run \`wrangler login\` in an interactive terminal, or set CLOUDFLARE_API_TOKEN, then retry.`,
			);
		}
		if (response.status === 429 || response.status >= 500) {
			if (attempt + 1 < maxAttempts) return this.retry(body, attempt, `HTTP ${response.status}`);
		}
		if (!response.ok) throw new Error(`D1 HTTP ${response.status}: ${raw.slice(0, 400)}`);

		let parsed: {
			success?: boolean;
			errors?: { code?: number; message?: string }[];
			result?: { results?: Record<string, unknown>[]; success?: boolean; meta?: { changes?: number } }[];
		};
		try {
			parsed = JSON.parse(raw);
		} catch {
			throw new Error(`D1 returned a non-JSON response: ${raw.slice(0, 400)}`);
		}
		if (!parsed.success) {
			throw new Error(`D1 error: ${(parsed.errors ?? []).map((e) => e.message ?? String(e.code)).join("; ") || raw.slice(0, 400)}`);
		}
		const rows = parsed.result ?? [];
		// A per-statement failure still comes back under `success: true`.
		const failed = rows.find((entry) => entry.success === false);
		if (failed) throw new Error(`D1 statement failed: ${JSON.stringify((failed as { error?: unknown }).error ?? failed).slice(0, 400)}`);
		return { results: rows.map((entry) => entry.results ?? []), changes: rows.reduce((sum, entry) => sum + (entry.meta?.changes ?? 0), 0) };
	}

	private async retry(body: unknown, attempt: number, reason: string): Promise<{ results: Record<string, unknown>[][]; changes: number }> {
		const wait = 400 * 2 ** attempt + Math.floor(Math.random() * 250);
		process.stderr.write(`\r  retrying D1 (${reason}) in ${wait}ms…            \n`);
		await new Promise((resolve) => setTimeout(resolve, wait));
		return this.post(body, attempt + 1);
	}

	async query<T = Record<string, unknown>>(sql: string, params?: D1Param[]): Promise<T[]> {
		const body = params && params.length ? { sql, params } : { sql };
		const { results } = await this.post(body);
		return (results[0] ?? []) as T[];
	}

	async batch(statements: SqlStatement[], options: BatchOptions = {}): Promise<number> {
		let changes = 0;
		let done = 0;
		for (const chunk of chunkStatements(statements)) {
			const body = {
				batch: chunk.map((statement) => {
					const params = statement.params ?? [];
					options.onStatement?.(statement.sql, params);
					return params.length ? { sql: statement.sql, params } : { sql: statement.sql };
				}),
			};
			const result = await this.post(body);
			changes += result.changes;
			done += chunk.length;
			options.onProgress?.(done, statements.length);
		}
		return changes;
	}

	close(): void {
		/* stateless */
	}
}

/** Splits statements into request-sized chunks (count + approximate bytes). */
function chunkStatements(statements: SqlStatement[]): SqlStatement[][] {
	const chunks: SqlStatement[][] = [];
	let current: SqlStatement[] = [];
	let bytes = 0;
	for (const statement of statements) {
		const size = statement.sql.length + (statement.params ?? []).reduce<number>((sum, value) => sum + (typeof value === "string" ? value.length : 8), 0);
		if (current.length > 0 && (current.length >= BATCH_MAX_STATEMENTS || bytes + size > BATCH_MAX_BYTES)) {
			chunks.push(current);
			current = [];
			bytes = 0;
		}
		current.push(statement);
		bytes += size;
	}
	if (current.length) chunks.push(current);
	return chunks;
}

// ---------------------------------------------------------------------------
// Local client (bun:sqlite)
// ---------------------------------------------------------------------------

class LocalD1 implements D1Client {
	readonly target: D1Target;
	private readonly db: Database;

	constructor(target: D1Target) {
		this.target = target;
		// NOTE: do not pass { readonly: false } — bun:sqlite rejects it with
		// SQLITE_MISUSE; the default mode is already read-write.
		this.db = new Database(target.localFile!);
	}

	async query<T = Record<string, unknown>>(sql: string, params?: D1Param[]): Promise<T[]> {
		const statement = this.db.query(sql);
		return (params && params.length ? statement.all(...(params as never[])) : statement.all()) as T[];
	}

	async batch(statements: SqlStatement[], options: BatchOptions = {}): Promise<number> {
		let changes = 0;
		const run = this.db.transaction((statement: SqlStatement) => {
			const params = statement.params ?? [];
			options.onStatement?.(statement.sql, params);
			const result = params.length ? this.db.run(statement.sql, params as never[]) : this.db.run(statement.sql);
			changes += Number(result.changes ?? 0);
		});
		let done = 0;
		for (const statement of statements) {
			run(statement);
			options.onProgress?.(++done, statements.length);
		}
		return changes;
	}

	close(): void {
		this.db.close();
	}
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function openTarget(name: TargetName, options: { localFile?: string } = {}): D1Client {
	const target = resolveTarget(name, options.localFile);
	return target.kind === "local" ? new LocalD1(target) : new RemoteD1(target);
}

/** Applies a caller-supplied statement list or a single statement to a client. */
export async function exec(client: D1Client, sql: string, params?: D1Param[]): Promise<number> {
	return client.batch([{ sql, params }]);
}
