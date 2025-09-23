import { batch, createEffect, createSignal } from "solid-js";
import type { SetStoreFunction } from "solid-js/store";
import { parse } from "valibot";
import { ActionEnum } from "../../src/components/admin/table/TableControlTypes";
import type { DefaultEndpointResponse } from "../../types/routes";
import { API, APIEndpoints, type APIArgs, type APIEndpointNames, type APIResponse } from "../routes/index.client";
import { objToFormData } from "../utilities/forms";
import { convertToUrlFromArgs } from "../utilities/url";
import { assertOwnProp } from "../utils.server";

export type APIStore = Partial<APIResponse>;
export { API };

// IMPORTANT: The useAPI can be called from the server or the client.
// To accurately determine the URL, I prepend the website url to the request when called from the server.
const { VITE_URL = "" } = import.meta.env;

export type StoreMutation<T extends APIEndpointNames> = {
	endpoint?: T,
	foreignKey?: keyof APIResponse[T],
	sort?: "ascending" | "descending",
	ids: number[];
	type: ActionEnum;
};

export const useAPI = (setStore?: SetStoreFunction<APIStore>) => async<T extends APIEndpointNames>(endpoint: T, req?: APIArgs[T], { Mutations }: { toFormData?: boolean, Mutations?: StoreMutation<T>; } = {}) => {
	const Route = APIEndpoints[endpoint] as (typeof APIEndpoints)[T];
	try {
		let fetcher: ReturnType<typeof fetch>;
		if (req === undefined) {
			const url = VITE_URL + "/api" + Route.path;
			fetcher = fetch(url, { method: Route.method });
		} else {
			assertOwnProp(req, "RequestObject");
			assertOwnProp(req, "UrlArgs");
			if ("validation" in Route && Route.validation) {
				parse(Route.validation, req.RequestObject);
				if (Route.multipart) {
					req.RequestObject = objToFormData(req.RequestObject as any);
				}
			}
			const { RequestObject, UrlArgs } = req;
			const IsBlob = RequestObject instanceof Blob;
			const body = ((IsBlob || Route.multipart) ? RequestObject : (RequestObject && JSON.stringify(RequestObject)) || null) as any;
			fetcher = fetch(VITE_URL + "/api" + convertToUrlFromArgs(Route.path, UrlArgs), {
				method: Route.method,
				headers: Route.multipart ? {} : {
					"Content-Type": (IsBlob && RequestObject.type) || "application/json"
				},
				body,
			});
		}
		const { res: response } = (await (await fetcher).json()) as DefaultEndpointResponse;
		if (response.type === "error") {
			throw Error(response.error);
		} else if (response.type === "message") {
			setStore && setStore(response.message as any);
			return { message: response.message };
		} else if (setStore && response.type === "data") {
			if (Mutations && Mutations.endpoint) {
				// If a mutation is assigned then do an in place replacement of the data in the store.
				if (Mutations.type === ActionEnum.ADD) {
					setStore(Mutations.endpoint as APIEndpointNames, (prev: any) => {
						let data = response.data;
						if (!data) return prev;

						const isArr = Array.isArray(data);
						let prevData = prev as any[] || [];
						let result = isArr ? [...prevData, ...(response.data as any[])] : [...prevData, response.data];
						if (Mutations.sort === "descending")
							result.unshift(result.pop());

						return result;
					});
				} else {
					setStore(Mutations.endpoint as APIEndpointNames, (prev) => {
						let data = response.data;
						if (!data) return prev;

						let prevData = prev as any[] || [];
						let accessor = Mutations.foreignKey || "id";
						prevData = prevData.filter(item => !Mutations.ids.includes(item[accessor]));
						if (Array.isArray(data)) {
							prevData.push(...data);
						} else {
							prevData.push(data);
						}

						if (Mutations.sort === "descending") {
							return prevData.sort((a, b) => b[accessor] - a[accessor]);
						}
						return prevData.sort((a, b) => a[accessor] - b[accessor]);
					});
				}
				// Else do a full replacement of the data in the store.
			} else setStore(endpoint, response.data as APIResponse[T]);
		}
		return { data: response.data as APIResponse[T] };
	} catch (err) {
		setStore && setStore(endpoint, err as any);
		throw err;
	}
};

export const useHydrate = (func: () => void) => {
	const [hydrate, setHydrate] = createSignal<boolean>(true, { equals: (prev, next) => true });
	createEffect(() => {
		hydrate();
		batch(func);
	});
	return setHydrate;
};
