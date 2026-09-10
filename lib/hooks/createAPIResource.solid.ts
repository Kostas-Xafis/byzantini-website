import { createResource, type Accessor } from "solid-js";
import type { SetStoreFunction } from "solid-js/store";
import type { APIArgs, APIEndpointNames, APIResponse } from "@routes/index.client";
import { apiCall } from "./apiCall";

/**
 * Shared reactive cache, keyed by endpoint name — the same shape as the legacy
 * `APIStore` (`lib/hooks/useAPI.solid.ts`), so existing consumers can keep
 * reading `store[API.Teachers.get]` with per-key reactivity.
 */
export type APIResourceStore = Partial<APIResponse>;

export type CreateAPIResourceOptions = {
	/**
	 * When provided, every successful data response is also written to this
	 * store under `endpoint`. Reads of that key stay fine-grained reactive.
	 *
	 * Keying is by endpoint name only (same limitation as the legacy cache):
	 * two fetches of the same endpoint with different arguments share one slot
	 * (last write wins). Use a per-component resource (no `cache`) when
	 * argument-specific isolation matters.
	 */
	cache?: SetStoreFunction<APIResourceStore>;
};

export type APIResourceResult<T extends APIEndpointNames> = ReturnType<typeof createAPIResource<T>>;

/**
 * Reactive wrapper around `apiCall`, built on Solid's `createResource`.
 *
 * Source semantics:
 * - No `source` argument: fetches once on creation, then on demand via `refetch`.
 * - With a `source` accessor: refetches whenever the accessor's return value
 *   changes; returning `undefined` skips the fetch (e.g. wait until a year is
 *   selected), and the first truthy value starts it.
 *
 * Result semantics:
 * - `resource()` holds the endpoint data (`undefined` while loading or for
 *   message-only endpoints).
 * - `resource.loading` / `resource.error` / `resource.state` behave exactly as
 *   documented for `createResource`.
 * - Errors are NOT written to the cache (unlike the legacy hook), they surface
 *   only through `resource.error`.
 *
 * @returns `[resource, { mutate, refetch }]` — the same tuple `createResource` returns.
 *
 * @example
 * const [store, setStore] = createStore<APIResourceStore>({});
 * const [teachers] = createAPIResource(API.Teachers.get, undefined, { cache: setStore });
 * // ...or arg-driven, waiting for a selected year:
 * const [registrations, { refetch }] = createAPIResource(
 *   API.Pupils.getEnrollmentsByYear,
 *   () => (year() ? { UrlArgs: { year: year()! } } : undefined),
 *   { cache: setStore },
 * );
 */
export function createAPIResource<T extends APIEndpointNames>(endpoint: T, source?: Accessor<APIArgs[T] | undefined>, options: CreateAPIResourceOptions = {}) {
	// `true` as a source value means "no arguments": fetch immediately and stay refetchable.
	const request: Accessor<APIArgs[T] | undefined | true> = source ?? (() => true);

	const fetcher = async (args: APIArgs[T] | undefined | true): Promise<APIResponse[T] | undefined> => {
		const res = await apiCall(endpoint, args === undefined || args === true ? undefined : args);
		if ("data" in res) {
			options.cache?.(endpoint, res.data);
			return res.data;
		}
		// Message-only responses carry no data to cache or expose.
		return undefined;
	};

	return createResource(request, fetcher, { name: endpoint });
}
