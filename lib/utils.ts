import type { Transaction as Tx } from "@planetscale/database";
import type { DefaultEndpointResponse, EndpointResponse } from "../types/routes";
import { CreateDbConnection } from "./db";

/**
 *
 * @param num
 * @returns Return the number of question marks needed for a query
 */
export const questionMarks = (num: number) => "?".repeat(num).split("").join(", ");

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

// FOR FUTURE ME: the return value of connection.execute is always an array of objects (i.e. Thing[])
// FOR FUTURE ME: the return value of async connection.execute is always an array of arrays of objects (i.e. Thing[][])
export const executeQuery = async <T = { insertId: number }>(query: string, args: any[] = [], trans?: Tx) => {
	const conn = trans ?? await CreateDbConnection();
	const res = await conn.execute(query, args, { as: "object" });
	return (res.insertId === '0' ? res.rows : { insertId: Number(res.insertId) }) as unknown as Promise<T extends { insertId: number } ? { insertId: number } : T[]>;
};

export type Transaction = Tx & { executeQuery: <T = { insertId: number }>(query: string, args?: any[]) => ReturnType<typeof executeQuery<T>> };

export const execTryCatch = async <T>(
	func: (() => Promise<T>) | ((t: Transaction) => Promise<T>)
): Promise<T extends string ? DefaultEndpointResponse : EndpointResponse<T>> => {
	// This is a work around because if I return inside the try-catch blocks, the return type is not inferred correctly
	let res: DefaultEndpointResponse | EndpointResponse<T>;
	const hasTransaction: boolean = func.length === 1;
	try {
		//@ts-ignore
		let response;
		if (hasTransaction) {
			let conn = await CreateDbConnection();
			response = await conn.transaction(async (tx) => {
				(tx as Transaction).executeQuery = (query: string, args?: any[]) => executeQuery(query, args, tx);
				return await func(tx as Transaction)
			});
		} else {
			// @ts-ignore
			response = await func()
		};
		if (typeof response === "string") res = MessageWrapper(response);
		else res = DataWrapper(response);
	} catch (error) {
		console.log(error);
		// @ts-ignore
		res = { res: "error", error: { message: error?.message, stack: error?.stack } };
	}
	return res as T extends string ? DefaultEndpointResponse : EndpointResponse<T>;
};

export const MessageWrapper = (msg: string) => {
	return { res: "message", message: msg } as DefaultEndpointResponse;
};

export const DataWrapper = <T = object>(data: T) => {
	return { res: "data", data } as EndpointResponse<T>;
};

export const isDevFromURL = (url: URL) => {
	return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "192.168.2.9" || url.hostname === "192.168.2.10";
} 