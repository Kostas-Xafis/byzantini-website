import type { DefaultEndpointResponse } from "@_types/routes";
import { APIEndpoints, type APIArgs, type APIEndpointNames, type APIResponse } from "@routes/index.client";
import { objToFormData } from "@utilities/forms";
import { convertToUrlFromArgs, getOriginFromContext } from "@utilities/url";
import { parse } from "valibot";

/**
 * Type-level assertion that `req` carries the `RequestObject`/`UrlArgs` properties.
 *
 * The `APIArgs` machinery removes nullish members from the arg object, so the
 * properties are not statically guaranteed. This is duplicated from
 * `lib/utils.server.ts` on purpose: importing that module here would pull
 * server-side code (env, db) into the client bundle.
 */
function assertRequestArgs<T extends APIEndpointNames>(req: APIArgs[T]): asserts req is APIArgs[T] & Record<"RequestObject" | "UrlArgs", unknown> {}

/**
 * Successful transport result, discriminated by the route contract.
 * Message endpoints (no data payload) resolve to `{ message }`.
 */
export type APICallResult<T> = { data: T } | { message: string };

/**
 * Framework-free, typed transport for the internal API.
 *
 * This is the fetch half of the legacy `useAPI` hook (`lib/hooks/useAPI.solid.ts`),
 * extracted with all state management removed: it does not write to any store,
 * does not cache, and does not require a reactive scope. Call it from anywhere
 * on the client (Solid components, plain event handlers, scripts).
 *
 * Behavior:
 * - Re-validates the payload client-side against the endpoint's Valibot contract.
 * - Converts the payload to `FormData` for `multipart` endpoints.
 * - Resolves `{ data }` or `{ message }` according to the route contract.
 * - Throws on network errors and on server `error` responses; errors are the
 *   caller's responsibility (e.g. `createAPIResource` surfaces them via
 *   `resource.error`).
 *
 * @param endpoint A typed endpoint key (e.g. `API.Teachers.get`).
 * @param req      Optional `{ RequestObject?, UrlArgs? }` payload; omit for plain GETs.
 */
export const apiCall = async <T extends APIEndpointNames>(endpoint: T, req?: APIArgs[T]): Promise<APICallResult<APIResponse[T]>> => {
	// Client-only usage, so the origin always comes from the window location.
	const origin = getOriginFromContext();
	const Route = APIEndpoints[endpoint];

	let fetcher: Promise<Response>;
	if (req === undefined) {
		fetcher = fetch(`${origin}/api${Route.path}`, { method: Route.method });
	} else {
		assertRequestArgs(req);
		if (Route.validation) parse(Route.validation, req.RequestObject);

		// Work on a local copy so the caller's request object is never mutated.
		let RequestObject = req.RequestObject;
		if (Route.multipart && RequestObject) {
			RequestObject = objToFormData(RequestObject as any) as any;
		}

		const IsBlob = RequestObject instanceof Blob;
		const body = (IsBlob || Route.multipart ? RequestObject : (RequestObject && JSON.stringify(RequestObject)) || null) as any;
		fetcher = fetch(`${origin}/api${convertToUrlFromArgs(Route.path, req.UrlArgs)}`, {
			method: Route.method,
			headers: Route.multipart
				? {}
				: {
						"Content-Type": (IsBlob && (RequestObject as Blob).type) || "application/json",
					},
			body,
		});
	}

	const { res: response } = (await (await fetcher).json()) as DefaultEndpointResponse;
	if (response.type === "error") {
		throw new Error(response.error);
	}
	if (response.type === "message") {
		return { message: response.message };
	}
	return { data: response.data as APIResponse[T] };
};
