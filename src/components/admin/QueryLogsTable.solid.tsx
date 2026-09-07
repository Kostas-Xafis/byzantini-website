import type { QueryLogs } from "@_types/entities";
import { apiCall } from "@hooks/apiCall";
import { createAPIResource, type APIResourceStore } from "@hooks/createAPIResource.solid";
import { API } from "@routes/index.client";
import { ExtendedFormData } from "@utilities/forms";
import { For, Show, createMemo, createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import Input, { type Props as InputProps } from "../input/Input.solid";
import Spinner from "../other/Spinner.solid";
import { createAlert, pushAlert } from "./Alert.solid";
import Table, { type ColumnType } from "./table/Table.solid";

const PREFIX = "querylogs";
const DEFAULT_LIMIT = 100;
const FILTER_FORM_PREFIX = `${PREFIX}-filters`;

type QueryLogsTableRow = QueryLogs;
type QueryLogFilterFields = {
	startDate: string;
	endDate: string;
	limit: number;
};

const columnNames: ColumnType<QueryLogsTableRow> = {
	id: { type: "copy", name: "Id", size: 2 },
	query: { type: "string", name: "Ερώτημα", size: 42 },
	args: { type: "string", name: "Ορίσματα", size: 34 },
	date: { type: "date", name: "Ημερομηνία", size: 14 },
	error: { type: "boolean", name: "Σφάλμα", size: 8 },
};

const queryLogsToTable = (queryLogs: QueryLogs[]): QueryLogsTableRow[] => {
	return queryLogs.map((queryLog) => {
		return [queryLog.id, queryLog.query, queryLog.args, queryLog.date, queryLog.error] as unknown as QueryLogsTableRow;
	});
};

const QueryLogFilterInputs = (): Record<keyof QueryLogFilterFields, InputProps> => ({
	startDate: {
		name: "startDate",
		label: "Από",
		type: "date",
		iconClasses: "fa-regular fa-calendar-days",
	},
	endDate: {
		name: "endDate",
		label: "Έως",
		type: "date",
		iconClasses: "fa-regular fa-calendar-days",
	},
	limit: {
		name: "limit",
		label: "Πλήθος",
		type: "number",
		value: DEFAULT_LIMIT,
		minmax: [1, 5000],
		iconClasses: "fa-solid fa-hashtag",
	},
});

const optionalDateToStartTimestamp = (formData: ExtendedFormData<QueryLogFilterFields>, key: keyof QueryLogFilterFields) => {
	const value = formData.string(key, "dd/mm/yyyy");
	if (!value || value === "dd/mm/yyyy") return null;
	return formData.date(key).getTime();
};

const optionalDateToEndTimestamp = (formData: ExtendedFormData<QueryLogFilterFields>, key: keyof QueryLogFilterFields) => {
	const timestamp = optionalDateToStartTimestamp(formData, key);
	if (timestamp === null) return null;
	const endDate = new Date(timestamp);
	endDate.setDate(endDate.getDate() + 1);
	return endDate.getTime();
};

export default function QueryLogsTable() {
	const [store, setStore] = createStore<APIResourceStore>({});
	const [activeView, setActiveView] = createSignal<"default" | "filtered">("default");
	const [filterFormKey, setFilterFormKey] = createSignal("querylogs-filter-form");

	// Initial hydration: fetches once, then writes the result into the shared
	// cache under `API.QueryLogs.get`; `store[...]` reads stay per-key reactive.
	createAPIResource(API.QueryLogs.get, undefined, { cache: setStore });

	const activeData = createMemo(() => {
		return activeView() === "filtered" ? store[API.QueryLogs.getByFilters] : store[API.QueryLogs.get];
	});

	const shapedData = createMemo(() => {
		const queryLogs = activeData();
		return Array.isArray(queryLogs) ? queryLogsToTable(queryLogs as QueryLogs[]) : [];
	});

	const applyFilters = async (e: SubmitEvent) => {
		e.preventDefault();
		const form = e.currentTarget as HTMLFormElement;
		const formData = new ExtendedFormData<QueryLogFilterFields>(form);

		const limit = formData.number("limit");
		if (!Number.isInteger(limit) || limit < 1) {
			pushAlert(createAlert("error", "Συμπληρώστε έγκυρο πλήθος αποτελεσμάτων"));
			return;
		}

		const startDate = optionalDateToStartTimestamp(formData, "startDate");
		const endDate = optionalDateToEndTimestamp(formData, "endDate");
		if (startDate !== null && endDate !== null && startDate >= endDate) {
			pushAlert(createAlert("error", "Η ημερομηνία έναρξης πρέπει να είναι πριν από την ημερομηνία λήξης"));
			return;
		}

		try {
			const res = await apiCall(API.QueryLogs.getByFilters, {
				RequestObject: {
					startDate,
					endDate,
					limit,
				},
			});
			if ("data" in res) setStore(API.QueryLogs.getByFilters, res.data);
			setActiveView("filtered");
		} catch (error) {
			pushAlert(createAlert("error", error instanceof Error ? error.message : "Σφάλμα κατά την φόρτωση"));
		}
	};

	const resetFilters = async () => {
		setFilterFormKey(`${Date.now()}`);

		try {
			const res = await apiCall(API.QueryLogs.get);
			if ("data" in res) setStore(API.QueryLogs.get, res.data);
			setActiveView("default");
		} catch (error) {
			pushAlert(createAlert("error", error instanceof Error ? error.message : "Σφάλμα κατά την φόρτωση"));
		}
	};

	const filterForm = createMemo(() => {
		filterFormKey();
		return (
			<form
				data-prefix={FILTER_FORM_PREFIX}
				class="grid grid-cols-[repeat(3,minmax(16rem,18rem))_auto] items-end justify-center gap-4 rounded-md border-[2px] border-red-900 px-4 py-3 dark:border-red-800 max-xl:grid-cols-2 max-sm:grid-cols-1"
				onSubmit={applyFilters}>
				<For each={Object.values(QueryLogFilterInputs())}>{(inputProps) => <Input {...inputProps} prefix={FILTER_FORM_PREFIX} />}</For>
				<div class="flex flex-wrap gap-2 self-center max-sm:justify-center">
					<button
						type="submit"
						class="rounded-md bg-red-900 px-4 py-2 text-white shadow-md transition-colors duration-200 hover:bg-red-950 dark:bg-red-800 dark:hover:bg-red-700">
						Εφαρμογή
					</button>
					<button
						type="button"
						onClick={resetFilters}
						class="rounded-md border border-red-900 px-4 py-2 text-red-950 shadow-md transition-colors duration-200 hover:bg-red-100 dark:border-red-700 dark:text-red-100 dark:hover:bg-red-900/50">
						Τελευταία 100
					</button>
				</div>
			</form>
		);
	});

	return (
		<Show when={Array.isArray(activeData())} fallback={<Spinner classes="max-sm:h-[100svh]" />}>
			<Table
				prefix={PREFIX}
				data={shapedData}
				columns={columnNames}
				structure={[
					{
						position: "top",
						controlGroups: [
							{
								type: "custom",
								children: filterForm(),
							},
						],
					},
					{
						position: "bottom",
						controlGroups: [
							{
								type: "pagination",
								pageSize: 100,
								dataSize: () => shapedData().length,
							},
						],
					},
				]}
			/>
		</Show>
	);
}
