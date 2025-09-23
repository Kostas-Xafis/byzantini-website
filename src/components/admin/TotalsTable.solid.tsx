import { Show, createMemo } from "solid-js";
import { createStore } from "solid-js/store";
import { API, useAPI, useHydrate, type APIStore } from "../../../lib/hooks/useAPI.solid";
import Spinner from "../other/Spinner.solid";
import Table, { type ColumnType } from "./table/Table.solid";

type TotalsTable = {
	total_registrations: number;
};

const firstYear = 2023;
const currentYear = new Date().getFullYear();
const years = new Array<number>(currentYear - firstYear + 1).fill(1).map((_, i) => firstYear + i);
console.log(years);
export default function TotalsTable() {
	const [store, setStore] = createStore<APIStore>({});
	const apiHook = useAPI(setStore);

	useHydrate(() => {
		apiHook(API.Registrations.getTotalByYear);
	});
	let columnNames: ColumnType<TotalsTable> = {} as any;
	for (let year of years) {
		columnNames = {
			...columnNames,
			["total_registrations_" + year]: {
				type: "number",
				name: "Σύνολο Εγγραφών " + year,
				size: 24,
			},
		};
	}

	let shapedData = createMemo(() => {
		console.log("Shaping data");
		const registrations = store[API.Registrations.getTotalByYear];
		console.log(registrations);
		if (!registrations) return [];
		let data: number[] = [];
		for (let year of years) {
			data.push(registrations[year] || 0);
		}
		console.log(data);
		return [data];
	});
	return (
		<Show
			when={store[API.Registrations.getTotalByYear]}
			fallback={<Spinner classes="max-sm:h-[100svh]" />}>
			<Table data={shapedData} columns={columnNames} />
		</Show>
	);
}
