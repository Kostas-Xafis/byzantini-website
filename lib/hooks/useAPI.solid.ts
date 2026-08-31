import { API, APIEndpoints, type APIArgs, type APIEndpointNames, type APIResponse } from "@routes/index.client";
import { ActionEnum } from "@components/admin/table/TableControlTypes";
import { objToFormData } from "@utilities/forms";
import { convertToUrlFromArgs, getOriginFromContext } from "@utilities/url";
import { batch, createEffect, createSignal } from "solid-js";
import type { SetStoreFunction } from "solid-js/store";
import { assertOwnProp } from "../utils.server";

export type APIStore = Partial<APIResponse>;
export { API };

export type StoreMutation<T extends APIEndpointNames> = {
	endpoint?: T;
	foreignKey?: keyof APIResponse[T];
	sort?: "ascending" | "descending";
	ids: number[];
	type: ActionEnum;
};

/**
 * Solid version of useAPI — Phase 4 envelope: the server returns
 * `{ data }` | `{ message }` | `{ error }` with proper status codes.
 */
export const useAPI =
	(setStore?: SetStoreFunction<APIStore>) =>
	async <T extends APIEndpointNames>(endpoint: T, req?: APIArgs[T], { Mutations }: { toFormData?: boolean; Mutations?: StoreMutation<T> } = {}) => {
		// useAPI of solid will only ever be called in a client context, so it's safe to get the origin from the window location.
		const origin = getOriginFromContext();
		const Route = APIEndpoints[endpoint] as (typeof APIEndpoints)[T];
		try {
			let fetcher: ReturnType<typeof fetch>;
			if (req === undefined) {
				fetcher = fetch(`${origin}/api${Route.path}`, { method: Route.method });
			} else {
				assertOwnProp(req, "RequestObject");
				assertOwnProp(req, "UrlArgs");
				if (Route.validation) {
					Route.validation.parse(req.RequestObject);
					if (Route.multipart) {
						req.RequestObject = objToFormData(req.RequestObject as any);
					}
				}
				const { RequestObject, UrlArgs } = req;
				const IsBlob = RequestObject instanceof Blob;
				const body = (IsBlob || Route.multipart ? RequestObject : (RequestObject && JSON.stringify(RequestObject)) || null) as any;
				fetcher = fetch(`${origin}/api${convertToUrlFromArgs(Route.path, UrlArgs)}`, {
					method: Route.method,
					headers: Route.multipart
						? {}
						: {
								"Content-Type": (IsBlob && RequestObject.type) || "application/json",
							},
					body,
				});
			}
			const response = (await (await fetcher).json()) as any;
			if (response && typeof response === "object" && "error" in response) {
				throw Error(response.error);
			}
			if (response && typeof response === "object" && "message" in response) {
				setStore && setStore(response.message as any);
				return { message: response.message };
			}
			const data = (response as any)?.data as APIResponse[T] | undefined;
			if (setStore && data !== undefined) {
				if (Mutations && Mutations.endpoint) {
					// If a mutation is assigned then do an in place replacement of the data in the store.
					if (Mutations.type === ActionEnum.ADD) {
						setStore(Mutations.endpoint as APIEndpointNames, (prev: any) => {
							if (!data) return prev;

							const isArr = Array.isArray(data);
							let prevData = (prev as any[]) || [];
							let result = isArr ? [...prevData, ...(data as any[])] : [...prevData, data as any];
							if (Mutations.sort === "descending") result.unshift(result.pop());

							return result;
						});
					} else {
						setStore(Mutations.endpoint as APIEndpointNames, (prev: any) => {
							if (!data) return prev;

							let prevData = (prev as any[]) || [];
							let accessor = Mutations.foreignKey || "id";
							prevData = prevData.filter((item) => !Mutations.ids.includes(item[accessor]));
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
				} else setStore(endpoint, data);
			}
			return { data };
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
