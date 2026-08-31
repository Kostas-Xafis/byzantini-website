import type { Insert } from "@_types/entities";
import { Random as R } from "@lib/random";
import { questionMarks } from "@lib/utils.server";
import { runtimeEnv } from "@env/runtime";
import type { D1Database } from "@cloudflare/workers-types";

/**
 * D1 data layer — replaces libSQL/Turso (Phase 3 of the Workers migration).
 *
 * - The binding is read from `cloudflare:workers` env (`env.DB`), available in
 *   dev (local miniflare SQLite) and production (remote D1).
 * - `???` placeholder expansion and the `ExecReturn` shape are preserved so
 *   route code keeps working unchanged.
 * - D1 has NO interactive transactions: atomic multi-statement flows must use
 *   `db.batch()`. The `Transaction` shim below executes statements immediately
 *   (no rollback) — audit rollback-sensitive flows when porting to D1
 *   (see docs/MIGRATION_SPEC.md).
 */

export type ExecReturn<T> = { insertId: "0"; rows: T[] };
export type Exec = <T = undefined>(query: string, args?: QueryArguments, _?: any) => Promise<T extends undefined ? { insertId: string } : ExecReturn<T>>;

export type QueryArguments = Record<string, any> | any[];

export type Transaction = {
	execute: Exec;
	executeQuery: <T = undefined>(query: string, args?: QueryArguments, log?: boolean) => Promise<T extends undefined ? Insert : T[]>;
	queryHistory: [
		{
			id: string;
			query: string;
			args: QueryArguments;
		},
	];
};

/** D1 binding accessor (throws outside the Workers runtime). */
export function getDb(): D1Database {
	const db = runtimeEnv?.DB as D1Database | undefined;
	if (!db) throw new Error("D1 binding 'DB' is not available");
	return db;
}

/** Low-level D1 execution with `???` expansion + libsql-style result shape. */
export async function dbExec<T = undefined>(query: string, args: QueryArguments = []): Promise<T extends undefined ? { insertId: string } : ExecReturn<T>> {
	const argsArr = Array.isArray(args) ? args : objectToArrayFromQuery(args, query);
	const sql = query.replace("???", questionMarks(argsArr.length));
	// D1 bind() rejects `undefined` — map to SQL NULL.
	const bindArgs = argsArr.map((v) => (v === undefined ? null : v));
	const stmt = getDb().prepare(sql).bind(...bindArgs);
	const trimmed = query.trim();

	// SELECT-like statements return rows; everything else returns last row id.
	if (/^(SELECT|WITH|PRAGMA|EXPLAIN|SHOW)/i.test(trimmed)) {
		const res = await stmt.all<T>();
		return { insertId: "0", rows: res.results } as T extends undefined ? { insertId: string } : ExecReturn<T>;
	}
	const res = await stmt.run();
	return { insertId: String(res.meta.last_row_id ?? 0) } as T extends undefined ? { insertId: string } : ExecReturn<T>;
}

const queryLogger = async ({ id, query, args }: Transaction["queryHistory"][number], err = false) => {
	query.length > 400 && (query = query.slice(0, 397) + "...");
	let argStr = JSON.stringify(Array.isArray(args) ? args : objectToArrayFromQuery(args, query));
	argStr.length > 400 && (argStr = argStr.slice(0, 397) + "...");
	try {
		await getDb()
			.prepare("INSERT INTO query_logs (id, query, args, error, date) VALUES (?, ?, ?, ?, ?)")
			.bind(id, query, argStr, err ? 1 : 0, Date.now())
			.run();
	} catch (error) {
		console.log("Query logger error:" + error);
	}
};

export const logQuery = (query: string, args: QueryArguments, err = false) => {
	return queryLogger({ id: R.link(20), query, args }, err);
};

const objectToArrayFromQuery = (obj: Record<string, any>, query: string) => {
	let argsArr = [] as any[];
	if (query.includes("VALUES")) {
		const fields = query.match(/\([_\-a-zA-Z ,]+\)/g);
		if (fields) {
			fields.forEach((field) => {
				const keys = field.slice(1, field.length - 1).split(", ");
				keys.forEach((key) => {
					argsArr.push(obj[key]);
				});
			});
		}
	} else {
		const fields = query.match(/([_\-a-zA-Z]+(<|>|!)?( )?(LIKE|=)( )?\?)/g);
		if (fields) {
			fields.forEach((field) => {
				const key = field.split("=")[0].trim();
				argsArr.push(obj[key]);
			});
		}
	}
	return argsArr;
};
