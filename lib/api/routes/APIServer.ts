import { z, treeifyError } from "astro/zod";
import { runtimeEnv } from "@env/runtime";
import type { Transaction } from "@lib/db";
import { APIError } from "./APIError";
import { ServerCookies } from "./cookies";
import { APIRoute, type APIRouteOptions, type HTTPMethod, type RouteParams } from "./APIRoute";

/**
 * Server-side typed API route (ported from Isokratis, adapted):
 *
 * - handler + middleware on top of APIRoute (the route contract + registry);
 * - Zod request validation (JSON or multipart-with-coercion);
 * - typed JSON responses with proper HTTP statuses;
 * - cookies passed as a ServerCookies instance and applied automatically;
 * - route modules register themselves via `new APIServer(...)`; the app's
 *   `API`/`APIEndpoints` maps are built from the same instances (see
 *   `lib/api/routes/index.ts`).
 *
 * Response envelope (kept minimal): success `{ data }` | `{ message }`,
 * errors `{ error, details? }` with 4xx/5xx status — `useAPI` unwraps it.
 *
 * Errors: handlers throw `APIError` for expected failures (its message and
 * status reach the caller); anything else is logged with `console.error` and
 * answered with a generic 500, so raw D1/SQL/stack text never leaves the
 * server. Every response from `handle` is JSON, including unknown paths (404)
 * and known paths called with another method (405 + `Allow`).
 */

/** Public message of an unexpected (500) failure when the route gives no message of its own. */
export const SERVER_ERROR_MESSAGE = "Σφάλμα διακομιστή";
/** Body that is not valid JSON/multipart or fails the route schema (`details` carries the issues). */
export const INVALID_BODY_MESSAGE = "Invalid request body";
export const ROUTE_NOT_FOUND_MESSAGE = "Η διαδρομή δεν βρέθηκε";
export const METHOD_NOT_ALLOWED_MESSAGE = "Η μέθοδος δεν επιτρέπεται για αυτή τη διαδρομή";

export interface RouteContext<P extends string, O extends z.ZodTypeAny | undefined> {
	/** Decoded path params; `[name:number]` is already a number (see `APIRoute.matchPath`). */
	params: RouteParams<P>;
	/**
	 * The body as parsed by the route's `schema` (any Zod type: object, array,
	 * `z_BlobUpload` for `rawBlob` uploads, …). Without a schema it is `unknown`:
	 * a handler that reads the body must declare a schema for it.
	 */
	body: O extends z.ZodTypeAny ? z.output<O> : unknown;
	request: Request;
	cookies: ServerCookies;
	/** Env (bindings, vars, secrets) — from `cloudflare:workers`. */
	env: Record<string, any> | undefined;
}

type HandlerResponse = Response;

type Handler<P extends string, O extends z.ZodTypeAny | undefined> = (context: RouteContext<P, O>) => Promise<HandlerResponse> | HandlerResponse;

/**
 * Runs before the body is read and validated (auth, rate limits), so an
 * anonymous caller gets a 401, never a validation report. Return a Response to
 * short-circuit, or throw an `APIError`.
 */
export type MiddlewareFunction = ({
	route,
	request,
	cookies,
}: {
	route: APIServer;
	request: Request;
	cookies: ServerCookies;
}) => void | Response | Promise<void | Response>;

/** A server-only API route that adds a typed handler + middleware to APIRoute. */
export class APIServer<
	M extends HTTPMethod = HTTPMethod,
	P extends string = string,
	O extends z.ZodTypeAny | undefined = undefined,
	R extends z.ZodTypeAny | undefined = undefined,
