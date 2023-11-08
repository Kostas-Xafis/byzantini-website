import type { SetStoreFunction } from "solid-js/store";
import { ActionEnum } from "../../src/components/admin/table/TableControlTypes";
import { useAPI, type APIStore } from "./useAPI.solid";
import { createEffect, createSignal, on } from "solid-js";
import { TypeEffectEnum, selectedRowsEvent } from "./useSelectedRows.solid";

export function useHydrateById(setStore: SetStoreFunction<APIStore>, mutationAccessEndpoint: keyof APIStore, mutatedEndpoint: keyof APIStore) {
	const [actionPressed, setActionPressed] = createSignal<{
		action: ActionEnum;
		// mutations: { endpoint: keyof APIStore, ids: number[], primary?: boolean; }[];
		mutate: number[]; //Array of mutated ids
		mutatedEndpoint?: keyof APIStore; // In case that the endpoint is different from the mutateEndpoint needs to be mutated
	}>(
		{ action: ActionEnum.NONE, mutate: [] },
		{
			equals: false,
		}
	);
	const hydrateById = (muts: number[], mutationType: ActionEnum) => {
		const mutations = {
			endpoint: actionPressed().mutatedEndpoint || mutatedEndpoint,
			ids: muts,
			type: mutationType,
		};
		useAPI(
			mutationAccessEndpoint,
			{ RequestObject: muts },
			setStore,
			mutations
		);
	};

	createEffect(
		on(actionPressed, ({ action, mutate, mutatedEndpoint: mutEndpoint }) => {
			if (action === ActionEnum.NONE || action === ActionEnum.DOWNLOAD_PDF || action === ActionEnum.DOWNLOAD_EXCEL)
				return;
			if (action === ActionEnum.DELETE) {
				setStore(mutEndpoint || mutatedEndpoint, (prev) => {
					if (!prev) return;
					return (prev as any[]).filter((item) => !mutate.includes(item.id));
				});
			} else {
				hydrateById(mutate, action);
			}
			selectedRowsEvent({ type: TypeEffectEnum.REMOVE_ALL });
		})
	);

	return [actionPressed, setActionPressed] as const;
}
