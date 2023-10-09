import {
	API,
	type APIStore,
	useHydrate,
	useAPI,
} from "../../../lib/hooks/useAPI.solid";
import type {
	Instruments,
	Registrations,
	Teachers,
} from "../../../types/entities";
import Table, { type ColumnType } from "./table/Table.solid";
import { createEffect, createMemo, Show, onMount } from "solid-js";
import { createStore } from "solid-js/store";
import TableControls, {
	ActionEnum,
	type Action,
	ActionIcon,
	type EmptyAction,
} from "./table/TableControls.solid";
import { type Props as InputProps, Fill } from "../Input.solid";
import { SelectedItemsContext } from "./table/SelectedRowContext.solid";
import { formErrorWrap, formListener } from "./table/formSubmit";
import Spinner from "../Spinner.solid";
import { PDF, loadXLSX } from "../../../lib/pdf.client";
import {
	SearchTable,
	type SearchColumn,
	type SearchSetter,
	CompareList,
	getCompareFn,
} from "./SearchTable.solid";
import { removeAccents } from "../../../lib/utils.client";
import { useHydrateById } from "../../../lib/hooks/useHydrateById.solid";
import { useSelectedRows } from "../../../lib/hooks/useSelectedRows.solid";

const PREFIX = "registrations";

type RegistrationsTable = Registrations;

const RegistrationsInputs = (
	teachers: Teachers[],
	instruments: Instruments[]
): Record<keyof Registrations, InputProps> => {
	let sortTeachers = teachers
		.map((t) => t)
		.sort((a, b) => {
			if (a.fullname < b.fullname) return -1;
			if (a.fullname > b.fullname) return 1;
			return 0;
		});
	return {
		id: {
			name: "id",
			label: "Id",
			type: "number",
			iconClasses: "fa-solid fa-hashtag",
		},
		am: {
			label: "Αριθμός Μητρώου",
			name: "am",
			type: "text",
			iconClasses: "fa-solid fa-id-card",
		},
		last_name: {
			label: "Επώνυμο",
			name: "last_name",
			type: "text",
			iconClasses: "fa-solid fa-user",
		},
		first_name: {
			label: "Όνομα",
			name: "first_name",
			type: "text",
			iconClasses: "fa-solid fa-user",
		},
		fathers_name: {
			label: "Πατρώνυμο",
			name: "fathers_name",
			type: "text",
			iconClasses: "fa-solid fa-user",
		},
		telephone: {
			label: "Τηλέφωνο",
			name: "telephone",
			type: "text",
			iconClasses: "fa-solid fa-phone",
		},
		cellphone: {
			label: "Κινητό",
			name: "cellphone",
			type: "text",
			iconClasses: "fa-solid fa-mobile-screen",
		},
		email: {
			label: "Email",
			name: "email",
			type: "email",
			iconClasses: "fa-solid fa-envelope",
		},
		birth_date: {
			label: "Ημερομηνία Γέννησης",
			name: "birth_date",
			type: "date",
			iconClasses: "fa-regular fa-calendar",
		},
		road: {
			label: "Οδός",
			name: "road",
			type: "text",
			iconClasses: "fa-solid fa-location-dot",
		},
		number: {
			label: "Αριθμός",
			name: "number",
			type: "number",
			iconClasses: "fa-solid fa-hashtag",
		},
		tk: {
			label: "Τ.Κ.",
			name: "tk",
			type: "number",
			iconClasses: "fa-solid fa-hashtag",
		},
		region: {
			label: "Δήμος/Περιοχή",
			name: "region",
			type: "text",
			iconClasses: "fa-solid fa-tree-city",
		},
		registration_year: {
			label: "Σχολικό Έτος",
			name: "registration_year",
			type: "text",
			iconClasses: "fa-solid fa-calendar",
			value: "2023-2024",
		},
		class_id: {
			label: "Τύπος Μουσικής",
			name: "class_id",
			type: "select",
			selectList: [
				"Βυζαντινή Μουσική",
				"Παραδοσιακή Μουσική",
				"Ευρωπαϊκή Μουσική",
			],
			iconClasses: "fa-solid fa-graduation-cap",
		},
		teacher_id: {
			label: "Καθηγητής",
			name: "teacher_id",
			type: "select",
			selectList: sortTeachers.map((t) => t.fullname),
			valueList: sortTeachers.map((t) => t.id),
			iconClasses: "fa-solid fa-user",
		},
		instrument_id: {
			label: "Όργανο",
			name: "instrument_id",
			type: "select",
			selectList: instruments.map((i) => i.name),
			valueList: instruments.map((i) => i.id),
			iconClasses: "fa-solid fa-guitar",
		},
		class_year: {
			label: "Τάξη",
			name: "class_year",
			type: "text",
			iconClasses: "fa-solid fa-graduation-cap",
		},
		date: {
			label: "Ημερομηνία Εγγραφής",
			name: "date",
			type: "date",
			iconClasses: "fa-regular fa-calendar",
		},
		payment_amount: {
			label: "Ποσό Πληρωμής",
			name: "payment_amount",
			type: "number",
			iconClasses: "fa-solid fa-money-bill",
		},
		total_payment: {
			label: "Σύνολο Πληρωμής",
			name: "total_payment",
			type: "number",
			iconClasses: "fa-solid fa-money-bill",
		},
		payment_date: {
			label: "Ημερομηνία Πληρωμής",
			name: "payment_date",
			type: "date",
			iconClasses: "fa-regular fa-calendar",
		},
	};
};

