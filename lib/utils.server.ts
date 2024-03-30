import type { Output } from "valibot";
import type { AnyObjectSchema, Context, EndpointResponse, EndpointResponseError } from "../types/routes";
import { createDbConnection, type Transaction } from "./db";
import { ExecutionQueue, sleep } from "./utils.client";
import type { Insert } from "../types/entities";

// This is a cheat to use whenever I know better than the type checker if an object has a property or not
export function assertOwnProp<X extends {}, Y extends PropertyKey>(obj: X, prop: Y): asserts obj is X & Record<Y, unknown> { }

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
export const ImageMIMEType = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/jfif", "image/jpg", "image/svg+xml", "image/webp"];

export function getUsedBody<T>(ctx: Context<T>): (T extends AnyObjectSchema ? Output<T> : T) | undefined {
	if (!ctx.request.bodyUsed) return undefined;
	// @ts-ignore
	return ctx.request.json();
};

export function unionStringToSet(str: string): Set<string | number> {
	return new Set(str.split("|").map((s) => {
		const num = Number(s);
		return isNaN(num) ? s.replaceAll(/[ \"]/g, "") : num;
	}));
}

export function unionHas(set: Set<any>, value: any): boolean {
	if (Number(value) && !isNaN(Number(value))) return set.has(Number(value));
	return set.has(value);
}

//  ---------------------- DATABASE UTILS ----------------------  \\

/**
 * @returns Return the number of question marks needed for a query
 */
export const questionMarks = (arg: number | any[] | {}) => {
	const length = Array.isArray(arg) ? arg.length : typeof arg === "number" ? arg : Object.keys(arg).length;
	return "?".repeat(length).split("").join(", ");
};

const queryLogger = async (queryId: string, query: string, args: any[]) => {
	query.length > 400 && (query = query.slice(0, 397) + "...");
	let argStr = JSON.stringify(args);
	argStr.length > 400 && (argStr = argStr.slice(0, 397) + "...");
	try {
		(await createDbConnection()).execute("INSERT INTO query_logs (id, query, args, date) VALUES (?, ?, ?, ?)", [queryId, query, argStr, Date.now()]);
	} catch (error) {
		console.log(error);
	}
};


export const executeQuery = async <T = undefined>(query: string, args: any[] = [], tx?: Transaction, log = false) => {
	const conn = tx ?? await createDbConnection();
	query = query.trim().replaceAll("\n", "");
	let queryId, res;
	try {
		if (!query.startsWith("SELECT") || log) {
			queryId = generateLink(20);
			tx && tx.queryHistory.push(queryId);
			queryLogger(queryId, query, args);
		}
		res = await conn.execute<T>(query, args, { as: "object" });
	} catch (error) {
		console.log(error);
		if (queryId) {
			(async function () {
				const errConn = await createDbConnection();
				if (tx)
					await errConn.execute(`UPDATE query_logs SET error = ? WHERE id IN (${questionMarks(tx.queryHistory.length)})`, [true, ...tx.queryHistory]);
				else
					await errConn.execute("UPDATE query_logs SET error = ? WHERE id=?", [true, queryId]);
			})();
		}
		throw new Error(error as any);
	}
	return (res.insertId === "0" && 'rows' in res ? res.rows : { insertId: Number(res.insertId) }) as T extends undefined ? Insert : T[];
};

// const TxQueue = new ExecutionQueue<() => Promise<any>>(0, (item) => {
// 	return item();
// }, true);

export const execTryCatch = async <T>(
	func: (t: Transaction) => Promise<T>
): Promise<EndpointResponse<T> | EndpointResponseError> => {
	// This is a work around because if I return inside the try-catch blocks, the return type is not inferred correctly
	let res: EndpointResponse<T> | EndpointResponseError;
	const hasTransaction: boolean = func.length === 1;
	try {
		let response;
		// ! Transactions refuse Cloudflare production
		if (hasTransaction) {
			let resId = "";
			// ! This code refuses to work in Cloudflare production
			// response = await new Promise(async (resolve, reject) => {
			// 	TxQueue.push(async () => {
			// 		try {
			// 			const conn = await createDbConnection();
			// 			const tres = await conn.transaction((tx) => {
			// 				tx.queryHistory = [];
			// 				tx.executeQuery = <T>(query: string, args?: any[], log = false) => executeQuery<T>(query, args, tx, log);
			// 				return func(tx as Transaction) as Promise<T>;
			// 			}) as T;
			// 			resolve(tres);
			// 		} catch (error) {
			// 			console.log({ resId, error });
			// 			reject(error);
			// 		}
			// 	});
			// }) as T;
			const conn = await createDbConnection();
			response = await conn.transaction(async (tx) => {
				tx.queryHistory = [];
				tx.executeQuery = <T>(query: string, args?: any[], log = false) => {
					console.log({ resId, query, args });
					return executeQuery<T>(query, args, tx, log);
				};
				return await func(tx as Transaction) as Promise<T>;
			}) as T;

			console.log({ resId, response });
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
		console.error(error);
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
