import { Show, createEffect, createMemo, createSignal, on, onMount, untrack } from "solid-js";
import { createStore } from "solid-js/store";
import { API, useAPI, useHydrate, type APIStore } from "../../../lib/hooks/useAPI.solid";
import { useHydrateById } from "../../../lib/hooks/useHydrateById.solid";
import { SelectedRows } from "../../../lib/hooks/useSelectedRows.solid";
import { PDF, loadXLSX } from "../../../lib/pdf.client";
import {
	ExtendedFormData,
	getKeyIndex,
	looseStringIncludes,
	onElementMount,
} from "../../../lib/utils.client";
import type { Instruments, Registrations, Teachers } from "../../../types/entities";
import { InputFields, type Props as InputProps } from "../input/Input.solid";
import Spinner from "../other/Spinner.solid";
import {
	CompareList,
	getCompareFn,
	type SearchColumn,
	type SearchSetter,
} from "./SearchTable.solid";
import Table, { type ColumnType } from "./table/Table.solid";
import { ActionEnum, ActionIcon, type EmptyAction } from "./table/TableControlTypes";
import { type Action } from "./table/TableControls.solid";

import { createAlert, pushAlert, updateAlert } from "./Alert.solid";
import { toggleCheckbox, toggleCheckboxes } from "./table/Row.solid";

const PREFIX = "registrations";

type RegistrationsTable = Omit<Registrations, "registration_url">;

const RegistrationsInputs = (
	student: Registrations,
	teachers: Teachers[],
	instruments: Instruments[]
): Record<keyof RegistrationsTable, InputProps> => {
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
		amka: {
			label: "ΑΜΚΑ",
			name: "amka",
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
			iconClasses: "fa-regular fa-calendar-days",
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
			iconClasses: "fa-solid fa-calendar-days",
			value: "2023-2024",
		},
		class_id: {
			label: "Τύπος Μουσικής",
			name: "class_id",
			type: "select",
			selectList: ["Βυζαντινή Μουσική", "Παραδοσιακή Μουσική", "Ευρωπαϊκή Μουσική"],
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
			iconClasses: "fa-regular fa-calendar-day",
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
			iconClasses: "fa-regular fa-calendar-days",
		},
		pass: {
			label: "Προάχθει",
			name: "pass",
			type: "multiselect",
			iconClasses: "fa-solid fa-check",
			multiselectOnce: true,
			multiselectList: [
				{ value: 1, label: "Ναί", selected: !!student?.pass },
				{ value: 0, label: "Όχι", selected: !student?.pass },
			],
		},
	};
};

const registrationsToTable = (
	registrations: Registrations[],
	teachers: Teachers[],
	instruments: Instruments[]
) => {
	return registrations.map((reg) => {
		const columns = Object.values(reg) as any[];
		columns[15] = ["Βυζαντινή Μουσική", "Παραδοσιακή Μουσική", "Ευρωπαϊκή Μουσική"][
			columns[15] as number
		];
		columns[16] = teachers.find((t) => t.id === columns[16])?.fullname;
		columns[17] = instruments.find((i) => i.id === columns[17])?.name;
		if (columns[19] === 0 || !columns[19]) columns[19] = null;
		if (columns[20] === 0 || !columns[20]) columns[20] = null;
		columns[22] = reg.amka;
		columns[23] = reg.pass;
		// Removing the subscription_url column
		return columns.slice(0, 24) as unknown as RegistrationsTable;
	});
};

