import type { Insert } from "@_types/entities";
import type { AnyObjectSchema, Context, EndpointResponse, EndpointResponseError } from "@_types/routes";
import { Env } from "@env/env";
import { dbExec, logQuery, type QueryArguments, type Transaction } from "@lib/db";
import { Random as R } from "@lib/random";
import type { Output } from "valibot";

export function isProduction() {
	const { MODE, PROD } = Env.env;
	return MODE === "production" && PROD === true;
}

// This is a cheat to use whenever I know better than the type checker if an object has a property or not
export function assertOwnProp<X extends {}, Y extends PropertyKey>(obj: X, prop: Y): asserts obj is X & Record<Y, unknown> {}

export const MIMETypeMap: Record<string, string> = {
	jpeg: "image/jpeg",
	png: "image/png",
	webp: "image/webp",
	gif: "image/gif",
	jfif: "image/jfif",
	jpg: "image/jpeg",
	svg: "image/svg+xml",
	pdf: "application/pdf",
	doc: "application/msword",
	docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	xls: "application/vnd.ms-excel",
	xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	ppt: "application/vnd.ms-powerpoint",
	pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
	txt: "text/plain",
};
export const ImageMIMEType = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/jfif", "image/jpg", "image/svg+xml", "image/webp"];

/**
 * This function serves as a small optimization and should be called first to get the body of the request
 * to avoid unnecessary use of promises. Otherwise, if it returns undefined, use `await ctx.request.json()`.
 * @param ctx The context object from the route
 * @returns The body of the request if it has been used, otherwise undefined
 * @example const body = getUsedBody(ctx) || await ctx.request.json();
 */
export function getUsedBody<T>(ctx: Context<T>): (T extends AnyObjectSchema ? Output<T> : T) | undefined {
	if (!ctx.request.bodyUsed) return undefined;
	// @ts-ignore
	return ctx.request.json();
}

export function formDataToObject(formData: FormData): Record<string, any> {
	const obj: Record<string, File | string | string[]> = {};
	formData.forEach((value, key) => {
		let val: any;
		if (obj[key] === undefined) val = value;
		else if (obj[key] === "number") val = Number(value);
		else if (obj[key] === "boolean") val = value === "true";
		else if (obj[key] === "null") val = null;
		else if (obj[key] === "undefined") val = undefined;
		else if (obj[key] === "object") val = JSON.parse(value as any);
		obj[key] = val;
	});
	return obj;
}

export function unionStringToSet(str: string): Set<string | number> {
	return new Set(
		str.split("|").map((s) => {
			const num = Number(s);
			return isNaN(num) ? s.replaceAll(/[ \"]/g, "") : num;
		}),
	);
}

export function unionHas(set: Set<any>, value: any): boolean {
	if (Number(value) && !isNaN(Number(value))) return set.has(Number(value));
	return set.has(value);
}

//  ---------------------- DATABASE UTILS ----------------------  \\

/**
 * @returns Return the number of question marks needed for a query
 */
export const questionMarks = (arg: number | QueryArguments) => {
	const length = Array.isArray(arg) ? arg.length : typeof arg === "number" ? arg : Object.keys(arg).length;
	return "?".repeat(length).split("").join(", ");
};

export const executeQuery = async <T = undefined>(query: string, args: QueryArguments = [], tx?: Transaction, log = false) => {
	query = query.trim().replaceAll("\n", "");
	const res = await dbExec<T>(query, args);
	if (tx && !query.startsWith("SELECT")) {
		tx.queryHistory.push({
			id: R.link(20),
			query,
			args,
		});
	}
	if (log && !tx) {
		await logQuery(query, args);
	}
	return ("rows" in (res as any) ? (res as any).rows : { insertId: Number((res as any).insertId) }) as T extends undefined ? Insert : T[];
};

/**
 * D1 note: there are NO interactive transactions — statements execute
 * immediately (autocommit). Use this for flows where the statements are
 * independently safe; switch rollback-sensitive flows to `db.batch()` (see
 * docs/MIGRATION_SPEC.md, Phase 3/4 notes).
 */
export const executeTransaction = <T>(func: (t: Transaction) => Promise<T>): Promise<T> => {
	const tx = {
		execute: <T2>(query: string, args: QueryArguments = []) => dbExec<T2>(query, args),
		queryHistory: [] as any,
		executeQuery: null as any,
	} as Transaction;
	tx.executeQuery = <T2 = undefined>(query: string, args?: QueryArguments, log = false) => {
		return executeQuery<T2>(query, args, tx, log);
	};
	return (async () => {
		let hasError = false;
		try {
			return await func(tx);
		} catch (error) {
			hasError = true;
			throw error;
		} finally {
			for (const q of tx.queryHistory) {
				if (q.query.startsWith("SELECT")) continue;
				await logQuery(q.query, q.args, hasError);
			}
		}
	})();
};

export const execTryCatch = async <T>(func: (t: Transaction) => Promise<T>, errorMessage?: string): Promise<EndpointResponse<T> | EndpointResponseError> => {
	// This is a work around because if I return inside the try-catch blocks, the return type is not inferred correctly
	let res: EndpointResponse<T> | EndpointResponseError;
	const needsTransaction: boolean = func.length === 1;
	try {
		let response;

		if (needsTransaction) {
			response = await executeTransaction(func as (t: Transaction) => Promise<T>);
		} else {
			response = (await (func as () => Promise<T>)()) as T;
		}

		// @ts-ignore
		if (typeof response === "string") res = MessageWrapper(response);
		else res = DataWrapper(response);
	} catch (error: any) {
		console.log(error);
		if (error instanceof Error) {
			res = ErrorWrapper((errorMessage || "") + " " + error.message);
		} else {
			res = ErrorWrapper((errorMessage || "") + " " + error);
		}
	}
	return res;
};

export const ErrorWrapper = (error: any): EndpointResponseError => {
	return { res: { type: "error", error } };
};

export const MessageWrapper = (msg: string): EndpointResponse<string> => {
	return {
		res: { type: "message", message: msg },
	};
};

export const DataWrapper = <T>(data: T) => {
	return { res: { type: "data", data } } as EndpointResponse<T>;
};

// Use case: import a module for use only in development.
// Any other use case will 99% probably crash the build process.
// Cursed function

/**
 * Asynchronously imports a module only in non-production environments.
 *
 * @example ```ts
 * const os = await silentImport<typeof import('os')>('os');
 * ```
 * @param {string} importStr - The string representing the module to import.
 * @returns {Promise<ImportType>} - A promise that resolves to the imported module or an empty object in production or on error.
 */
export const silentImport = <ImportType>(importStr: string) => {
	if (isProduction()) {
		return Promise.resolve({}) as Promise<ImportType>;
	}
	try {
		return eval(`import("${importStr}")`) as Promise<ImportType>;
	} catch (err) {
		return Promise.resolve({}) as Promise<ImportType>;
	}
};