const registrationsToTable = (
	registrations: Registrations[],
	teachers: Teachers[],
	instruments: Instruments[]
): RegistrationsTable[] => {
	return registrations.map((reg) => {
		const columns = Object.values(reg);
		columns[15] = [
			"Βυζαντινή Μουσική",
			"Παραδοσιακή Μουσική",
			"Ευρωπαϊκή Μουσική",
		][columns[15] as number];
		columns[16] =
			teachers.find((t) => t.id === columns[16])?.fullname || "";
		columns[17] = instruments.find((i) => i.id === columns[17])?.name || "";
		if (columns[19] === 0 || !columns[19]) columns[19] = "-";
		if (columns[20] === 0 || !columns[20]) columns[20] = "-";
		return columns as unknown as RegistrationsTable;
	});
};

const columns: ColumnType<RegistrationsTable> = {
	id: { type: "number", name: "Id" },
	am: { type: "number", name: "Αριθμός Μητρώου", size: 6 },
	last_name: { type: "string", name: "Επώνυμο", size: 15 },
	first_name: { type: "string", name: "Όνομα", size: 15 },
	fathers_name: { type: "string", name: "Πατρώνυμο", size: 15 },
	birth_date: { type: "date", name: "Ημερομηνία Γέννησης", size: 12 },
	road: { type: "string", name: "Οδός", size: 20 },
	number: { type: "number", name: "Αριθμός" },
	tk: { type: "number", name: "Τ.Κ." },
	region: { type: "string", name: "Δήμος/Περιοχή", size: 15 },
	telephone: { type: "string", name: "Τηλέφωνο", size: 12 },
	cellphone: { type: "string", name: "Κινητό", size: 12 },
	email: { type: "string", name: "Email", size: 20 },
	registration_year: { type: "string", name: "Σχολικό Έτος", size: 10 },
	class_year: { type: "string", name: "Έτος Φοίτησης", size: 15 },
	class_id: { type: "string", name: "Τάξη", size: 15 },
	teacher_id: { type: "string", name: "Καθηγητής", size: 15 },
	instrument_id: { type: "string", name: "Όργανο", size: 15 },
	date: { type: "date", name: "Ημερομηνία Εγγραφής", size: 12 },
	payment_amount: { type: "number", name: "Ποσό Πληρωμής", size: 8 },
	total_payment: { type: "number", name: "Σύνολο Πληρωμής", size: 8 },
	payment_date: { type: "date", name: "Ημερομηνία Πληρωμής", size: 12 },
};

const searchColumns: SearchColumn[] = [
	{ columnName: "am", name: "ΑΜ", type: "number" },
	{ columnName: "last_name", name: "Επώνυμο", type: "string" },
	{ columnName: "first_name", name: "Όνομα", type: "string" },
	{ columnName: "telephone", name: "Τηλέφωνο", type: "string" },
	{ columnName: "cellphone", name: "Κινητό", type: "string" },
	{ columnName: "email", name: "Email", type: "string" },
	{ columnName: "date", name: "Ημερομηνία Εγγραφής", type: "date" },
	{ columnName: "class_year", name: "Έτος Φοίτησης", type: "string" },
];

const [selectedItems, setSelectedItems] = useSelectedRows();

