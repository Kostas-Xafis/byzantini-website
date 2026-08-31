import { z, treeifyError } from "astro/zod";
import { runtimeEnv } from "@env/runtime";
import type { Transaction } from "@lib/db";
import { ServerCookies } from "./cookies";
import { APIClient, type APIClientOptions, type HTTPMethod, type RouteParams } from "./APIClient";

/**
 * Server-side typed API route (ported from Isokratis, adapted):
 *
 * - handler + middleware on top of APIClient;
 * - Zod request validation (JSON or multipart-with-coercion);
 * - typed JSON responses with proper HTTP statuses;
 * - cookies passed as a ServerCookies instance and applied automatically;
 * - route modules register themselves via `new APIServer(...)`; the app's
 *   `API`/`APIEndpoints` maps are built from the same instances (see
 *   `lib/api/routes/index.ts`).
 *
 * Response envelope (kept minimal): success `{ data }` | `{ message }`,
 * errors `{ error, details? }` with 4xx/5xx status — `useAPI` unwraps it.
 */

export interface RouteContext<P extends string, O extends z.ZodTypeAny | undefined> {
	params: RouteParams<P>;
	body: O extends z.ZodObject ? z.infer<O> : never;
	request: Request;
	cookies: ServerCookies;
	/** Env (bindings, vars, secrets) — from `cloudflare:workers`. */
	env: Record<string, any> | undefined;
}

type HandlerResponse = Response;

type Handler<P extends string, O extends z.ZodTypeAny | undefined> = (
	context: RouteContext<P, O>,
) => Promise<HandlerResponse> | HandlerResponse;

export type MiddlewareFunction = ({
	route,
	request,
	cookies,
	body,
}: {
	route: APIServer;
	request: Request;
	cookies: ServerCookies;
	body?: unknown;
}) => void | Response | Promise<void | Response>;

/** A server-only API route that adds a typed handler + middleware to APIClient. */
export class APIServer<
	M extends HTTPMethod = HTTPMethod,
	P extends string = string,
	O extends z.ZodTypeAny | undefined = undefined,
	R extends z.ZodTypeAny | undefined = undefined,
> extends APIClient<M, P, O, R> {
	readonly handler: Handler<P, O>;
	readonly middleware: MiddlewareFunction[] = [];

	constructor(route: APIClientOptions<M, P, O, R>, handler?: Handler<P, O>);
	constructor(route: APIClientOptions<M, P, O, R>, middleware: MiddlewareFunction[], handler: Handler<P, O>);
	constructor(
		route: APIClientOptions<M, P, O, R>,
		middlewareOrHandler?: MiddlewareFunction[] | Handler<P, O>,
		handler?: Handler<P, O>,
	) {
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
		const cookies = new ServerCookies(request);

		const pathname = new URL(request.url).pathname;
		const path = pathname.replace(new RegExp(`^${pathPrefix}`), "") || "/";
		const match = this.findRoute(request.method as HTTPMethod, path) as {
			route: APIServer;
			params: Record<string, string>;
		} | null;
		if (!match) return this.redirect("/404", HTTP.FOUND);

		// Body parsing — ALWAYS (handlers may read the raw body even without a schema)
		let body: unknown = undefined;
		const schema = match.route.schema as z.ZodTypeAny | undefined;
		try {
			if (match.route.rawBlob) {
				body = await request.blob();
			} else if (match.route.multipart) {
				body = await request.formData().then((fd) => this.formDataToObject(fd));
			} else {
				const text = await request.clone().text();
				body = text ? JSON.parse(text) : undefined;
			}
		} catch {
			return this.jsonError("Invalid request body", HTTP.BAD_REQUEST);
		}
		if (schema) {
			const result = await schema.safeParseAsync(body);
			if (!result.success) {
				return new Response(JSON.stringify({ error: "Invalid request body", details: treeifyError(result.error) }), {
					status: HTTP.BAD_REQUEST,
					headers: { "Content-Type": "application/json" },
				});
			}
			body = result.data;
		}

		for (const middleware of match.route.middleware) {
			const result = await middleware({
				route: match.route,
				request,
				cookies,
				body,
			});
			if (result instanceof Response) return this.validateResponse(cookies.apply(result), match.route.responseSchema);
		}

		let response = await match.route.handler({
			params: match.params,
			body,
			request,
			cookies,
			env: runtimeEnv,
		} as never);

		response = cookies.apply(response);
		return this.validateResponse(response, match.route.responseSchema);
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

	private static async validateResponse(response: Response, schema: z.ZodTypeAny | undefined): Promise<Response> {
		if (!schema || !response.ok) return response;
		let body: unknown;
		try {
			body = await response.clone().json();
		} catch {
			return this.invalidResponse("Response body must be valid JSON");
		}
		// The success envelope is `{ data }` — validate + TRANSFORM the inner payload
		// against responseSchema, then re-emit the parsed data (the wire payload
		// keeps DB-level nulls otherwise, e.g. image: null → undefined).
		const wrapped = body && typeof body === "object" && "data" in (body as any);
		const payload = wrapped ? (body as any).data : body;
		const result = await schema.safeParseAsync(payload);
		if (!result.success) return this.invalidResponse("Response body does not match its schema", result.error);
		const serialized = JSON.stringify(wrapped ? { data: result.data } : result.data);
		return new Response(serialized, { status: response.status, headers: response.headers });
	}

	private static invalidResponse(message: string, error?: z.ZodError): Response {
		return new Response(JSON.stringify({ error: message, ...(error && { details: treeifyError(error) }) }), {
			status: HTTP.INTERNAL_SERVER_ERROR,
			headers: { "Content-Type": "application/json" },
		});
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
 * Handler-result helper mirroring the old `execTryCatch` semantics:
 * - `fn.length === 1` → runs inside the D1 transaction shim (executeTransaction);
 * - string result → `{ message }`; other results → `{ data }`;
 * - throws → 500 `{ error }` (logs the original error).
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
	} catch (error: any) {
		console.log(error);
		return APIServer.jsonError((errorMessage ? errorMessage + " " : "") + (error instanceof Error ? error.message : error), HTTP.INTERNAL_SERVER_ERROR);
	}
}
