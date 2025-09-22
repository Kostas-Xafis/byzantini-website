import { createMemo } from "solid-js";
import type { HydrateByIdReturnType } from "../../../../../lib/hooks/useHydrateById.solid";
import { API } from "../../../../../lib/routes/index.client";
import type { Instruments } from "../../../../../types/entities";
import { type Props as InputProps } from "../../../input/Input.solid";
import { createAlert, pushAlert } from "../../Alert.solid";
import { ActionEnum, ActionIcon, type EmptyAction } from "../../table/TableControlTypes";
import type { Action } from "../../table/TableControls.solid";
import type { APIHook } from "./helpers";

export const onAddInstrument = function (
    hydrate: HydrateByIdReturnType,
    apiHook: APIHook
) {
    return createMemo((): Action | EmptyAction => {
        const submit = async function (fd: FormData) {
            const data: Omit<Instruments, "id"> = {
                name: fd.get("name") as string,
                type: (fd.get("type") as string) === "Παραδοσιακή Μουσική" ? "par" : "eur",
                isInstrument: !!(
                    Number(
                        [
                            ...document.querySelectorAll<HTMLInputElement>(
                                `button[data-specifier='isInstrument']`
                            ),
                        ].filter((i) => i.dataset.selected === "true")[0].dataset.value as string
                    ) - 1
                ),
            };
            const res = await apiHook(API.Instruments.post, { RequestObject: data });
            if (!res.data) return;
            hydrate({
                action: ActionEnum.ADD,
                id: res.data.insertId,
            });
            pushAlert(createAlert("success", "Επιτυχής εισαγωγή οργάνου"));
        };
        return {
            inputs: {
                name: {
                    type: "text",
                    name: "name",
                    label: "Όργανο",
                    iconClasses: "fas fa-chalkboard-teacher",
                } as InputProps,
                type: {
                    type: "select",
                    name: "type",
                    label: "Τύπος Μαθήματος",
                    iconClasses: "fas fa-chalkboard-teacher",
                    selectList: ["Παραδοσιακή Μουσική", "Ευρωπαϊκή Μουσική"],
                    valueLiteral: true,
                } as InputProps,
                isInstrument: {
                    type: "multiselect",
                    name: "isInstrument",
                    label: "",
                    iconClasses: "fas fa-guitar",
                    multiselectList: [
                        { label: "Όργανο", value: 2, selected: true },
                        { label: "Μαθήμα", value: 1, selected: false },
                    ],
                    multiselectOnce: true,
                } as InputProps,
            },
            onSubmit: submit,
            submitText: "Προσθήκη",
            headerText: "Εισαγωγή Οργάνου",
            type: ActionEnum.ADD,
            icon: ActionIcon.ADD_BOX,
        };
    });
};
