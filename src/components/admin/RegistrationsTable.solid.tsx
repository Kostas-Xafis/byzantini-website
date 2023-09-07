import { API, type APIStore, createHydration, useAPI } from "../../../lib/hooks/useAPI.solid";
import type { Instruments, Registrations, Teachers } from "../../../types/entities";
import Table from "./table/Table.solid";
import { createEffect, createMemo, createSignal, on, Show } from "solid-js";
import { createStore } from "solid-js/store";
import TableControls, { ActionEnum, type Action, ActionIcon, type EmptyAction } from "./table/TableControls.solid";
import { type Props as InputProps, Fill } from "../Input.solid";
import { type ContextType, SelectedItemsContext } from "./table/SelectedRowContext.solid";
import { formErrorWrap, formListener } from "./table/formSubmit";
import Spinner from "../Spinner.solid";
import { PDF } from "../../../lib/pdf.client";

const PREFIX = "registrations";

type ColumnType<T> = Record<keyof T, string | { name: string; size: () => number }>;
type RegistrationsTable = Registrations;

const RegistrationsInputs = (teachers: Teachers[], instruments: Instruments[]): Record<keyof Registrations, InputProps> => {
	let sortTeachers = teachers
		.map(t => t)
		.sort((a, b) => {
			if (a.fullname < b.fullname) return -1;
			if (a.fullname > b.fullname) return 1;
			return 0;
		});
	return {
		id: { name: "id", label: "Id", type: "number", iconClasses: "fa-solid fa-hashtag" },
		am: {
			label: "Αριθμός Μητρώου",
			name: "am",
			type: "text",
			iconClasses: "fa-solid fa-id-card"
		},
		last_name: {
			label: "Επώνυμο",
			name: "last_name",
			type: "text",
			iconClasses: "fa-solid fa-user"
		},
		first_name: {
			label: "Όνομα",
			name: "first_name",
			type: "text",
			iconClasses: "fa-solid fa-user"
		},
		fathers_name: {
			label: "Πατρώνυμο",
			name: "fathers_name",
			type: "text",
			iconClasses: "fa-solid fa-user"
		},
		telephone: {
			label: "Τηλέφωνο",
			name: "telephone",
			type: "text",
			iconClasses: "fa-solid fa-phone"
		},
		cellphone: {
			label: "Κινητό",
			name: "cellphone",
			type: "text",
			iconClasses: "fa-solid fa-mobile-screen"
		},
		email: {
			label: "Email",
			name: "email",
			type: "email",
			iconClasses: "fa-solid fa-envelope"
		},
		birth_date: {
			label: "Ημερομηνία Γέννησης",
			name: "birth_date",
			type: "date",
			iconClasses: "fa-regular fa-calendar"
		},
		road: {
			label: "Οδός",
			name: "road",
			type: "text",
			iconClasses: "fa-solid fa-location-dot"
		},
		number: {
			label: "Αριθμός",
			name: "number",
			type: "number",
			iconClasses: "fa-solid fa-hashtag"
		},
		tk: {
			label: "Τ.Κ.",
			name: "tk",
			type: "number",
			iconClasses: "fa-solid fa-hashtag"
		},
		region: {
			label: "Δήμος/Περιοχή",
			name: "region",
			type: "text",
			iconClasses: "fa-solid fa-tree-city"
		},
		registration_year: {
			label: "Σχολικό Έτος",
			name: "registration_year",
			type: "text",
			iconClasses: "fa-solid fa-calendar",
			value: "2023-2024"
		},
		class_id: {
			label: "Τύπος Μουσικής",
			name: "class_id",
			type: "select",
			selectList: ["Βυζαντινή Μουσική", "Παραδοσιακή Μουσική", "Ευρωπαϊκή Μουσική"],
			iconClasses: "fa-solid fa-graduation-cap"
		},
		teacher_id: {
			label: "Καθηγητής",
			name: "teacher_id",
			type: "select",
			selectList: sortTeachers.map(t => t.fullname),
			valueList: sortTeachers.map(t => t.id),
			iconClasses: "fa-solid fa-user"
		},
		instrument_id: {
			label: "Όργανο",
			name: "instrument_id",
			type: "select",
			selectList: instruments.map(i => i.name),
			valueList: instruments.map(i => i.id),
			iconClasses: "fa-solid fa-guitar"
		},
		class_year: {
			label: "Τάξη",
			name: "class_year",
			type: "text",
			iconClasses: "fa-solid fa-graduation-cap"
		},
		date: {
			label: "Ημερομηνία Εγγραφής",
			name: "date",
			type: "date",
			iconClasses: "fa-regular fa-calendar"
		},
		payment_amount: {
			label: "Ποσό Πληρωμής",
			name: "payment_amount",
			type: "number",
			iconClasses: "fa-solid fa-money-bill"
		},
		payment_date: {
			label: "Ημερομηνία Πληρωμής",
			name: "payment_date",
			type: "date",
			iconClasses: "fa-regular fa-calendar"
		}
	};
};

