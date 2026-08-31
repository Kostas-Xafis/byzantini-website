import type { z } from "astro/zod";

/**
 * Browser-safe typed API route (ported from Isokratis).
 *
 * Each route is an instance; subclasses own an independent registry used by
 * `APIServer.handle` for dispatch and by the app's `useAPI`-based helpers.
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

type RouteBody<O> = O extends z.ZodTypeAny ? z.infer<O> : never;
type RouteResponse<R> = R extends z.ZodTypeAny ? z.infer<R> : unknown;
type RouteCallOptions<P extends string, O> = (keyof RouteParams<P> extends never ? { params?: never } : { params: RouteParams<P> }) &
	([RouteBody<O>] extends [never] ? { body?: never } : { body: RouteBody<O> });
type RouteCallArgs<P extends string, O> = keyof RouteParams<P> extends never
	? [RouteBody<O>] extends [never]
		? [options?: RouteCallOptions<P, O>]
		: [options: RouteCallOptions<P, O>]
	: [options: RouteCallOptions<P, O>];

export interface APIClientOptions<
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

/** A browser-safe typed API route. Subclasses own independent route registries. */
export class APIClient<
	M extends HTTPMethod = HTTPMethod,
	P extends string = string,
	O extends z.ZodTypeAny | undefined = undefined,
	R extends z.ZodTypeAny | undefined = undefined,
> {
	static baseUrl = "/api";
	static routes: RegisteredRoute[] = [];

	readonly method: M;
	readonly path: P;
	readonly schema?: O;
	readonly responseSchema?: R;
	readonly multipart: boolean;
	readonly rawBlob: boolean;

	constructor(options: APIClientOptions<M, P, O, R>) {
		this.method = options.method;
		this.path = options.path;
		this.schema = options.schema;
		this.responseSchema = options.responseSchema;
		this.multipart = options.multipart ?? false;
		this.rawBlob = options.rawBlob ?? false;
		this.register();
	}

	/** Call this route with compile-time checked parameters and request body. */
	async call(...[options]: RouteCallArgs<P, O>): Promise<RouteResponse<R>> {
		const path = APIClient.fillParams(this.path, (options?.params ?? {}) as Record<string, unknown>);
		const baseUrl = (this.constructor as typeof APIClient).baseUrl;

		const isMultipart = this.multipart;
		let body: BodyInit | undefined;
		let headers: Record<string, string> = {};

		if (options?.body !== undefined) {
			if (isMultipart && typeof FormData !== "undefined") {
				body = this.toFormData(options.body as Record<string, unknown>);
			} else {
				headers["Content-Type"] = "application/json";
				body = JSON.stringify(options.body);
			}
		}

		const response = await fetch(`${baseUrl}${path}`, {
			method: this.method,
			headers,
			body,
		});

		if (!response.ok) {
			const error = await response.json().catch(() => ({}));
			throw new Error(`API ${this.method} ${path} failed (${response.status}): ${JSON.stringify(error)}`);
		}
		if (response.status === 204) return undefined as RouteResponse<R>;

		const data: unknown = await response.json();
		return this.responseSchema ? (this.responseSchema.parse(data) as RouteResponse<R>) : (data as RouteResponse<R>);
	}

	/** Encode a body for multipart requests (mirrors `objToFormData` in @utilities/forms). */
	toFormData(obj: Record<string, unknown>): FormData {
		const fd = new FormData();
		Object.entries(obj).forEach(([key, value]) => {
			if (value instanceof Object && !(value instanceof Blob)) {
				fd.append(key, "object");
				fd.append(key, JSON.stringify(value));
				return;
			}
			if (typeof value === "number") fd.append(key, "number");
			else if (typeof value === "boolean") fd.append(key, "boolean");
			else if (value === null) fd.append(key, "null");
			else if (value === undefined) fd.append(key, "undefined");
			fd.append(key, value as string | Blob);
		});
		return fd;
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
		const constructor = this.constructor as typeof APIClient;
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