export default function RegistrationsTable() {
	const [searchQuery, setSearchQuery] = createStore<SearchSetter>({});
	const [store, setStore] = createStore<APIStore>({});
	const [actionPressed, setActionPressed] = useHydrateById(
		setStore,
		API.Registrations.getById,
		API.Registrations.get
	);
	useHydrate(() => {
		useAPI(setStore, API.Registrations.get, {});
		useAPI(setStore, API.Teachers.getByFullnames, {});
		useAPI(setStore, API.Instruments.get, {});
	})(true);

	const shapedData = createMemo(() => {
		const registrations = store[API.Registrations.get];
		const teachers = store[API.Teachers.getByFullnames];
		const instruments = store[API.Instruments.get];
		if (!registrations || !teachers || !instruments) return [];
		let { columnName, value, type } = searchQuery;
		if (!columnName || !value || !type)
			return registrationsToTable(registrations, teachers, instruments);
		let searchRows: Registrations[] = [];

		if (type === "number") {
			// @ts-ignore value is misstyped....
			const EqCheck = CompareList.findLast((c) => value.startsWith(c));
			const fn = EqCheck && getCompareFn(value);
			const nVal = Number(value.slice((EqCheck || "").length));
			searchRows = registrations
				.map((x) => x)
				.filter((r) => {
					const nCol = Number(r[columnName as keyof Registrations]); //Converting to number because the column might be a stringified number
					if (fn) return fn(nCol, nVal);
					let sCol = "" + nCol;
					let sVal = "" + nVal;
					return sCol.includes(sVal);
				});
		} else if (type === "string") {
			searchRows = registrations
				.map((x) => x)
				.filter((r) => {
					const col = r[columnName as keyof Registrations];
					const nsCol = removeAccents(col as string).toLowerCase();
					const nsVal = removeAccents(value as string).toLowerCase();
					return nsCol.includes(nsVal);
				});
		} else if (type === "date") {
			// @ts-ignore
			const EqCheck = CompareList.findLast((c) => value.startsWith(c));
			const fn = EqCheck && getCompareFn(value);
			value = value.replace(EqCheck || "", "");
			if (EqCheck === "=") {
				return registrations
					.map((x) => x)
					.filter((r) => {
						const nCol = r[
							columnName as keyof Registrations
						] as number;
						const sCol = new Date(nCol).toLocaleDateString("el-GR");
						return value === sCol;
					});
			}

			let [day, month = 1, year = 1970] = value
				.split("/")
				.map((x) => Number(x));
			const dVal = new Date(year, month - 1, day);
			const nVal = dVal.getTime();
			const sVal = dVal.toLocaleDateString("el-GR");
			searchRows = registrations
				.map((x) => x)
				.filter((r) => {
					const nCol = r[columnName as keyof Registrations] as number;
					if (fn) return fn(nCol, nVal - 1);
					let sCol = new Date(nCol).toLocaleDateString("el-GR");
					return sCol.includes(sVal);
				});
		}
		if (searchRows.length) {
			// Reset the checked rows when a search is made
			setSelectedItems.removeAll();
			document
				.querySelectorAll(".mcb, .cb")
				.forEach((r) => r.classList.remove("selected"));
		}
		return registrationsToTable(searchRows, teachers, instruments);
	});

	const onModify = createMemo((): Action | EmptyAction => {
		const registrations = store[API.Registrations.get];
		const teachers = store[API.Teachers.getByFullnames];
		const instruments = store[API.Instruments.get];
		if (!teachers || !registrations || !instruments)
			return { icon: ActionIcon.MODIFY };
		if (selectedItems.length !== 1) return { icon: ActionIcon.MODIFY };
		const registration = JSON.parse(
			JSON.stringify(
				registrations.find((r) => r.id === selectedItems[0]) as any
			)
		) as Registrations;
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
				birth_date: new Date(
					formData.get("birth_date") as string
				).getTime(),
				road: formData.get("road") as string,
				number: Number(formData.get("number") as string),
				tk: Number(formData.get("tk") as string),
				region: formData.get("region") as string,
				registration_year: formData.get("registration_year") as string,
				class_year: formData.get("class_year") as string,
				class_id,
				teacher_id: Number(formData.get("teacher_id")) || 0,
				instrument_id:
					(class_id && Number(formData.get("instrument_id"))) || 0,
				date: new Date(formData.get("date") as string).getTime(),
				payment_amount:
					Number(formData.get("payment_amount") as string) || 0,
				total_payment:
					Number(formData.get("total_payment") as string) || 0,
				payment_date: formData.get("payment_date")
					? new Date(formData.get("payment_date") as string).getTime()
					: null,
			};
			await useAPI(setStore, API.Registrations.update, {
				RequestObject: data,
			});
			setActionPressed({ action: ActionEnum.MODIFY, mutate: [data.id] });
		});
		const filledInputs = Fill(
			RegistrationsInputs(teachers, instruments) as Record<
				keyof Registrations,
				InputProps
			>,
			registration
		);
		filledInputs.class_id.value = registration.class_id;
		filledInputs.teacher_id.value = registration.teacher_id;
		filledInputs.instrument_id.value =
			instruments.find((i) => i.id === registration.instrument_id)?.id ||
			0; // findIndex because the instruments are sorted by name
		return {
			inputs: filledInputs,
			onMount: () => formListener(submit, true, PREFIX),
			onCleanup: () => formListener(submit, false, PREFIX),
			submitText: "Ενημέρωση",
			headerText: "Ενημέρωση Εγγραφής",
			icon: ActionIcon.MODIFY,
		};
	});
	const onDelete = createMemo((): Action | EmptyAction => {
		const registrations = store[API.Registrations.get];
		if (!registrations || selectedItems.length < 1)
			return { icon: ActionIcon.DELETE };
		const submit = formErrorWrap(async function (e: Event) {
			e.preventDefault();
			e.stopPropagation();
			const data = selectedItems.map((id) => id);
			const res = await useAPI(setStore, API.Registrations.delete, {
				RequestObject: data,
			});
			if (!res.data && !res.message) return;
			setActionPressed({ action: ActionEnum.DELETE, mutate: data });
		});
		return {
			inputs: {},
			onMount: () => formListener(submit, true, PREFIX),
			onCleanup: () => formListener(submit, false, PREFIX),
			submitText: "Διαγραφή",
			headerText: "Διαγραφή Εγγραφής",
			icon: ActionIcon.DELETE,
		};
	});

	const onDownloadPDf = createMemo(() => {
		const registrations = store[API.Registrations.get];
		const teachers = store[API.Teachers.getByFullnames];
		const instruments = store[API.Instruments.get];
		if (
			!teachers ||
			!registrations ||
			!instruments ||
			selectedItems.length <= 0
		)
			return { icon: ActionIcon.DOWNLOAD_SINGLE };

		let bulk = selectedItems.length > 1;

		const onSubmit = !bulk
			? formErrorWrap(async function (e: Event) {
					e.preventDefault();
					e.stopPropagation();
					const student = registrations.find(
						(r) => r.id === selectedItems[0]
					) as Registrations;
					const teacher = teachers.find(
						(t) => t.id === student.teacher_id
					) as Teachers;
					const instrument =
						(student.class_id &&
							(instruments.find(
								(i) => i.id === student.instrument_id
							) as Instruments)) ||
						null;
					try {
						const pdf = await PDF.createInstance();
						pdf.setTemplateData(
							student,
							teacher.fullname,
							instrument?.name || ""
						);
						await pdf.fillTemplate();
						await pdf.download();
					} catch (error) {}
					setActionPressed({
						action: ActionEnum.DOWNLOAD,
						mutate: [],
					});
			  })
			: formErrorWrap(async function (e: Event) {
					e.preventDefault();
					e.stopPropagation();
					const items = selectedItems.map((id) => {
						const student = registrations.find(
							(r) => r.id === id
						) as Registrations;
						const teacher = teachers.find(
							(t) => t.id === student.teacher_id
						) as Teachers;
						const instrument =
							(student.class_id &&
								(instruments.find(
									(i) => i.id === student.instrument_id
								) as Instruments)) ||
							null;
						return { student, teacher, instrument };
					});
					let pdfArr: PDF[] = [];
					try {
						for (const item of items) {
							const pdf = await PDF.createInstance();
							pdf.setTemplateData(
								item.student,
								item.teacher.fullname,
								item.instrument?.name || ""
							);
							pdfArr.push(pdf);
						}
						await PDF.downloadBulk(pdfArr);
					} catch (error) {}
					setActionPressed({
						action: ActionEnum.DOWNLOAD,
						mutate: [],
					});
			  });
		return {
			inputs: {},
			onMount: () => formListener(onSubmit, true, PREFIX),
			onCleanup: () => formListener(onSubmit, false, PREFIX),
			submitText: "Λήψη",
			headerText: bulk ? "Λήψη Εγγραφών σε PDF" : "Λήψη Εγγράφης σε PDF",

			icon:
				selectedItems.length > 1
					? ActionIcon.DOWNLOAD_ZIP
					: ActionIcon.DOWNLOAD_SINGLE,
		};
	});

	const onDownloadExcel = createMemo(() => {
		const registrations = store[API.Registrations.get];
		const teachers = store[API.Teachers.getByFullnames];
		const instruments = store[API.Instruments.get];
		if (
			!teachers ||
			!registrations ||
			!instruments ||
			selectedItems.length <= 0
		)
			return { icon: ActionIcon.DOWNLOAD_EXCEL };

		const onSubmit = formErrorWrap(async function (e: Event) {
			e.preventDefault();
			e.stopPropagation();
			const items = selectedItems
				.map((id) => {
					const student = registrations.find((r) => r.id === id);
					if (!student) return;
					const teacher = teachers.find(
						(t) => t.id === student.teacher_id
					);
					if (!teacher) return;
					const instrument =
						(student.class_id &&
							(instruments.find(
								(i) => i.id === student.instrument_id
							) as Instruments)) ||
						null;
					return { student, teacher, instrument };
				})
				.filter((x) => !!x) as {
				student: Registrations;
				teacher: Teachers;
				instrument: Instruments | null;
			}[];
			const xlsx = await loadXLSX();
			const wb = xlsx.utils.book_new();
			const wsStudentsBook = xlsx.utils.aoa_to_sheet(
				[
					[
						"Αριθμός Μητρώου",
						"Επώνυμο",
						"Όνομα",
						"Όνομα Πατρός",
						"Έτος Γέννησης",
						"Διεύθυνση",
						"Ημερομηνία Εγγραφής",
						"Διδάσκων Καθηγητής",
						"Email",
						"Τηλέφωνα",
					],
				].concat(
					items.map((item) => {
						return [
							item.student.am,
							item.student.last_name,
							item.student.first_name,
							item.student.fathers_name,
							"" +
								new Date(item.student.birth_date).getFullYear(),
							`${item.student.road} ${item.student.number}, ${item.student.region}, ${item.student.tk}`,
							new Date(item.student.date).toLocaleDateString(
								"el-GR"
							),
							item.teacher.fullname,
							item.student.email,
							item.student.telephone +
								"-" +
								item.student.cellphone,
						];
					})
				)
			);
			const wsSchoolYearBook = xlsx.utils.aoa_to_sheet(
				[
					[
						"Αριθμός Μητρώου",
						"Επώνυμο",
						"Όνομα",
						"Όνομα Πατρός",
						"Έτος Γέννησης",
						"Διεύθυνση",
						"Έτος Φόιτησης",
						"Διδάσκων Καθηγητής",
						"Όργανο",
					],
				].concat(
					items.map((item) => {
						return [
							item.student.am,
							item.student.last_name,
							item.student.first_name,
							item.student.fathers_name,
							"" +
								new Date(item.student.birth_date).getFullYear(),
							`${item.student.road} ${item.student.number}, ${item.student.region}, ${item.student.tk}`,
							item.student.class_year,
							item.teacher.fullname,
							item.instrument?.name || "",
						];
					})
				)
			);
			const wsBookByTeacher = teachers.map((teacher) => {
				const students = items.filter(
					(item) => item.teacher.id === teacher.id
				);
				if (!students.length) return;
				return xlsx.utils.aoa_to_sheet(
					[
						[
							"Αριθμός Μητρώου",
							"Επώνυμο",
							"Όνομα",
							"Όνομα Πατρός",
							"Έτος Γέννησης",
							"Διεύθυνση",
							"Ημερομηνία Εγγραφής",
							"Έτος Φόιτησης",
							"Διδάσκων Καθηγητής",
							"Email",
							"Τηλέφωνα",
						],
					].concat(
						students.map((item) => {
							return [
								item.student.am,
								item.student.last_name,
								item.student.first_name,
								item.student.fathers_name,
								"" +
									new Date(
										item.student.birth_date
									).getFullYear(),
								`${item.student.road} ${item.student.number}, ${item.student.region}, ${item.student.tk}`,
								new Date(item.student.date).toLocaleDateString(
									"el-GR"
								),
								item.student.class_year,
								item.teacher.fullname,
								item.student.email,
								item.student.telephone +
									"-" +
									item.student.cellphone,
							];
						})
					)
				);
			});
			xlsx.utils.book_append_sheet(wb, wsStudentsBook, "Γενικό Μητρώο");
			xlsx.utils.book_append_sheet(wb, wsSchoolYearBook, "Μαθητολόγιο");
			wsBookByTeacher.forEach((ws, i) => {
				if (!ws) return;
				xlsx.utils.book_append_sheet(wb, ws, teachers[i].fullname);
			});
			xlsx.writeFile(wb, "Εγγραφές.xlsx");
		});
		return {
			inputs: {},
			onMount: () => formListener(onSubmit, true, PREFIX),
			onCleanup: () => formListener(onSubmit, false, PREFIX),
			submitText: "Λήψη",
			headerText: "Λήψη Εγγραφών σε Excel",

			icon: ActionIcon.DOWNLOAD_EXCEL,
		};
	});

	createEffect(() => {
		const registrations = store[API.Registrations.get];
		const teachers = store[API.Teachers.getByFullnames];
		const instruments = store[API.Instruments.get];
		if (!registrations || !teachers || !instruments) return;
		let { columnName, value, type } = searchQuery;
		if (!columnName || !value || !type) {
			// Make use of the variables to avoid optimization and therefore not triggering the effect when a search is made
			document.dispatchEvent(new Event("hydrate"));
		} else {
			document.dispatchEvent(new Event("hydrate"));
		}
	});

	onMount(() => {
		document.addEventListener("hydrate", (e) => {
			e.stopPropagation();
			let registrations = store[API.Registrations.get];
			if (!registrations) return;
			let rows = [
				...document.querySelectorAll<HTMLElement>(".row[data-id]"),
			];
			let result = rows
				.map((row) => {
					const id = Number(row.dataset.id);
					//@ts-ignore
					let reg = registrations.find((r) => r.id === id);
					if (reg) return { row, registration: reg };
					return null;
				})
				.filter((x) => !!x) as {
				row: HTMLElement;
				registration: Registrations;
			}[];
			result.forEach(({ row, registration }) => {
				const payment_status =
					registration.total_payment - registration.payment_amount;
				if (
					registration.payment_amount === 0 &&
					registration.total_payment === 0
				)
					return;
				if (payment_status === 0) row.setAttribute("data-paid", "");
				else if (
					payment_status > 0 ||
					(registration.payment_amount > registration.total_payment &&
						registration.total_payment === 0)
				)
					row.setAttribute("data-partially-paid", "");
			});
		});
	});

	return (
		<SelectedItemsContext.Provider
			value={[selectedItems, setSelectedItems]}
		>
			<Show
				when={
					store[API.Registrations.get] &&
					store[API.Teachers.getByFullnames] &&
					store[API.Instruments.get]
				}
				fallback={<Spinner classes="max-sm:h-[100svh]" />}
			>
				<Table
					prefix={PREFIX}
					data={shapedData}
					columns={columns}
					hasSelectBox
				>
					<TableControls
						pressedAction={actionPressed}
						onActionsArray={[onModify, onDelete]}
						prefix={PREFIX}
					/>
					<TableControls
						pressedAction={actionPressed}
						onActionsArray={[onDownloadPDf, onDownloadExcel]}
						prefix={PREFIX}
					/>
					<SearchTable
						columns={searchColumns}
						setSearchQuery={setSearchQuery}
					/>
				</Table>
			</Show>
			{/* Registration specific row styles */}
			<style>
				{`
/* Paid rows */
.row[data-paid]:nth-child(odd)::before {
	background: linear-gradient(to right, #6FD286, 80px, rgb(243,244,246) 160px);
}
.row[data-paid]::before {
	background: linear-gradient(to right, #6FD286, 80px, white 160px);
}
.row[data-paid]:is(.selectedRow){
	background: linear-gradient(to right, #6FD286, 80px, rgb(254,202,202) 160px);
}

/* Partially-Paid rows */
.row[data-partially-paid]:nth-child(odd)::before {
	background: linear-gradient(to right, #FDE85A, 80px, rgb(243,244,246) 160px);
}
.row[data-partially-paid]::before {
	background: linear-gradient(to right, #FDE85A, 80px, white 160px);
}
.row[data-partially-paid]:is(.selectedRow){
	background: linear-gradient(to right, #FDE85A, 80px, rgb(254,202,202) 160px);
}

`}
			</style>
		</SelectedItemsContext.Provider>
	);
}
