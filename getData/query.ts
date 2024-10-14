import { argv } from "process";
import dotenv from "dotenv";
import { readFile, writeFile } from "fs/promises";
import XLSX from "xlsx";
import { SimpleConnection, createDbConnection } from "../lib/db";

type ArgsType = {
	"--dev"?: boolean;
	"--prod"?: boolean;
	"--q"?: string;
	"--f"?: string;
	"--out"?: string;
	"--excel"?: string;
	"--t"?: string;
	"--h"?: string;
	"--help"?: string;
};

const getQueries = (str: string) => {
	const formatQuery = (query) => {
		query = query.replace(/\r\n/g, "");
		query = query.replace(/\n/g, "");
		return query;
	};

	const separateQueries = (query) => {
		return query.split(";");
	};

	const filterComments = (queries) => {
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
	if (args["--skip"]) {
		for (let i = 0; i < queries.length; i++) {
			const query = queries[i];
			if (query === "") break;
			try {
				await db.execute(query);
				console.log(`Executed query: ${query}`);
			} catch (err) {
				console.log(`Query Error: ${err}`);
			}
		}
		return;
	}
	try {
		for (let i = 0; i < queries.length; i++) {
			const query = queries[i];
			if (query === "") break;
			resArr.push(await db.execute(query));
			console.log(`Executed query: ${query}`);
		}
	} catch (error) {
		console.error(error);
	}
	return resArr;
};

const asyncEscape = (msg) => {
	console.log(msg);
	throw new Error();
};

/**
 *
 * @param {Object<string, string | number>[]} data
 */
const outputToExcel = (data) => {
	const headers = Object.keys(data[0]);
	const wb = XLSX.utils.book_new();
	const ws = XLSX.utils.aoa_to_sheet([headers].concat(data.map((row) => Object.values(row))));

	XLSX.utils.book_append_sheet(wb, ws, "Σελίδα 1");
	XLSX.writeFile(wb, args["--out"] || "output.xlsx");
};

const argReader = (args: string[]): ArgsType => {
	let argObj = {};
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		// if Flag or KV pair
		if (arg.startsWith("--") && (args[i + 1]?.startsWith("--") || args[i + 1] === undefined)) {
			argObj[arg] = true;
		} else if (arg.startsWith("--")) {
			argObj[arg] = args[i + 1];
		}
	}
	return argObj;
};
const args: ArgsType = argReader(argv);

const dbProcess = async function (args: ArgsType) {
	const conn = createDbConnection(isProduction ? "sqlite-prod" : "sqlite-dev");
	let data;
	try {
		if (args["--f"]) {
			const file = args["--f"];
			if (typeof file !== "string" || file === "") asyncEscape("No file specified");

			const queries = getQueries(await readFile(file, { encoding: "utf8" }));
			data = await executeQueries(queries, conn);
		} else if (args["--q"]) {
			const query = args["--q"];
			if (typeof query !== "string" || query === "") asyncEscape("No query specified");

			data = await conn.execute(query);
		} else {
			asyncEscape("No query or file specified");
		}
	} catch (error) {
		console.log(error);
	} finally {
		conn.close();
	}
	return data;
};

const printUsage = () => {
	console.log("Usage: node query.js --dev|--prod --q <query>|--f <file> [--out <file>]\n");
	console.log("  --dev:\tDevelopment environment");
	console.log("  --prod:\tProduction environment");
	console.log("  --q:\t\tQuery string");
	console.log("  --f:\t\tFile path to query file");
	console.log("  --out:\tOutput file path");
	console.log("  --excel:\tOutput to excel file");
	console.log("  --t:\t\tPrint execution time");
};

const isProduction = args["--dev"] ? false : args["--prod"] || null;
/**
 * Program use case examples:
 * Query database: node query.js --dev|--prod --q "SELECT * FROM users"
 * Query from file: node query.js --prod --f queries.sql
 * Query from file and output to file: node query.js --prod --f queries.sql --out output.json
 */
async function main() {
	if (args["--h"] || args["--help"] || Object.keys(args).length === 0) {
		printUsage();
		return;
	}
	dotenv.config({
		path: "../.env.development",
	});

	let isProduction = args["--dev"] ? false : args["--prod"] || null;
	if (isProduction === null) asyncEscape("No environment specified");

	args["--t"] && console.time("Execution Time");
	let data = await dbProcess(args);

	args["--t"] && console.timeEnd("Execution Time");

	if (args["--out"] && args["--excel"]) {
		outputToExcel(data);
	} else {
		const strData = JSON.stringify(data, null, 4);
		if (args["--out"]) {
			await writeFile(args["--out"], strData, { encoding: "utf8", flag: "w+" });
		} else {
			console.log(strData);
			if (data?.rows) {
				console.log("Returned rows: ", data.rows.length);
			}
		}
	}
}

main();
