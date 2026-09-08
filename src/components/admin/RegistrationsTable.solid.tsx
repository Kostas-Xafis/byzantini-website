import { For, Show, createEffect, createSignal, onMount, untrack } from "solid-js";
import { createStore } from "solid-js/store";
import { useSearchParams } from "@solidjs/router";
import { createAPIResource, type APIResourceStore } from "@hooks/createAPIResource.solid";
import { useAPIClient } from "@hooks/useAPIClient.solid";
import { useCacheMutations } from "@hooks/useCacheMutations.solid";
import { API } from "@routes/index.client";
import { SelectedRows } from "@hooks/useSelectedRows.solid";
import type { Registrations } from "@_types/entities";
import Spinner from "../other/Spinner.solid";
import { type SearchSetter } from "./SearchTable.solid";
import { ALL_COLUMNS } from "./table/searchMatch";
import Table from "./table/Table.solid";

import { onElementMount } from "@utilities/dom";
import {
	columnIndexOf,
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
	const [searchQuery, setSearchQuery] = createStore<SearchSetter>({});

	// Deep-link support: /admin/registrations?year=2024&search=<query>&col=<key>.
	// URL params are read ONCE on mount (link pasting only, no live state
	// tracking); afterwards the search bar/year picker write the URL but the
	// URL never drives the UI.
	const [params, setParams] = useSearchParams();
	const [year, setYear] = createSignal<number | null>(params.year ? Number(params.year) : null);
	onMount(() => {
		const search = params.search;
		if (search === undefined) return;
		const col = typeof params.col === "string" ? params.col : undefined;
		const columnName = col !== undefined && columnIndexOf(col) >= 0 ? col : ALL_COLUMNS;
		setSearchQuery({ columnName, value: String(search), type: "string" });
	});
	// Mirror the user's query + column into the URL (?search=...&col=...) so
	// filtered views are shareable/reloadable (see setSearchParams semantics).
	const onQueryChange = (query: string, columnName: string) => {
		const q = query.trim();
		const col = q && columnName !== ALL_COLUMNS ? columnName : undefined;
		if (q === (params.search ?? "") && col === (params.col ?? undefined)) return;
		setParams({ search: q || undefined, col });
	};
	const [years, setYears] = createSignal<string[]>([]);
	const [store, setStore] = createStore<APIResourceStore>({});
	const apiHook = useAPIClient(setStore);
	const setRegistrationHydrate = useCacheMutations({
		setStore,
		mutations: [
			{
				srcEndpoint: API.Registrations.getById,
				destEndpoint: API.Registrations.get,
			},
		],
	});

	createAPIResource(API.Registrations.getYears, undefined, { cache: setStore });
	createAPIResource(API.Teachers.getByFullnames, undefined, { cache: setStore });
	createAPIResource(API.Instruments.get, undefined, { cache: setStore });

	// Year-driven registrations fetch: waits while no year is selected and
	// refetches whenever the year changes (replaces the legacy on(year) fetch effect).
	createAPIResource(
		API.Registrations.get,
		() => {
			const y = year();
			return y === null ? undefined : { UrlArgs: { year: y } };
		},
		{ cache: setStore },
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
								{
									type: "search",
									columns: searchColumns,
									searchQuery,
									setSearchQuery,
									resultsCount: dataLength,
									totalCount: () => store[API.Registrations.get]?.length ?? 0,
									searchToIndex: (columnName) =>
										columnName === ALL_COLUMNS ? "all" : columnIndexOf(columnName) >= 0 ? [columnIndexOf(columnName)] : undefined,
									onQueryChange,
								},
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
												class="px-2 py-1 border border-red-950 text-xl text-red-950 rounded-md transition-colors duration-200 hover:bg-red-900 hover:text-white focus-visible:outline-hidden dark:border-red-700 dark:text-red-50 dark:hover:bg-red-800"
												onChange={(e) => {
													const value = e.currentTarget.value;
													if (value === "") return;
													setYear(Number(value));
													setSearchQuery({}); // Year change resets the search
													// and clears both URL query params so links stay accurate.
													setParams({ year: Number(value), search: undefined, col: undefined });
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
