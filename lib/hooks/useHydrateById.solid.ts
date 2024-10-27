import { batch } from "solid-js";
import type { SetStoreFunction } from "solid-js/store";
import { ActionEnum } from "../../src/components/admin/table/TableControlTypes";
import { useAPI, type APIStore, API } from "./useAPI.solid";
import { createEffect, createSignal, on } from "solid-js";
import { TypeEffectEnum, selectedRowsEvent } from "./useSelectedRows.solid";
import { APIEndpoints } from "../routes/index.client";

type Mutation<S extends keyof APIStore> = {
	srcEndpoint: keyof APIStore; // Basically the get by id endpoint
	destEndpoint: S; // The endpoint in the store to mutate
	foreignKey?: keyof APIStore[S]; // The foreign key to match the id to
};

type HydrateById = {
	action: ActionEnum.NONE;
} | {
	action: ActionEnum.DELETE;
	ids: number[];
} | {
	action: ActionEnum.ADD;
	id: number;
} | {
	action: ActionEnum.MODIFY | ActionEnum.CHECK;
	ids: number[];
	isMultiple: true;
} | {
	action: ActionEnum.MODIFY | ActionEnum.CHECK;
	id: number;
	isMultiple: false;
};


export function useHydrateById(args: { setStore: SetStoreFunction<APIStore>, mutations: Mutation<any>[]; sort?: "ascending" | "descending"; }) {
	let { setStore, mutations, sort } = args;
	const apiHook = useAPI(setStore);
	const [hydration, setHydration] = createSignal<HydrateById>(
		{ action: ActionEnum.NONE },
		{ equals: false }
	);
	const hydrateById = (hydrate: HydrateById) => {
		if (hydrate.action === ActionEnum.NONE)
			return;
		const mutationType = hydrate.action;
		if (mutationType === ActionEnum.DELETE) {
			const ids = hydrate.ids;
			batch(() => {
				mutations.forEach((mut) => {
					setStore(mut.destEndpoint, (prev) => {
						if (!prev) return;
						return (prev as any[]).filter((item) => !ids.includes(mut.foreignKey ? item[mut.foreignKey] : item.id));
					});
				});
			});
		} else {
			if ((hydrate.action === ActionEnum.MODIFY || hydrate.action === ActionEnum.CHECK) && hydrate.isMultiple) {
				const ids = hydrate.ids;
				mutations.forEach((mut) => {
					apiHook(mut.srcEndpoint, { RequestObject: ids }, { Mutations: { sort, type: mutationType, endpoint: mut.destEndpoint, foreignKey: mut.foreignKey, ids } });
				});
			} else if ((("isMultiple" in hydrate) && !hydrate.isMultiple) || hydrate.action === ActionEnum.ADD) {
				const id = hydrate.id;
				mutations.forEach((mut) => {
					if (APIEndpoints[mut.srcEndpoint].hasUrlParams) {
						apiHook(mut.srcEndpoint, { UrlArgs: { id: [id] } }, { Mutations: { sort, type: mutationType, endpoint: mut.destEndpoint, foreignKey: mut.foreignKey, ids: [id] } });
					} else {
						apiHook(mut.srcEndpoint, { RequestObject: [id] }, { Mutations: { sort, type: mutationType, endpoint: mut.destEndpoint, foreignKey: mut.foreignKey, ids: [id] } });
					}
				});
			}
		}
	};

	createEffect(
		on(hydration, (hydrate) => {
			hydrateById(hydrate);
			if (hydrate.action !== ActionEnum.NONE) {
				selectedRowsEvent({ type: TypeEffectEnum.REMOVE_ALL });
			}
		})
	);

	return setHydration;
}
