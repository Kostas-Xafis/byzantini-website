import type { EndpointResponse, EndpointResponseError } from "../types/routes";
import { CreateDbConnection, type Transaction } from "./db";


// This is a cheat to use whenever I know better than the type checker if an object has a property or not
export function assertOwnProp<X extends {}, Y extends PropertyKey>(obj: X, prop: Y): asserts obj is X & Record<Y, unknown> { }

/**
 *
 * @param arg
 * @returns Return the number of question marks needed for a query
 */
export const questionMarks = (arg: number | any[] | {}) => {
	const length = Array.isArray(arg) ? arg.length : typeof arg === "number" ? arg : Object.keys(arg).length;
	return "?".repeat(length).split("").join(", ");
};
export const createSessionId = (size = 32) => {
	const hexLookup = "0123456789abcdef";
	let session_id = "";
	for (let j = 0; j < size; j++) {
		session_id += hexLookup[Math.floor(Math.random() * 16)];
	}
	return { session_id, session_exp_date: Date.now() + 1000 * 60 * 60 * 24 * 7 };
};

export const generateLink = (size = 16) => {
	const linkLookup = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
	let link = "";
	for (let j = 0; j < size; j++) {
		link += linkLookup[Math.floor(Math.random() * 62)];
	}
	return link;
};

export const MIMETypeMap: Record<string, string> = {
	"jpeg": "image/jpeg",
	"png": "image/png",
	"webp": "image/webp",
	"gif": "image/gif",
	"jfif": "image/jfif",
	"jpg": "image/jpeg",
	"svg": "image/svg+xml",
	"pdf": "application/pdf",
	"doc": "application/msword",
	"docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"xls": "application/vnd.ms-excel",
	"xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	"ppt": "application/vnd.ms-powerpoint",
	"pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
	"txt": "text/plain",
};
export const imageMIMEType = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/jfif", "image/jpg", "image/svg+xml", "image/webp"];



//  ---------------------- DATABASE UTILS ----------------------  \\

const queryLogger = async (queryId: string, query: string, args: any[]) => {
	query.length > 400 && (query = query.slice(0, 397) + "...");
	let argStr = JSON.stringify(args);
	argStr.length > 400 && (argStr = argStr.slice(0, 397) + "...");
	try {
		await (await CreateDbConnection()).execute("INSERT INTO query_logs (id, query, args, date) VALUES (?, ?, ?, ?)", [queryId, query, argStr, Date.now()]);
	} catch (error) {
		console.log(error);
	}
};


export const executeQuery = async <T = undefined>(query: string, args: any[] = [], tx?: Transaction, log = false) => {
	const conn = tx ?? await CreateDbConnection();
	let queryId, res;
	try {
		if (!query.startsWith("SELECT") || log) {
			queryId = generateLink(20);
			tx && tx.queryHistory.push(queryId);
			await queryLogger(queryId, query, args);
		}
		res = await conn.execute<T>(query, args, { as: "object" });
	} catch (error) {
		console.log(error);
		if (queryId) {
			const errConn = await CreateDbConnection();
			if (tx)
				await errConn.execute(`UPDATE query_logs SET error = ? WHERE id IN (${questionMarks(tx.queryHistory.length)})`, [true, ...tx.queryHistory]);
			else
				await errConn.execute("UPDATE query_logs SET error = ? WHERE id=?", [true, queryId]);
		}
		throw new Error(error as any);
	}
	return (res.insertId === "0" && 'rows' in res ? res.rows : { insertId: Number(res.insertId) }) as T extends undefined ? { insertId: number; } : T[];
};

export const execTryCatch = async <T>(
	func: (t: Transaction) => Promise<T>
): Promise<EndpointResponse<T> | EndpointResponseError> => {
	// This is a work around because if I return inside the try-catch blocks, the return type is not inferred correctly
	let res: EndpointResponse<T> | EndpointResponseError;
	const hasTransaction: boolean = func.length === 1;
	try {
		let response;
		if (hasTransaction) {
			let conn = await CreateDbConnection();
			response = await conn.transaction((tx) => {
				tx.queryHistory = [];
				tx.executeQuery = <T>(query: string, args?: any[], log = false) => executeQuery<T>(query, args, tx, log);
				return func(tx as Transaction) as Promise<T>;
			}) as T;
		} else {
			response = (await (func as () => Promise<T>)()) as T;
		}
		// @ts-ignore
		if (typeof response === "string") res = MessageWrapper(response);
		else res = DataWrapper(response);
	} catch (error: any) {
		if (error instanceof Error) {
			res = ErrorWrapper(error.message);
		} else {
			res = ErrorWrapper(error);
		}
	}
	return res;
};

export const ErrorWrapper = (error: any): EndpointResponseError => {
	return { res: { type: "error", error } };
};

export const MessageWrapper = (msg: string): EndpointResponse<string> => {
	return {
		res: { type: "message", message: msg }
	};
};

export const DataWrapper = <T>(data: T) => {
	return { res: { type: "data", data } } as EndpointResponse<T>;
};
