import type { Instruments, JoinedEnrollments, Teachers } from "@_types/entities";
import { PDF } from "@lib/pdf.client";
import { API, type APIResponse } from "@routes/index.client";
import { createMemo } from "solid-js";
import { toast, type ProgressHandle } from "../../Alert.solid";
import { ActionEnum, ActionIcon } from "../../table/TableControlTypes";

export const onDownloadPDF = function (store: Partial<APIResponse>, selectedItems: number[]) {
	return createMemo(() => {
		const registrations = store[API.Pupils.getEnrollmentsByYear];
		const teachers = store[API.Teachers.getByFullnames];
		const instruments = store[API.Instruments.get];
		if (!teachers || !registrations || !instruments || selectedItems.length <= 0)
			return {
				type: ActionEnum.DOWNLOAD_PDF,
				icon: ActionIcon.DOWNLOAD_SINGLE,
			};

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
				const total = pdfArr.length;
				// A single PDF is downloaded directly (no per-file progress): indeterminate bar.
				progress = toast.progress(
					total > 1
						? { title: "Λήψη των PDF", label: "Δημιουργία αρχείων…", done: 0, total }
						: { title: "Λήψη του PDF", label: "Δημιουργία αρχείου…" },
				);
				const p = progress;
				await PDF.downloadBulk(pdfArr, (done) => {
					// After the last PDF, downloadBulk still zips them: switch to an indeterminate bar.
					if (done >= total) p.update({ label: "Δημιουργία αρχείου .zip…", done: undefined, total: undefined });
					else p.update({ done, total });
				});
				progress.success(total > 1 ? `Η λήψη ολοκληρώθηκε: ${total} PDF.` : "Η λήψη του PDF ολοκληρώθηκε.");
			} catch (error: any) {
				if (progress) progress.error(error, { title: "Σφάλμα κατά τη λήψη των PDF" });
				else toast.error(error, { title: "Σφάλμα κατά τη λήψη των PDF" });
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
