/**
 * Request/response codec for the internal API, shared by the browser transport (`lib/hooks/apiCall.ts`)
 * and the server's in-process caller (`lib/hooks/useAPI.server.ts`), so both build requests and read the
 * `{ data } | { message } | { error, details? }` envelope (see `APIServer.handle`) the same way.
 *
 * Environment-agnostic and browser-safe: no server imports, no origin handling.
 */
import { assertOwnProp } from "@utilities/assert";
import { objToFormData } from "@utilities/forms";
import { convertToUrlFromArgs } from "@utilities/url";

/** What the codec needs to know about a route (an entry of the generated contract `lib/api/contract.ts`). */
export interface APIRequestRoute {
	method: string;
	path: string;
	multipart: boolean;
}

/** A successful call: `{ data }`, or `{ message }` for endpoints that only report what they did. */
export type APICallResult<T> = { data: T } | { message: string };

/**
 * Zod's `treeifyError` output, which the server attaches as `details` to 400 "Invalid request body"
 * responses: messages for the whole body in `errors`, per field under `properties` (nested objects
 * recurse), per array index under `items`.
 */
export interface ValidationTree {
	errors: string[];
	properties?: Record<string, ValidationTree | undefined>;
	items?: (ValidationTree | undefined)[];
}

/**
 * The server answered, but not with success: a non-2xx status or an `{ error }` envelope.
 *
 * A network failure (offline, DNS, CORS) is NOT an `APIRequestError` — `fetch` rejects with its own
 * `TypeError`, so `err instanceof APIRequestError` tells "the server said no" from "we never reached it".
 */
export class APIRequestError extends Error {
	override readonly name = "APIRequestError";
	/** HTTP status of the response. */
	readonly status: number;
	/** Per-field validation messages (400 responses from request validation). */
	readonly details?: ValidationTree;
	/**
	 * True when the body was the API's JSON error envelope, so `message` is the server's own text.
	 * False for anything else (an HTML error page from the platform, an empty or non-JSON body).
	 */
	readonly envelope: boolean;

	constructor(status: number, message: string, { details, envelope = true }: { details?: ValidationTree; envelope?: boolean } = {}) {
		super(message);
		this.status = status;
		this.details = details;
		this.envelope = envelope;
	}
}

/** Every message in a validation tree, depth-first and de-duplicated. */
export function validationMessages(tree: ValidationTree | undefined): string[] {
	const messages = new Set<string>();
	const walk = (node: ValidationTree | undefined) => {
		if (!node) return;
		node.errors?.forEach((message) => messages.add(message));
		Object.values(node.properties ?? {}).forEach(walk);
		node.items?.forEach(walk);
	};
	walk(tree);
	return [...messages];
}

/**
 * Path (relative to `/api`) and `RequestInit` for one call. The caller's request object is never mutated.
 *
 * - no `req`: a bare request — no headers, no body;
 * - `multipart` routes: the body becomes `FormData` (with the `objToFormData` type markers);
 * - a `Blob` body (`rawBlob` uploads) is sent as-is with its own content type;
 * - anything else is JSON.
 */
export function buildAPIRequest(route: APIRequestRoute, req?: object): { path: string; init: RequestInit } {
	if (req === undefined) return { path: route.path, init: { method: route.method } };
	assertOwnProp(req, "RequestObject");
	assertOwnProp(req, "UrlArgs");

	let requestObject = req.RequestObject;
	if (route.multipart && requestObject) requestObject = objToFormData(requestObject as Record<string, unknown>);

	const isBlob = requestObject instanceof Blob;
	const body = (isBlob || route.multipart ? requestObject : (requestObject && JSON.stringify(requestObject)) || null) as BodyInit | null;
	const headers: Record<string, string> = route.multipart ? {} : { "Content-Type": (isBlob && (requestObject as Blob).type) || "application/json" };
	return { path: convertToUrlFromArgs(route.path, req.UrlArgs ?? {}), init: { method: route.method, headers, body } };
}

/** Unwraps the response envelope; throws `APIRequestError` for `{ error }` envelopes and non-2xx/non-JSON responses. */
export async function readAPIResponse<T>(response: Response): Promise<APICallResult<T>> {
	let body: unknown;
	try {
		body = await response.json();
	} catch {
		throw new APIRequestError(response.status, `Μη αναμενόμενη απάντηση από τον διακομιστή (HTTP ${response.status}).`, { envelope: false });
	}
	const envelope = body && typeof body === "object" ? (body as { data?: T; message?: unknown; error?: unknown; details?: ValidationTree }) : undefined;
	if (envelope && "error" in envelope) {
		const message = typeof envelope.error === "string" ? envelope.error : JSON.stringify(envelope.error);
		throw new APIRequestError(response.status, message, { details: envelope.details });
	}
	if (!response.ok) {
		throw new APIRequestError(response.status, `Μη αναμενόμενη απάντηση από τον διακομιστή (HTTP ${response.status}).`, { envelope: false });
	}
	if (envelope && "message" in envelope) return { message: envelope.message as string };
	return { data: envelope?.data as T };
}
