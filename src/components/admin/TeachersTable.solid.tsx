import { API, APIStore, createHydration, useAPI } from "../../../lib/hooks/useAPI.solid";
import type {
	SimpleTeacher as Teachers,
	Teachers as FullTeachers,
	ClassType,
	TeacherClasses,
	Locations,
	TeacherLocations,
	Instruments,
	TeacherInstruments
} from "../../../types/entities";
import Table from "./table/Table.solid";
import { createEffect, createMemo, createSignal, on, Show } from "solid-js";
import { createStore } from "solid-js/store";
import TableControls, { ActionEnum } from "./table/TableControls.solid";
import { type Props as InputProps, Fill, Omit } from "../Input.solid";
import { ContextType, SelectedItemsContext } from "./table/SelectedRowContext.solid";
import { formListener, formErrorWrap } from "./table/formSubmit";
import Spinner from "../Spinner.solid";

const PREFIX = "teachers";

type ColumnType<T> = Record<keyof T, string | { name: string; size: () => number }>;
type TeachersTable = Omit<FullTeachers, "instruments"> & { priority_byz: number; priority_par: number; priority_eur: number };
type TeacherJoins = { teacherClasses: number[]; teacherInstruments: number[]; teacherLocations: number[]; priorities: number[] };

const TeachersInputs = (
	class_types: ClassType[],
	locations: Locations[],
	instruments: Instruments[],
	teacher?: FullTeachers,
	classList?: TeacherClasses[],
	locationsList?: TeacherLocations[],
	instrumentsList?: TeacherInstruments[]
): Record<
	| keyof FullTeachers
	| "teacherClasses"
	| "teacherLocations"
	| "teacherInstrumentsTraditional"
	| "teacherInstrumentsEuropean"
	| "priority_byz"
	| "priority_par"
	| "priority_eur",
	InputProps
> => {
	const teacherClasses = classList?.filter(c => c.teacher_id === teacher?.id) || [];
	const multiselectClasses = class_types?.map(ct => {
		let c = teacherClasses && teacherClasses.find(t => t.class_id === ct.id);
		return { value: ct.id, label: ct.name, selected: !!c };
	});

	const teacherLocations = locationsList?.filter(l => l.teacher_id === teacher?.id) || [];
	const multiselectLocations = locations?.map(l => {
		let c = teacherLocations && teacherLocations.find(t => t.location_id === l.id);
		return { value: l.id, label: l.name, selected: !!c };
	});

	const teacherInstruments = instrumentsList?.filter(i => i.teacher_id === teacher?.id) || [];

	const multiselectInstrumentsTraditional = instruments
		?.filter(i => i.type === "par")
		.map(i => {
			let c = teacherInstruments && teacherInstruments.find(t => t.instrument_id === i.id);
			return { value: i.id, label: i.name, selected: !!c };
		});
	const multiselectInstrumentsEuropean = instruments
		?.filter(i => i.type === "eur")
		.map(i => {
			let c = teacherInstruments && teacherInstruments.find(t => t.instrument_id === i.id);
			return { value: i.id, label: i.name, selected: !!c };
		});
	return {
		id: { name: "id", label: "Id", type: "number", iconClasses: "fa-solid fa-hashtag" },
		fullname: { name: "fullname", label: "Ονοματεπώνυμο", type: "text", iconClasses: "fa-solid fa-user" },
		priority_byz: {
			name: "priority_byz",
			label: "Προτεραιότητα Βυζαντινής",
			type: "number",
			iconClasses: "fa-solid fa-arrow-up-9-1",
			minmax: [1, 1000]
		},
		priority_par: {
			name: "priority_par",
			label: "Προτεραιότητα Παραδοσιακής",
			type: "number",
			iconClasses: "fa-solid fa-arrow-up-9-1",
			minmax: [1, 1000]
		},
		priority_eur: {
			name: "priority_eur",
			label: "Προτεραιότητα Ευρωπαϊκής",
			type: "number",
			iconClasses: "fa-solid fa-arrow-up-9-1",
			minmax: [1, 1000]
		},
		picture: {
			name: "picture",
			label: "Φωτογραφία",
			type: "file",
			iconClasses: "fa-regular fa-file-image",
			fileExtension: "image/*",
			value: teacher?.picture
		},
		cv: {
			name: "cv",
			label: "Βιογραφικό",
			type: "file",
			iconClasses: "fa-solid fa-file-pdf",
			fileExtension: ".pdf",
			value: teacher?.cv
		},
		teacherLocations: {
			name: "teacherLocations",
			label: "Τοποθεσίες",
			type: "multiselect",
			iconClasses: "fa-solid fa-map-location-dot",
			multiselectList: multiselectLocations
		},
		teacherClasses: {
			name: "teacherClasses",
			label: "Μαθήματα",
			type: "multiselect",
			iconClasses: "fa-solid fa-chalkboard-teacher",
			multiselectList: multiselectClasses
		},
		teacherInstrumentsTraditional: {
			name: "teacherInstrumentsTraditional",
			label: "Παραδοσιακή Μουσική",
			type: "multiselect",
			iconClasses: "fa-solid fa-guitar",
			multiselectList: multiselectInstrumentsTraditional
		},
		teacherInstrumentsEuropean: {
			name: "teacherInstrumentsEuropean",
			label: "Ευρωπαϊκή Μουσική",
			type: "multiselect",
			iconClasses: "fa-solid fa-guitar",
			multiselectList: multiselectInstrumentsEuropean
		}
	};
};

