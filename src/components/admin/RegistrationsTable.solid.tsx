import { createAPIResource, type APIResourceStore } from "@hooks/createAPIResource.solid";
import { useAPIClient } from "@hooks/useAPIClient.solid";
import { useCacheMutations } from "@hooks/useCacheMutations.solid";
import { SelectedRows } from "@hooks/useSelectedRows.solid";
import { API } from "@routes/index.client";
import { useSearchParams } from "@solidjs/router";
import { For, Show, createEffect, createSignal, onCleanup, onMount, untrack } from "solid-js";
import { createStore } from "solid-js/store";
import Spinner from "../other/Spinner.solid";
import { type SearchSetter } from "./SearchTable.solid";
import { ALL_COLUMNS } from "./table/searchMatch";
import Table from "./table/Table.solid";

import { onElementMount } from "@utilities/dom";
import { ALL_YEARS } from "@lib/pupils/years";
import {
	columnIndexOf,
	columns,
	onDeleteMemo,
	onDownloadExcelMemo,
	onDownloadPDFMemo,
	onModifyMemo,
	onPaymentMemo,
	onPrintMemo,
	reshapeData,
	searchColumns,
} from "./controls/Registrations/all";
import { PREFIX } from "./controls/Registrations/helpers";
import type { JoinedEnrollments } from "@_types/entities";
import { EVALUATION_BADGE } from "@lib/classYears";
import { toggleCheckbox } from "./table/Row.solid";

const PAID_LABEL = "Πληρωμένη";
const PARTIALLY_PAID_LABEL = "Μερική πληρωμή";

/**
 * Mirrors the row's colour-coded payment state as text for people who cannot
 * rely on colour: hover title, the select button's accessible name and the
 * generated "✓"/"◐" glyph (see the style block at the bottom).
 */
const setPaymentCue = (row: HTMLElement, label: string | null) => {
	if (label) {
		row.setAttribute("title", label);
	} else {
		row.removeAttribute("title");
	}
	const selectBtn = row.querySelector<HTMLElement>(".cb button");
	if (!selectBtn) return;
	const base = (selectBtn.dataset.baseLabel ??= selectBtn.getAttribute("aria-label") ?? "Επιλογή εγγραφής");
	selectBtn.setAttribute("aria-label", label ? `${base} (${label})` : base);
};

const FEE_DECOR = "data-fee-decor";
const CLASS_YEAR_CELL = columnIndexOf("class_year");
const TOTAL_PAYMENT_CELL = columnIndexOf("total_payment");

/**
 * The table cells are plain text (shared `Row`), so the fee cues are added on hydrate, like the payment cue:
 * a «Κατάταξη» badge on a placed evaluation row and the «Ειδική τιμή» marker on a manual total. Idempotent —
 * hydrate runs on every render, sort and page change.
 */
const setFeeCues = (row: HTMLElement, registration: JoinedEnrollments) => {
	row.querySelectorAll(`[${FEE_DECOR}]`).forEach((el) => el.remove());
	const cells = row.querySelectorAll<HTMLElement>(":scope > .cell");
	const classYearCell = cells[CLASS_YEAR_CELL];
	if (classYearCell && registration.evaluation && registration.class_year) {
		const badge = document.createElement("span");
		badge.setAttribute(FEE_DECOR, "");
		badge.title = "Εγγράφηκε με κατατακτήριες εξετάσεις";
		badge.className =
			"ml-1 inline-block whitespace-nowrap rounded-full bg-violet-100 px-1.5 text-xs font-semibold text-violet-900 dark:bg-violet-900/50 dark:text-violet-100";
		badge.textContent = EVALUATION_BADGE;
		classYearCell.appendChild(badge);
	}
	const totalCell = cells[TOTAL_PAYMENT_CELL];
	if (totalCell && registration.fee_manual) {
		const marker = document.createElement("span");
		marker.setAttribute(FEE_DECOR, "");
		marker.title = "Ειδική τιμή: ορίστηκε χειροκίνητα";
		marker.className = "ml-1 inline-block text-sm text-sky-800 dark:text-sky-200";
		const icon = document.createElement("i");
		icon.className = "fa-solid fa-hand-holding-dollar";
		icon.setAttribute("aria-hidden", "true");
		const text = document.createElement("span");
		text.className = "sr-only";
		text.textContent = "Ειδική τιμή";
		marker.appendChild(icon);
		marker.appendChild(text);
		totalCell.appendChild(marker);
	}
};

