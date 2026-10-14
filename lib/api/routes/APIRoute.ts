import type { z } from "astro/zod";

/**
 * Typed API route contract + registry (ported from Isokratis).
 *
 * Each route is an instance carrying its contract (method, path, schemas);
 * subclasses own an independent registry used by `APIServer.handle` for
 * dispatch. `APIServer` adds the handler and middleware on top.
 */
export type HTTPMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS" | "HEAD";

/**
 * Path params arrive percent-decoded; `[name:number]` is coerced to a finite
 * number (a segment that is not a decimal number does not match the route).
 * Every other annotation is a plain string.
 */
type StringTypeToType<S extends string> = S extends "number" ? number : string;

export type RouteParams<S extends string> = S extends `${infer _Start}[${infer Param}:${infer Type}]${infer Rest}`
	? { [K in Param]: StringTypeToType<Type> } & RouteParams<Rest>
	: S extends `${infer _Start}[${infer Param}]${infer Rest}`
		? { [K in Param]: string } & RouteParams<Rest>
		: {};

export interface APIRouteOptions<M extends HTTPMethod, P extends string, O extends z.ZodTypeAny | undefined, R extends z.ZodTypeAny | undefined> {
	method: M;
	path: P;
	schema?: O;
	responseSchema?: R;
	/** Multipart form-data request (values are coerced server-side). */
	multipart?: boolean;
	/** File upload: the request body IS the raw file (no form parsing). Pair it with `schema: z_BlobUpload` so the handler gets a typed Blob. */
	rawBlob?: boolean;
}

export interface RegisteredRoute {
	method: HTTPMethod;
	path: string;
	multipart?: boolean;
	rawBlob?: boolean;
	schema?: z.ZodTypeAny;
	responseSchema?: z.ZodTypeAny;
}

export interface RouteMatch {
	route: RegisteredRoute;
	params: Record<string, string | number>;
}

/** A `[name:number]` segment: an optionally signed decimal (no hex, exponent, blanks or Infinity). */
const NUMERIC_SEGMENT = /^-?\d+(?:\.\d+)?$/;

/** `decodeURIComponent` that keeps a malformed escape (a lone `%`) as written. */
function safeDecode(segment: string): string {
	try {
		return decodeURIComponent(segment);
	} catch {
		return segment;
	}
}

/** A typed API route contract. Subclasses own independent route registries. */
export class APIRoute<
	M extends HTTPMethod = HTTPMethod,
	P extends string = string,
	O extends z.ZodTypeAny | undefined = undefined,
	R extends z.ZodTypeAny | undefined = undefined,
> {
	static routes: RegisteredRoute[] = [];

	readonly method: M;
	readonly path: P;
	readonly schema?: O;
	readonly responseSchema?: R;
	readonly multipart: boolean;
	readonly rawBlob: boolean;

	constructor(options: APIRouteOptions<M, P, O, R>) {
		this.method = options.method;
		this.path = options.path;
		this.schema = options.schema;
		this.responseSchema = options.responseSchema;
		this.multipart = options.multipart ?? false;
		this.rawBlob = options.rawBlob ?? false;
		this.register();
	}

	static getRoutes(): readonly RegisteredRoute[] {
		return this.routes;
	}

	/** The route for `method` + `concretePath` (static routes win over parametrised ones), with its decoded params. */
	static findRoute(method: HTTPMethod, concretePath: string): RouteMatch | null {
		let bestMatch: RouteMatch | null = null;
		for (const route of this.getRoutes()) {
			if (route.method !== method) continue;
			const params = this.matchPath(concretePath, route.path);
			if (!params) continue;
			const match = { route, params };
			if (!route.path.includes("[")) return match;
			bestMatch ??= match;
		}
		return bestMatch;
	}

	/**
	 * Matches `concretePath` (as received, percent-encoded) against a route
	 * pattern and returns its params, or null when it does not match. The path
	 * is split on `/` BEFORE decoding, so an encoded `%2F` stays inside its
	 * param. Each param is decoded once; `[name:number]` must be a decimal
	 * number and is returned as one, otherwise the route does not match (the
	 * caller ends with a 404, never a handler run with NaN).
	 */
	static matchPath(concretePath: string, patternPath: string): Record<string, string | number> | null {
		const concrete = concretePath.split("/").filter(Boolean);
		const pattern = patternPath.split("/").filter(Boolean);
		if (concrete.length !== pattern.length) return null;
		const params: Record<string, string | number> = {};
		for (const [index, segment] of pattern.entries()) {
			if (!segment.startsWith("[") || !segment.endsWith("]")) {
				if (segment !== concrete[index]) return null;
				continue;
			}
			const [name, type] = segment.slice(1, -1).split(":");
			const value = safeDecode(concrete[index]);
			if (type === "number") {
				if (!NUMERIC_SEGMENT.test(value)) return null;
				params[name] = Number(value);
			} else {
				params[name] = value;
			}
		}
		return params;
	}

	/** Builds a concrete path from a pattern, encoding each param (the inverse of `matchPath`). */
	static fillParams(pattern: string, params: Record<string, unknown>): string {
		let result = pattern;
		for (const [key, value] of Object.entries(params)) {
			result = result.replace(new RegExp(`\\[${key}(?::[^\\]]+)?\\]`, "g"), encodeURIComponent(String(value)));
		}
		return result;
	}

	private register(): void {
		const constructor = this.constructor as typeof APIRoute;
		if (!Object.hasOwn(constructor, "routes")) {
			Object.defineProperty(constructor, "routes", { value: [], writable: true });
		}
		const routes = constructor.routes;
		if (routes.some((route) => route.method === this.method && route.path === this.path)) {
			throw new Error(`Duplicate API route: ${this.method} ${this.path}`);
		}
		routes.push(this);
	}
}
