import { API, type APIStore, createHydration, useAPI } from "../../../lib/hooks/useAPI.solid";
import Table from "./table/Table.solid";
import { createMemo, Show } from "solid-js";
import { createStore } from "solid-js/store";
import Spinner from "../Spinner.solid";
import { type ContextType, SelectedItemsContext } from "./table/SelectedRowContext.solid";

type TotalsTable = {
	total_payments: number;
	total_school_payoffs: number;
	total_registrations: number;
};

type ColumnType<T> = Record<keyof T, string | { name: string; size: () => number }>;

export default function TotalsTable() {
	const [store, setStore] = createStore<APIStore>({});
	createHydration(() => {
		useAPI(setStore, API.Payments.getTotal, {});
		useAPI(setStore, API.Payoffs.getTotal, {});
		useAPI(setStore, API.Registrations.getTotal, {});
	});

	const columnNames: ColumnType<TotalsTable> = {
		total_payments: { name: "Συνολικές Οφειλές Μαθητών", size: () => 14 },
		total_school_payoffs: { name: "Συνολικά Οφειλές Σχολής", size: () => 14 },
		total_registrations: { name: "Συνολικές Εγγραφές", size: () => 12 }
	};

	let shapedData = createMemo(() => {
		const payments = store[API.Payments.getTotal];
		const payoffs = store[API.Payoffs.getTotal];
		const registrations = store[API.Registrations.getTotal];
		if (!payments || !payoffs || !registrations) return [];
		return [[payments.total, payoffs.total, registrations.total]];
	});
	const ROWS = [
		[],
		{
			add: (id: number) => {},
			remove: (id: number) => {},
			removeAll: () => {}
		}
	];
	return (
		<SelectedItemsContext.Provider value={ROWS as ContextType}>
			<Show
				when={store[API.Payoffs.getTotal] && store[API.Payments.getTotal] && store[API.Registrations.getTotal]}
				fallback={<Spinner />}
			>
				<Table data={shapedData} columnNames={columnNames}>
					<div></div>
				</Table>
			</Show>
		</SelectedItemsContext.Provider>
	);
}
