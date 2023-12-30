import { batch, createEffect, createSignal } from "solid-js";
import type { SetStoreFunction } from "solid-js/store";
import { parse } from "valibot";
import { ActionEnum } from "../../src/components/admin/table/TableControlTypes";
import { APIEndpoints, API, type APIEndpointNames, type APIArgs, type APIRes } from "../routes/index.client";
import { convertUrlFromArgs } from "../utils.client";

export type APIStore = {
	[K in keyof APIEndpointNames]?: Extract<APIRes[K]["res"], { type: "data"; }>["data"];
};
export { API };

// IMPORTANT: The useAPI can be called from the server or the client.
// To accurately determine the URL, I prepend the website url to the request when called from the server.
const URL = (import.meta.env.URL as string) ?? "";

export type StoreMutation<T extends keyof APIEndpointNames> = {
	endpoint?: T,
	foreignKey?: keyof APIStore[T],
	sort?: "ascending" | "descending",
	ids: number[];
	type: ActionEnum;
};

function assertOwnPropCheat<X extends {}, Y extends PropertyKey>(obj: X, prop: Y): asserts obj is X & Record<Y, unknown> { }

export const useAPI = (setStore?: SetStoreFunction<APIStore>) => async<T extends keyof APIEndpointNames>(endpoint: T, req?: APIArgs[T], Mutations?: StoreMutation<keyof APIEndpointNames>) => {
	const Route = APIEndpoints[endpoint];
	try {
		let fetcher: ReturnType<typeof fetch> | undefined = undefined;
		if (req === undefined) {
			const url = URL + "/api" + Route.path;
			fetcher = fetch(url, { method: Route.method });
		} else {
			assertOwnPropCheat(req, "RequestObject");
			assertOwnPropCheat(req, "UrlArgs");
			if ("validation" in Route && Route.validation) {
				parse(Route.validation, req.RequestObject);
			}
			const { RequestObject, UrlArgs } = req;
			const body = (RequestObject instanceof Blob ? RequestObject : (RequestObject && JSON.stringify(RequestObject)) || null) as any;
			fetcher = fetch(URL + "/api" + convertUrlFromArgs(Route.path, UrlArgs), {
				method: Route.method,
				headers: {
					"Content-Type": (RequestObject instanceof Blob && RequestObject.type) || "application/json"
				},
				body
			});
		}
		const res = await fetcher;
		const { res: response } = (await res.json()) as APIRes[T];
		if ("error" in response) {
			console.error(response.error);
			setStore && setStore(endpoint, response.error);
			throw new Error(JSON.stringify(response.error));
		}
		if ("message" in response) {
			setStore && setStore(response.message as any);
			return { message: response.message };
		}
		if (setStore && "data" in response) {
			if (Mutations && Mutations.endpoint) {
				// If a mutation is assigned then do an in place replacement of the data in the store.
				if (Mutations.type === ActionEnum.ADD) {
					setStore(Mutations.endpoint as keyof APIEndpointNames, (prev) => {
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
					setStore(Mutations.endpoint as keyof APIEndpointNames, (prev) => {
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
			} else setStore(endpoint, response.data as APIStore[T]);
		}
		return { data: response.data as APIStore[T] };
	} catch (err) {
		setStore && setStore(endpoint, err as any);
		console.error(err);
		throw new Error(JSON.stringify(err as {}));
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
