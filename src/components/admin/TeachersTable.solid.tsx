import { Show, createMemo } from "solid-js";
import { createStore } from "solid-js/store";
import { API, useAPI, useHydrate, type APIStore } from "../../../lib/hooks/useAPI.solid";
import { useHydrateById } from "../../../lib/hooks/useHydrateById.solid";
import { useSelectedRows } from "../../../lib/hooks/useSelectedRows.solid";
import { loadXLSX } from "../../../lib/pdf.client";
import { fileToBlob, removeAccents, teacherTitleByGender } from "../../../lib/utils.client";
import type {
	ClassType,
	Teachers as FullTeachers,
	Instruments,
	Locations,
	TeacherClasses,
	TeacherInstruments,
	TeacherLocations,
	SimpleTeacher as Teachers,
} from "../../../types/entities";
import {
	Fill,
	Omit,
	getByName,
	getMultiSelect,
	type Props as InputProps,
} from "../input/Input.solid";
import Spinner from "../other/Spinner.solid";
import { SearchTable, type SearchColumn, type SearchSetter } from "./SearchTable.solid";
import { toggleCheckboxes } from "./table/Row.solid";
import { SelectedItemsContext } from "./table/SelectedRowContext.solid";
import Table, { type ColumnType } from "./table/Table.solid";
import { ActionEnum, ActionIcon, type EmptyAction } from "./table/TableControlTypes";
import { TableControl, type Action, TableControlsGroup } from "./table/TableControls.solid";
import { FileHandler } from "../../../lib/fileHandling.client";

const PREFIX = "teachers";

type TeachersTableType = Omit<FullTeachers, "instruments"> & {
	priority_byz: number;
	priority_par: number;
	priority_eur: number;
};
type TeacherJoins = {
	teacherClasses: number[];
	teacherInstruments: number[];
	teacherLocations: number[];
	priorities: number[];
	registrations_number: string[];
};

type ExtraInputs =
	| "teacherClasses"
	| "teacherLocations"
	| "teacherInstrumentsTraditional"
	| "teacherInstrumentsEuropean"
	| "priority_byz"
	| "priority_par"
	| "priority_eur"
	| "ae_byz"
	| "ae_par"
	| "ae_eur";
