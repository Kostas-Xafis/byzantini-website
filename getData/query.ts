import { createSimpleDbConnection, type SimpleConnection } from "@lib/db";
import type { ResultSet } from "@libsql/client";
import { argReader } from "@utilities/cli";
import { parseEnvFile } from "../loadEnvVars";
import { readFile, writeFile } from "fs/promises";
import { argv } from "process";
import XLSX from "xlsx";

type ArgsType = {
	"--dev"?: boolean;
	"--prod"?: boolean;
	"--q"?: string;
	"--f"?: string;
	"--out"?: string;
	"--excel"?: string;
	"--json"?: boolean;
	"--j"?: boolean;
	"--json-out"?: string;
	"--jo"?: string;
	"--skip"?: boolean;
	"--t"?: string;
	"--time"?: string;
	"--s"?: string;
	"--silent"?: string;
	"--h"?: string;
	"--help"?: string;
};
const args = argReader<ArgsType>(argv, "--");

const isSilent = args.silent || args.s;
const isTimed = args.time || args.t;
const log = (...msg: any) => {
	if (isSilent) return;
	console.log(...msg);
};

const loadCloudflareEnv = async (isProduction: boolean) => {
	const fileName = isProduction ? ".dev.vars" : ".dev.vars.development";
	const filePath = `${process.cwd()}/${fileName}`;
	const envContents = await readFile(filePath, { encoding: "utf8" });
	const parsed = parseEnvFile(envContents);

	Object.assign(process.env, parsed);
	if (!(import.meta as any).env) {
		(import.meta as any).env = {};
	}
	Object.assign((import.meta as any).env, parsed);
	log(`[query] Loaded environment from ${fileName}`);
};

const getQueries = (str: string) => {
	const splitSqlStatements = (sql: string): string[] => {
		const statements: string[] = [];
		let curr = "";
		let inSingle = false;
		let inDouble = false;
		let inBacktick = false;

		for (let i = 0; i < sql.length; i++) {
			const ch = sql[i];
			const prev = sql[i - 1];

			if (ch === "'" && prev !== "\\" && !inDouble && !inBacktick) inSingle = !inSingle;
			else if (ch === '"' && prev !== "\\" && !inSingle && !inBacktick) inDouble = !inDouble;
			else if (ch === "`" && prev !== "\\" && !inSingle && !inDouble) inBacktick = !inBacktick;

			if (ch === ";" && !inSingle && !inDouble && !inBacktick) {
				const statement = curr.trim();
				if (statement) statements.push(statement);
				curr = "";
				continue;
			}
			curr += ch;
		}

		const tail = curr.trim();
		if (tail) statements.push(tail);

		return statements;
	};

	const formatQuery = (query: string) => {
		query = query.replace(/\r\n/g, "");
		query = query.replace(/\n/g, "");
		return query;
	};

	const filterComments = (queries: string[]) => {
		return queries.filter((query) => !query.startsWith("--"));
	};
	return filterComments(splitSqlStatements(str).map((query) => formatQuery(query)));
};

/**
 *
 * @param {string[]} queries
 * @param {*} db
 * @returns {Promise<Object<string, string | number>[]>}
 */
const executeQueries = async (queries: string[], db: SimpleConnection) => {
	let resArr: any[] = [];
	if (args.skip) {
		for (let i = 0; i < queries.length; i++) {
			const query = queries[i];
			if (query === "") break;
			try {
				await db.execute(query);
				log(`Executed query: ${query}`);
			} catch (err) {
				log(`Query Error: ${err}`);
			}
		}
		return;
	}
	try {
		for (let i = 0; i < queries.length; i++) {
			const query = queries[i];
			if (query === "") break;
			resArr.push(await db.execute(query));
			log(`Executed query: ${query}`);
		}
	} catch (error) {
		console.error(error);
	}
	return resArr;
};

const asyncEscape = (msg: string) => {
	log(msg);
	throw new Error();
};

const isResultSetLike = (value: unknown): value is ResultSet => {
	if (!value || typeof value !== "object") return false;
	return "rows" in value && "columns" in value;
};

const normalizeForJson = (value: unknown): unknown => {
	if (Array.isArray(value)) {
		return value.map((item) => normalizeForJson(item));
	}
	if (!isResultSetLike(value)) return value;

	return {
		columns: value.columns,
		rows: value.rows,
		rowsAffected: value.rowsAffected,
		lastInsertRowid: value.lastInsertRowid,
	};
};

