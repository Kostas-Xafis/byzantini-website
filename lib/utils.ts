import type { Connection } from "mysql2/promise";
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

export class Transaction {
	private connection: Connection;
	private hasCommitted = false;
	private hasRolledBack = false;
	constructor(conn: Connection) {
		this.connection = conn;
		this.connection.connect();
	}

	static async begin() {
		const transaction = new Transaction(await CreateDbConnection());
		await transaction.connection.beginTransaction();
		return transaction;
	}

	async commit() {
		if (this.hasCommitted) throw new Error("Transaction has already committed");
		await this.connection.commit();
		this.hasCommitted = true;
		await this.connection.end();
	}
	async rollback() {
		if (this.hasRolledBack) throw new Error("Transaction has already rolled back");
		await this.connection.rollback();
		this.hasRolledBack = true;
		await this.connection.end();
	}
	execute<T = { insertId: number }>(query: string, args: any[] = []) {
		if (this.hasCommitted) throw new Error("Transaction has already committed");
		if (this.hasRolledBack) throw new Error("Transaction has already rolled back");
		return executeQuery<T>(query, args, this);
	}

	getConnection() {
		return this.connection;
	}
}

// FOR FUTURE ME: the return value of connection.execute is always an array of objects (i.e. Thing[])
// FOR FUTURE ME: the return value of async connection.execute is always an array of arrays of objects (i.e. Thing[][])
export const executeQuery = async <T = { insertId: number }>(query: string, args: any[] = [], trans?: Transaction) => {
	const connection = trans?.getConnection() ?? (await CreateDbConnection());
	const [res, _] = await connection.execute(query, args);
	if (!trans) await connection.end();
	return res as unknown as Promise<T extends { insertId: number } ? { insertId: number } : T[]>;
};

export const execTryCatch = async <T>(
	func: (() => Promise<T>) | ((t: Transaction) => Promise<T>)
): Promise<T extends string ? DefaultEndpointResponse : EndpointResponse<T>> => {
	// This is a work around because if I return inside the try-catch blocks, the return type is not inferred
	let res: DefaultEndpointResponse | EndpointResponse<T>;
	const transaction: Transaction | undefined = func.length ? await Transaction.begin() : undefined;
	try {
		//@ts-ignore
		const response = transaction ? await func(transaction) : await func();
		if (typeof response === "string") res = MessageWrapper(response);
		else {
			res = DataWrapper(response);
		}
		await transaction?.commit();
	} catch (error) {
		console.log(error);
		res = { res: "error", error };
		transaction && transaction.rollback();
	}
	return res as T extends string ? DefaultEndpointResponse : EndpointResponse<T>;
};

export const MessageWrapper = (msg: string) => {
	return { res: "message", message: msg } as DefaultEndpointResponse;
};

export const DataWrapper = <T = object>(data: T) => {
	return { res: "data", data } as EndpointResponse<T>;
};
