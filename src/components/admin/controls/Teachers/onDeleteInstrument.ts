import { createMemo } from "solid-js";
import type { HydrateByIdReturnType } from "../../../../../lib/hooks/useHydrateById.solid";
import { API, type APIResponse } from "../../../../../lib/routes/index.client";
import { type Props as InputProps } from "../../../input/Input.solid";
import { createAlert, pushAlert } from "../../Alert.solid";
import { ActionEnum, ActionIcon, type EmptyAction } from "../../table/TableControlTypes";
import type { Action } from "../../table/TableControls.solid";
import type { APIHook } from "./helpers";

export const onDeleteInstrument = function (
    hydrate: HydrateByIdReturnType,
    store: Partial<APIResponse>,
    apiHook: APIHook
) {
    return createMemo((): Action | EmptyAction => {
        const instruments = store[API.Instruments.get];
        if (!instruments) return { type: ActionEnum.DELETE, icon: ActionIcon.DELETE_BOX };

        const submit = async function (fd: FormData) {
            const name = fd.get("name") as string;
            const instrument = instruments.find((i) => i.name === name);
            if (!instrument) return;

            const res = await apiHook(API.Instruments.delete, { RequestObject: [instrument.id] });
            if (!res.data && !res.message) return;
            hydrate({
                action: ActionEnum.DELETE,
                ids: [instrument.id],
            });
            pushAlert(createAlert("success", "Επιτυχής διαγραφή οργάνου"));
        };
        return {
            inputs: {
                name: {
                    name: "name",
                    label: "Όργανο",
                    type: "select",
                    iconClasses: "fa-solid fa-chalkboard-teacher",
                    selectList: instruments.map((c) => c.name),
                    valueLiteral: true,
                } as InputProps,
            },
            onSubmit: submit,
            submitText: "Διαγραφή",
            headerText: "Διαγραφή Οργάνου",
            type: ActionEnum.DELETE,
            icon: ActionIcon.DELETE_BOX,
        };
    });
};
