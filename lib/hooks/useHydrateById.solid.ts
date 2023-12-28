import { batch } from "solid-js";
import type { SetStoreFunction } from "solid-js/store";
import { ActionEnum } from "../../src/components/admin/table/TableControlTypes";
import { useAPI, type APIStore } from "./useAPI.solid";
import { createEffect, createSignal, on } from "solid-js";
import { TypeEffectEnum, selectedRowsEvent } from "./useSelectedRows.solid";

type Mutation<S extends keyof APIStore> = {
	srcEndpoint: keyof APIStore; // Basically the get by id endpoint
	destEndpoint: S; // The endpoint in the store to mutate
	foreignKey?: keyof S; // The foreign key to match the id to
};

export function useHydrateById(args: { setStore: SetStoreFunction<APIStore>, mutations: Mutation<any>[]; sort?: "ascending" | "descending"; }) {
	let { setStore, mutations, sort } = args;
	const apiHook = useAPI(setStore);
	const [actionPressed, setActionPressed] = createSignal<{
		action: ActionEnum;
		ids: number[];
	}>(
		{ action: ActionEnum.NONE, ids: [] },
		{
			equals: false,
		}
	);
	const hydrateById = (ids: number[], mutationType: ActionEnum) => {
		if (mutationType === ActionEnum.DELETE) {
			batch(() => {
				mutations.forEach((mut) => {
					setStore(mut.destEndpoint, (prev) => {
						if (!prev) return;
						return (prev as any[]).filter((item) => !ids.includes(mut.foreignKey ? item[mut.foreignKey] : item.id));
					});
				});
			});
		} else {
			mutations.forEach((mut) => {
				apiHook(mut.srcEndpoint, { RequestObject: ids }, { sort, type: mutationType, endpoint: mut.destEndpoint, foreignKey: mut.foreignKey, ids });
			});
		}
	};

	createEffect(
		on(actionPressed, ({ action, ids }) => {
			if (action === ActionEnum.NONE || action === ActionEnum.DOWNLOAD_PDF || action === ActionEnum.DOWNLOAD_EXCEL)
				return;
			hydrateById(ids, action);
			selectedRowsEvent({ type: TypeEffectEnum.REMOVE_ALL });
		})
	);

	return setActionPressed;
}