const fileToBlob = async (file: File): Promise<Blob | null> => {
	if (!file.name) return null;
	return new Promise(res => {
		const reader = new FileReader();
		reader.onload = () => {
			if (reader.result) res(new Blob([reader.result], { type: file.type }));
			else res(null);
		};
		reader.readAsArrayBuffer(file);
	});
};

const teacherToTableTeacher = (teacher: FullTeachers, classList: TeacherClasses[]): TeachersTable => {
	const classes = classList.filter(c => c.teacher_id === teacher.id);
	const columns = Object.values(teacher);

	columns[2] = (teacher.picture && "/kathigites/images/" + teacher.picture) || "";
	columns[3] = (teacher.cv && "/kathigites/cv/" + teacher.cv) || "";

	columns[4] = classes.find(c => c.class_id === 1)?.priority || "-";
	columns[5] = classes.find(c => c.class_id === 2)?.priority || "-";
	columns[6] = classes.find(c => c.class_id === 3)?.priority || "-";
	return columns as unknown as TeachersTable;
};

const teachersToTable = (teachers: FullTeachers[], classList: TeacherClasses[]): TeachersTable[] => {
	return teachers.map(t => teacherToTableTeacher(t, classList));
};

export default function TeachersTable() {
	const class_types = [
		{ id: 1, name: "Βυζαντινή Μουσική" },
		{ id: 2, name: "Παραδοσιακή Μουσική" },
		{ id: 3, name: "Ευρωπαϊκή Μουσική" }
	];
	const [actionPressed, setActionPressed] = createSignal(ActionEnum.NONE, { equals: false });
	const [store, setStore] = createStore<APIStore>({});
	const hydrate = createHydration(() => {
		console.log("Hydrating table data");
		useAPI(setStore, API.Teachers.get, {});
		useAPI(setStore, API.Teachers.getClasses, {});

		useAPI(setStore, API.Locations.get, {});
		useAPI(setStore, API.Teachers.getLocations, {});

		useAPI(setStore, API.Instruments.get, {});
		useAPI(setStore, API.Teachers.getInstruments, {});
	});

	createEffect(
		on(actionPressed, action => {
			if (action === ActionEnum.NONE) return;
			ROWS[1].removeAll();
			hydrate(true);
		})
	);

	const [selectedItems, setSelectedItems] = createStore<number[]>([]);
	const ROWS = [
		selectedItems,
		{
			add: (id: number) => {
				setSelectedItems([...selectedItems, id]);
			},
			remove: (id: number) => {
				setSelectedItems(selectedItems.filter(i => i !== id));
			},
			removeAll: () => {
				setSelectedItems([]);
			}
		}
	] as const;
	const columnNames: ColumnType<TeachersTable> = {
		id: "Id",
		fullname: { name: "Ονοματεπώνυμο", size: () => 25 },
		picture: "Φωτογραφία",
		cv: "Βιογραφικό",
		priority_byz: { name: "Προτεραιότητα Βυζαντινής", size: () => 15 },
		priority_par: { name: "Προτεραιότητα Παραδοσιακής", size: () => 15 },
		priority_eur: { name: "Προτεραιότητα Ευρωπαϊκής", size: () => 15 }
	};

	const shapedData = createMemo(() => {
		const classList = store[API.Teachers.getClasses];
		const teachers = store[API.Teachers.get];
		if (!classList || !teachers) return [];
		return teachers ? teachersToTable(teachers, classList) : [];
	});
	const onAdd = createMemo(() => {
		const locations = store[API.Locations.get];
		const locationsList = store[API.Teachers.getLocations];
		const instruments = store[API.Instruments.get];
		if (!locations || !locationsList || !instruments) return;
		const submit = formErrorWrap(async function (e: Event) {
			e.preventDefault();
			e.stopPropagation();
			const formData = new FormData(e.currentTarget as HTMLFormElement);
			const data: Omit<Teachers & TeacherJoins, "id"> = {
				fullname: formData.get("fullname") as string,
				teacherClasses: [...document.querySelectorAll<HTMLInputElement>(`button[data-specifier='teacherClasses']`)]
					.map(btn => {
						const id = btn.dataset.selected === "true" ? Number(btn.dataset.value) : null;
						return id;
					})
					.filter(Boolean) as number[],
				teacherInstruments: [...document.querySelectorAll<HTMLInputElement>(`button[data-specifier^='teacherInstruments']`)]
					.map(btn => {
						const id = btn.dataset.selected === "true" ? Number(btn.dataset.value) : null;
						return id;
					})
					.filter(Boolean) as number[],
				teacherLocations: [...document.querySelectorAll<HTMLInputElement>(`button[data-specifier='teacherLocations']`)]
					.map(btn => {
						const id = btn.dataset.selected === "true" ? Number(btn.dataset.value) : null;
						return id;
					})
					.filter(Boolean) as number[],
				priorities: [...document.querySelectorAll<HTMLInputElement>(`input[name^='priority']`)]
					.map(i => Number(i.value))
					.filter(Boolean)
			};
			const res = await useAPI(setStore, API.Teachers.post, { RequestObject: data });
			if (!res.data) return;
			const id = res.data.insertId as number;
			const files = {
				picture: await fileToBlob(formData.get("picture") as File),
				cv: await fileToBlob(formData.get("cv") as File)
			};
			if (files.picture)
				await useAPI(setStore, API.Teachers.fileUpload, {
					RequestObject: files.picture,
					UrlArgs: { id }
				});
			if (files.cv) await useAPI(setStore, API.Teachers.fileUpload, { RequestObject: files.cv, UrlArgs: { id } });
			setActionPressed(ActionEnum.ADD);
		});
		return {
			inputs: Omit(TeachersInputs(class_types, locations, instruments), "id"),
			onMount: () => formListener(submit, true, PREFIX),
			onCleanup: () => formListener(submit, false, PREFIX),
			submitText: "Προσθήκη",
			headerText: "Εισαγωγή Καθηγητή",
			type: ActionEnum.ADD
		};
	});
	const onEdit = createMemo(() => {
		const teachers = store[API.Teachers.get];
		if (!teachers || selectedItems.length !== 1) return undefined;
		const teacher = teachers.find(p => p.id === selectedItems[0]);
		const classList = store[API.Teachers.getClasses];
		const locations = store[API.Locations.get];
		const locationsList = store[API.Teachers.getLocations];
		const instruments = store[API.Instruments.get];
		const teacherInstruments = store[API.Teachers.getInstruments];
		if (!teacher || !classList || !locations || !locationsList || !instruments || !teacherInstruments) return;

		let pictureRemoved = false;
		let cvRemoved = false;
		const submit = formErrorWrap(async function (e: Event) {
			e.preventDefault();
			e.stopPropagation();
			const formData = new FormData(e.currentTarget as HTMLFormElement);
			const data: Teachers & TeacherJoins = {
				id: teacher.id,
				fullname: formData.get("fullname") as string,
				teacherClasses: [...document.querySelectorAll<HTMLInputElement>(`button[data-specifier='teacherClasses']`)]
					.map(btn => {
						const id = btn.dataset.selected === "true" ? Number(btn.dataset.value) : null;
						return id;
					})
					.filter(Boolean) as number[],
				teacherInstruments: [...document.querySelectorAll<HTMLInputElement>(`button[data-specifier^='teacherInstruments']`)]
					.map(btn => {
						const id = btn.dataset.selected === "true" ? Number(btn.dataset.value) : null;
						return id;
					})
					.filter(Boolean) as number[],
				teacherLocations: [...document.querySelectorAll<HTMLInputElement>(`button[data-specifier='teacherLocations']`)]
					.map(btn => {
						const id = btn.dataset.selected === "true" ? Number(btn.dataset.value) : null;
						return id;
					})
					.filter(Boolean) as number[],
				priorities: [...document.querySelectorAll<HTMLInputElement>(`input[name^='priority']`)]
					.map(i => Number(i.value))
					.filter(Boolean)
			};
			const res = await useAPI(setStore, API.Teachers.update, { RequestObject: data });
			if (!res.data && !res.message) return;
			const file = {
				picture: await fileToBlob(formData.get("picture") as File),
				cv: await fileToBlob(formData.get("cv") as File)
			};
			if (pictureRemoved) {
				await useAPI(setStore, API.Teachers.fileDelete, {
					RequestObject: {
						id: teacher.id,
						type: "picture"
					}
				});
			}
			if (cvRemoved) {
				await useAPI(setStore, API.Teachers.fileDelete, { RequestObject: { id: teacher.id, type: "cv" } });
			}
			if (file.picture)
				await useAPI(setStore, API.Teachers.fileUpload, {
					RequestObject: file.picture,
					UrlArgs: { id: teacher.id }
				});
			if (file.cv)
				await useAPI(setStore, API.Teachers.fileUpload, {
					RequestObject: file.cv,
					UrlArgs: { id: teacher.id }
				});
			setActionPressed(ActionEnum.EDIT);
		});
		const emptyFileRemove = (e: CustomEvent) => {
			e.preventDefault();
			e.stopPropagation();
			const name = e.detail as string;
			if (name === teacher.picture) pictureRemoved = true;
			if (name === teacher.cv) cvRemoved = true;
		};

		const simpleTeacher = JSON.parse(JSON.stringify(teacher)) as Teachers;
		// @ts-ignore
		delete simpleTeacher.picture;
		// @ts-ignore
		delete simpleTeacher.cv;
		return {
			inputs: Omit(
				Fill(
					TeachersInputs(class_types, locations, instruments, teacher, classList, locationsList, teacherInstruments),
					simpleTeacher
				),
				"id"
			),
			onMount: () => {
				//@ts-ignore
				document.addEventListener("emptyFileRemove", emptyFileRemove);
				formListener(submit, true, PREFIX);
			},
			onCleanup: () => {
				//@ts-ignore
				document.removeEventListener("emptyFileRemove", emptyFileRemove);
				formListener(submit, false, PREFIX);
			},
			submitText: "Ενημέρωση",
			headerText: "Επεξεργασία Καθηγητή",
			type: ActionEnum.EDIT
		};
	});
	const onDelete = createMemo(() => {
		const teachers = store[API.Teachers.get];
		if (!teachers || selectedItems.length < 1) return undefined;
		const submit = formErrorWrap(async function (e: Event) {
			e.preventDefault();
			e.stopPropagation();
			const data = selectedItems.map(i => (teachers.find(p => p.id === i) as Teachers).id);
			const res = await useAPI(setStore, API.Teachers.delete, { RequestObject: data });
			if (!res.data && !res.message) return;
			setActionPressed(ActionEnum.DELETE);
		});
		return {
			inputs: {},
			onMount: () => formListener(submit, true, PREFIX),
			onCleanup: () => formListener(submit, false, PREFIX),
			submitText: "Διαγραφή",
			headerText: "Διαγραφή Καθηγητών",
			type: ActionEnum.DELETE
		};
	});

	const onAddInstrument = createMemo(() => {
		const submit = formErrorWrap(async function (e: Event) {
			e.preventDefault();
			e.stopPropagation();
			const formData = new FormData(e.currentTarget as HTMLFormElement);
			const data: Omit<Instruments, "id"> = {
				name: formData.get("name") as string,
				type: (formData.get("type") as string) === "Παραδοσιακή Μουσική" ? "par" : "eur",
				isInstrument: (Number(
					[...document.querySelectorAll<HTMLInputElement>(`button[data-specifier='isInstrument']`)].filter(
						i => i.dataset.selected === "true"
					)[0].dataset.value as string
				) - 1) as 0 | 1
			};
			const res = await useAPI(setStore, API.Instruments.post, { RequestObject: data });
			if (!res.data && !res.message) return;
			setActionPressed(ActionEnum.ADD);
		});
		return {
			inputs: {
				name: {
					type: "text",
					name: "name",
					label: "Όργανο",
					iconClasses: "fas fa-chalkboard-teacher"
				} as InputProps,
				type: {
					type: "select",
					name: "type",
					label: "Τύπος Μαθήματος",
					iconClasses: "fas fa-chalkboard-teacher",
					selectList: ["Παραδοσιακή Μουσική", "Ευρωπαϊκή Μουσική"],
					valueLiteral: true
				} as InputProps,
				isInstrument: {
					type: "multiselect",
					name: "isInstrument",
					label: "",
					iconClasses: "fas fa-guitar",
					multiselectList: [
						{ label: "Όργανο", value: 2, selected: true },
						{ label: "Μαθήμα", value: 1, selected: false }
					],
					multiselectOnce: true
				} as InputProps
			},
			onMount: () => formListener(submit, true, "instrument"),
			onCleanup: () => formListener(submit, false, "instrument"),
			submitText: "Προσθήκη",
			headerText: "Εισαγωγή Οργάνου",
			type: ActionEnum.ADD
		};
	});
	const onDeleteInstrument = createMemo(() => {
		const instruments = store[API.Instruments.get];
		if (!instruments) return undefined;
		const submit = formErrorWrap(async function (e: Event) {
			e.preventDefault();
			e.stopPropagation();
			const formData = new FormData(e.currentTarget as HTMLFormElement);
			const name = formData.get("name") as string;
			console.log(name);
			const instrument = instruments.find(i => i.name === name);
			if (!instrument) return;
			const res = await useAPI(setStore, API.Instruments.delete, { RequestObject: [instrument.id] });
			if (!res.data && !res.message) return;
			setActionPressed(ActionEnum.DELETE);
		});
		return {
			inputs: {
				name: {
					name: "name",
					label: "Όργανο",
					type: "select",
					iconClasses: "fa-solid fa-chalkboard-teacher",
					selectList: instruments.map(c => c.name),
					valueLiteral: true
				} as InputProps
			},
			onMount: () => formListener(submit, true, "instrument"),
			onCleanup: () => formListener(submit, false, "instrument"),
			submitText: "Διαγραφή",
			headerText: "Διαγραφή Οργάνου",
			type: ActionEnum.DELETE
		};
	});
	return (
		<SelectedItemsContext.Provider value={ROWS as ContextType}>
			<Show
				when={
					store[API.Teachers.get] &&
					store[API.Teachers.getClasses] &&
					store[API.Locations.get] &&
					store[API.Teachers.getLocations] &&
					store[API.Instruments.get] &&
					store[API.Teachers.getInstruments]
				}
				fallback={<Spinner />}
			>
				<Table prefix={PREFIX} data={shapedData} columnNames={columnNames}>
					<TableControls pressedAction={actionPressed} onAdd={onAdd} onEdit={onEdit} onDelete={onDelete} prefix={PREFIX} />
					<TableControls
						pressedAction={actionPressed}
						onAdd={onAddInstrument}
						onDelete={onDeleteInstrument}
						prefix={"instrument"}
					/>
				</Table>
			</Show>
		</SelectedItemsContext.Provider>
	);
}