> extends APIRoute<M, P, O, R> {
	readonly handler: Handler<P, O>;
	readonly middleware: MiddlewareFunction[] = [];
	/** The endpoint key (`Books.post`), set by the registry (`lib/api/routes/index.ts`). */
	endpoint?: string;

	/**
	 * Called after every successful non-GET request (the registry installs the activity log,
	 * `lib/activity/record.server.ts`). It never fails or delays the answer beyond its own await: errors
	 * are logged and swallowed.
	 */
	static afterWrite?: (write: { route: APIServer; params: Record<string, string | number>; body: unknown; cookies: ServerCookies }) => Promise<void>;

	/**
	 * Hook for unexpected failures — every 5xx `handle` answers, plus a failed `afterWrite` — installed by the
	 * registry (`lib/errors/record.server.ts`, the «Σφάλματα» log). Awaited before the answer leaves, so the
	 * Workers runtime cannot cancel it; it must not throw.
	 */
	static onServerError?: (failure: { route: APIServer; request: Request; status: number; error: unknown }) => Promise<void>;

	/** The error behind a 500 built by `errorResponse` / `validateResponse`, for `onServerError`. */
	private static failures = new WeakMap<Response, unknown>();

	constructor(route: APIRouteOptions<M, P, O, R>, handler?: Handler<P, O>);
	constructor(route: APIRouteOptions<M, P, O, R>, middleware: MiddlewareFunction[], handler: Handler<P, O>);
	constructor(route: APIRouteOptions<M, P, O, R>, middlewareOrHandler?: MiddlewareFunction[] | Handler<P, O>, handler?: Handler<P, O>) {
		super({
			method: route.method,
			path: route.path,
			schema: route.schema,
			responseSchema: route.responseSchema,
			multipart: route.multipart,
			rawBlob: route.rawBlob,
		});
		if (Array.isArray(middlewareOrHandler)) {
			this.middleware = middlewareOrHandler;
			this.handler = handler!;
		} else {
			this.middleware = [];
			this.handler = middlewareOrHandler ?? (async () => APIServer.jsonError("Handler not implemented", 501));
		}
	}

	static async handle(request: Request, pathPrefix = "/api"): Promise<Response> {
		const method = request.method.toUpperCase() as HTTPMethod;
		const pathname = new URL(request.url).pathname;
		const path = pathname.replace(new RegExp(`^${pathPrefix}`), "") || "/";
		const match = this.findRoute(method, path) as {
			route: APIServer;
			params: Record<string, string | number>;
		} | null;
		if (!match) {
			await discardBody(request);
			const allowed = this.allowedMethods(path);
			if (allowed.length === 0) return this.jsonError(ROUTE_NOT_FOUND_MESSAGE, HTTP.NOT_FOUND);
			const response = this.jsonError(METHOD_NOT_ALLOWED_MESSAGE, HTTP.METHOD_NOT_ALLOWED);
			response.headers.set("Allow", allowed.join(", "));
			return response;
		}

		const { route, params } = match;
		const context = `${method} ${path}`;
		const cookies = new ServerCookies(request);
		// Every answer leaves through here: a 5xx is reported to `onServerError` first.
		const finish = async (response: Response) => {
			if (response.status >= 500 && this.onServerError) {
				// A route that answers a 5xx itself (e.g. an upstream worker failed) has no exception: keep its public message.
				let error = this.failures.get(response);
				if (error === undefined) {
					const body = (await response
						.clone()
						.json()
						.catch(() => null)) as { error?: string } | null;
					error = new Error(`HTTP ${response.status}${body?.error ? `: ${body.error}` : ""}`);
				}
				await this.onServerError({ route, request, status: response.status, error }).catch(() => {});
			}
			return response;
		};
		try {
			// Middleware first: an anonymous or rate-limited caller is turned away before its body is read.
			for (const middleware of route.middleware) {
				const result = await middleware({ route, request, cookies });
				if (result instanceof Response) {
					await discardBody(request);
					return await finish(await this.validateResponse(cookies.apply(result), route.responseSchema, context));
				}
			}

			// Body parsing — ALWAYS (a schemaless handler still receives it, typed `unknown`)
			let body: unknown = undefined;
			try {
				if (route.rawBlob) {
					body = await request.blob();
				} else if (route.multipart) {
					body = await request.formData().then((fd) => this.formDataToObject(fd));
				} else {
					const text = await request.clone().text();
					body = text ? JSON.parse(text) : undefined;
				}
			} catch {
				return this.jsonError(INVALID_BODY_MESSAGE, HTTP.BAD_REQUEST);
			}
			const schema = route.schema as z.ZodTypeAny | undefined;
			if (schema) {
				const result = await schema.safeParseAsync(body);
				if (!result.success) return this.json({ error: INVALID_BODY_MESSAGE, details: treeifyError(result.error) }, HTTP.BAD_REQUEST);
				body = result.data;
			}

			const response = await route.handler({
				params,
				body,
				request,
				cookies,
				env: runtimeEnv,
			} as never);
			if (method !== "GET" && response.ok && this.afterWrite) {
				await this.afterWrite({ route, params, body, cookies }).catch(async (error) => {
					console.error(`[api] ${context}: afterWrite failed`, error);
					await this.onServerError?.({ route, request, status: response.status, error: new Error("afterWrite failed", { cause: error }) });
				});
			}
			return await finish(await this.validateResponse(cookies.apply(response), route.responseSchema, context));
		} catch (error) {
			// Handlers without `handlerResult`, middleware and body/response parsing end up here.
			return await finish(cookies.apply(this.errorResponse(error, SERVER_ERROR_MESSAGE, context)));
		}
	}

	/** The methods registered for `concretePath` — the `Allow` header of a 405. */
	static allowedMethods(concretePath: string): HTTPMethod[] {
		const methods = this.getRoutes()
			.filter((route) => this.matchPath(concretePath, route.path) !== null)
			.map((route) => route.method);
		return [...new Set(methods)];
	}

	/**
	 * The error envelope for anything thrown while serving a request:
	 * - `APIError` → its status and public message (+ `details`);
	 * - a Zod error → 400 with the treeified issues;
	 * - anything else → logged with `console.error`, answered with `publicMessage` and a 500.
	 */
	static errorResponse(error: unknown, publicMessage = SERVER_ERROR_MESSAGE, context?: string): Response {
		if (error instanceof APIError) {
			return this.json({ error: error.message, ...(error.details !== undefined && { details: error.details }) }, error.status);
		}
		if (error instanceof z.core.$ZodError) {
			return this.json({ error: INVALID_BODY_MESSAGE, details: treeifyError(error) }, HTTP.BAD_REQUEST);
		}
		console.error(`[api] ${context ?? publicMessage}:`, error);
		const response = this.jsonError(publicMessage, HTTP.INTERNAL_SERVER_ERROR);
		this.failures.set(response, error);
		return response;
	}

	/**
	 * Multipart body → object with type coercion.
	 *
	 * Mirrors the old `formDataToObject` (marker entries emitted by
	 * `objToFormData`: "number", "boolean", "null", "undefined", "object" are
	 * the first entry, the value is the second) and additionally coerces plain
	 * numeric/boolean strings — fixes the long-standing multipart number
	 * validation bug ("Μη έγκυρο announcement_id").
	 */
	private static formDataToObject(formData: FormData): Record<string, any> {
		const obj: Record<string, any> = {};
		formData.forEach((value, key) => {
			let val: any = value;
			if (obj[key] === undefined) {
				// first value — keep as-is (string/File)
			} else if (obj[key] === "number") val = Number(value);
			else if (obj[key] === "boolean") val = value === "true";
			else if (obj[key] === "null") val = null;
			else if (obj[key] === "undefined") val = undefined;
			else if (obj[key] === "object") val = JSON.parse(value as any);
			obj[key] = val;
		});
		// Belt & braces: coerce numeric/boolean strings for marker-less multipart clients
		for (const key of Object.keys(obj)) {
			const value = obj[key];
			if (typeof value === "string" && value.trim() !== "") {
				if (/^-?\d+$/.test(value.trim())) obj[key] = Number(value);
				else if (value.trim() === "true") obj[key] = true;
				else if (value.trim() === "false") obj[key] = false;
			}
		}
		return obj;
	}

	/** A response that breaks its schema is a server bug: logged, and answered with the generic 500. */
	private static async validateResponse(response: Response, schema: z.ZodTypeAny | undefined, context: string): Promise<Response> {
		if (!schema || !response.ok) return response;
		let body: unknown;
		try {
			body = await response.clone().json();
		} catch (error) {
			return this.errorResponse(new Error("Response body must be valid JSON", { cause: error }), SERVER_ERROR_MESSAGE, context);
		}
		// The success envelope is `{ data }` — validate + TRANSFORM the inner payload
		// against responseSchema, then re-emit the parsed data (the wire payload
		// keeps DB-level nulls otherwise, e.g. image: null → undefined).
		const wrapped = body && typeof body === "object" && "data" in (body as any);
		const payload = wrapped ? (body as any).data : body;
		const result = await schema.safeParseAsync(payload);
		if (!result.success) {
			console.error(`[api] ${context}: response does not match its schema`, JSON.stringify(treeifyError(result.error)));
			const failed = this.jsonError(SERVER_ERROR_MESSAGE, HTTP.INTERNAL_SERVER_ERROR);
			this.failures.set(failed, new Error("The response does not match its schema"));
			return failed;
		}
		const serialized = JSON.stringify(wrapped ? { data: result.data } : result.data);
		return new Response(serialized, { status: response.status, headers: response.headers });
	}

	static response(status: number, body?: string, headers?: Record<string, string>): Response {
		return new Response(body ?? null, { status, headers });
	}

	static json<T>(data: T, status: number = HTTP.OK): Response {
		return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
	}

	/** Success envelope for plain data (kept for useAPI compat). */
	static jsonData<T>(data: T, status: number = HTTP.OK): Response {
		return this.json({ data }, status);
	}

	static jsonMessage(message: string, status: number = HTTP.OK): Response {
		return this.json({ message }, status);
	}

	static jsonError(message: string, status: number = HTTP.BAD_REQUEST): Response {
		return this.json({ error: message }, status);
	}

	static redirect(url: string, status: number = HTTP.FOUND): Response {
		return new Response(null, { status, headers: { Location: url } });
	}
}

