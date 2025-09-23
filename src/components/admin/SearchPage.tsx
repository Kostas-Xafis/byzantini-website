import { Show, createEffect, createSignal, on, onMount, untrack } from "solid-js";
import { createStore } from "solid-js/store";
import { API, useAPI, useHydrate, type APIStore } from "../../../lib/hooks/useAPI.solid";
import { useHydrateById } from "../../../lib/hooks/useHydrateById.solid";
import { SelectedRows } from "../../../lib/hooks/useSelectedRows.solid";
import { onElementMount } from "../../../lib/utilities/dom";
import type { Registrations } from "../../../types/entities";
import Spinner from "../other/Spinner.solid";
import { type SearchSetter } from "./SearchTable.solid";
import Table from "./table/Table.solid";

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

export default function SearchPage() {
	const selectedItems = new SelectedRows().useSelectedRows();
	const [searchQuery, setSearchQuery] = createStore<SearchSetter<Registrations>>({});

	const [year, setYear] = createSignal(new Date().getFullYear());
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
		apiHook(API.Registrations.get, { UrlArgs: { year: year() } });
		apiHook(API.Registrations.get);
		apiHook(API.Teachers.getByFullnames);
		apiHook(API.Instruments.get);
	});

	createEffect(
		on(year, (y) => {
			apiHook(API.Registrations.get, { UrlArgs: { year: y } });
		})
	);

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
					const payment_status = registration.total_payment - registration.payment_amount;
					if (registration.payment_amount === 0 && registration.total_payment === 0)
						continue;
					if (payment_status <= 0) {
						row.setAttribute("data-paid", "");
					} else if (
						payment_status > 0 ||
						(registration.payment_amount > registration.total_payment &&
							registration.total_payment === 0)
					) {
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
				when={
					store[API.Registrations.get] &&
					store[API.Teachers.getByFullnames] &&
					store[API.Instruments.get]
				}
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
					]}
				/>
			</Show>
		</>
	);
}
