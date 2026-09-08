import type { Teachers as FullTeachers, TeacherClasses, SimpleTeacher as Teachers } from "@_types/entities";
import { createAPIResource, type APIResourceStore } from "@hooks/createAPIResource.solid";
import { useAPIClient } from "@hooks/useAPIClient.solid";
import { useCacheMutations } from "@hooks/useCacheMutations.solid";
import { API } from "@routes/index.client";
import { SelectedRows } from "@hooks/useSelectedRows.solid";
import { looseStringIncludes } from "@utilities/string";
import { teacherTitleByGender } from "@utilities/text";
import { Show, createMemo, onMount } from "solid-js";
import { createStore } from "solid-js/store";
import { useSearchParams } from "@solidjs/router";
import Spinner from "../other/Spinner.solid";
import { type SearchColumn, type SearchSetter } from "./SearchTable.solid";
import { ALL_COLUMNS } from "./table/searchMatch";
import { onAddInstrumentMemo, onAddMemo, onDeleteInstrumentMemo, onDeleteMemo, onDownloadExcelMemo, onModifyMemo } from "./controls/Teachers/all";
import { INSTRUMENTS_PREFIX, PREFIX, type TeacherJoins } from "./controls/Teachers/helpers";
import { toggleCheckboxes } from "./table/Row.solid";
import Table, { type ColumnType } from "./table/Table.solid";

type TeachersTableType = Omit<FullTeachers, "instruments"> & {
	priority_byz: number;
	priority_par: number;
	priority_eur: number;
};

const teachersToTable = (teachers: FullTeachers[], classList: TeacherClasses[]) => {
	return teachers.map((t) => {
		const classes = classList.filter((c) => c.teacher_id === t.id);
		// const columns = Object.values(t) as any[];
		const columns = Array(14).fill(null) as any[];

		columns[0] = t.id;
		columns[1] = t.fullname;
		columns[2] = (t.picture && "/kathigites/picture/" + t.picture) || undefined;
		columns[3] = (t.cv && "/kathigites/cv/" + t.cv) || undefined;
		columns[4] = t?.email;
		columns[5] = t?.telephone;
		columns[6] = t?.amka || "-";
		columns[7] = t?.linktree;

		columns[8] = classes.find((c) => c.class_id === 0)?.priority;
		columns[9] = classes.find((c) => c.class_id === 1)?.priority;
		columns[10] = classes.find((c) => c.class_id === 2)?.priority;

		columns[11] = t.gender === "M" ? "Άρρεν" : "Θήλυ";
		columns[12] = teacherTitleByGender(t.title, t.gender);

		columns[13] = t.visible;
		columns[14] = t.online;
		return columns as unknown as TeachersTableType;
	});
};

const searchColumns: SearchColumn[] = [
	{ columnName: "fullname", name: "Ονοματεπώνυμο", type: "string" },
	{ columnName: "email", name: "Email", type: "string" },
	{ columnName: "teacherInstruments", name: "Όργανο", type: "string" },
];

/** Combined haystack (visible fields + instrument names) for all-columns mode. */
const teacherHaystack = (
	t: FullTeachers,
	teachersInstruments: { teacher_id: number; instrument_id: number }[] | undefined,
	instruments: { id: number; name: string }[] | undefined,
) => {
	const parts: string[] = [
		t.fullname,
		t.gender === "M" ? "άρρεν" : "θήλυ",
		t.title !== undefined ? teacherTitleByGender(t.title, t.gender) : "",
		t.email ?? "",
		t.telephone ?? "",
		t.amka ?? "",
		t.linktree ?? "",
	];
	if (teachersInstruments && instruments) {
		for (const ti of teachersInstruments) {
			if (ti.teacher_id !== t.id) continue;
			const inst = instruments.find((i) => i.id === ti.instrument_id);
			if (inst) parts.push(inst.name);
		}
	}
	return parts.filter(Boolean).join(" ");
};

const columnNames: ColumnType<TeachersTableType> = {
	id: { type: "number", name: "Id" },
	fullname: { type: "string", name: "Ονοματεπώνυμο", size: 14 },
	picture: { type: "link", name: "Φωτογραφία" },
	cv: { type: "link", name: "Βιογραφικό" },
	email: { type: "string", name: "Email", size: 15 },
	telephone: { type: "string", name: "Τηλέφωνο", size: 12 },
	amka: { type: "string", name: "ΑΜΚΑ", size: 13 },
	linktree: { type: "link", name: "Σύνδεσμος", size: 9 },
	priority_byz: {
		type: "number",
		name: "Προτεραιότητα Βυζαντινής",
		size: 12,
	},
	priority_par: {
		type: "number",
		name: "Προτεραιότητα Παραδοσιακής",
		size: 12,
	},
	priority_eur: {
		type: "number",
		name: "Προτεραιότητα Ευρωπαϊκής",
		size: 12,
	},
	gender: { type: "string", name: "Φύλο", size: 5 },
	title: { type: "string", name: "Τίτλος", size: 10 },
	visible: { type: "boolean", name: "Εμφάνιση" },
	online: { type: "boolean", name: "Ηλεκτρ. Μάθημα", size: 10 },
};

