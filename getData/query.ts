import { readFile, writeFile } from "fs/promises";
import { argv } from "process";
import XLSX from "xlsx";
import { type SimpleConnection, createSimpleDbConnection } from "../lib/db";
import { argReader } from "../lib/utilities/cli";
import type { ResultSet } from "@libsql/client";

type ArgsType = {
	"--dev"?: boolean;
	"--prod"?: boolean;
	"--q"?: string;
	"--f"?: string;
	"--out"?: string;
	"--excel"?: string;
	"--skip"?: boolean;
	"--t"?: string;
	"--time"?: string;
	"--s"?: string;
	"--silent"?: string;
	"--h"?: string;
	"--help"?: string;
};
const args = argReader<ArgsType>(argv, "--");
const isProduction = args.dev ? false : args.prod || null;

const isSilent = args.silent || args.s;
const isTimed = args.time || args.t;
const log = (...msg: any) => {
	if (isSilent) return;
	console.log(...msg);
};

const getQueries = (str: string) => {
	const formatQuery = (query: string) => {
		query = query.replace(/\r\n/g, "");
		query = query.replace(/\n/g, "");
		return query;
	};

	const separateQueries = (query: string) => {
		return query.split(";");
	};

	const filterComments = (queries: string[]) => {
		return queries.filter((query) => !query.startsWith("--"));
	};
	return filterComments(separateQueries(str).map((query) => formatQuery(query)));
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


const dbProcess = async function () {
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
 */
async function main() {
	if (args.h || args.help || Object.keys(args).length === 0) {
		printUsage();
		return;
	}

	let isProduction = args.dev ? false : args.prod || null;
	if (isProduction === null) asyncEscape("No environment specified");

	log({ ...args });

	isTimed && console.time("Execution Time");
	let data = await dbProcess();
	isTimed && console.timeEnd("Execution Time");

	if (args.excel) {
		outputToExcel(data as any);
	} else {
		const strData = JSON.stringify(data, null, 4);
		if (args.out) {
			await writeFile(args.out, strData, { encoding: "utf8", flag: "w+" });
		} else {
			log(strData);
			(data as ResultSet)?.rows && log("Returned rows: ", (data as ResultSet).rows.length);
		}
	}
}

main();
