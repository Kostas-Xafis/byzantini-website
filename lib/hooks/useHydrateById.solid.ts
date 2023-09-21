import type { SetStoreFunction } from "solid-js/store";
import { ActionEnum } from "../../src/components/admin/table/TableControls.solid";
import { useAPI, type APIStore } from "./useAPI.solid";
import { createEffect, createSignal, on } from "solid-js";

export function useHydrateById(setStore: SetStoreFunction<APIStore>, mutationAccessEndpoint: keyof APIStore, mutatedEndpoint: keyof APIStore) {
	const [actionPressed, setActionPressed] = createSignal<{
		action: ActionEnum;
		mutate: number[]; //Array of mutated ids
		mutatedEndpoint?: keyof APIStore; // In case that the endpoint is different from the mutateEndpoint needs to be mutated
	}>(
		{ action: ActionEnum.NONE, mutate: [] },
		{
			equals: false,
		}
	);

	const hydrateById = (muts: number[], mutationType: ActionEnum) => {
		useAPI(
			setStore,
			mutationAccessEndpoint,
			{ RequestObject: muts },
			{
				mutation: muts,
				mutationType,
				mutatedEndpoint: actionPressed().mutatedEndpoint || mutatedEndpoint,
			}
		);
	};

	createEffect(
		on(actionPressed, ({ action, mutate, mutatedEndpoint: mutEndpoint }) => {
			if (action === ActionEnum.NONE || action === ActionEnum.DOWNLOAD)
				return;
			if (action === ActionEnum.DELETE) {
				return setStore(mutEndpoint || mutatedEndpoint, (prev) => {
					if (!prev) return;
					return (prev as any[]).filter((item) => !mutate.includes(item.id));
				});
			}
			hydrateById(mutate, action);
			document.dispatchEvent(new Event("RemoveAllRows"));
		})
	);

	return [actionPressed, setActionPressed] as const;
}