const columns: ColumnType<RegistrationsTable> = {
	id: { type: "number", name: "Id" },
	am: { type: "number", name: "Αριθμός Μητρώου", size: 7 },
	last_name: { type: "string", name: "Επώνυμο", size: 15 },
	first_name: { type: "string", name: "Όνομα", size: 15 },
	fathers_name: { type: "string", name: "Πατρώνυμο", size: 15 },
	birth_date: { type: "date", name: "Ημερομηνία Γέννησης", size: 12 },
	road: { type: "string", name: "Οδός", size: 15 },
	number: { type: "number", name: "Αριθμός" },
	tk: { type: "number", name: "Τ.Κ." },
	region: { type: "string", name: "Δήμος/Περιοχή", size: 15 },
	telephone: { type: "string", name: "Τηλέφωνο", size: 12 },
	cellphone: { type: "string", name: "Κινητό", size: 12 },
	email: { type: "string", name: "Email", size: 20 },
	registration_year: { type: "string", name: "Σχολικό Έτος", size: 10 },
	class_year: { type: "string", name: "Έτος Φοίτησης", size: 12 },
	class_id: { type: "string", name: "Τάξη", size: 15 },
	teacher_id: { type: "string", name: "Καθηγητής", size: 15 },
	instrument_id: { type: "string", name: "Όργανο", size: 12 },
	date: { type: "date", name: "Ημερομηνία Εγγραφής", size: 12 },
	payment_amount: { type: "number", name: "Ποσό Πληρωμής", size: 8 },
	total_payment: { type: "number", name: "Σύνολο Πληρωμής", size: 8 },
	payment_date: { type: "date", name: "Ημερομηνία Πληρωμής", size: 12 },
	amka: { type: "string", name: "ΑΜΚΑ", size: 15 },
	pass: { type: "boolean", name: "Προάχθει", size: 8 },
};

const searchColumns: SearchColumn[] = [
	{ columnName: "last_name", name: "Επώνυμο", type: "string" },
	{ columnName: "first_name", name: "Όνομα", type: "string" },
	{ columnName: "am", name: "ΑΜ", type: "number" },
	{ columnName: "amka", name: "ΑΜΚΑ", type: "string" },
	{ columnName: "teacher_id", name: "Καθηγητής", type: "string" },
	{ columnName: "telephone", name: "Τηλέφωνο", type: "string" },
	{ columnName: "cellphone", name: "Κινητό", type: "string" },
	{ columnName: "email", name: "Email", type: "string" },
	{ columnName: "date", name: "Ημερομηνία Εγγραφής", type: "date" },
	{ columnName: "class_year", name: "Έτος Φοίτησης", type: "string" },
];