const TeachersInputs = (
	class_types: ClassType[],
	locations: Locations[],
	instruments: Instruments[],
	teacher?: FullTeachers,
	classList?: TeacherClasses[],
	locationsList?: TeacherLocations[],
	instrumentsList?: TeacherInstruments[]
): Record<keyof FullTeachers | ExtraInputs, InputProps> => {
	const teacherClasses = classList?.filter((c) => c.teacher_id === teacher?.id) || [];
	const teacherPriorities = teacherClasses.map((c) => {
		return { priority: c.priority, class_id: c.class_id };
	});
	const teacherRegNumber = teacherClasses.map((c) => {
		return {
			registration_number: c.registration_number,
			class_id: c.class_id,
		};
	});
	const multiselectClasses = class_types?.map((ct) => {
		let c = teacherClasses && teacherClasses.find((t) => t.class_id === ct.id);
		return { value: ct.id, label: ct.name, selected: !!c };
	});

	const teacherLocations = locationsList?.filter((l) => l.teacher_id === teacher?.id) || [];
	const multiselectLocations = locations?.map((l) => {
		let c = teacherLocations && teacherLocations.find((t) => t.location_id === l.id);
		return { value: l.id, label: l.name, selected: !!c };
	});

	const teacherInstruments = instrumentsList?.filter((i) => i.teacher_id === teacher?.id) || [];

	const multiselectInstrumentsTraditional = instruments
		?.filter((i) => i.type === "par")
		.map((i) => {
			let c = teacherInstruments && teacherInstruments.find((t) => t.instrument_id === i.id);
			return { value: i.id, label: i.name, selected: !!c };
		});
	const multiselectInstrumentsEuropean = instruments
		?.filter((i) => i.type === "eur")
		.map((i) => {
			let c = teacherInstruments && teacherInstruments.find((t) => t.instrument_id === i.id);
			return { value: i.id, label: i.name, selected: !!c };
		});
	return {
		id: {
			name: "id",
			label: "Id",
			type: "number",
			iconClasses: "fa-solid fa-hashtag",
		},
		fullname: {
			name: "fullname",
			label: "Ονοματεπώνυμο",
			type: "text",
			iconClasses: "fa-solid fa-user",
		},
		email: {
			name: "email",
			label: "Email",
			type: "email",
			iconClasses: "fa-solid fa-envelope",
		},
		telephone: {
			name: "telephone",
			label: "Τηλέφωνο",
			type: "text",
			iconClasses: "fa-solid fa-phone",
		},
		gender: {
			name: "gender",
			label: "Φύλο",
			type: "multiselect",
			iconClasses: "fa-solid fa-venus-mars",
			multiselectOnce: true,
			multiselectList: [
				{ value: 0, label: "Άρρεν", selected: teacher?.gender === "M" },
				{ value: 1, label: "Θήλυ", selected: teacher?.gender === "F" },
			],
		},
		title: {
			name: "title",
			label: "Τίτλος",
			type: "multiselect",
			multiselectList: ["Καθηγητής", "Δάσκαλος", "Επιμελητής"].map((t, i) => {
				return {
					value: i,
					label: t,
					selected: teacher?.title === i,
				};
			}),
			multiselectOnce: true,
			iconClasses: "fa-solid fa-user-graduate",
		},
		ae_byz: {
			name: "ae-byz",
			label: "Α.Έκγρισης Βυζαντινής",
			type: "text",
			iconClasses: "fa-solid fa-id-card",
			value: teacherRegNumber.find((p) => p.class_id === 0)?.registration_number || "",
		},
		ae_par: {
			name: "ae-par",
			label: "Α.Έκγρισης Παραδοσιακής",
			type: "text",
			iconClasses: "fa-solid fa-id-card",
			value: teacherRegNumber.find((p) => p.class_id === 1)?.registration_number || "",
		},
		ae_eur: {
			name: "ae-eur",
			label: "Α.Έκγρισης Ευρωπαϊκής",
			type: "text",
			iconClasses: "fa-solid fa-id-card",
			value: teacherRegNumber.find((p) => p.class_id === 2)?.registration_number || "",
		},
		priority_byz: {
			name: "priority_byz",
			label: "Προτεραιότητα Βυζαντινής",
			type: "number",
			iconClasses: "fa-solid fa-arrow-up-9-1",
			value: teacherPriorities.find((p) => p.class_id === 0)?.priority || "",
			minmax: [1, 1000],
		},
		priority_par: {
			name: "priority_par",
			label: "Προτεραιότητα Παραδοσιακής",
			type: "number",
			iconClasses: "fa-solid fa-arrow-up-9-1",
			value: teacherPriorities.find((p) => p.class_id === 1)?.priority || "",
			minmax: [1, 1000],
		},
		priority_eur: {
			name: "priority_eur",
			label: "Προτεραιότητα Ευρωπαϊκής",
			type: "number",
			iconClasses: "fa-solid fa-arrow-up-9-1",
			value: teacherPriorities.find((p) => p.class_id === 2)?.priority || "",
			minmax: [1, 1000],
		},
		picture: {
			name: "picture",
			label: "Φωτογραφία",
			type: "file",
			iconClasses: "fa-regular fa-file-image",
			fileExtension: "image/*",
			value: teacher?.picture,
		},
		cv: {
			name: "cv",
			label: "Βιογραφικό",
			type: "file",
			iconClasses: "fa-solid fa-file-pdf",
			fileExtension: ".pdf",
			value: teacher?.cv,
		},
		linktree: {
			name: "linktree",
			label: "Σύνδεσμος",
			type: "text",
			iconClasses: "fa-solid fa-link",
		},
		visible: {
			name: "visible",
			label: "Εμφάνιση",
			type: "multiselect",
			iconClasses: "fa-solid fa-eye",
			multiselectList: [
				{ value: 1, label: "Ναι", selected: !!teacher?.visible },
				{ value: 0, label: "Όχι", selected: !teacher?.visible },
			],
			multiselectOnce: true,
		},
		online: {
			name: "online",
			label: "Ηλεκτρ. Μάθημα",
			type: "multiselect",
			iconClasses: "fa-solid fa-laptop",
			multiselectList: [
				{ value: 1, label: "Ναι", selected: !!teacher?.online },
				{ value: 0, label: "Όχι", selected: !teacher?.online },
			],
			multiselectOnce: true,
		},
		teacherLocations: {
			name: "teacherLocations",
			label: "Τοποθεσίες",
			type: "multiselect",
			iconClasses: "fa-solid fa-map-location-dot",
			multiselectList: multiselectLocations,
		},
		teacherClasses: {
			name: "teacherClasses",
			label: "Μαθήματα",
			type: "multiselect",
			iconClasses: "fa-solid fa-chalkboard-teacher",
			multiselectList: multiselectClasses,
		},
		teacherInstrumentsTraditional: {
			name: "teacherInstrumentsTraditional",
			label: "Παραδοσιακή Μουσική",
			type: "multiselect",
			iconClasses: "fa-solid fa-guitar",
			multiselectList: multiselectInstrumentsTraditional,
		},
		teacherInstrumentsEuropean: {
			name: "teacherInstrumentsEuropean",
			label: "Ευρωπαϊκή Μουσική",
			type: "multiselect",
			iconClasses: "fa-solid fa-guitar",
			multiselectList: multiselectInstrumentsEuropean,
		},
	};
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
		columns[6] = t?.linktree;

		columns[7] = classes.find((c) => c.class_id === 0)?.priority;
		columns[8] = classes.find((c) => c.class_id === 1)?.priority;
		columns[9] = classes.find((c) => c.class_id === 2)?.priority;

		columns[10] = t.gender === "M" ? "Άρρεν" : "Θήλυ";
		columns[11] = teacherTitleByGender(t.title, t.gender);

		columns[12] = t.visible;
		columns[13] = t.online;
		return columns as unknown as TeachersTableType;
	});
};

