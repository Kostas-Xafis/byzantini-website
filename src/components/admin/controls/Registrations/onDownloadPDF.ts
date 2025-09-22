import { createMemo } from "solid-js";
import { loadXLSX } from "../../../../../lib/pdf.client";
import { API, type APIResponse } from "../../../../../lib/routes/index.client";
import type { Instruments, Registrations, Teachers } from "../../../../../types/entities";
import { createAlert, pushAlert } from "../../Alert.solid";
import { ActionEnum, ActionIcon } from "../../table/TableControlTypes";

export const onDownloadPDF = function (
	store: Partial<APIResponse>,
	selectedItems: number[],
) {
	return createMemo(() => {
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
};