export default function TeachersTable() {
	const selectedItems = new SelectedRows().useSelectedRows();
	const [searchQuery, setSearchQuery] = createStore<SearchSetter>({});
	const [store, setStore] = createStore<APIResourceStore>({});
	const apiHook = useAPIClient(setStore);

	const setTeacherHydrate = useCacheMutations({
		setStore,
		mutations: [
			{
				srcEndpoint: API.Teachers.getById,
				destEndpoint: API.Teachers.get,
			},
			{
				srcEndpoint: API.Teachers.getClassesById,
				destEndpoint: API.Teachers.getClasses,
				foreignKey: "teacher_id",
			},
			{
				srcEndpoint: API.Teachers.getLocationsById,
				destEndpoint: API.Teachers.getLocations,
				foreignKey: "teacher_id",
			},
			{
				srcEndpoint: API.Teachers.getInstrumentsById,
				destEndpoint: API.Teachers.getInstruments,
				foreignKey: "teacher_id",
			},
		],
	});
	const setActionPressedInstruments = useCacheMutations({
		setStore,
		mutations: [
			{
				srcEndpoint: API.Instruments.getById,
				destEndpoint: API.Instruments.get,
			},
		],
	});

	createAPIResource(API.Teachers.get, undefined, { cache: setStore });
	createAPIResource(API.Teachers.getClasses, undefined, { cache: setStore });
	createAPIResource(API.Locations.get, undefined, { cache: setStore });
	createAPIResource(API.Teachers.getLocations, undefined, { cache: setStore });
	createAPIResource(API.Instruments.get, undefined, { cache: setStore });
	createAPIResource(API.Teachers.getInstruments, undefined, { cache: setStore });

	const [params, setParams] = useSearchParams();
	// Deep-link support: /admin/teachers?search=<query>&col=<field>.
	// The URL is read ONCE on mount (link pasting only, no live state tracking);
	// afterwards the search bar writes the URL but the URL never drives the UI.
	// (col is validated; absent/invalid → all-columns mode.)
	const SEARCHABLE_FIELDS = ["fullname", "email", "teacherInstruments"];
	onMount(() => {
		const search = params.search;
		if (search === undefined) return;
		const col = typeof params.col === "string" ? params.col : undefined;
		const columnName = col !== undefined && SEARCHABLE_FIELDS.includes(col) ? col : ALL_COLUMNS;
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

	const shapedData = createMemo(() => {
		const classList = store[API.Teachers.getClasses];
		const teachers = store[API.Teachers.get];
		if (!classList || !teachers) return [];
		const { columnName, value, type } = searchQuery;
		if (!columnName || !value || !type) {
			toggleCheckboxes(false);
			return teachersToTable(teachers, classList);
		}
		const query = String(value).trim();
		if (!query) {
			toggleCheckboxes(false);
			return teachersToTable(teachers, classList);
		}
		let searchRows: FullTeachers[];
		if (columnName === ALL_COLUMNS) {
			const teachersInstruments = store[API.Teachers.getInstruments];
			const instruments = store[API.Instruments.get];
			searchRows = teachers.filter((t) => looseStringIncludes(teacherHaystack(t, teachersInstruments, instruments), query));
		} else if (columnName === "teacherInstruments") {
			const teachersInstruments = store[API.Teachers.getInstruments];
			const instruments = store[API.Instruments.get];
			if (!teachersInstruments || !instruments) return teachersToTable(teachers, classList);
			const searchedInstruments = instruments.filter((i) => looseStringIncludes(i.name, query)).map((i) => i.id);
			// inside a set because there might be multiple instruments per teacher and we don't want duplicates
			searchRows = [
				...new Set(
					teachersInstruments.filter((t) => searchedInstruments.includes(t.instrument_id)).map((t) => teachers.find((x) => x.id === t.teacher_id)),
				),
			] as FullTeachers[];
		} else {
			searchRows = teachers.filter((r) => {
				const col = r[columnName as keyof Teachers];
				if (typeof col === "string") {
					return looseStringIncludes(col, query);
				}
				return false;
			});
		}
		toggleCheckboxes(false);
		return teachersToTable(searchRows, classList);
	});
	const resultsCount = () => shapedData().length;
	const totalCount = () => store[API.Teachers.get]?.length ?? 0;
	const onAdd = onAddMemo(setTeacherHydrate, store, apiHook);
	const onModify = onModifyMemo(setTeacherHydrate, store, selectedItems, apiHook);
	const onDelete = onDeleteMemo(setTeacherHydrate, store, selectedItems, apiHook);

	const onAddInstrument = onAddInstrumentMemo(setActionPressedInstruments, apiHook);
	const onDeleteInstrument = onDeleteInstrumentMemo(setActionPressedInstruments, store, apiHook);

	const onDownloadExcel = onDownloadExcelMemo(store, selectedItems);

	return (
		<Show
			when={
				store[API.Teachers.get] &&
				store[API.Teachers.getClasses] &&
				store[API.Locations.get] &&
				store[API.Teachers.getLocations] &&
				store[API.Instruments.get] &&
				store[API.Teachers.getInstruments]
			}
			fallback={<Spinner classes="max-sm:h-[100svh]" />}>
			<Table
				prefix={PREFIX}
				data={shapedData}
				columns={columnNames}
				hasSelectBox
				structure={[
					{
						position: "top",
						controlGroups: [
							{
								prefix: PREFIX,
								controls: [onAdd, onModify, onDelete],
							},
							{
								prefix: INSTRUMENTS_PREFIX,
								controls: [onAddInstrument, onDeleteInstrument],
							},
							{
								prefix: PREFIX,
								controls: [onDownloadExcel],
							},
							{
								type: "search",
								columns: searchColumns,
								searchQuery,
								setSearchQuery,
								resultsCount,
								totalCount,
								onQueryChange,
								// Row layout: 0 id, 1 fullname, 2 picture, 3 cv, 4 email, 5 telephone,
								// 6 amka, 7 linktree, 8-10 priorities, 11 gender, 12 title, 13 visible, 14 online
								searchToIndex: (columnName) => {
									if (columnName === ALL_COLUMNS) return "all";
									switch (columnName) {
										case "fullname":
											return [1];
										case "email":
											return [4];
										default:
											return undefined; // teacherInstruments has no direct row cell
									}
								},
							},
						],
					},
				]}
			/>
		</Show>
	);
}