const getReturnedRowsCount = (value: unknown) => {
	if (Array.isArray(value)) {
		return value.reduce((sum, item) => sum + (isResultSetLike(item) ? item.rows.length : 0), 0);
	}
	if (isResultSetLike(value)) return value.rows.length;
	return null;
};

const ensureJsonExtension = (filePath: string) => {
	return filePath.toLowerCase().endsWith(".json") ? filePath : `${filePath}.json`;
};

/**
 *
 * @param {Object<string, string | number>[]} data
 */
const outputToExcel = (data: any[]) => {
	const headers = Object.keys(data[0]);
	const wb = XLSX.utils.book_new();
	const ws = XLSX.utils.aoa_to_sheet([headers].concat(data.map((row) => Object.values(row))));

	XLSX.utils.book_append_sheet(wb, ws, "Σελίδα 1");
	XLSX.writeFile(wb, args.out || "output.xlsx");
};


const dbProcess = async function (isProduction: boolean) {
	let conn: SimpleConnection = null as any;
	let data;
	try {
		conn = createSimpleDbConnection(isProduction ? "sqlite-prod" : "sqlite-dev");
		if (args.f) {
			const file = args.f;
			if (typeof file !== "string" || file === "") asyncEscape("No file specified");

			const queries = getQueries(await readFile(file, { encoding: "utf8" }));
			data = await executeQueries(queries, conn);
		} else if (args.q) {
			const query = args.q;
			if (typeof query !== "string" || query === "") asyncEscape("No query specified");
			data = await conn.execute(query);
		} else {
			asyncEscape("No query or file specified");
		}
	} catch (error) {
		log(error);
	} finally {
		if (conn) conn.close();
	}
	return data;
};

const printUsage = () => {
	log("Usage: node query.js --dev|--prod --q <query>|--f <file> [--out <file>]\n"
		, "  --dev:\tDevelopment environment\n"
		, "  --prod:\tProduction environment\n"
		, "  --q:\t\tQuery string\n"
		, "  --f:\t\tFile path to query file\n"
		, "  --out:\tOutput file path\n"
		, "  --excel:\tOutput to excel file\n"
		, "  --json, --j:\tPrint query output as JSON\n"
		, "  --json-out, --jo:\tStore query output as JSON (adds .json if missing)\n"
		, "  --t, --time:\t\tPrint execution time\n"
		, "  --s, --silent:\tSilent mode\n"
		, "  --skip:\tSkip errors\n"
		, "  --h, --help:\tPrint this message\n");
};

/**
 * Program use case examples:
 * Query database: node query.js --dev|--prod --q "SELECT * FROM users"
 * Query from file: node query.js --prod --f queries.sql
 * Query from file and output to file: node query.js --prod --f queries.sql --out output.json
 * Print query output as JSON: node query.js --dev --q "SELECT * FROM users" --json
 * Print and store JSON output: node query.js --prod --f queries.sql --json --json-out output
 */
async function main() {
	if (args.h || args.help || Object.keys(args).length === 0) {
		printUsage();
		return;
	}

	let isProduction = args.dev ? false : args.prod || null;
	if (isProduction === null) asyncEscape("No environment specified");
	const selectedIsProduction = isProduction as boolean;
	await loadCloudflareEnv(selectedIsProduction);

	log({ ...args });

	isTimed && console.time("Execution Time");
	let data = await dbProcess(selectedIsProduction);
	isTimed && console.timeEnd("Execution Time");

	if (args.excel) {
		outputToExcel(data as any);
	} else {
		const printJson = Boolean(args.json || args.j);
		const requestedJsonOut = (args["json-out"] || args.jo || args.out) as string | undefined;
		const shouldStoreJson = typeof requestedJsonOut === "string" && requestedJsonOut !== "";
		const jsonOutputPath = shouldStoreJson ? ensureJsonExtension(requestedJsonOut) : null;
		const normalizedData = normalizeForJson(data);
		const strData = JSON.stringify(normalizedData, null, 4);

		if (jsonOutputPath) {
			await writeFile(jsonOutputPath, strData, { encoding: "utf8", flag: "w+" });
			log(`[query] JSON output saved to ${jsonOutputPath}`);
		}

		if (printJson || !shouldStoreJson) {
			log(strData);
			const rowsCount = getReturnedRowsCount(data);
			if (rowsCount !== null) {
				log("Returned rows: ", rowsCount);
			}
		}
	}
}

main();