export default function RegistrationsTable() {
	const selectedItems = new SelectedRows().useSelectedRows();
	const [searchQuery, setSearchQuery] = createStore<SearchSetter<Registrations>>({});

	const [year, setYear] = createSignal(new Date().getFullYear());
	const [store, setStore] = createStore<APIStore>({});
	const apiHook = useAPI(setStore);
	const setRegistrationHydrate = useHydrateById({
		setStore,
		mutations: [
			{
				srcEndpoint: API.Registrations.getById,
				destEndpoint: API.Registrations.get,
			},
		],
	});
	const [dataLength, setDataLength] = createSignal(0);

	useHydrate(() => {
		apiHook(API.Registrations.get, { UrlArgs: { year: year() } });
		apiHook(API.Registrations.get);
		apiHook(API.Teachers.getByFullnames);
		apiHook(API.Instruments.get);
	});

	createEffect(
		on(year, (y) => {
			apiHook(API.Registrations.get, { UrlArgs: { year: y } });
		})
	);

	const shapedData = createMemo(() => {
		const registrations = store[API.Registrations.get];
		const teachers = store[API.Teachers.getByFullnames];
		const instruments = store[API.Instruments.get];
		if (!registrations || !teachers || !instruments) return [];
		let { columnName, value, type } = searchQuery;
		if (!columnName || !value || !type) {
			toggleCheckboxes(false);
			setDataLength(registrations.length);
			return registrationsToTable(registrations, teachers, instruments);
		}
		let searchRows = registrationsToTable(registrations, teachers, instruments);
		const columnIndex = getKeyIndex(columnName, registrations[0]);
		if (type === "number") {
			// @ts-ignore value is misstyped....
			const EqCheck = CompareList.findLast((col) => value.startsWith(col));
			const nVal = Number(value.slice((EqCheck || "").length));
			const fn = EqCheck && getCompareFn(value);
			searchRows = searchRows.filter((row) => {
				//@ts-ignore
				const nCol = Number(row[columnIndex]); //Converting to number because the column might be a stringified number
				if (fn) return fn(nCol, nVal);
				let sCol = "" + nCol;
				let sVal = "" + nVal;
				return sCol.includes(sVal) || sVal === sCol;
			});
		} else if (type === "string") {
			searchRows = searchRows.filter((r) => {
				//@ts-ignore
				const col = r[columnIndex] as string;
				if (!col) {
					// In case where there is not a value for the column
					return false;
				}
				return looseStringIncludes(col, value as string);
			});
		} else if (type === "date") {
			// @ts-ignore
			const EqCheck = CompareList.findLast((c) => value.startsWith(c));
			const fn = EqCheck && getCompareFn(value);
			value = value.replace(EqCheck || "", "");
			if (EqCheck === "=") {
				return searchRows.filter((r) => {
					//@ts-ignore
					const nCol = r[columnIndex] as number;
					const sCol = new Date(nCol).toLocaleDateString("el-GR");
					return value === sCol;
				});
			}

			let [day, month = 1, year = 1970] = value.split("/").map((x) => Number(x));
			const dVal = new Date(year, month - 1, day);
			const nVal = dVal.getTime();
			const sVal = dVal.toLocaleDateString("el-GR");
			searchRows = searchRows.filter((r) => {
				//@ts-ignore
				const nCol = r[columnIndex] as number;
				if (fn) return fn(nCol, nVal - 1);
				let sCol = new Date(nCol).toLocaleDateString("el-GR");
				return sCol.includes(sVal);
			});
		}
		toggleCheckboxes(false);
		setDataLength(searchRows.length);
		return searchRows;
	});

	const onModify = createMemo((): Action | EmptyAction => {
		const modifyModal = {
			type: ActionEnum.MODIFY,
			icon: ActionIcon.MODIFY,
		};
		const registrations = store[API.Registrations.get];
		const teachers = store[API.Teachers.getByFullnames];
		const instruments = store[API.Instruments.get];
		if (!teachers || !registrations || !instruments || selectedItems.length !== 1)
			return modifyModal;

		const registration = JSON.parse(
			JSON.stringify(registrations.find((r) => r.id === selectedItems[0]) as any)
		) as Registrations;
		const submit = async function (form: ExtendedFormData<Registrations>) {
			const class_id = form.number("class_id");
			const data: Registrations = {
				id: registration.id,
				am: form.string("am"),
				amka: form.string("amka", ""),
				last_name: form.string("last_name"),
				first_name: form.string("first_name"),
				fathers_name: form.string("fathers_name"),
				telephone: form.string("telephone", "-"),
				cellphone: form.string("cellphone"),
				email: form.string("email"),
				birth_date: form.date("birth_date").getTime(),
				road: form.string("road"),
				number: form.number("number"),
				tk: form.number("tk"),
				region: form.string("region"),
				registration_year: form.string("registration_year"),
				class_year: form.string("class_year"),
				class_id,
				teacher_id: form.number("teacher_id", 0),
				instrument_id: (class_id && form.number("instrument_id")) || 0,
				date: form.date("date").getTime(),
				payment_amount: form.number("payment_amount", 0),
				total_payment: form.number("total_payment", 0),
				payment_date: form.date("payment_date")?.getTime() || null,
				pass: form.multiSelect("pass", "boolean", { single: true }),
			};
			await apiHook(API.Registrations.update, {
				RequestObject: data,
			});
			setRegistrationHydrate({
				action: ActionEnum.MODIFY,
				id: data.id,
				isMultiple: false,
			});
			pushAlert(createAlert("success", "Επιτυχής ενημέρωση εγγραφής"));
		};

		const inputs = RegistrationsInputs(registration, teachers, instruments) as Record<
			keyof Registrations,
			InputProps
		>;

		return {
			inputs: new InputFields(inputs)
				.fill((field, key) => {
					if (key === "instrument_id") {
						field.value =
							instruments.find((i) => i.id === registration.instrument_id)?.id || 0;
					} else {
						field.value = registration[key] as any;
					}
				})
				.getInputs(),
			onSubmit: submit,
			submitText: "Ενημέρωση",
			headerText: "Ενημέρωση Εγγραφής",
			...modifyModal,
		};
	});
	const onDelete = createMemo((): Action | EmptyAction => {
		const deleteModal = {
			type: ActionEnum.DELETE,
			icon: ActionIcon.DELETE,
		};
		const registrations = store[API.Registrations.get];
		if (!registrations || selectedItems.length < 1) return deleteModal;

		const submit = async function () {
			const data = selectedItems.map((id) => id);
			const res = await apiHook(API.Registrations.delete, {
				RequestObject: data,
			});
			if (!res.data && !res.message) return;
			setRegistrationHydrate({ action: ActionEnum.DELETE, ids: data });
			data.forEach((id) => {
				const reg = registrations.find((r) => r.id === id);
				let fullname = reg?.last_name + " " + reg?.first_name;
				pushAlert(createAlert("success", `Επιτυχής διαγραφή εγγραφής: ${fullname}`));
			});
		};
		return {
			inputs: {},
			onSubmit: submit,
			submitText: "Διαγραφή",
			headerText: "Διαγραφή Εγγραφής",
			...deleteModal,
		};
	});

	const onDownloadPDF = createMemo(() => {
		const registrations = store[API.Registrations.get];
		const teachers = store[API.Teachers.getByFullnames];
		const instruments = store[API.Instruments.get];
		if (!teachers || !registrations || !instruments || selectedItems.length <= 0)
			return {
				type: ActionEnum.DOWNLOAD_PDF,
				icon: ActionIcon.DOWNLOAD_SINGLE,
			};

		let bulk = selectedItems.length > 1;

		const submit = !bulk
			? async function () {
					const student = registrations.find(
						(r) => r.id === selectedItems[0]
					) as Registrations;
					const teacher = teachers.find((t) => t.id === student.teacher_id) as Teachers;
					const instrument =
						(student.class_id &&
							(instruments.find(
								(i) => i.id === student.instrument_id
							) as Instruments)) ||
						null;
					try {
						const pdf = new PDF();
						pdf.setTemplateData(
							student,
							teacher?.fullname || "",
							instrument?.name || ""
						);
						await pdf.download();
						pushAlert(createAlert("success", "Επιτυχής λήψη PDF"));
					} catch (error: any) {
						pushAlert(createAlert("error", "Σφάλμα κατά την λήψη του PDF: ", error));
					}
			  }
			: async function () {
					const items = selectedItems.map((id) => {
						const student = registrations.find((r) => r.id === id) as Registrations;
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
							const pdf = new PDF();
							pdf.setTemplateData(
								item.student,
								item.teacher?.fullname || "",
								item.instrument?.name || ""
							);
							pdfArr.push(pdf);
						}
						const alert = pushAlert(
							createAlert("success", "Λήψη των PDF: 0 από " + pdfArr.length)
						);
						await PDF.downloadBulk(pdfArr, (pg) => {
							alert.message = "Λήψη των PDF: " + pg + " από " + pdfArr.length;
							updateAlert(alert);
							return new Promise((res, rej) => {
								alert.onDidUpdate = res;
							});
						});
					} catch (error: any) {
						pushAlert(createAlert("error", "Σφάλμα κατά την λήψη των PDF: ", error));
					}
			  };
		return {
			inputs: {},
			onSubmit: submit,
			submitText: "Λήψη",
			headerText: bulk ? "Λήψη Εγγραφών σε PDF" : "Λήψη Εγγραφής σε PDF",
			type: ActionEnum.DOWNLOAD_PDF,
			icon: selectedItems.length > 1 ? ActionIcon.DOWNLOAD_ZIP : ActionIcon.DOWNLOAD_SINGLE,
		};
	});

	const onDownloadExcel = createMemo(() => {
		const excelModal = {
			type: ActionEnum.DOWNLOAD_EXCEL,
			icon: ActionIcon.DOWNLOAD_EXCEL,
		};
		const registrations = store[API.Registrations.get];
		const teachers = store[API.Teachers.getByFullnames];
		const instruments = store[API.Instruments.get];
		if (!teachers || !registrations || !instruments || selectedItems.length <= 0)
			return excelModal;
		const submit = async function () {
			let items = (
				selectedItems
					.map((id) => {
						const student = registrations.find((r) => r.id === id);
						if (!student) return;
						const teacher = teachers.find((t) => t.id === student.teacher_id);
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
					teacher?: Teachers;
					instrument: Instruments | null;
				}[]
			).sort((a, b) => (Number(a?.student.am) < Number(b?.student.am) ? -1 : 1));
			const xlsx = await loadXLSX();
			const wb = xlsx.utils.book_new();
			const wsStudentsBook = xlsx.utils.aoa_to_sheet(
				[
					[
						"Αριθμός Μητρώου",
						"Επώνυμο",
						"Όνομα",
						"Όνομα Πατρός",
						"ΑΜΚΑ",
						"Έτος Γέννησης",
						"Διεύθυνση",
						"Ημερομηνία Εγγραφής",
						"Διδάσκων Καθηγητής",
						"Email",
						"Τηλέφωνα",
					],
				].concat(
					items.map((s) => {
						return [
							s.student.am,
							s.student.last_name,
							s.student.first_name,
							s.student.fathers_name,
							s.student.amka,
							"" + new Date(s.student.birth_date).getFullYear(),
							`${s.student.road} ${s.student.number}, ${s.student.region}, ${s.student.tk}`,
							new Date(s.student.date).toLocaleDateString("el-GR"),
							s.teacher?.fullname || "-",
							s.student.email,
							s.student.telephone + "-" + s.student.cellphone,
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
						"ΑΜΚΑ",
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
							item.student.amka,
							"" + new Date(item.student.birth_date).getFullYear(),
							`${item.student.road} ${item.student.number}, ${item.student.region}, ${item.student.tk}`,
							item.student.class_year,
							item.teacher?.fullname || "-",
							item.instrument?.name || "",
						];
					})
				)
			);
			items = items.sort((a, b) =>
				(a?.teacher?.fullname || "") < (b?.teacher?.fullname || "") ? -1 : 1
			);

			const byzStudents = items.filter((i) => i.student.class_id === 0);
			const parStudents = items.filter((i) => i.student.class_id === 1);
			const wsStudentsBookForMinistry = xlsx.utils.aoa_to_sheet([
				[
					"Αριθμός Μητρώου",
					"Επώνυμο",
					"Όνομα",
					"Όνομα Πατρός",
					"ΑΜΚΑ",
					"Έτος Γέννησης",
					"Διεύθυνση",
					"Έτος Φόιτησης",
					"Διδάσκων Καθηγητής",
					"Όργανο",
				],
				...byzStudents.map((s) => {
					return [
						s.student.am,
						s.student.last_name,
						s.student.first_name,
						s.student.fathers_name,
						s.student.amka,
						"" + new Date(s.student.birth_date).getFullYear(),
						`${s.student.road} ${s.student.number}, ${s.student.region}, ${s.student.tk}`,
						s.student.class_year,
						s.teacher?.fullname || "-",
						"",
					];
				}),
				[""],
				...parStudents.map((s) => {
					return [
						s.student.am,
						s.student.last_name,
						s.student.first_name,
						s.student.fathers_name,
						s.student.amka,
						"" + new Date(s.student.birth_date).getFullYear(),
						`${s.student.road} ${s.student.number}, ${s.student.region}, ${s.student.tk}`,
						s.student.class_year,
						s.teacher?.fullname || "-",
						s.instrument?.name || "",
					];
				}),
			]);
			//@ts-ignore
			const wsStudentsBookPayments = xlsx.utils.aoa_to_sheet<string | number>([
				[
					"Αριθμός Μητρώου",
					"Επώνυμο",
					"Όνομα",
					"Όνομα Πατρός",
					"ΑΜΚΑ",
					"Διδάσκων Καθηγητής",
					"Email",
					"Τηλέφωνα",
					"Ποσό Πληρωμής",
					"Σύνολο Πληρωμής",
				],
				...items.map((s) => {
					// @ts-ignore
					return [
						s.student.am,
						s.student.last_name,
						s.student.first_name,
						s.student.fathers_name,
						s.student.amka,
						s.teacher?.fullname || "-",
						s.student.email,
						s.student.telephone + "-" + s.student.cellphone,
						s.student.payment_amount,
						s.student.total_payment,
					];
				}),
			]);
			const wsBookByTeacher = teachers.map((teacher) => {
				const students = items.filter((item) => item.teacher?.id === teacher.id);
				if (!students.length) return;
				return xlsx.utils.aoa_to_sheet(
					[
						[
							"Αριθμός Μητρώου",
							"Επώνυμο",
							"Όνομα",
							"Όνομα Πατρός",
							"ΑΜΚΑ",
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
								item.student.amka,
								"" + new Date(item.student.birth_date).getFullYear(),
								`${item.student.road} ${item.student.number}, ${item.student.region}, ${item.student.tk}`,
								new Date(item.student.date).toLocaleDateString("el-GR"),
								item.student.class_year,
								item.teacher?.fullname || "-",
								item.student.email,
								item.student.telephone + "-" + item.student.cellphone,
							];
						})
					)
				);
			});
			xlsx.utils.book_append_sheet(wb, wsStudentsBook, "Γενικό Μητρώο");
			xlsx.utils.book_append_sheet(wb, wsSchoolYearBook, "Μαθητολόγιο");
			xlsx.utils.book_append_sheet(wb, wsStudentsBookForMinistry, "Μαθητολόγιο Χωριστά");
			xlsx.utils.book_append_sheet(wb, wsStudentsBookPayments, "Πληρωμές");
			wsBookByTeacher.forEach((ws, i) => {
				if (!ws) return;
				xlsx.utils.book_append_sheet(wb, ws, teachers[i].fullname);
			});
			xlsx.writeFile(wb, "Εγγραφές.xlsx");
			pushAlert(createAlert("success", "Επιτυχής λήψη Excel"));
		};
		return {
			inputs: {},
			onSubmit: submit,
			submitText: "Λήψη",
			headerText: "Λήψη Εγγραφών σε Excel",
			...excelModal,
		};
	});

	const onPrint = createMemo((): Action | EmptyAction => {
		const registrations = store[API.Registrations.get];
		const teachers = store[API.Teachers.getByFullnames];
		const instruments = store[API.Instruments.get];
		const printModal = {
			type: ActionEnum.PRINT,
			icon: ActionIcon.PRINT,
		};
		if (!teachers || !registrations || !instruments || selectedItems.length <= 0)
			return printModal;

		let bulk = selectedItems.length > 1;

		const submit = !bulk
			? async function () {
					const student = registrations.find(
						(r) => r.id === selectedItems[0]
					) as Registrations;
					const teacher = teachers.find((t) => t.id === student.teacher_id) as Teachers;
					const instrument =
						(student.class_id &&
							(instruments.find(
								(i) => i.id === student.instrument_id
							) as Instruments)) ||
						null;
					try {
						const pdf = new PDF();
						pdf.setTemplateData(
							student,
							teacher?.fullname || "",
							instrument?.name || ""
						);
						await pdf.print();
						pushAlert(createAlert("success", "Επιτυχής εκτύπωση PDF"));
					} catch (error: any) {
						pushAlert(
							createAlert("error", "Σφάλμα κατά την εκτύπωση του PDF: ", error)
						);
					}
			  }
			: async function () {
					const items = selectedItems.map((id) => {
						const student = registrations.find((r) => r.id === id) as Registrations;
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
							const pdf = new PDF();
							pdf.setTemplateData(
								item.student,
								item.teacher?.fullname || "",
								item.instrument?.name || ""
							);
							pdfArr.push(pdf);
						}
						await PDF.printBulk(pdfArr);
						pushAlert(createAlert("success", "Εκτύπωση των " + pdfArr.length + " PDF"));
					} catch (error: any) {
						pushAlert(
							createAlert("error", "Σφάλμα κατά την εκτύπωση των PDF: ", error)
						);
					}
			  };
		return {
			inputs: {},
			onSubmit: submit,
			submitText: "Εκτύπωση",
			headerText: bulk ? "Εκτύπωση Εγγραφών σε PDF" : "Εκτύπωση Εγγραφής σε PDF",
			...printModal,
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
			document.dispatchEvent(new CustomEvent("hydrate") as CustomEvent);
		} else {
			document.dispatchEvent(new CustomEvent("hydrate") as CustomEvent);
		}
	});

	onMount(() => {
		document.addEventListener("hydrate", (e) => {
			e.stopPropagation();
			untrack(() => {
				let registrations = store[API.Registrations.get];
				if (!registrations) return;
				let rows = [...document.querySelectorAll<HTMLElement>(".row[data-id]")];
				let resultArray = [];
				for (let i = 0; i < rows.length; i++) {
					const id = Number(rows[i].dataset.id);
					let reg = registrations.find((r) => r.id === id);
					if (reg) {
						resultArray.push({ row: rows[i], registration: reg });
					}
				}
				for (let i = 0; i < resultArray.length; i++) {
					const { row, registration } = resultArray[i];
					const payment_status = registration.total_payment - registration.payment_amount;
					if (registration.payment_amount === 0 && registration.total_payment === 0)
						continue;
					if (payment_status <= 0) {
						row.setAttribute("data-paid", "");
					} else if (
						payment_status > 0 ||
						(registration.payment_amount > registration.total_payment &&
							registration.total_payment === 0)
					) {
						row.setAttribute("data-partially-paid", "");
					}
				}
				for (let i = 0; i < selectedItems.length; i++) {
					toggleCheckbox(selectedItems[i], true);
				}
			});
		});
		onElementMount("#tableContainer", (el) => {
			el.style.setProperty("--gradient-left-offset", "0px");
			let prevOffset = 0;
			el.addEventListener("scroll", (e) => {
				if (el.scrollLeft === prevOffset) return;
				el.style.setProperty("--gradient-left-offset", el.scrollLeft + "px");
			});
		});
	});

	return (
		<>
			<Show
				when={
					store[API.Registrations.get] &&
					store[API.Teachers.getByFullnames] &&
					store[API.Instruments.get]
				}
				fallback={<Spinner classes="max-sm:h-[100svh]" />}>
				<Table
					prefix={PREFIX}
					data={shapedData}
					columns={columns}
					hasSelectBox
					structure={[
						{
							position: "top",
							prefix: PREFIX,
							controlGroups: [
								{ controls: [onModify, onDelete] },
								{ controls: [onDownloadPDF, onDownloadExcel, onPrint] },
								{ type: "search", columns: searchColumns, setSearchQuery },
							],
						},
						{
							position: "bottom",
							prefix: PREFIX,
							controlGroups: [
								{ type: "pagination", pageSize: 100, dataSize: dataLength },
								{
									type: "custom",
									children: (
										<div class="pb-2 flex items-center gap-x-4">
											<button
												data-active={year() === 2023}
												class="px-2 py-1 border border-red-950 text-xl text-red-950 rounded-md transition-colors duration-200 hover:text-white hover:bg-red-900 data-[active='true']:text-white data-[active='true']:bg-red-900"
												onClick={() => setYear(2023)}>
												2023-24
											</button>
											<button
												data-active={year() === 2024}
												class="px-2 py-1 border border-red-950 text-xl text-red-950 rounded-md transition-colors duration-200 hover:text-white hover:bg-red-900 data-[active='true']:text-white data-[active='true']:bg-red-900"
												onClick={() => setYear(2024)}>
												2024-25
											</button>
										</div>
									),
								},
							],
						},
					]}
				/>
			</Show>
			{/* Registration specific row styles */}
			<style>
				{`
				#tableContainer {
					--gradient-left-offset: 0px;
				}
				/* Paid rows */
				.row[data-paid]:nth-of-type(odd)::before {
					background: linear-gradient(to right, #6FD286, calc(var(--gradient-left-offset) + 80px), rgb(243,244,246) calc(var(--gradient-left-offset) + 160px));
				}
				.row[data-paid]::before {
					background: linear-gradient(to right, #6FD286, calc(var(--gradient-left-offset) + 80px), white calc(var(--gradient-left-offset) + 160px));
				}
				.row[data-paid]:is(.selectedRow){
					background: linear-gradient(to right, #6FD286, calc(var(--gradient-left-offset) + 80px), rgb(254,202,202) calc(var(--gradient-left-offset) + 160px));
				}

				/* Partially-Paid rows */
				.row[data-partially-paid]:nth-of-type(odd)::before {
					background: linear-gradient(to right, #FDE85A, calc(var(--gradient-left-offset) + 80px), rgb(243,244,246) calc(var(--gradient-left-offset) + 160px));
				}
				.row[data-partially-paid]::before {
					background: linear-gradient(to right, #FDE85A, calc(var(--gradient-left-offset) + 80px), white calc(var(--gradient-left-offset) + 160px));
				}
				.row[data-partially-paid]:is(.selectedRow){
					background: linear-gradient(to right, #FDE85A, calc(var(--gradient-left-offset) + 80px), rgb(254,202,202) calc(var(--gradient-left-offset) + 160px));
				}

				/* Partially-Paid rows */
				.row[data-partially-paid]:nth-of-type(odd)::before {
					background: linear-gradient(to right, #FDE85A, calc(var(--gradient-left-offset) + 80px), rgb(243,244,246) calc(var(--gradient-left-offset) + 160px));
				}
				.row[data-partially-paid]::before {
					background: linear-gradient(to right, #FDE85A, calc(var(--gradient-left-offset) + 80px), white calc(var(--gradient-left-offset) + 160px));
				}
				.row[data-partially-paid]:is(.selectedRow){
					background: linear-gradient(to right, #FDE85A, calc(var(--gradient-left-offset) + 80px), rgb(254,202,202) calc(var(--gradient-left-offset) + 160px));
				}
				`}
			</style>
		</>
	);
}
