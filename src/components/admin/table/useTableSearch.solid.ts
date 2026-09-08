import { createMemo, onMount, type Accessor } from "solid-js";
import { createStore, type SetStoreFunction } from "solid-js/store";
import { useSearchParams } from "@solidjs/router";
import { ALL_COLUMNS, cellMatches, rowMatchesAny } from "./searchMatch";
import type { SearchColumn, SearchSetter } from "../SearchTable.solid";
import type { CellValue } from "./Row.solid";

type SearchableColumn = { name: string; type: CellValue };

/**
 * Client-side table search with the shared `SearchTable` component.
 *
 * The `rows` accessor must return the already-shaped table rows (arrays whose
 * index order matches the `columns` argument). The hook takes over the search
 * query state, exposes the filtered rows, and wires up `?search=` deep links
 * (e.g. `/admin/books?search=παπαδόπουλος`).
 */
export function useTableSearch(rows: Accessor<any[]>, columns: SearchableColumn[]) {
	const [searchQuery, setSearchQuery] = createStore<SearchSetter>({});
	const types = columns.map((c) => c.type);
	const searchColumns: SearchColumn[] = columns.map(({ name, type }, index) => ({
		columnName: String(index),
		name,
		type,
	}));

	const shapedData = createMemo(() => {
		const data = rows();
		const { columnName, value, type } = searchQuery;
		if (!columnName || !value || !type) return data;
		const query = String(value).trim();
		if (!query) return data;
		// Clone the rows that survive the filter: the shared Row/For list is keyed
		// by row identity, so filtering in place (same references) would keep the
		// existing rows mounted WITHOUT re-rendering them — and the highlight
		// state (only active while searching) would never reach the DOM.
		const cloneRow = (row: any[]) => [...row];
		if (columnName === ALL_COLUMNS) return data.filter((row) => rowMatchesAny(row, types, query)).map(cloneRow);
		const index = Number(columnName);
		if (!Number.isInteger(index) || index < 0 || index >= columns.length) return data;
		return data.filter((row) => cellMatches(row[index], columns[index].type, query)).map(cloneRow);
	});

	const resultsCount = () => shapedData().length;
	const totalCount = () => rows().length;

	// Deep-link support: /admin/<page>?search=<query>&col=<column index>.
	// The URL is read ONCE on mount (link pasting only, no live state tracking);
	// afterwards the search bar writes the URL but the URL never drives the UI.
	// (col is validated; absent/invalid → all-columns mode.)
	const [params, setParams] = useSearchParams();
	onMount(() => {
		const search = params.search;
		if (search === undefined) return;
		const col = typeof params.col === "string" ? params.col : undefined;
		const index = col === undefined ? NaN : Number(col);
		const columnName = Number.isInteger(index) && index >= 0 && index < columns.length ? col : ALL_COLUMNS;
		setSearchQuery({ columnName, value: String(search), type: "string" });
	});

	// Mirror the user's query + column into the URL (?search=...&col=...) so
	// filtered views are shareable/reloadable — merges with existing params and
	// clears the keys when the query is emptied (see setSearchParams semantics).
	const onQueryChange = (query: string, columnName: string) => {
		const q = query.trim();
		const col = q && columnName !== ALL_COLUMNS ? columnName : undefined;
		if (q === (params.search ?? "") && col === (params.col ?? undefined)) return;
		setParams({ search: q || undefined, col });
	};

	// Maps a search column name to the highlighted row indexes; the shared
	// SearchTable prepends the "*" (all columns) option.
	const searchToIndex = (columnName: string): number[] | "all" | undefined => {
		if (columnName === ALL_COLUMNS) return "all";
		const index = Number(columnName);
		if (!Number.isInteger(index) || index < 0 || index >= columns.length) return undefined;
		return [index];
	};

	return { shapedData, searchQuery, setSearchQuery, searchColumns, resultsCount, totalCount, searchToIndex, onQueryChange };
}
