import type { SetStoreFunction } from "solid-js/store";
import type { APIArgs, APIEndpointNames, APIResponse } from "@routes/index.client";
import { apiCall, type APICallResult } from "./apiCall";
import type { APIResourceStore } from "./createAPIResource.solid";

/**
 * The imperative fetch function used by components and table controls:
 * `apiCall` plus an optional shared cache.
 * - Writes to the store only when the response carries data (never error
 *   objects, never message strings).
 * - Rejects exactly like `apiCall` (`APIRequestError` when the server answered).
 */
export type APIClient = <T extends APIEndpointNames>(endpoint: T, req?: APIArgs[T]) => Promise<APICallResult<APIResponse[T]>>;

/**
 * Creates an `APIClient` bound to an optional shared cache (`APIResourceStore`).
 * Pass a `SetStoreFunction` to cache successful data responses under their
 * endpoint key; omit it for plain, uncached calls.
 */
export const useAPIClient = (setStore?: SetStoreFunction<APIResourceStore>): APIClient => {
	return async (endpoint, req) => {
		const res = await apiCall(endpoint, req);
		if (setStore && "data" in res) setStore(endpoint, res.data);
		return res;
	};
};
