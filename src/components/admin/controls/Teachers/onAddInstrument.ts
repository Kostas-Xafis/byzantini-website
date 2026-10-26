import type { Instruments } from "@_types/entities";
import type { CacheMutationsReturnType } from "@hooks/useCacheMutations.solid";
import { API } from "@routes/index.client";
import { createMemo } from "solid-js";
import { type Props as InputProps } from "../../../input/Input.solid";
import { createAlert, pushAlert } from "../../Alert.solid";
import { ActionEnum, ActionIcon, type EmptyAction } from "../../table/TableControlTypes";
import type { Action } from "../../table/TableControls.solid";
import type { APIHook } from "./helpers";

export const onAddInstrument = function (hydrate: CacheMutationsReturnType, apiHook: APIHook) {
	return createMemo((): Action | EmptyAction => {
		const submit = async function (fd: FormData, form?: HTMLFormElement) {
			const data: Omit<Instruments, "id"> = {
				name: fd.get("name") as string,
				type: (fd.get("type") as string) === "Παραδοσιακή Μουσική" ? "par" : "eur",
				isInstrument: !!(
					Number(
						[...((form ?? document) as ParentNode).querySelectorAll<HTMLButtonElement>(`button[data-specifier='isInstrument']`)].filter(
							(i) => i.dataset.selected === "true",
						)[0].dataset.value as string,
					) - 1
				),
			};
			const res = await apiHook(API.Instruments.post, { RequestObject: data });
			if (!("data" in res) || !res.data) return;
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
					icon: "teacher",
				} as InputProps,
				type: {
					type: "select",
					name: "type",
					label: "Τύπος Μαθήματος",
					icon: "teacher",
					selectList: ["Παραδοσιακή Μουσική", "Ευρωπαϊκή Μουσική"],
					valueLiteral: true,
				} as InputProps,
				isInstrument: {
					type: "multiselect",
					name: "isInstrument",
					label: "",
					icon: "guitar",
					multiselectList: [
						{ label: "Όργανο", value: 2, selected: true },
						{ label: "Μάθημα", value: 1, selected: false },
					],
					multiselectOnce: true,
				} as InputProps,
			},
			onSubmit: submit,
			submitText: "Προσθήκη",
			headerText: "Εισαγωγή Οργάνου",
			label: "Προσθήκη οργάνου",
			type: ActionEnum.ADD,
			icon: ActionIcon.ADD_BOX,
		};
	});
};
