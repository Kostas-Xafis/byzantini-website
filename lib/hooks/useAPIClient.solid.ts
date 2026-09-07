import type { SetStoreFunction } from "solid-js/store";
import type { APIArgs, APIEndpointNames, APIResponse } from "@routes/index.client";
import { apiCall, type APICallResult } from "./apiCall";
import type { APIResourceStore } from "./createAPIResource.solid";

/**
 * The imperative fetch function used by components and table controls.
 *
 * Same calling convention as the legacy `apiHook(endpoint, req?)`
 * (`lib/hooks/useAPI.solid.ts`), rebuilt on `apiCall`, with the hidden
 * behavior removed:
 * - Writes to the store only when the response carries data (never error
 *   objects, never message strings).
 * - Drops the legacy `Mutations` cache-surgery option entirely.
 */
export type APIClient = <T extends APIEndpointNames>(endpoint: T, req?: APIArgs[T]) => Promise<APICallResult<APIResponse[T]>>;

/**
 * Creates an `APIClient` bound to an optional shared cache (`APIResourceStore`).
 * Pass a `SetStoreFunction` to mirror the legacy caching behavior
 * (successful data responses land under their endpoint key); omit it for
 * plain, uncached calls.
 */
export const useAPIClient = (setStore?: SetStoreFunction<APIResourceStore>): APIClient => {
	return async (endpoint, req) => {
		const res = await apiCall(endpoint, req);
		if (setStore && "data" in res) setStore(endpoint, res.data);
		return res;
	};
};