const class_types = [
	{ id: 0, name: "Βυζαντινή Μουσική" },
	{ id: 1, name: "Παραδοσιακή Μουσική" },
	{ id: 2, name: "Ευρωπαϊκή Μουσική" },
];

const searchColumns: SearchColumn[] = [
	{ columnName: "fullname", name: "Ονοματεπώνυμο", type: "string" },
	{ columnName: "email", name: "Email", type: "string" },
	{ columnName: "teacherInstruments", name: "Όργανο", type: "string" },
];

const columnNames: ColumnType<TeachersTableType> = {
	id: { type: "number", name: "Id" },
	fullname: { type: "string", name: "Ονοματεπώνυμο", size: 25 },
	picture: { type: "link", name: "Φωτογραφία" },
	cv: { type: "link", name: "Βιογραφικό" },
	email: { type: "string", name: "Email", size: 25 },
	telephone: { type: "string", name: "Τηλέφωνο", size: 15 },
	linktree: { type: "link", name: "Σύνδεσμος", size: 15 },
	priority_byz: {
		type: "number",
		name: "Προτεραιότητα Βυζαντινής",
		size: 15,
	},
	priority_par: {
		type: "number",
		name: "Προτεραιότητα Παραδοσιακής",
		size: 15,
	},
	priority_eur: {
		type: "number",
		name: "Προτεραιότητα Ευρωπαϊκής",
		size: 15,
	},
	gender: { type: "string", name: "Φύλο", size: 15 },
	title: { type: "string", name: "Τίτλος", size: 15 },
	visible: { type: "boolean", name: "Εμφάνιση", size: 15 },
	online: { type: "boolean", name: "Ηλεκτρ. Μάθημα", size: 15 },
};

const [selectedItems, setSelectedItems] = useSelectedRows();

