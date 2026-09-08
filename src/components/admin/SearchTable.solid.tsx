import type { Accessor } from "solid-js";
import { batch, createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import type { SetStoreFunction } from "solid-js/store";
import type { CellValue } from "./table/Row.solid";
import { ALL_COLUMNS } from "./table/searchMatch";

export type SearchColumn = {
	columnName: string;
	name: string;
	type: CellValue;
};
export type SearchSetter = Partial<{
	columnName: string | typeof ALL_COLUMNS;
	value: string;
	type: CellValue;
}>;

type SearchTableProps = {
	/** Reactive store holding the active query (read here to stay in sync). */
	searchQuery: SearchSetter;
	/** Store setter for the active query. */
	setSearchQuery: SetStoreFunction<SearchSetter>;
	columns: SearchColumn[];
	/** Number of rows matching the active query (shown next to the input). */
	resultsCount?: Accessor<number>;
	/** Total rows without a query (shown next to the results count). */
	totalCount?: Accessor<number>;
	/** Called when the user commits a query (typing debounce, enter, column change) or clears it with ("", ""). */
	onQueryChange?: (query: string, columnName: string) => void;
};

export function SearchTable(props: SearchTableProps) {
	const allColumns = createMemo<SearchColumn[]>(() => [{ columnName: ALL_COLUMNS, name: "Όλα τα πεδία", type: "string" }, ...props.columns]);
	const [column, setColumn] = createSignal<SearchColumn>(allColumns()[0], { equals: false });
	const [value, setValue] = createSignal<string>("");

	// The store is the single source of truth: keep the input AND the selected
	// column in sync with programmatic changes (deep links, year-change resets, …).
	// `lastApplied`/`lastAppliedColumn` let our own writes pass through without
	// touching the caret or resetting the picker.
	let lastApplied = "";
	let lastAppliedColumn = "";
	createEffect(() => {
		const current = props.searchQuery.value ?? "";
		if (current !== lastApplied) {
			setValue(current);
			lastApplied = current;
		}
	});
	createEffect(() => {
		const current = props.searchQuery.columnName ?? "";
		if (current === lastAppliedColumn) return;
		const next = allColumns().find((c) => c.columnName === current);
		if (next) {
			setColumn(next);
			lastAppliedColumn = current;
		}
	});

	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	onCleanup(() => clearTimeout(debounceTimer));

	const apply = (v: string, c = column()) => {
		lastApplied = v;
		lastAppliedColumn = c.columnName;
		batch(() => {
			props.setSearchQuery({ columnName: c.columnName, value: v, type: c.type });
		});
		props.onQueryChange?.(v.trim(), c.columnName);
	};

	const clear = () => {
		clearTimeout(debounceTimer);
		lastApplied = "";
		lastAppliedColumn = "";
		setValue("");
		batch(() => {
			props.setSearchQuery({ columnName: undefined, value: undefined, type: undefined });
		});
		props.onQueryChange?.("", "");
	};

	const placeholder = createMemo(() => {
		switch (column().type) {
			case "number":
				return "π.χ. 1500, >500 ή =100";
			case "date":
				return "π.χ. 05/02/2024, 02/2024 ή 2024";
			default:
				return "Αναζήτηση…";
		}
	});

	const hasActiveQuery = () => !!props.searchQuery.value;

	return (
		<div class="flex flex-wrap items-center justify-center gap-x-2 max-sm:gap-y-2 rounded-lg border-2 border-red-900 bg-white/50 px-3 max-sm:mx-4 py-1.5 shadow-md shadow-gray-300 dark:border-red-800 dark:bg-dark dark:shadow-gray-700">
			<i class="fa-solid fa-magnifying-glass text-red-900 drop-shadow-md dark:text-red-200" aria-hidden="true"></i>
			<select
				aria-label="Στήλη αναζήτησης"
				class="max-w-[14rem] cursor-pointer rounded-md bg-red-300 px-2 py-1 text-sm font-bold text-red-900 shadow-md focus-visible:outline-hidden dark:bg-red-900 dark:text-red-50 dark:shadow-gray-800"
				onChange={(e) => {
					const colName = e.currentTarget.value;
					const next = allColumns().find((c) => c.columnName === colName);
					if (!next) return;
					setColumn(next);
					clearTimeout(debounceTimer);
					apply(value(), next);
				}}>
				<For each={allColumns()}>
					{(c) => (
						<option value={c.columnName} selected={c.columnName === column().columnName}>
							{c.name}
						</option>
					)}
				</For>
			</select>
			<input
				class="w-48 max-sm:w-40 rounded-md bg-white px-3 py-1.5 font-didact text-base text-red-950 shadow-md shadow-gray-300 focus:shadow-lg focus-visible:outline-hidden dark:bg-dark dark:text-red-50 dark:shadow-gray-700"
				type="text"
				name="search"
				autocomplete="off"
				spellcheck="false"
				placeholder={placeholder()}
				aria-label="Αναζήτηση"
				value={value()}
				onInput={(e) => {
					const v = e.currentTarget.value;
					setValue(v);
					clearTimeout(debounceTimer);
					debounceTimer = setTimeout(() => apply(v), 250);
				}}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						clearTimeout(debounceTimer);
						apply(value());
					} else if (e.key === "Escape") {
						clear();
					}
				}}
			/>
			<Show when={hasActiveQuery() || value()}>
				<span class="whitespace-nowrap font-didact text-sm text-red-950 dark:text-red-100" aria-live="polite">
					{props.resultsCount?.() ?? 0}
					{props.totalCount ? <span class="opacity-70"> / {props.totalCount()}</span> : null}
				</span>
			</Show>
			<Show when={value()}>
				<button
					type="button"
					aria-label="Καθαρισμός αναζήτησης"
					class="grid h-6 w-6 place-items-center rounded-full text-red-900 transition-colors hover:bg-red-200 dark:text-red-200 dark:hover:bg-red-900/70"
					onClick={clear}>
					<i class="fa-solid fa-xmark text-sm leading-none" aria-hidden="true"></i>
				</button>
			</Show>
		</div>
	);
}
