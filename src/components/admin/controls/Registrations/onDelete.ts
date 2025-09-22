import { createMemo } from "solid-js";
import type { HydrateByIdReturnType } from "../../../../../lib/hooks/useHydrateById.solid";
import { API, type APIResponse } from "../../../../../lib/routes/index.client";
import { createAlert, pushAlert } from "../../Alert.solid";
import { ActionEnum, ActionIcon, type EmptyAction } from "../../table/TableControlTypes";
import type { Action } from "../../table/TableControls.solid";
import type { APIHook } from "./helpers";

export const onDelete = function (
	hydrate: HydrateByIdReturnType,
	store: Partial<APIResponse>,
	selectedItems: number[],
	apiHook: APIHook
) {
	return createMemo((): Action | EmptyAction => {
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
			hydrate({ action: ActionEnum.DELETE, ids: data });
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

};
