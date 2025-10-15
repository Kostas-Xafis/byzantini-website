import type { SimpleTeacher as Teachers } from "@_types/entities";
import { loadXLSX } from "@lib/pdf.client";
import { API, type APIResponse } from "@routes/index.client";
import { teacherTitleByGender } from "@utilities/text";
import { createMemo } from "solid-js";
import { createAlert, pushAlert } from "../../Alert.solid";
import { ActionEnum, ActionIcon, type EmptyAction } from "../../table/TableControlTypes";
import type { Action } from "../../table/TableControls.solid";

export const onDownloadExcel = function (
    store: Partial<APIResponse>,
    selectedItems: number[],
) {
    return createMemo((): Action | EmptyAction => {
        const excelModal = {
            type: ActionEnum.DOWNLOAD_EXCEL,
            icon: ActionIcon.DOWNLOAD_EXCEL,
        };
        const teachers = store[API.Teachers.get];
        const classes = store[API.Teachers.getClasses];
        const instrumentsByTeacher = store[API.Teachers.getInstruments];
        const instruments = store[API.Instruments.get];
        if (
            !teachers ||
            !classes ||
            !instrumentsByTeacher ||
            !instruments ||
            selectedItems.length <= 0
        )
            return excelModal;
        const submit = async function () {
            const byzTeachers: Teachers[] = [],
                parTeachers: Teachers[] = [],
                eurTeachers: Teachers[] = [];
            selectedItems.forEach((id) => {
                const teacher = teachers.find((t) => t.id === id);
                if (!teacher) return;
                const teacherClasses = classes.filter((c) => c.teacher_id === id);
                teacherClasses.forEach((c) => {
                    if (c.class_id === 0) byzTeachers.push(teacher);
                    if (c.class_id === 1) parTeachers.push(teacher);
                    if (c.class_id === 2) eurTeachers.push(teacher);
                });
            });

            const xlsx = await loadXLSX();
            const wb = xlsx.utils.book_new();
            const wsStudentsBook = xlsx.utils.aoa_to_sheet(
                [
                    ["Ονοματεπώνυμο", "Ιδιότητα", "Email", "Τηλέφωνο", "ΑΜΚΑ", "Αριθμός Έγκρισης"],
                ].concat(
                    byzTeachers.map((t) => {
                        const ao = classes.find(
                            (c) => c.teacher_id === t.id && c.class_id === 0
                        )?.registration_number;
                        return [
                            t.fullname.includes("π.")
                                ? t.fullname.replace("π. ", "").split(" ").reverse().join(" π. ")
                                : t.fullname.split(" ").reverse().join(" "),
                            teacherTitleByGender(t.title, t.gender),
                            t.email ?? "",
                            t.telephone ?? "",
                            t.amka ?? "",
                            ao ?? "",
                        ];
                    }),
                    [""],
                    parTeachers.map((t) => {
                        const ao = classes.find(
                            (c) => c.teacher_id === t.id && c.class_id === 0
                        )?.registration_number;
                        const teacherInstruments = instrumentsByTeacher
                            .filter((i) => i.teacher_id === t.id)
                            .map((i) => instruments.find((x) => x.id === i.instrument_id)?.name)
                            .join(", ");
                        return [
                            t.fullname.includes("π.")
                                ? t.fullname.replace("π. ", "").split(" ").reverse().join(" π.")
                                : t.fullname.split(" ").reverse().join(" "),
                            teacherInstruments,
                            t.email ?? "",
                            t.telephone ?? "",
                            t.amka ?? "",
                            ao ?? "",
                        ];
                    })
                )
            );
            xlsx.utils.book_append_sheet(wb, wsStudentsBook, "Καθηγητές");
            xlsx.writeFile(wb, "Καθηγητές.xlsx");
            pushAlert(createAlert("success", "Επιτυχής λήψη αρχείου excel"));
        };
        return {
            inputs: {},
            onSubmit: submit,
            submitText: "Λήψη",
            headerText: "Λήψη Καθηγητών σε Excel",
            ...excelModal,
        };
    });
};