const registrationToTableRegistration = (
	registration: Registrations,
	teachers: Teachers[],
	instruments: Instruments[]
): RegistrationsTable => {
	const columns = Object.values(registration);
	columns[5] = new Date(columns[5] as number).toLocaleDateString("el-GR");
	columns[15] = class_types[columns[15] as number];
	columns[16] = teachers.find(t => t.id === columns[16])?.fullname || "";
	columns[17] = instruments.find(i => i.id === columns[17])?.name || "";
	let d = new Date(columns[18] as number);
	columns[18] = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
	if (columns[19] === 0 || !columns[19]) columns[19] = "-";
	if (columns[20] === 0 || !columns[20]) columns[20] = "-";
	else {
		d = new Date(columns[20] as number);
		columns[20] = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
	}
	return columns as unknown as RegistrationsTable;
};

const registrationsToTable = (registrations: Registrations[], teachers: Teachers[], instruments: Instruments[]): RegistrationsTable[] => {
	return registrations.map(registration => registrationToTableRegistration(registration, teachers, instruments));
};

const class_types = ["Βυζαντινή Μουσική", "Παραδοσιακή Μουσική", "Ευρωπαϊκή Μουσική"] as const;

export default function RegistrationsTable() {
	const [actionPressed, setActionPressed] = createSignal(ActionEnum.NONE, { equals: false });
	const [store, setStore] = createStore<APIStore>({});
	const hydrate = createHydration(() => {
		useAPI(setStore, API.Registrations.get, {});
		useAPI(setStore, API.Teachers.getByFullnames, {});
		useAPI(setStore, API.Instruments.get, {});
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
	const columnNames: ColumnType<RegistrationsTable> = {
		id: "Id",
		am: { name: "Αριθμός Μητρώου", size: () => 6 },
		last_name: { name: "Επώνυμο", size: () => 15 },
		first_name: { name: "Όνομα", size: () => 15 },
		fathers_name: { name: "Πατρώνυμο", size: () => 15 },
		birth_date: { name: "Ημερομηνία Γέννησης", size: () => 12 },
		road: { name: "Οδός", size: () => 20 },
		number: "Αριθμός",
		tk: "Τ.Κ.",
		region: { name: "Δήμος/Περιοχή", size: () => 15 },
		telephone: { name: "Τηλέφωνο", size: () => 12 },
		cellphone: { name: "Κινητό", size: () => 12 },
		email: { name: "Email", size: () => 20 },
		registration_year: { name: "Σχολικό Έτος", size: () => 10 },
		class_year: { name: "Έτος Φοίτησης", size: () => 15 },
		class_id: { name: "Τάξη", size: () => 15 },
		teacher_id: { name: "Καθηγητής", size: () => 15 },
		instrument_id: { name: "Όργανο", size: () => 15 },
		date: { name: "Ημερομηνία Εγγραφής", size: () => 12 },
		payment_amount: { name: "Ποσό Πληρωμής", size: () => 8 },
		payment_date: { name: "Ημερομηνία Πληρωμής", size: () => 12 }
	};

	const shapedData = createMemo(() => {
		const registrations = store[API.Registrations.get];
		const teachers = store[API.Teachers.getByFullnames];
		const instruments = store[API.Instruments.get];
		if (!registrations || !teachers || !instruments) return [];
		return registrations ? registrationsToTable(registrations, teachers, instruments) : [];
	});

	const onModify = createMemo((): Action | EmptyAction => {
		const registrations = store[API.Registrations.get];
		const teachers = store[API.Teachers.getByFullnames];
		const instruments = store[API.Instruments.get];
		if (!teachers || !registrations || !instruments) return { icon: ActionIcon.MODIFY };
		if (selectedItems.length !== 1) return { icon: ActionIcon.MODIFY };
		const registration = JSON.parse(JSON.stringify(registrations.find(r => r.id === selectedItems[0]) as any)) as Registrations;
		const submit = formErrorWrap(async function (e: Event) {
			e.preventDefault();
			e.stopPropagation();
			const formData = new FormData(e.currentTarget as HTMLFormElement);
			const class_id = Number(formData.get("class_id") as string);
			const data: Registrations = {
				id: registration.id,
				am: formData.get("am") as string,
				last_name: formData.get("last_name") as string,
				first_name: formData.get("first_name") as string,
				fathers_name: formData.get("fathers_name") as string,
				telephone: (formData.get("telephone") as string) || "-",
				cellphone: formData.get("cellphone") as string,
				email: formData.get("email") as string,
				birth_date: new Date(formData.get("birth_date") as string).getTime(),
				road: formData.get("road") as string,
				number: Number(formData.get("number") as string),
				tk: Number(formData.get("tk") as string),
				region: formData.get("region") as string,
				registration_year: formData.get("registration_year") as string,
				class_year: formData.get("class_year") as string,
				class_id,
				teacher_id: Number(formData.get("teacher_id")) || 0,
				instrument_id: (class_id && Number(formData.get("instrument_id"))) || 0,
				date: Date.now(),
				payment_amount: Number(formData.get("payment_amount") as string) || 0,
				payment_date: formData.get("payment_date") ? new Date(formData.get("payment_date") as string).getTime() : null
			};
			await useAPI(setStore, API.Registrations.update, { RequestObject: data });
			setActionPressed(ActionEnum.MODIFY);
		});
		const filledInputs = Fill(RegistrationsInputs(teachers, instruments) as Record<keyof Registrations, InputProps>, registration);
		filledInputs.class_id.value = registration.class_id;
		filledInputs.teacher_id.value = registration.teacher_id;
		filledInputs.instrument_id.value = instruments.find(i => i.id === registration.instrument_id)?.name || 0; // findIndex because the instruments are sorted by name
		return {
			inputs: filledInputs,
			onMount: () => formListener(submit, true, PREFIX),
			onCleanup: () => formListener(submit, false, PREFIX),
			submitText: "Ενημέρωση",
			headerText: "Ενημέρωση Εγγραφής",
			type: ActionEnum.MODIFY,
			icon: ActionIcon.MODIFY
		};
	});
	const onDelete = createMemo((): Action | EmptyAction => {
		const registrations = store[API.Registrations.get];
		if (!registrations || selectedItems.length < 1) return { icon: ActionIcon.DELETE };
		const submit = formErrorWrap(async function (e: Event) {
			e.preventDefault();
			e.stopPropagation();
			const data = selectedItems.map(id => id);
			const res = await useAPI(setStore, API.Registrations.complete, { RequestObject: data });
			if (!res.data && !res.message) return;
			setActionPressed(ActionEnum.DELETE);
		});
		return {
			inputs: {},
			onMount: () => formListener(submit, true, PREFIX),
			onCleanup: () => formListener(submit, false, PREFIX),
			submitText: "Διαγραφή",
			headerText: "Διαγραφή Εγγραφής",
			type: ActionEnum.DELETE,
			icon: ActionIcon.DELETE
		};
	});

	const onSingleDownloadPDf = createMemo(() => {
		const registrations = store[API.Registrations.get];
		const teachers = store[API.Teachers.getByFullnames];
		const instruments = store[API.Instruments.get];
		if (!teachers || !registrations || !instruments || selectedItems.length !== 1) return { icon: ActionIcon.DOWNLOAD_SINGLE };
		const onSubmit = formErrorWrap(async function (e: Event) {
			e.preventDefault();
			e.stopPropagation();
			const student = registrations.find(r => r.id === selectedItems[0]) as Registrations;
			const teacher = teachers.find(t => t.id === student.teacher_id) as Teachers;
			const instrument = (!student.class_id && (instruments.find(i => i.id === student.instrument_id) as Instruments)) || null;
			try {
				const pdf = new PDF();
				// load pdf library
				await PDF.loadPDFLib();
				pdf.setTemplateData(student, teacher.fullname, instrument?.name || "");
				await pdf.loadTemplate();
				await pdf.fillTemplate();
				await pdf.download();
			} catch (error) {
				console.error(error);
			}

			setActionPressed(ActionEnum.DOWNLOAD);
		});
		return {
			inputs: {},
			onMount: () => formListener(onSubmit, true, PREFIX),
			onCleanup: () => formListener(onSubmit, false, PREFIX),
			submitText: "Λήψη",
			headerText: "Λήψη Εγγράφης σε PDF",
			type: ActionEnum.DOWNLOAD,
			icon: ActionIcon.DOWNLOAD_SINGLE
		};
	});

	return (
		<SelectedItemsContext.Provider value={ROWS as ContextType}>
			<Show
				when={store[API.Registrations.get] && store[API.Teachers.getByFullnames] && store[API.Instruments.get]}
				fallback={<Spinner />}
			>
				<Table prefix={PREFIX} data={shapedData} columnNames={columnNames}>
					<TableControls pressedAction={actionPressed} onActionsArray={[onModify, onDelete]} prefix={PREFIX} />
					<TableControls pressedAction={actionPressed} onActionsArray={[onSingleDownloadPDf]} prefix={PREFIX} />
				</Table>
			</Show>
		</SelectedItemsContext.Provider>
	);
}
