import type { Instruments, JoinedEnrollments, Teachers } from "@_types/entities";
import { PDF } from "@lib/pdf.client";
import { API, type APIResponse } from "@routes/index.client";
import { createMemo } from "solid-js";
import { toast, type ProgressHandle } from "../../Alert.solid";
import { ActionEnum, ActionIcon } from "../../table/TableControlTypes";

export const onPrint = function (store: Partial<APIResponse>, selectedItems: number[]) {
	return createMemo(() => {
		const registrations = store[API.Pupils.getEnrollmentsByYear];
		const teachers = store[API.Teachers.getByFullnames];
		const instruments = store[API.Instruments.get];
		const printModal = {
			type: ActionEnum.PRINT,
			icon: ActionIcon.PRINT,
		};
		if (!teachers || !registrations || !instruments || selectedItems.length <= 0) return printModal;

		const submit = async function () {
			const items = selectedItems.map((id) => {
				const student = registrations.find((r) => r.id === id) as JoinedEnrollments;
				const teacher = teachers.find((t) => t.id === student.teacher_id) as Teachers;
				const instrument = (student.class_id && (instruments.find((i) => i.id === student.instrument_id) as Instruments)) || null;
				return { student, teacher, instrument };
			});
			let pdfArr: PDF[] = [];
			let progress: ProgressHandle | undefined;
			try {
				for (const item of items) {
					const pdf = new PDF();
					pdf.setTemplateData(item.student, item.teacher?.fullname || "", item.instrument?.name || "");
					pdfArr.push(pdf);
				}
				progress = toast.progress({ title: "Εκτύπωση", label: "Προετοιμασία " + pdfArr.length + " PDF για εκτύπωση…" });
				await PDF.printBulk(pdfArr);
				progress.success("Επιτυχής εκτύπωση των " + pdfArr.length + " PDF");
			} catch (error: any) {
				if (progress) progress.error(error, { title: "Σφάλμα κατά την εκτύπωση των PDF" });
				else toast.error(error, { title: "Σφάλμα κατά την εκτύπωση των PDF" });
			}
		};
		let bulk = selectedItems.length > 1;
		return {
			inputs: {},
			onSubmit: submit,
			submitText: "Εκτύπωση",
			headerText: "Επιτυχής " + (bulk ? "εκτύπωση Εγγραφών σε PDF" : "εκτύπωση Εγγραφής σε PDF"),
			...printModal,
		};
	});
};
