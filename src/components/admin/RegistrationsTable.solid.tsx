import { For, Show, createEffect, createSignal, on, onMount, untrack } from "solid-js";
import { createStore } from "solid-js/store";
import { API, useAPI, useHydrate, type APIStore } from "@hooks/useAPI.solid";
import { useHydrateById } from "@hooks/useHydrateById.solid";
import { SelectedRows } from "@hooks/useSelectedRows.solid";
import type { Registrations } from "@_types/entities";
import Spinner from "../other/Spinner.solid";
import { type SearchSetter } from "./SearchTable.solid";
import Table from "./table/Table.solid";

import { onElementMount } from "@utilities/dom";
import {
	columns,
	onDeleteMemo,
	onDownloadExcelMemo,
	onDownloadPDFMemo,
	onModifyMemo,
	onPrintMemo,
	reshapeData,
	searchColumns,
} from "./controls/Registrations/all";
import { PREFIX } from "./controls/Registrations/helpers";
import { toggleCheckbox } from "./table/Row.solid";

const schoolYearLabel = (registrationYear: string) => {
	const [start, end] = registrationYear.split("-");
	return `${start}-${end.slice(2)}`;
};

export default function RegistrationsTable() {
	const selectedItems = new SelectedRows().useSelectedRows();
	const [searchQuery, setSearchQuery] = createStore<SearchSetter<Registrations>>({});

	const [year, setYear] = createSignal<number | null>(null);
	const [years, setYears] = createSignal<string[]>([]);
	const [store, setStore] = createStore<APIStore>({});
	const apiHook = useAPI(setStore);
	const setRegistrationHydrate = useHydrateById({
		setStore,
		mutations: [
			{
				srcEndpoint: API.Registrations.getById,
				destEndpoint: API.Registrations.get,
			},
		],
	});

	useHydrate(() => {
		apiHook(API.Registrations.getYears);
		apiHook(API.Teachers.getByFullnames);
		apiHook(API.Instruments.get);
	});

	createEffect(
		on(year, (y) => {
			if (y === null) return;
			setSearchQuery({}); // Reset search on year change
			apiHook(API.Registrations.get, { UrlArgs: { year: y } });
		}),
	);

	// Automatically select the latest available school year once known,
	// so the table opens populated without requiring a button press.
	createEffect(() => {
		const availableYears = store[API.Registrations.getYears];
		if (!availableYears) return;
		const currentYear = new Date().getFullYear();
		if (availableYears.length === 0) {
			setYears([`${currentYear}-${currentYear + 1}`]);
			if (year() === null) setYear(currentYear);
			return;
		}
		setYears(availableYears);
		if (year() === null) setYear(Number(availableYears[0].split("-")[0]));
	});

	const [shapedData, dataLength] = reshapeData(store, searchQuery);

	const onModify = onModifyMemo(setRegistrationHydrate, store, selectedItems, apiHook);
	const onDelete = onDeleteMemo(setRegistrationHydrate, store, selectedItems, apiHook);
	const onDownloadPDF = onDownloadPDFMemo(store, selectedItems);

	const onDownloadExcel = onDownloadExcelMemo(store, selectedItems);

	const onPrint = onPrintMemo(store, selectedItems);

	createEffect(() => {
		const registrations = store[API.Registrations.get];
		const teachers = store[API.Teachers.getByFullnames];
		const instruments = store[API.Instruments.get];
		if (!registrations || !teachers || !instruments) return;
		let { columnName, value, type } = searchQuery;
		if (!columnName || !value || !type) {
			// Make use of the variables to avoid optimization and therefore not triggering the effect when a search is made
			document.dispatchEvent(new CustomEvent("hydrate") as CustomEvent);
		} else {
			document.dispatchEvent(new CustomEvent("hydrate") as CustomEvent);
		}
	});

	onMount(() => {
		document.addEventListener("hydrate", (e) => {
			e.stopPropagation();
			untrack(() => {
				let registrations = store[API.Registrations.get];
				if (!registrations) return;
				let rows = [...document.querySelectorAll<HTMLElement>(".row[data-id]")];
				let resultArray = [];
				for (let i = 0; i < rows.length; i++) {
					const id = Number(rows[i].dataset.id);
					let reg = registrations.find((r) => r.id === id);
					if (reg) {
						resultArray.push({ row: rows[i], registration: reg });
					}
				}
				for (let i = 0; i < resultArray.length; i++) {
					const { row, registration } = resultArray[i];
					row.removeAttribute("data-paid");
					row.removeAttribute("data-partially-paid");
					const payment_status = registration.total_payment - registration.payment_amount;
					if (registration.payment_amount === 0 && registration.total_payment === 0) continue;
					if (payment_status <= 0) {
						row.setAttribute("data-paid", "");
					} else if (payment_status > 0 || (registration.payment_amount > registration.total_payment && registration.total_payment === 0)) {
						row.setAttribute("data-partially-paid", "");
					}
				}
				for (let i = 0; i < selectedItems.length; i++) {
					toggleCheckbox(selectedItems[i], true);
				}
			});
		});
		onElementMount("#tableContainer", (el) => {
			el.style.setProperty("--gradient-left-offset", "0px");
			let prevOffset = 0;
			el.addEventListener("scroll", (e) => {
				if (el.scrollLeft === prevOffset) return;
				el.style.setProperty("--gradient-left-offset", el.scrollLeft + "px");
			});
		});
	});

	return (
		<>
			<Show
				when={store[API.Registrations.get] && store[API.Teachers.getByFullnames] && store[API.Instruments.get]}
				fallback={<Spinner classes="max-sm:h-[100svh]" />}>
				<Table
					prefix={PREFIX}
					data={shapedData}
					columns={columns}
					hasSelectBox
					structure={[
						{
							position: "top",
							prefix: PREFIX,
							controlGroups: [
								{ controls: [onModify, onDelete] },
								{ controls: [onDownloadPDF, onDownloadExcel, onPrint] },
								{ type: "search", columns: searchColumns, setSearchQuery },
							],
						},
						{
							position: "bottom",
							prefix: PREFIX,
							controlGroups: [
								{ type: "pagination", pageSize: 100, dataSize: dataLength },
								{
									type: "custom",
									children: (
										<div class="pb-2 flex items-center gap-x-4">
											<select
												aria-label="Σχολική χρονιά"
												class="px-2 py-1 border border-red-950 text-xl text-red-950 rounded-md transition-colors duration-200 hover:bg-red-900 hover:text-white focus-visible:outline-none dark:border-red-700 dark:text-red-50 dark:hover:bg-red-800"
												onChange={(e) => {
													const value = e.currentTarget.value;
													if (value === "") return;
													setYear(Number(value));
												}}>
												<Show when={year() === null}>
													<option value="" selected></option>
												</Show>
												<For each={years()}>
													{(schoolYear) => {
														const startYear = Number(schoolYear.split("-")[0]);
														return (
															<option value={startYear} selected={year() === startYear}>
																{schoolYearLabel(schoolYear)}
															</option>
														);
													}}
												</For>
											</select>
										</div>
									),
								},
							],
						},
					]}
				/>
			</Show>
			{/* Registration specific row styles */}
			<style>
				{`
				#tableContainer {
					--gradient-left-offset: 0px;
				}
				/* Paid rows */
				.row[data-paid]:nth-of-type(odd)::before {
					background: linear-gradient(to right, #6FD286, calc(var(--gradient-left-offset) + 80px), rgb(243,244,246) calc(var(--gradient-left-offset) + 160px));
				}
				.row[data-paid]::before {
					background: linear-gradient(to right, #6FD286, calc(var(--gradient-left-offset) + 80px), white calc(var(--gradient-left-offset) + 160px));
				}
				html.dark .row[data-paid]:nth-of-type(odd)::before {
					background: linear-gradient(to right, #2f7a44, calc(var(--gradient-left-offset) + 80px), rgb(38, 38, 38) calc(var(--gradient-left-offset) + 160px));
				}
				html.dark .row[data-paid]::before {
					background: linear-gradient(to right, #2f7a44, calc(var(--gradient-left-offset) + 80px), rgb(30, 30, 30) calc(var(--gradient-left-offset) + 160px));
				}
				.row[data-paid]:is(.selectedRow)::before {
					background: linear-gradient(to right, #6FD286, calc(var(--gradient-left-offset) + 80px), rgb(254,202,202) calc(var(--gradient-left-offset) + 160px));
				}
				html.dark .row[data-paid]:is(.selectedRow)::before {
					background: linear-gradient(to right, #2f7a44, calc(var(--gradient-left-offset) + 80px), rgb(68, 30, 30) calc(var(--gradient-left-offset) + 160px));
				}

				/* Partially-Paid rows */
				.row[data-partially-paid]:nth-of-type(odd)::before {
					background: linear-gradient(to right, #FDE85A, calc(var(--gradient-left-offset) + 80px), rgb(243,244,246) calc(var(--gradient-left-offset) + 160px));
				}
				.row[data-partially-paid]::before {
					background: linear-gradient(to right, #FDE85A, calc(var(--gradient-left-offset) + 80px), white calc(var(--gradient-left-offset) + 160px));
				}
				html.dark .row[data-partially-paid]:nth-of-type(odd)::before {
					background: linear-gradient(to right, #8f7800, calc(var(--gradient-left-offset) + 80px), rgb(38, 38, 38) calc(var(--gradient-left-offset) + 160px));
				}
				html.dark .row[data-partially-paid]::before {
					background: linear-gradient(to right, #8f7800, calc(var(--gradient-left-offset) + 80px), rgb(30, 30, 30) calc(var(--gradient-left-offset) + 160px));
				}
				.row[data-partially-paid]:is(.selectedRow)::before {
					background: linear-gradient(to right, #FDE85A, calc(var(--gradient-left-offset) + 80px), rgb(254,202,202) calc(var(--gradient-left-offset) + 160px));
				}
				html.dark .row[data-partially-paid]:is(.selectedRow)::before {
					background: linear-gradient(to right, #8f7800, calc(var(--gradient-left-offset) + 80px), rgb(68, 30, 30) calc(var(--gradient-left-offset) + 160px));
				}
				`}
			</style>
		</>
	);
}
