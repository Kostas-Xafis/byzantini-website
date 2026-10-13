import type { z } from "astro/zod";

/**
 * Typed API route contract + registry (ported from Isokratis).
 *
 * Each route is an instance carrying its contract (method, path, schemas);
 * subclasses own an independent registry used by `APIServer.handle` for
 * dispatch. `APIServer` adds the handler and middleware on top.
 */
export type HTTPMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS" | "HEAD";

type StringTypeToType<S extends string> = S extends "string"
	? string
	: S extends "number"
		? number
		: S extends "bigint"
			? bigint
			: S extends "boolean"
				? boolean
				: S extends "undefined"
					? undefined
					: S extends "null"
						? null
						: unknown;

export type RouteParams<S extends string> = S extends `${infer _Start}[${infer Param}:${infer Type}]${infer Rest}`
	? { [K in Param]: StringTypeToType<Type> } & RouteParams<Rest>
	: S extends `${infer _Start}[${infer Param}]${infer Rest}`
		? { [K in Param]: string } & RouteParams<Rest>
		: {};

export interface APIRouteOptions<
	M extends HTTPMethod,
	P extends string,
	O extends z.ZodTypeAny | undefined,
	R extends z.ZodTypeAny | undefined,
> {
	method: M;
	path: P;
	schema?: O;
	responseSchema?: R;
	/** Multipart form-data request (values are coerced server-side). */
	multipart?: boolean;
	/** Multipart file upload: the request body IS the raw file (no form parsing). */
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
	params: Record<string, string>;
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

	static findRoute(method: HTTPMethod, concretePath: string): RouteMatch | null {
		let bestMatch: RouteMatch | null = null;
		for (const route of this.getRoutes()) {
			if (route.method !== method || !this.pathMatchesPattern(concretePath, route.path)) continue;
			const match = { route, params: this.pathParamsToObject(concretePath, route.path) };
			if (!route.path.includes("[")) return match;
			bestMatch ??= match;
		}
		return bestMatch;
	}

	static pathMatchesPattern(concretePath: string, patternPath: string): boolean {
		const concrete = concretePath.split("/").filter(Boolean);
		const pattern = patternPath.split("/").filter(Boolean);
		return (
			concrete.length === pattern.length &&
			pattern.every((segment, index) => (segment.startsWith("[") && segment.endsWith("]")) || segment === concrete[index])
		);
	}

	static pathParamsToObject(concretePath: string, patternPath: string): Record<string, string> {
		const pathSegments = concretePath.split("/").filter(Boolean);
		const patternSegments = patternPath.split("/").filter(Boolean);
		return Object.fromEntries(
			patternSegments.flatMap((segment, index) => {
				if (!segment.startsWith("[") || !segment.endsWith("]")) return [];
				return [[segment.slice(1, -1).split(":")[0], pathSegments[index]]];
			}),
		);
	}

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
