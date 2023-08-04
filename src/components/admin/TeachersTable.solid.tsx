import { API, APIStore, createHydration, useAPI } from "../../../lib/hooks/useAPI.solid";
import type {
	SimpleTeacher as Teachers,
	Teachers as FullTeachers,
	ClassType,
	TeacherClasses,
	Locations,
	TeacherLocations
} from "../../../types/entities";
import Table from "./table/Table.solid";
import { createEffect, createMemo, createSignal, on, Show } from "solid-js";
import { createStore } from "solid-js/store";
import TableControls, { ActionEnum } from "./table/TableControls.solid";
import { type Props as InputProps, Fill, Omit } from "../Input.solid";
import { ContextType, SelectedItemsContext } from "./table/SelectedRowContext.solid";
import { formListener } from "./table/formSubmit";

const PREFIX = "teachers";

type ColumnType<T> = Record<keyof T, string | { name: string; size: () => number }>;
type TeachersTable = FullTeachers;

const TeachersInputs = (
	class_types: ClassType[],
	locations: Locations[],
	teacher?: FullTeachers,
	classList?: TeacherClasses[],
	locationsList?: TeacherLocations[]
): Record<keyof FullTeachers | "classes" | "locations", InputProps> => {
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
	return {
		id: { name: "id", label: "Id", type: "number", iconClasses: "fa-solid fa-hashtag" },
		fullname: { name: "fullname", label: "Ονοματεπώνυμο", type: "text", iconClasses: "fa-solid fa-user" },
		email: { name: "email", label: "Email", type: "email", iconClasses: "fa-solid fa-envelope" },
		cellphone: {
			name: "cellphone",
			label: "Κινητό Τηλέφωνο",
			type: "text",
			iconClasses: "fa-solid fa-phone"
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
		priority: {
			name: "priority",
			label: "Προτεραιότητα",
			type: "number",
			iconClasses: "fa-solid fa-arrow-up-9-1",
			minmax: [1, 9]
		},
		classes: {
			name: "classes",
			label: "Μαθήματα",
			type: "multiselect",
			iconClasses: "fa-solid fa-chalkboard-teacher",
			multiselectList: multiselectClasses
		},
		locations: {
			name: "locations",
			label: "Τοποθεσίες",
			type: "multiselect",
			iconClasses: "fa-solid fa-map-marker",
			multiselectList: multiselectLocations
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

const teacherToTableTeacher = (teacher: FullTeachers): TeachersTable => {
	const columns = Object.values(teacher);

	columns[4] = (teacher.picture && "/kathigites/images/" + teacher.picture) || "";
	columns[5] = (teacher.cv && "/kathigites/cv/" + teacher.cv) || "";
	return columns as unknown as TeachersTable;
};

const teachersToTable = (teachers: FullTeachers[]): TeachersTable[] => {
	return teachers.map(t => teacherToTableTeacher(t));
};

export default function TeachersTable() {
	const [actionPressed, setActionPressed] = createSignal(ActionEnum.NONE, { equals: false });
	const [store, setStore] = createStore<APIStore>({});
	const hydrate = createHydration(() => {
		console.log("Hydrating table data");
		useAPI(setStore, API.Teachers.get, {});
		useAPI(setStore, API.ClassType.get, {});
		useAPI(setStore, API.Teachers.getClasses, {});
		useAPI(setStore, API.Locations.get, {});
		useAPI(setStore, API.Teachers.getLocations, {});
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
		email: { name: "Email", size: () => 20 },
		cellphone: "Κινητό Τηλέφωνο",
		picture: "Φωτογραφία",
		cv: "Βιογραφικό",
		priority: "Προτεραιότητα"
	};

	const shapedData = createMemo(() => {
		const teachers = store[API.Teachers.get];
		return teachers ? teachersToTable(teachers) : [];
	});
	const onAdd = createMemo(() => {
		const class_types = store[API.ClassType.get];
		const classList = store[API.Teachers.getClasses];
		const locations = store[API.Locations.get];
		const locationsList = store[API.Teachers.getLocations];
		if (!class_types || !classList || !locations || !locationsList) return;
		const submit = function (e: Event) {
			e.preventDefault();
			e.stopPropagation();
			const formData = new FormData(e.currentTarget as HTMLFormElement);
			const data: Omit<Teachers & { classes: number[] }, "id"> = {
				fullname: formData.get("fullname") as string,
				email: formData.get("email") as string,
				cellphone: formData.get("cellphone") as string,
				priority: Number(formData.get("priority") as string),
				classes: [...document.querySelectorAll<HTMLInputElement>(`button[data-specifier='classes']`)]
					.map(btn => {
						const id = btn.dataset.selected === "true" ? Number(btn.dataset.value) : null;
						return id;
					})
					.filter(Boolean) as number[]
			};
			useAPI(setStore, API.Teachers.post, { RequestObject: data }).then(async res => {
				if (!res.data) return;
				const id = res.data.insertId;
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
		};
		return {
			inputs: Omit(TeachersInputs(class_types, locations), "id"),
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
		const class_types = store[API.ClassType.get];
		const classList = store[API.Teachers.getClasses];
		const locations = store[API.Locations.get];
		const locationsList = store[API.Teachers.getLocations];
		if (!teacher || !class_types || !classList || !locations || !locationsList) return;

		let pictureRemoved = false;
		let cvRemoved = false;
		const submit = function (e: Event) {
			e.preventDefault();
			e.stopPropagation();
			const formData = new FormData(e.currentTarget as HTMLFormElement);
			const data: Teachers & { classes: number[] } = {
				id: teacher.id,
				fullname: formData.get("fullname") as string,
				email: formData.get("email") as string,
				cellphone: formData.get("cellphone") as string,
				priority: Number(formData.get("priority") as string),
				classes: [...document.querySelectorAll<HTMLInputElement>(`button[data-specifier='classes']`)]
					.map(btn => {
						const id = btn.dataset.selected === "true" ? Number(btn.dataset.value) : null;
						return id;
					})
					.filter(Boolean) as number[]
			};
			useAPI(setStore, API.Teachers.update, { RequestObject: data }).then(async res => {
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
		};
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
			inputs: Omit(Fill(TeachersInputs(class_types, locations, teacher, classList, locationsList), simpleTeacher), "id"),
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
		const submit = function (e: Event) {
			e.preventDefault();
			e.stopPropagation();
			const data = selectedItems.map(i => (teachers.find(p => p.id === i) as Teachers).id);
			useAPI(setStore, API.Teachers.delete, { RequestObject: data }).then(() => {
				setActionPressed(ActionEnum.DELETE);
			});
		};
		return {
			inputs: {},
			onMount: () => formListener(submit, true, PREFIX),
			onCleanup: () => formListener(submit, false, PREFIX),
			submitText: "Διαγραφή",
			headerText: "Διαγραφή Καθηγητών",
			type: ActionEnum.DELETE
		};
	});

	const onAddClass = createMemo(() => {
		const submit = function (e: Event) {
			e.preventDefault();
			e.stopPropagation();
			const formData = new FormData(e.currentTarget as HTMLFormElement);
			const data: Omit<ClassType, "id"> = {
				name: formData.get("name") as string
			};
			useAPI(setStore, API.ClassType.post, { RequestObject: data }).then(async res => {
				setActionPressed(ActionEnum.ADD);
			});
		};
		return {
			inputs: {
				name: {
					type: "text",
					name: "name",
					label: "Μάθημα",
					iconClasses: "fas fa-chalkboard-teacher"
				} as InputProps
			},
			onMount: () => formListener(submit, true, "classtype"),
			onCleanup: () => formListener(submit, false, "classtype"),
			submitText: "Προσθήκη",
			headerText: "Εισαγωγή Mαθήματος",
			type: ActionEnum.ADD
		};
	});
	const onDeleteClass = createMemo(() => {
		const classtypes = store[API.ClassType.get];
		if (!classtypes) return undefined;
		const submit = function (e: Event) {
			e.preventDefault();
			e.stopPropagation();
			const formData = new FormData(e.currentTarget as HTMLFormElement);
			const data = [classtypes[parseInt(formData.get("name") as string)]?.id || -1];

			useAPI(setStore, API.ClassType.delete, { RequestObject: data }).then(async res => {
				setActionPressed(ActionEnum.ADD);
			});
		};
		return {
			inputs: {
				name: {
					name: "name",
					label: "Μάθημα",
					type: "select",
					iconClasses: "fa-solid fa-chalkboard-teacher",
					selectList: classtypes.map(c => c.name)
				} as InputProps
			},
			onMount: () => formListener(submit, true, "classtype"),
			onCleanup: () => formListener(submit, false, "classtype"),
			submitText: "Διαγραφή",
			headerText: "Διαγραφή Mαθήματος",
			type: ActionEnum.ADD
		};
	});
	return (
		<SelectedItemsContext.Provider value={ROWS as ContextType}>
			<Show when={store[API.Teachers.get]} fallback={<div>Loading...</div>}>
				<Table prefix={PREFIX} data={shapedData} columnNames={columnNames}>
					<TableControls pressedAction={actionPressed} onAdd={onAdd} onEdit={onEdit} onDelete={onDelete} prefix={PREFIX} />
					<TableControls pressedAction={actionPressed} onAdd={onAddClass} onDelete={onDeleteClass} prefix={"classtype"} />
				</Table>
			</Show>
		</SelectedItemsContext.Provider>
	);
}
