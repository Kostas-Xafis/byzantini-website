import {
	API,
	type APIStore,
	createHydration,
	useAPI,
} from "../../../lib/hooks/useAPI.solid";
import Table, { type ColumnType } from "./table/Table.solid";
import { createMemo, Show } from "solid-js";
import { createStore } from "solid-js/store";
import Spinner from "../Spinner.solid";
import { SelectedItemsContext } from "./table/SelectedRowContext.solid";

type TotalsTable = {
	total_payments: number;
	total_school_payoffs: number;
	total_registrations: number;
};

export default function TotalsTable() {
	const [store, setStore] = createStore<APIStore>({});
	createHydration(() => {
		useAPI(setStore, API.Payments.getTotal, {});
		useAPI(setStore, API.Payoffs.getTotal, {});
		useAPI(setStore, API.Registrations.getTotal, {});
	});

	const columnNames: ColumnType<TotalsTable> = {
		total_payments: {
			type: "number",
			name: "Συνολικές Οφειλές Μαθητών",
			size: () => 20,
		},
		total_school_payoffs: {
			type: "number",
			name: "Συνολικές Οφειλές Σχολής",
			size: () => 20,
		},
		total_registrations: {
			type: "number",
			name: "Συνολικές Εγγραφές",
			size: () => 18,
		},
	};

	let shapedData = createMemo(() => {
		const payments = store[API.Payments.getTotal];
		const payoffs = store[API.Payoffs.getTotal];
		const registrations = store[API.Registrations.getTotal];
		if (!payments || !payoffs || !registrations) return [];
		return [
			[payments.total + "€", payoffs.total + "€", registrations.total],
		];
	});
	return (
		<SelectedItemsContext.Provider value={[[], {}]}>
			<Show
				when={
					store[API.Payoffs.getTotal] &&
					store[API.Payments.getTotal] &&
					store[API.Registrations.getTotal]
				}
				fallback={<Spinner />}
			>
				<Table data={shapedData} columns={columnNames}>
					<div></div>
				</Table>
			</Show>
		</SelectedItemsContext.Provider>
	);
}