export default function TeachersTable() {
	const [searchQuery, setSearchQuery] = createStore<SearchSetter<FullTeachers & TeacherJoins>>(
		{}
	);
	const [store, setStore] = createStore<APIStore>({});
	const setTeacherHydrate = useHydrateById(setStore, [
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
	]);
	const setActionPressedInstruments = useHydrateById(setStore, [
		{
			srcEndpoint: API.Instruments.getById,
			destEndpoint: API.Instruments.get,
		},
	]);
	const fileUpload = (file: Blob, id: number) => {
		return useAPI(
			API.Teachers.fileUpload,
			{
				RequestObject: file,
				UrlArgs: { id },
			},
			setStore
		);
	};

	useHydrate(() => {
		useAPI(API.Teachers.get, {}, setStore);
		useAPI(API.Teachers.getClasses, {}, setStore);

		useAPI(API.Locations.get, {}, setStore);
		useAPI(API.Teachers.getLocations, {}, setStore);

		useAPI(API.Instruments.get, {}, setStore);
		useAPI(API.Teachers.getInstruments, {}, setStore);
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
				?.filter((i) =>
					removeAccents(i.name)
						.toLowerCase()
						.includes(removeAccents(value as string).toLowerCase())
				)
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
						let nCol = removeAccents(col).toLowerCase();
						let nVal = removeAccents(value as string).toLowerCase();
						return nCol.includes(nVal);
					}
					return false;
				});
		}
		toggleCheckboxes(false);
		return teachersToTable(searchRows, classList);
	});
	const onAdd = createMemo((): Action | EmptyAction => {
		const addModal = {
			type: ActionEnum.ADD,
			icon: ActionIcon.ADD,
		};
		const locations = store[API.Locations.get];
		const locationsList = store[API.Teachers.getLocations];
		const instruments = store[API.Instruments.get];
		if (!locations || !locationsList || !instruments) return addModal;
		const submit = async function (form: HTMLFormElement) {
			const formData = new FormData(form);
			const data: Omit<Teachers & TeacherJoins, "id"> = {
				fullname: formData.get("fullname") as string,
				email: formData.get("email") as string,
				telephone: formData.get("telephone") as string,
				linktree: formData.get("linktree") as string,
				gender: getMultiSelect("gender").map((btn) =>
					Number(btn.dataset.value) ? "F" : "M"
				)[0],
				title: getMultiSelect("title").map((btn) => Number(btn.dataset.value))[0] as
					| 0
					| 1
					| 2,
				visible: getMultiSelect("visible").map(
					(btn) => !!Number(btn.dataset.value)
				)[0] as boolean,
				online: getMultiSelect("online").map(
					(btn) => !!Number(btn.dataset.value)
				)[0] as boolean,
				teacherClasses: getMultiSelect("teacherClasses").map((btn) =>
					Number(btn.dataset.value)
				) as number[],
				teacherInstruments: [
					...getMultiSelect("teacherInstrumentsTraditional"),
					...getMultiSelect("teacherInstrumentsEuropean"),
				].map((btn) => Number(btn.dataset.value)) as number[],
				teacherLocations: getMultiSelect("teacherLocations").map((btn) =>
					Number(btn.dataset.value)
				) as number[],
				priorities: getByName("priority", "startsWith")
					.map((i) => Number(i.value))
					.filter(Boolean),
				registrations_number: getByName("ae-", "startsWith")
					.map((i) => i.value)
					.filter(Boolean),
			};
			const res = await useAPI(
				API.Teachers.post,
				{
					RequestObject: data,
				},
				setStore
			);
			if (!res.data) return;
			const id = res.data.insertId;
			const files = {
				picture: FileHandler.getFiles("picture"),
				cv: FileHandler.getFiles("cv"),
			};
			const blobs = {
				picture:
					files.picture.length && !files.picture[0].isProxy
						? await fileToBlob(files.picture[0].file)
						: null,
				cv:
					files.cv.length && !files.cv[0].isProxy
						? await fileToBlob(files.cv[0].file)
						: null,
			};
			if (blobs.picture) await fileUpload(blobs.picture, id);
			if (blobs.cv) await fileUpload(blobs.cv, id);

			setTeacherHydrate({ action: ActionEnum.ADD, ids: [id] });
		};
		return {
			inputs: Omit(TeachersInputs(class_types, locations, instruments), "id"),
			onSubmit: submit,
			submitText: "Προσθήκη",
			headerText: "Εισαγωγή Καθηγητή",
			...addModal,
		};
	});
	const onModify = createMemo((): Action | EmptyAction => {
		const modifyModal = {
			type: ActionEnum.MODIFY,
			icon: ActionIcon.MODIFY,
		};
		const teachers = store[API.Teachers.get];
		if (!teachers || selectedItems.length !== 1) return modifyModal;
		const teacher = teachers.find((p) => p.id === selectedItems[0]);
		const classList = store[API.Teachers.getClasses];
		const locations = store[API.Locations.get];
		const locationsList = store[API.Teachers.getLocations];
		const instruments = store[API.Instruments.get];
		const teacherInstruments = store[API.Teachers.getInstruments];
		if (
			!teacher ||
			!classList ||
			!locations ||
			!locationsList ||
			!instruments ||
			!teacherInstruments
		)
			return modifyModal;

		const submit = async function (form: HTMLFormElement) {
			const formData = new FormData(form);
			const classes = getMultiSelect("teacherClasses").map((btn) =>
				Number(btn.dataset.value)
			) as number[];
			const data: Teachers & TeacherJoins = {
				id: teacher.id,
				fullname: formData.get("fullname") as string,
				email: formData.get("email") as string,
				telephone: formData.get("telephone") as string,
				linktree: formData.get("linktree") as string,
				gender: getMultiSelect("gender").map((btn) =>
					Number(btn.dataset.value) ? "F" : "M"
				)[0],
				title: getMultiSelect("title").map((btn) => Number(btn.dataset.value))[0] as
					| 0
					| 1
					| 2,
				visible: getMultiSelect("visible").map(
					(btn) => !!Number(btn.dataset.value)
				)[0] as boolean,
				online: getMultiSelect("online").map(
					(btn) => !!Number(btn.dataset.value)
				)[0] as boolean,
				teacherClasses: classes,
				teacherInstruments: (
					[
						classes.find((c) => c === 1) &&
							getMultiSelect("teacherInstrumentsTraditional"),
						classes.find((c) => c === 2) &&
							getMultiSelect("teacherInstrumentsEuropean"),
					].flat() as (HTMLInputElement | undefined)[]
				)
					.map((btn) => btn && Number(btn.dataset.value))
					.filter((btn) => !!btn) as number[],
				teacherLocations: getMultiSelect("teacherLocations").map((btn) =>
					Number(btn.dataset.value)
				) as number[],
				priorities: getByName("priority", "startsWith")
					.map((i) => Number(i.value))
					.filter(Boolean),
				registrations_number: getByName("ae-", "startsWith")
					.map((i) => i.value)
					.filter(Boolean),
			};
			const res = await useAPI(
				API.Teachers.update,
				{
					RequestObject: data,
				},
				setStore
			);
			if (!res.data && !res.message) return;

			const files = {
				picture: FileHandler.getFiles("picture"),
				cv: FileHandler.getFiles("cv"),
			};
			const blobs = {
				picture:
					files.picture.length && !files.picture[0].isProxy
						? await fileToBlob(files.picture[0].file)
						: null,
				cv:
					files.cv.length && !files.cv[0].isProxy
						? await fileToBlob(files.cv[0].file)
						: null,
			};
			const deletedFiles = {
				picture: FileHandler.getDeletedFiles("picture"),
				cv: FileHandler.getDeletedFiles("cv"),
			};
			await Promise.all([
				deletedFiles.picture.length
					? useAPI(
							API.Teachers.fileDelete,
							{
								RequestObject: {
									id: teacher.id,
									type: "picture",
								},
							},
							setStore
					  )
					: Promise.resolve(),
				deletedFiles.cv.length
					? useAPI(
							API.Teachers.fileDelete,
							{ RequestObject: { id: teacher.id, type: "cv" } },
							setStore
					  )
					: Promise.resolve(),
			]);

			if (blobs.picture) await fileUpload(blobs.picture, teacher.id);
			if (blobs.cv) await fileUpload(blobs.cv, teacher.id);

			setTeacherHydrate({
				action: ActionEnum.MODIFY,
				ids: [teacher.id],
			});
		};

		const simpleTeacher = JSON.parse(JSON.stringify(teacher)) as Partial<FullTeachers>;
		delete simpleTeacher.picture;
		delete simpleTeacher.cv;
		return {
			inputs: Omit(
				Fill(
					TeachersInputs(
						class_types,
						locations,
						instruments,
						teacher,
						classList,
						locationsList,
						teacherInstruments
					),
					simpleTeacher
				),
				"id"
			),
			onSubmit: submit,
			submitText: "Ενημέρωση",
			headerText: "Επεξεργασία Καθηγητή",
			...modifyModal,
		};
	});
	const onDelete = createMemo((): Action | EmptyAction => {
		const deleteModal = {
			type: ActionEnum.DELETE,
			icon: ActionIcon.DELETE,
		};
		const teachers = store[API.Teachers.get];
		if (!teachers || selectedItems.length < 1) return deleteModal;
		const submit = async function (form: HTMLFormElement) {
			const ids = selectedItems.map((i) => (teachers.find((p) => p.id === i) as Teachers).id);
			const res = await useAPI(
				API.Teachers.delete,
				{
					RequestObject: ids,
				},
				setStore
			);
			if (!res.data && !res.message) return;
			setTeacherHydrate({ action: ActionEnum.DELETE, ids: ids });
		};
		return {
			inputs: {},
			onSubmit: submit,
			submitText: "Διαγραφή",
			headerText: "Διαγραφή Καθηγητών",
			...deleteModal,
		};
	});

	const onAddInstrument = createMemo((): Action | EmptyAction => {
		const submit = async function (form: HTMLFormElement) {
			const formData = new FormData(form);
			const data: Omit<Instruments, "id"> = {
				name: formData.get("name") as string,
				type: (formData.get("type") as string) === "Παραδοσιακή Μουσική" ? "par" : "eur",
				isInstrument: (Number(
					[
						...document.querySelectorAll<HTMLInputElement>(
							`button[data-specifier='isInstrument']`
						),
					].filter((i) => i.dataset.selected === "true")[0].dataset.value as string
				) - 1) as 0 | 1,
			};
			const res = await useAPI(
				API.Instruments.post,
				{
					RequestObject: data,
				},
				setStore
			);
			if (!res.data) return;
			setActionPressedInstruments({
				action: ActionEnum.ADD,
				ids: [res.data.insertId],
			});
		};
		return {
			inputs: {
				name: {
					type: "text",
					name: "name",
					label: "Όργανο",
					iconClasses: "fas fa-chalkboard-teacher",
				} as InputProps,
				type: {
					type: "select",
					name: "type",
					label: "Τύπος Μαθήματος",
					iconClasses: "fas fa-chalkboard-teacher",
					selectList: ["Παραδοσιακή Μουσική", "Ευρωπαϊκή Μουσική"],
					valueLiteral: true,
				} as InputProps,
				isInstrument: {
					type: "multiselect",
					name: "isInstrument",
					label: "",
					iconClasses: "fas fa-guitar",
					multiselectList: [
						{ label: "Όργανο", value: 2, selected: true },
						{ label: "Μαθήμα", value: 1, selected: false },
					],
					multiselectOnce: true,
				} as InputProps,
			},
			onSubmit: submit,
			submitText: "Προσθήκη",
			headerText: "Εισαγωγή Οργάνου",
			type: ActionEnum.ADD,
			icon: ActionIcon.ADD_BOX,
		};
	});
	const onDeleteInstrument = createMemo((): Action | EmptyAction => {
		const instruments = store[API.Instruments.get];
		if (!instruments) return { icon: ActionIcon.DELETE_BOX };
		const submit = async function (form: HTMLFormElement) {
			const formData = new FormData(form);
			const name = formData.get("name") as string;
			const instrument = instruments.find((i) => i.name === name);
			if (!instrument) return;
			const res = await useAPI(
				API.Instruments.delete,
				{
					RequestObject: [instrument.id],
				},
				setStore
			);
			if (!res.data && !res.message) return;
			setActionPressedInstruments({
				action: ActionEnum.DELETE,
				ids: [instrument.id],
			});
		};
		return {
			inputs: {
				name: {
					name: "name",
					label: "Όργανο",
					type: "select",
					iconClasses: "fa-solid fa-chalkboard-teacher",
					selectList: instruments.map((c) => c.name),
					valueLiteral: true,
				} as InputProps,
			},
			onSubmit: submit,
			submitText: "Διαγραφή",
			headerText: "Διαγραφή Οργάνου",
			type: ActionEnum.DELETE,
			icon: ActionIcon.DELETE_BOX,
		};
	});

	const onDownloadExcel = createMemo(() => {
		const excelModal = {
			type: ActionEnum.DOWNLOAD_EXCEL,
			icon: ActionIcon.DOWNLOAD_EXCEL,
		};
		const teachers = store[API.Teachers.get];
		const classes = store[API.Teachers.getClasses];
		const instrumentsByTeacher = store[API.Teachers.getInstruments];
		const instruments = store[API.Instruments.get];
		if (
			!teachers ||
			!classes ||
			!instrumentsByTeacher ||
			!instruments ||
			selectedItems.length <= 0
		)
			return excelModal;
		const submit = async function (form: HTMLFormElement) {
			const byzTeachers: Teachers[] = [],
				parTeachers: Teachers[] = [],
				eurTeachers: Teachers[] = [];
			selectedItems.forEach((id) => {
				const teacher = teachers.find((t) => t.id === id);
				if (!teacher) return;
				const teacherClasses = classes.filter((c) => c.teacher_id === id);
				teacherClasses.forEach((c) => {
					if (c.class_id === 0) byzTeachers.push(teacher);
					if (c.class_id === 1) parTeachers.push(teacher);
					if (c.class_id === 2) eurTeachers.push(teacher);
				});
			});

			const xlsx = await loadXLSX();
			const wb = xlsx.utils.book_new();
			const wsStudentsBook = xlsx.utils.aoa_to_sheet(
				[["Ονοματεπώνυμο", "Ιδιότητα", "Αριθμός Έγκρισης", "Υπογραφή"]].concat(
					byzTeachers.map((t) => {
						const ao = classes.find(
							(c) => c.teacher_id === t.id && c.class_id === 0
						)?.registration_number;
						return [
							t.fullname.includes("π.")
								? t.fullname.replace("π. ", "").split(" ").reverse().join(" π. ")
								: t.fullname.split(" ").reverse().join(" "),
							teacherTitleByGender(t.title, t.gender),
							ao ?? "",
							"",
						];
					}),
					[""],
					parTeachers.map((t) => {
						const ao = classes.find(
							(c) => c.teacher_id === t.id && c.class_id === 0
						)?.registration_number;
						const teacherInstruments = instrumentsByTeacher
							.filter((i) => i.teacher_id === t.id)
							.map((i) => instruments.find((x) => x.id === i.instrument_id)?.name)
							.join(", ");
						return [
							t.fullname.includes("π.")
								? t.fullname.replace("π. ", "").split(" ").reverse().join("π.")
								: t.fullname.split(" ").reverse().join(" "),
							teacherInstruments,
							ao ?? "",
							"",
						];
					})
				)
			);
			xlsx.utils.book_append_sheet(wb, wsStudentsBook, "Καθηγητές");
			xlsx.writeFile(wb, "Καθηγητές.xlsx");
		};
		return {
			inputs: {},
			onSubmit: submit,
			submitText: "Λήψη",
			headerText: "Λήψη Καθηγητών σε Excel",
			...excelModal,
		};
	});

	return (
		<SelectedItemsContext.Provider value={[selectedItems, setSelectedItems]}>
			<Show
				when={
					store[API.Teachers.get] &&
					store[API.Teachers.getClasses] &&
					store[API.Locations.get] &&
					store[API.Teachers.getLocations] &&
					store[API.Instruments.get] &&
					store[API.Teachers.getInstruments]
				}
				fallback={<Spinner classes="max-sm:h-[100svh]" />}
			>
				<Table prefix={PREFIX} data={shapedData} columns={columnNames} hasSelectBox>
					<TableControlsGroup prefix={PREFIX}>
						<TableControl action={onAdd} prefix={PREFIX} />
						<TableControl action={onModify} prefix={PREFIX} />
						<TableControl action={onDelete} prefix={PREFIX} />
					</TableControlsGroup>
					<TableControlsGroup prefix={"instrument"}>
						<TableControl action={onAddInstrument} prefix={"instrument"} />
						<TableControl action={onDeleteInstrument} prefix={"instrument"} />
					</TableControlsGroup>
					<TableControlsGroup prefix={PREFIX}>
						<TableControl action={onDownloadExcel} prefix={PREFIX} />
					</TableControlsGroup>
					<SearchTable columns={searchColumns} setSearchQuery={setSearchQuery} />
				</Table>
			</Show>
		</SelectedItemsContext.Provider>
	);
}
