import type { CacheMutationsReturnType } from "@hooks/useCacheMutations.solid";
import { API, type APIResponse } from "@lib/routes/index.client";
import { createMemo } from "solid-js";
import { createAlert, pushAlert } from "../../Alert.solid";
import { ActionEnum, ActionIcon, type EmptyAction } from "../../table/TableControlTypes";
import type { Action } from "../../table/TableControls.solid";
import type { APIHook } from "./helpers";

export const onDelete = function (hydrate: CacheMutationsReturnType, store: Partial<APIResponse>, selectedItems: number[], apiHook: APIHook) {
	return createMemo((): Action | EmptyAction => {
		const deleteModal = {
			type: ActionEnum.DELETE,
			icon: ActionIcon.DELETE,
		};
		const registrations = store[API.Pupils.getEnrollmentsByYear];
		if (!registrations || selectedItems.length < 1) return deleteModal;

		const submit = async function () {
			const data = selectedItems.map((id) => id);
			const res = await apiHook(API.Pupils.deleteEnrollments, {
				RequestObject: data,
			});
			if (!("data" in res ? res.data : res.message)) return;
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
