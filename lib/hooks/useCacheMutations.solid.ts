import { ActionEnum } from "@components/admin/table/TableControlTypes";
import { APIEndpoints, type APIArgs, type APIEndpointNames } from "@routes/index.client";
import { batch, createEffect, createSignal, on, type Setter } from "solid-js";
import type { SetStoreFunction } from "solid-js/store";
import { apiCall } from "./apiCall";
import type { APIResourceStore } from "./createAPIResource.solid";
import { selectedRowsEvent, TypeEffectEnum } from "./useSelectedRows.solid";

/**
 * Declares how one cache key (`destEndpoint`) is kept in sync after a row
 * action: rows are fetched again from `srcEndpoint` (a get-by-id endpoint)
 * and merged into the cache, replacing the affected ids.
 */
export type CacheMutation = {
	/** Get-by-id endpoint whose result is merged into the cache. */
	srcEndpoint: APIEndpointNames;
	/** Cache key to patch. */
	destEndpoint: keyof APIResourceStore;
	/** Field of the cached rows that carries the matching id (defaults to `id`). */
	foreignKey?: string;
};

export type CacheHydrateById =
	| { action: ActionEnum.NONE }
	| { action: ActionEnum.DELETE; ids: number[] }
	| { action: ActionEnum.ADD; id: number }
	| { action: ActionEnum.MODIFY | ActionEnum.CHECK; ids: number[]; isMultiple: true }
	| { action: ActionEnum.MODIFY | ActionEnum.CHECK; id: number; isMultiple: false };

export type CacheMutationsReturnType = Setter<CacheHydrateById>;

/**
 * Replacement for the legacy `useHydrateById` (`lib/hooks/useHydrateById.solid.ts`),
 * rebuilt on `apiCall`. Public API is identical: pass the cache setter and the
 * mutation declarations, get back a trigger setter.
 *
 * Semantics:
 * - `DELETE`: removes the ids from every declared `destEndpoint` locally —
 *   no network round-trip (same as before).
 * - `ADD` / `MODIFY` / `CHECK`: re-fetches the affected rows via `srcEndpoint`
 *   and merges them into `destEndpoint`, replacing any rows with the same ids,
 *   then sorts by the key field (descending first when `sort` is set).
 *   The legacy distinction between append (ADD) and replace (MODIFY) is
 *   normalized into one idempotent replace+merge, which is equivalent for
 *   monotonically increasing ids.
 * - Clears the selected rows after every non-`NONE` trigger (same as before).
 */
export function useCacheMutations(args: { setStore: SetStoreFunction<APIResourceStore>; mutations: CacheMutation[]; sort?: "ascending" | "descending" }) {
	const { setStore, mutations, sort } = args;
	const [hydration, setHydration] = createSignal<CacheHydrateById>({ action: ActionEnum.NONE }, { equals: false });

	const hydrateById = (event: CacheHydrateById) => {
		if (event.action === ActionEnum.NONE) return;

		if (event.action === ActionEnum.DELETE) {
			batch(() => {
				mutations.forEach((mut) => {
					setStore(mut.destEndpoint, (prev: any) => {
						if (!prev) return prev;
						return (prev as any[]).filter((item) => !event.ids.includes(mut.foreignKey ? item[mut.foreignKey] : item.id));
					});
				});
			});
			return;
		}

		let ids: number[];
		let isSingle: boolean;
		if (event.action === ActionEnum.ADD) {
			ids = [event.id];
			isSingle = true;
		} else if (event.isMultiple) {
			ids = event.ids;
			isSingle = false;
		} else {
			ids = [event.id];
			isSingle = true;
		}

		mutations.forEach((mut) => {
			const src = APIEndpoints[mut.srcEndpoint];
			// Single-id requests go through URL args (`id: [id]` stringifies to
			// the bare id, same quirk as the legacy hook); bulk requests use the body.
			const req = (
				isSingle ? (src.hasUrlParams ? { UrlArgs: { id: ids } } : { RequestObject: ids }) : { RequestObject: ids }
			) as APIArgs[APIEndpointNames];

			apiCall(mut.srcEndpoint, req as any).then((res) => {
				if (!("data" in res)) return;
				const data = res.data as any;
				setStore(mut.destEndpoint, (prev: any) => {
					const prevData = (prev as any[]) || [];
					const accessor = mut.foreignKey || "id";
					const merged = prevData.filter((item) => !ids.includes(item[accessor]));
					if (Array.isArray(data)) merged.push(...data);
					else merged.push(data);
					if (sort === "descending") return merged.sort((a, b) => b[accessor] - a[accessor]);
					return merged.sort((a, b) => a[accessor] - b[accessor]);
				});
			});
		});
	};

	createEffect(
		on(hydration, (event) => {
			hydrateById(event);
			if (event.action !== ActionEnum.NONE) {
				selectedRowsEvent({ type: TypeEffectEnum.REMOVE_ALL });
			}
		}),
	);

	return setHydration;
}
