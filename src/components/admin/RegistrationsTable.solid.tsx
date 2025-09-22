import { Show, createEffect, createMemo, createSignal, on, onMount, untrack } from "solid-js";
import { createStore } from "solid-js/store";
import { API, useAPI, useHydrate, type APIStore } from "../../../lib/hooks/useAPI.solid";
import { useHydrateById } from "../../../lib/hooks/useHydrateById.solid";
import { SelectedRows } from "../../../lib/hooks/useSelectedRows.solid";
import { getKeyIndex, looseStringIncludes, onElementMount } from "../../../lib/utils.client";
import type { Instruments, Registrations, Teachers } from "../../../types/entities";
import Spinner from "../other/Spinner.solid";
import {
	CompareList,
	getCompareFn,
	type SearchColumn,
	type SearchSetter,
} from "./SearchTable.solid";
import Table, { type ColumnType } from "./table/Table.solid";

import {
	onDeleteMemo,
	onDownloadExcelMemo,
	onDownloadPDFMemo,
	onModifyMemo,
	onPrintMemo,
} from "./controls/Registrations/all";
import { PREFIX } from "./controls/Registrations/helpers";
import { toggleCheckbox, toggleCheckboxes } from "./table/Row.solid";

const registrationsToTable = (
	registrations: Registrations[],
	teachers: Teachers[],
	instruments: Instruments[]
) => {
	return registrations.map((reg) => {
		const columns = Object.values(reg) as any[];
		columns[15] = ["Βυζαντινή Μουσική", "Παραδοσιακή Μουσική", "Ευρωπαϊκή Μουσική"][
			columns[15] as number
		];
		columns[16] = teachers.find((t) => t.id === columns[16])?.fullname;
		columns[17] = instruments.find((i) => i.id === columns[17])?.name;
		if (columns[19] === 0 || !columns[19]) columns[19] = null;
		if (columns[20] === 0 || !columns[20]) columns[20] = null;

		columns[22] = reg.amka;
		columns[23] = reg.pass;
		columns[24] = location.origin + "/eggrafes/?regid=" + reg.registration_url;
		return columns;
	});
};

const columns: ColumnType<Registrations> = {
	id: { type: "number", name: "Id" },
	am: { type: "number", name: "Αριθμός Μητρώου", size: 7 },
	last_name: { type: "string", name: "Επώνυμο", size: 15 },
	first_name: { type: "string", name: "Όνομα", size: 15 },
	fathers_name: { type: "string", name: "Πατρώνυμο", size: 15 },
	birth_date: { type: "date", name: "Ημερομηνία Γέννησης", size: 12 },
	road: { type: "string", name: "Οδός", size: 15 },
	number: { type: "number", name: "Αριθμός" },
	tk: { type: "number", name: "Τ.Κ." },
	region: { type: "string", name: "Δήμος/Περιοχή", size: 15 },
	telephone: { type: "string", name: "Τηλέφωνο", size: 12 },
	cellphone: { type: "string", name: "Κινητό", size: 12 },
	email: { type: "string", name: "Email", size: 20 },
	registration_year: { type: "string", name: "Σχολικό Έτος", size: 10 },
	class_year: { type: "string", name: "Έτος Φοίτησης", size: 12 },
	class_id: { type: "string", name: "Τάξη", size: 15 },
	teacher_id: { type: "string", name: "Καθηγητής", size: 15 },
	instrument_id: { type: "string", name: "Όργανο", size: 12 },
	date: { type: "date", name: "Ημερομηνία Εγγραφής", size: 12 },
	payment_amount: { type: "number", name: "Ποσό Πληρωμής", size: 8 },
	total_payment: { type: "number", name: "Σύνολο Πληρωμής", size: 8 },
	payment_date: { type: "date", name: "Ημερομηνία Πληρωμής", size: 12 },
	amka: { type: "string", name: "ΑΜΚΑ", size: 15 },
	pass: { type: "boolean", name: "Προάχθει", size: 8 },
	registration_url: { type: "link", name: "URL Εγγραφής", size: 12 },
};

const searchColumns: SearchColumn[] = [
	{ columnName: "last_name", name: "Επώνυμο", type: "string" },
	{ columnName: "first_name", name: "Όνομα", type: "string" },
	{ columnName: "am", name: "ΑΜ", type: "number" },
	{ columnName: "amka", name: "ΑΜΚΑ", type: "string" },
	{ columnName: "teacher_id", name: "Καθηγητής", type: "string" },
	{ columnName: "telephone", name: "Τηλέφωνο", type: "string" },
	{ columnName: "cellphone", name: "Κινητό", type: "string" },
	{ columnName: "email", name: "Email", type: "string" },
	{ columnName: "date", name: "Ημερομηνία Εγγραφής", type: "date" },
	{ columnName: "class_year", name: "Έτος Φοίτησης", type: "string" },
];

