import { buildAPIRequest, readAPIResponse, type APICallResult } from "@lib/api/transport";
import { APIEndpoints, type APIArgs, type APIEndpointNames, type APIResponse } from "@routes/index.client";
import { getOriginFromContext } from "@utilities/url";

export { APIRequestError, validationMessages, type APICallResult, type ValidationTree } from "@lib/api/transport";

/**
 * Framework-free, typed browser transport for the internal API — the one client transport.
 *
 * It does not write to any store, does not cache, and does not require a reactive scope: call it from
 * anywhere on the client (Solid components, plain event handlers, Astro `<script>`s). For a cached or
 * reactive variant see `useAPIClient` / `createAPIResource`. Server code (Astro frontmatter) uses
 * `useAPI` from `@hooks/useAPI.server`, which dispatches in-process instead.
 *
 * Behavior:
 * - Converts the payload to `FormData` for `multipart` endpoints and never mutates the caller's request.
 * - Resolves `{ data }` or `{ message }` according to the server envelope (see `APIServer.handle`).
 * - Throws `APIRequestError` (`status`, and `details` for validation failures) when the server answers
 *   with a non-2xx status or an `{ error }` envelope; a network failure rejects with fetch's own error
 *   (no `status`), so the two stay distinguishable.
 *
 * Request validation is server-side only: the browser bundle carries the generated route contract
 * (`lib/api/contract.ts` — method, path, multipart), never the Zod schemas. Invalid input comes back
 * as a 400 whose `details` maps fields to messages.
 *
 * @param endpoint A typed endpoint key (e.g. `API.Teachers.get`).
 * @param req      Optional `{ RequestObject?, UrlArgs? }` payload; omit for plain GETs.
 */
export const apiCall = async <T extends APIEndpointNames>(endpoint: T, req?: APIArgs[T]): Promise<APICallResult<APIResponse[T]>> => {
	// Client-only usage, so the origin always comes from the window location.
	const { path, init } = buildAPIRequest(APIEndpoints[endpoint], req);
	const response = await fetch(`${getOriginFromContext()}/api${path}`, init);
	return readAPIResponse<APIResponse[T]>(response);
};
