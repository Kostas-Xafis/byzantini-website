import { batch, createEffect, createSignal, untrack } from "solid-js";
import { API as api, type APIArgs, APIEndpoints, type APIRes } from "../routes/index.client";
import type { SetStoreFunction } from "solid-js/store";
import { parse } from "valibot";
import { ActionEnum } from "../../src/components/admin/table/TableControls.solid";
import { convertUrlFromArgs } from "../utils.client";
type APIEndpointKey = keyof typeof APIEndpoints;
export type APIStore = {
	[K in APIEndpointKey]?: Extract<APIRes[K]["res"], { type: "data"; }>["data"];
};
type APIStoreValue<Key extends keyof APIStore> = APIStore[Key];


export const API = api;

// IMPORTANT: The useAPI can be called from the server or the client.
// To accurately determine the URL, I prepend the website url to the request when called from the server.
const URL = (import.meta.env.URL as string) ?? "";

type StoreMutation = {
	mutatedEndpoint?: APIEndpointKey,
	mutation: number[];
	mutationType: ActionEnum;
};

export const useAPI = async<T extends APIEndpointKey>(endpoint: T, req: APIArgs[T], setStore?: SetStoreFunction<APIStore>, StoreMut?: StoreMutation) => {
	const Route = APIEndpoints[endpoint];
	if ("validation" in Route && Route.validation && req.RequestObject) {
		parse(Route.validation, req.RequestObject);
	}
	const url = URL + "/api" + (req.UrlArgs ? convertUrlFromArgs(Route.path, req.UrlArgs) : Route.path);
	const { RequestObject } = req;
	const body = RequestObject instanceof Blob ? RequestObject : (RequestObject && JSON.stringify(RequestObject)) || null;
	try {
		const res = await fetch(url, {
			method: Route.method,
			headers: {
				"Content-Type": (RequestObject instanceof Blob && RequestObject.type) || "application/json"
			},
			body
		});
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
			if (StoreMut && StoreMut.mutatedEndpoint) {
				setStore(StoreMut.mutatedEndpoint as APIEndpointKey, (prev) => {
					let data = response.data;
					if (!data) return prev;
					const isArr = Array.isArray(data);
					let prevData = prev as any[] || [];
					if (StoreMut.mutationType === ActionEnum.ADD)
						return isArr ? [...prevData, ...(response.data as any[])] : [...prevData, response.data];

					if (Array.isArray(data)) {
						return prevData.map(item => StoreMut.mutation.includes(item.id) ? (data as any[]).find(d => d.id === item.id) || item : item);
					} else {
						return prevData.map(item => StoreMut.mutation.includes(item.id) ? response.data : item);
					}
				});
			} else setStore(endpoint, response.data as APIStoreValue<T>);
		}
		return { data: response.data as APIStoreValue<T> };
	} catch (err) {
		setStore && setStore(endpoint, err as any);
		console.error(err);
		throw new Error(JSON.stringify(err as {}));
	}
};

export const useHydrate = (func: () => void) => {
	const [hydrate, setHydrate] = createSignal<boolean>(false, { equals: (prev, next) => false });
	createEffect(() => {
		hydrate();
		untrack(() => batch(func));
	});
	return setHydrate;
};