const schoolYearLabel = (registrationYear: string) => {
	const [start, end] = registrationYear.split("-");
	return `${start}-${end.slice(2)}`;
};

/**
 * Εγγραφές table: one row per enrollment, scoped by the school-year picker at
 * the bottom. The picker's `ALL_YEARS` option lifts that scope and lists every
 * enrollment, exactly as the listing route's `year` token does.
 */
export default function RegistrationsTable() {
	const selectedItems = new SelectedRows().useSelectedRows();
	const [searchQuery, setSearchQuery] = createStore<SearchSetter>({});

	// Deep-link support: /admin/registrations?year=2024&search=<query>&col=<key>.
	// URL params are read ONCE on mount (link pasting only, no live state
	// tracking); afterwards the search bar/year picker write the URL but the
	// URL never drives the UI. `year=all` opens the unconstrained listing.
	const [params, setParams] = useSearchParams();
	// Selected school year: its START year as a string ("2025"), or ALL_YEARS
	// ("all") for every year; null until the user (or the auto-select) picks one.
	const [year, setYear] = createSignal<string | null>(params.year ? String(params.year) : null);
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
				srcEndpoint: API.Pupils.getEnrollmentById,
				destEndpoint: API.Pupils.getEnrollmentsByYear,
			},
		],
	});

	createAPIResource(API.Pupils.getYears, undefined, { cache: setStore });
	createAPIResource(API.Teachers.getByFullnames, undefined, { cache: setStore });
	createAPIResource(API.Instruments.get, undefined, { cache: setStore });

	// Year-driven registrations fetch: waits while no year is selected and
	// refetches whenever the year changes (replaces the legacy on(year) fetch effect).
	// The year token doubles as the route's own: a start year, or ALL_YEARS for
	// the listing without a year constraint.
	createAPIResource(
		API.Pupils.getEnrollmentsByYear,
		() => {
			const y = year();
			return y === null ? undefined : { UrlArgs: { year: y } };
		},
		{ cache: setStore },
	);

	// Automatically select the latest available school year once known,
	// so the table opens populated without requiring a button press.
	createEffect(() => {
		const availableYears = store[API.Pupils.getYears];
		if (!availableYears) return;
		const currentYear = new Date().getFullYear();
		if (availableYears.length === 0) {
			setYears([`${currentYear}-${currentYear + 1}`]);
			if (year() === null) setYear(String(currentYear));
			return;
		}
		setYears(availableYears);
		if (year() === null) setYear(availableYears[0].split("-")[0]);
	});

	const [shapedData, dataLength] = reshapeData(store, searchQuery);

	const onModify = onModifyMemo(setRegistrationHydrate, store, selectedItems, apiHook);
	const onPayment = onPaymentMemo(setRegistrationHydrate, store, selectedItems, apiHook);
	const onDelete = onDeleteMemo(setRegistrationHydrate, store, selectedItems, apiHook);
	const onDownloadPDF = onDownloadPDFMemo(store, selectedItems);

	const onDownloadExcel = onDownloadExcelMemo(store, selectedItems);

	const onPrint = onPrintMemo(store, selectedItems);

	createEffect(() => {
		const registrations = store[API.Pupils.getEnrollmentsByYear];
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
		const onHydrate = (e: Event) => {
			e.stopPropagation();
			untrack(() => {
				let registrations = store[API.Pupils.getEnrollmentsByYear];
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
					setFeeCues(row, registration);
					row.removeAttribute("data-paid");
					row.removeAttribute("data-partially-paid");
					setPaymentCue(row, null);
					const payment_status = registration.total_payment - registration.payment_amount;
					if (registration.payment_amount === 0 && registration.total_payment === 0) continue;
					if (payment_status <= 0) {
						row.setAttribute("data-paid", "");
						setPaymentCue(row, PAID_LABEL);
					} else if (payment_status > 0 || (registration.payment_amount > registration.total_payment && registration.total_payment === 0)) {
						row.setAttribute("data-partially-paid", "");
						setPaymentCue(row, PARTIALLY_PAID_LABEL);
					}
				}
				for (let i = 0; i < selectedItems.length; i++) {
					toggleCheckbox(selectedItems[i], true);
				}
			});
		};
		document.addEventListener("hydrate", onHydrate);
		onCleanup(() => document.removeEventListener("hydrate", onHydrate));

		let disposed = false;
		let removeScrollListener: (() => void) | undefined;
		onCleanup(() => {
			disposed = true;
			removeScrollListener?.();
		});
		onElementMount("#tableContainer", (el) => {
			if (disposed) return;
			el.style.setProperty("--gradient-left-offset", "0px");
			let prevOffset = 0;
			const onScroll = () => {
				if (el.scrollLeft === prevOffset) return;
				el.style.setProperty("--gradient-left-offset", el.scrollLeft + "px");
			};
			el.addEventListener("scroll", onScroll);
			removeScrollListener = () => el.removeEventListener("scroll", onScroll);
		});
	});

	return (
		<>
			<Show when={store[API.Pupils.getEnrollmentsByYear]} fallback={<Spinner classes="max-sm:h-[100svh]" />}>
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
								{ controls: [onModify, onPayment, onDelete] },
								{ controls: [onDownloadExcel, onDownloadPDF, onPrint] },
								{
									type: "search",
									columns: searchColumns,
									searchQuery,
									setSearchQuery,
									resultsCount: dataLength,
									totalCount: () => store[API.Pupils.getEnrollmentsByYear]?.length ?? 0,
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
												class="px-2 py-1 border border-red-950 text-xl text-red-950 rounded-md transition-colors duration-200 hover:bg-red-900 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-900 dark:focus-visible:outline-red-300 dark:border-red-700 dark:text-red-50 dark:hover:bg-red-800"
												onChange={(e) => {
													const value = e.currentTarget.value;
													if (value === "") return;
													setYear(value);
													setSearchQuery({}); // Year change resets the search
													// and clears both URL query params so links stay accurate.
													setParams({ year: value, search: undefined, col: undefined });
												}}>
												<Show when={year() === null}>
													<option value="" selected></option>
												</Show>
												{/* Widest scope first, like the search control's "Όλα τα πεδία". */}
												<option value={ALL_YEARS} selected={year() === ALL_YEARS}>
													Όλα τα έτη
												</option>
												<For each={years()}>
													{(schoolYear) => {
														const startYear = schoolYear.split("-")[0];
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
				/* Text cue for the payment colour: a glyph in the row's right padding (alt text after the slash is read aloud). */
				.row[data-paid]::after,
				.row[data-partially-paid]::after {
					position: absolute;
					top: 50%;
					right: 0.4rem;
					transform: translateY(-50%);
					font-size: 0.95rem;
					line-height: 1;
					color: rgb(23, 23, 23);
				}
				html.dark .row[data-paid]::after,
				html.dark .row[data-partially-paid]::after {
					color: rgb(245, 245, 245);
				}
				.row[data-paid]::after {
					content: "✓" / "${PAID_LABEL}";
				}
				.row[data-partially-paid]::after {
					content: "◐" / "${PARTIALLY_PAID_LABEL}";
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
