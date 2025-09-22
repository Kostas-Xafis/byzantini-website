import { createMemo } from "solid-js";
import { PDF } from "../../../../../lib/pdf.client";
import { API, type APIResponse } from "../../../../../lib/routes/index.client";
import type { Instruments, Registrations, Teachers } from "../../../../../types/entities";
import { createAlert, pushAlert } from "../../Alert.solid";
import { ActionEnum, ActionIcon } from "../../table/TableControlTypes";

export const onPrint = function (
	store: Partial<APIResponse>,
	selectedItems: number[],
) {
	return createMemo(() => {
		const registrations = store[API.Registrations.get];
		const teachers = store[API.Teachers.getByFullnames];
		const instruments = store[API.Instruments.get];
		const printModal = {
			type: ActionEnum.PRINT,
			icon: ActionIcon.PRINT,
		};
		if (!teachers || !registrations || !instruments || selectedItems.length <= 0)
			return printModal;

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
				await PDF.printBulk(pdfArr);
				pushAlert(
					createAlert("success", "Επιτυχής εκτύπωση των " + pdfArr.length + " PDF")
				);
			} catch (error: any) {
				pushAlert(createAlert("error", "Σφάλμα κατά την εκτύπωση των PDF: ", error));
			}
		};
		let bulk = selectedItems.length > 1;
		return {
			inputs: {},
			onSubmit: submit,
			submitText: "Εκτύπωση",
			headerText:
				"Επιτυχής " + (bulk ? "εκτύπωση Εγγραφών σε PDF" : "εκτύπωση Εγγραφής σε PDF"),
			...printModal,
		};
	});
};
