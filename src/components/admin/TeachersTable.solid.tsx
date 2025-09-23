import { Show, createMemo } from "solid-js";
import { createStore } from "solid-js/store";
import { API, useAPI, useHydrate, type APIStore } from "../../../lib/hooks/useAPI.solid";
import { useHydrateById } from "../../../lib/hooks/useHydrateById.solid";
import { SelectedRows } from "../../../lib/hooks/useSelectedRows.solid";
import { looseStringIncludes } from "../../../lib/utilities/string";
import { teacherTitleByGender } from "../../../lib/utilities/text";
import type {
	Teachers as FullTeachers,
	TeacherClasses,
	SimpleTeacher as Teachers,
} from "../../../types/entities";
import Spinner from "../other/Spinner.solid";
import { type SearchColumn, type SearchSetter } from "./SearchTable.solid";
import {
	onAddInstrumentMemo,
	onAddMemo,
	onDeleteInstrumentMemo,
	onDeleteMemo,
	onDownloadExcelMemo,
	onModifyMemo,
} from "./controls/Teachers/all";
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
	const [searchQuery, setSearchQuery] = createStore<SearchSetter<FullTeachers & TeacherJoins>>(
		{}
	);
	const [store, setStore] = createStore<APIStore>({});
	const apiHook = useAPI(setStore);

	const setTeacherHydrate = useHydrateById({
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
	const setActionPressedInstruments = useHydrateById({
		setStore,
		mutations: [
			{
				srcEndpoint: API.Instruments.getById,
				destEndpoint: API.Instruments.get,
			},
		],
	});

	useHydrate(() => {
		apiHook(API.Teachers.get);
		apiHook(API.Teachers.getClasses);

		apiHook(API.Locations.get);
		apiHook(API.Teachers.getLocations);

		apiHook(API.Instruments.get);
		apiHook(API.Teachers.getInstruments);
	});

	const shapedData = createMemo(() => {
		const classList = store[API.Teachers.getClasses];
		const teachers = store[API.Teachers.get];
		if (!classList || !teachers) return [];
		const { columnName, value } = searchQuery;
		if (!columnName || !value) {
			toggleCheckboxes(false);
			return teachersToTable(teachers, classList);
		}
		let searchRows: FullTeachers[];
		if (columnName === "teacherInstruments") {
			const teachersInstruments = store[API.Teachers.getInstruments];
			const instruments = store[API.Instruments.get];
			if (!teachersInstruments || !instruments) return teachersToTable(teachers, classList);
			const searchedInstruments = instruments
				.map((x) => x)
				?.filter((i) => looseStringIncludes(i.name, value as string))
				.map((i) => i.id);
			// inside a set because there might be multiple instruments per teacher and we don't want duplicates
			searchRows = [
				...new Set(
					teachersInstruments
						.map((x) => x)
						.filter((t) => searchedInstruments.includes(t.instrument_id))
						.map((t) => teachers.find((x) => x.id === t.teacher_id))
				),
			] as FullTeachers[];
		} else {
			searchRows = teachers
				.map((x) => x)
				.filter((r) => {
					const col = r[columnName as keyof Teachers];
					if (typeof col === "string") {
						return looseStringIncludes(col, value as string);
					}
					return false;
				});
		}
		toggleCheckboxes(false);
		return teachersToTable(searchRows, classList);
	});
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
								setSearchQuery,
							},
						],
					},
				]}
			/>
		</Show>
	);
}