/** HTTP status codes as named constants. */
export const HTTP = {
	OK: 200,
	CREATED: 201,
	ACCEPTED: 202,
	NO_CONTENT: 204,
	MOVED_PERMANENTLY: 301,
	FOUND: 302,
	SEE_OTHER: 303,
	NOT_MODIFIED: 304,
	TEMPORARY_REDIRECT: 307,
	PERMANENT_REDIRECT: 308,
	BAD_REQUEST: 400,
	UNAUTHORIZED: 401,
	FORBIDDEN: 403,
	NOT_FOUND: 404,
	METHOD_NOT_ALLOWED: 405,
	CONFLICT: 409,
	GONE: 410,
	PAYLOAD_TOO_LARGE: 413,
	UNSUPPORTED_MEDIA_TYPE: 415,
	UNPROCESSABLE_ENTITY: 422,
	TOO_MANY_REQUESTS: 429,
	INTERNAL_SERVER_ERROR: 500,
	NOT_IMPLEMENTED: 501,
	BAD_GATEWAY: 502,
	SERVICE_UNAVAILABLE: 503,
	GATEWAY_TIMEOUT: 504,
} as const;

export type HTTPStatus = (typeof HTTP)[keyof typeof HTTP];

/**
 * Reads to the end a request body the route never read (unknown path, wrong method, refused by
 * middleware). In local dev, miniflare forwards even a body-less DELETE as a body stream; answering
 * without consuming it left the connection unusable and the NEXT request on it failed with "socket
 * connection was closed unexpectedly" (~6% of requests after a body-less DELETE that got a 401).
 * `body.cancel()` does not fix it; reading does. The client has already sent the bytes either way.
 */
