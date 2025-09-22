import { createMemo } from "solid-js";
import { PDF } from "../../../../../lib/pdf.client";
import { API, type APIResponse } from "../../../../../lib/routes/index.client";
import type { Instruments, Registrations, Teachers } from "../../../../../types/entities";
import { createAlert, pushAlert, updateAlert } from "../../Alert.solid";
import { ActionEnum, ActionIcon } from "../../table/TableControlTypes";

export const onDownloadExcel = function (
	store: Partial<APIResponse>,
	selectedItems: number[],
) {
	return createMemo(() => {
		const registrations = store[API.Registrations.get];
		const teachers = store[API.Teachers.getByFullnames];
		const instruments = store[API.Instruments.get];
		if (!teachers || !registrations || !instruments || selectedItems.length <= 0)
			return {
				type: ActionEnum.DOWNLOAD_PDF,
				icon: ActionIcon.DOWNLOAD_SINGLE,
			};

		const submit = async function () {
			const items = selectedItems.map((id) => {
				const student = registrations.find((r) => r.id === id) as Registrations;
				const teacher = teachers.find((t) => t.id === student.teacher_id) as Teachers;
				const instrument =
					(student.class_id &&
						(instruments.find((i) => i.id === student.instrument_id) as Instruments)) ||
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
		let bulk = selectedItems.length > 1;
		return {
			inputs: {},
			onSubmit: submit,
			submitText: "Λήψη",
			headerText: "Επιτυχής " + (bulk ? "Λήψη Εγγραφών σε PDF" : "Λήψη Εγγραφής σε PDF"),
			type: ActionEnum.DOWNLOAD_PDF,
			icon: bulk ? ActionIcon.DOWNLOAD_ZIP : ActionIcon.DOWNLOAD_SINGLE,
		};
	});
};