export default function RegistrationsTable() {
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
	const [dataLength, setDataLength] = createSignal(0);

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

	const shapedData = createMemo(() => {
		const registrations = store[API.Registrations.get];
		const teachers = store[API.Teachers.getByFullnames];
		const instruments = store[API.Instruments.get];
		if (!registrations || !teachers || !instruments) return [];
		let { columnName, value, type } = searchQuery;
		if (!columnName || !value || !type) {
			toggleCheckboxes(false);
			setDataLength(registrations.length);
			return registrationsToTable(registrations, teachers, instruments);
		}
		let searchRows = registrationsToTable(registrations, teachers, instruments);
		const columnIndex = getKeyIndex(columnName, registrations[0]);
		if (type === "number") {
			// @ts-ignore value is misstyped....
			const EqCheck = CompareList.findLast((col) => value.startsWith(col));
			const nVal = Number(value.slice((EqCheck || "").length));
			const fn = EqCheck && getCompareFn(value);
			searchRows = searchRows.filter((row) => {
				//@ts-ignore
				const nCol = Number(row[columnIndex]); //Converting to number because the column might be a stringified number
				if (fn) return fn(nCol, nVal);
				let sCol = "" + nCol;
				let sVal = "" + nVal;
				return sCol.includes(sVal) || sVal === sCol;
			});
		} else if (type === "string") {
			searchRows = searchRows.filter((r) => {
				//@ts-ignore
				const col = r[columnIndex] as string;
				if (!col) {
					// In case where there is not a value for the column
					return false;
				}
				return looseStringIncludes(col, value as string);
			});
		} else if (type === "date") {
			// @ts-ignore
			const EqCheck = CompareList.findLast((c) => value.startsWith(c));
			const fn = EqCheck && getCompareFn(value);
			value = value.replace(EqCheck || "", "");
			if (EqCheck === "=") {
				return searchRows.filter((r) => {
					//@ts-ignore
					const nCol = r[columnIndex] as number;
					const sCol = new Date(nCol).toLocaleDateString("el-GR");
					return value === sCol;
				});
			}

			let [day, month = 1, year = 1970] = value.split("/").map((x) => Number(x));
			const dVal = new Date(year, month - 1, day);
			const nVal = dVal.getTime();
			const sVal = dVal.toLocaleDateString("el-GR");
			searchRows = searchRows.filter((r) => {
				//@ts-ignore
				const nCol = r[columnIndex] as number;
				if (fn) return fn(nCol, nVal - 1);
				let sCol = new Date(nCol).toLocaleDateString("el-GR");
				return sCol.includes(sVal);
			});
		}
		toggleCheckboxes(false);
		setDataLength(searchRows.length);
		return searchRows;
	});

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
						{
							position: "bottom",
							prefix: PREFIX,
							controlGroups: [
								{ type: "pagination", pageSize: 100, dataSize: dataLength },
								{
									type: "custom",
									children: (
										<div class="pb-2 flex items-center gap-x-4">
											<button
												data-active={year() === 2023}
												class="px-2 py-1 border border-red-950 text-xl text-red-950 rounded-md transition-colors duration-200 hover:text-white hover:bg-red-900 data-[active='true']:text-white data-[active='true']:bg-red-900"
												onClick={() => setYear(2023)}>
												2023-24
											</button>
											<button
												data-active={year() === 2024}
												class="px-2 py-1 border border-red-950 text-xl text-red-950 rounded-md transition-colors duration-200 hover:text-white hover:bg-red-900 data-[active='true']:text-white data-[active='true']:bg-red-900"
												onClick={() => setYear(2024)}>
												2024-25
											</button>
											<button
												data-active={year() === 2025}
												class="px-2 py-1 border border-red-950 text-xl text-red-950 rounded-md transition-colors duration-200 hover:text-white hover:bg-red-900 data-[active='true']:text-white data-[active='true']:bg-red-900"
												onClick={() => setYear(2025)}>
												2025-26
											</button>
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
				.row[data-paid]:is(.selectedRow){
					background: linear-gradient(to right, #6FD286, calc(var(--gradient-left-offset) + 80px), rgb(254,202,202) calc(var(--gradient-left-offset) + 160px));
				}

				/* Partially-Paid rows */
				.row[data-partially-paid]:nth-of-type(odd)::before {
					background: linear-gradient(to right, #FDE85A, calc(var(--gradient-left-offset) + 80px), rgb(243,244,246) calc(var(--gradient-left-offset) + 160px));
				}
				.row[data-partially-paid]::before {
					background: linear-gradient(to right, #FDE85A, calc(var(--gradient-left-offset) + 80px), white calc(var(--gradient-left-offset) + 160px));
				}
				.row[data-partially-paid]:is(.selectedRow){
					background: linear-gradient(to right, #FDE85A, calc(var(--gradient-left-offset) + 80px), rgb(254,202,202) calc(var(--gradient-left-offset) + 160px));
				}

				/* Partially-Paid rows */
				.row[data-partially-paid]:nth-of-type(odd)::before {
					background: linear-gradient(to right, #FDE85A, calc(var(--gradient-left-offset) + 80px), rgb(243,244,246) calc(var(--gradient-left-offset) + 160px));
				}
				.row[data-partially-paid]::before {
					background: linear-gradient(to right, #FDE85A, calc(var(--gradient-left-offset) + 80px), white calc(var(--gradient-left-offset) + 160px));
				}
				.row[data-partially-paid]:is(.selectedRow){
					background: linear-gradient(to right, #FDE85A, calc(var(--gradient-left-offset) + 80px), rgb(254,202,202) calc(var(--gradient-left-offset) + 160px));
				}
				`}
			</style>
		</>
	);
}