async function discardBody(request: Request) {
	if (request.body && !request.bodyUsed) await request.arrayBuffer().catch(() => {});
}

/**
 * Handler-result helper mirroring the old `execTryCatch` semantics:
 * - `fn.length === 1` → runs inside the D1 transaction shim (executeTransaction);
 * - string result → `{ message }`; other results → `{ data }`;
 * - throws → `APIServer.errorResponse`: an `APIError` keeps its status and
 *   message; anything else is logged and answered with a 500 carrying
 *   `errorMessage` (the route's Greek "Σφάλμα κατά …") or the generic
 *   `SERVER_ERROR_MESSAGE` — never the raw error text.
 */
export async function handlerResult<T>(fn: ((t: Transaction) => Promise<T | string>) | (() => Promise<T | string>), errorMessage?: string): Promise<Response> {
	try {
		let response: T | string;
		if (fn.length === 1) {
			const { executeTransaction } = await import("@lib/utils.server");
			response = await executeTransaction(fn as (t: Transaction) => Promise<T | string>);
		} else {
			response = await (fn as () => Promise<T | string>)();
		}
		if (typeof response === "string") return APIServer.jsonMessage(response);
		return APIServer.jsonData(response);
	} catch (error) {
		return APIServer.errorResponse(error, errorMessage ?? SERVER_ERROR_MESSAGE);
	}
}
