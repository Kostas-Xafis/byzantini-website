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

		const fullname = (id: number) => {
			const reg = registrations.find((r) => r.id === id);
			return reg ? `${reg.last_name} ${reg.first_name}` : `#${id}`;
		};
		const count = selectedItems.length;
		// "Select all" selects every row of the current search/year, not just the visible page — list who goes.
		const shown = selectedItems.slice(0, 15).map(fullname);
		const summary = count > shown.length ? [...shown, `… και ${count - shown.length} ακόμη`] : shown;

		const submit = async function () {
			const data = selectedItems.map((id) => id);
			const res = await apiHook(API.Pupils.deleteEnrollments, {
				RequestObject: data,
			});
			if (!("data" in res ? res.data : res.message)) return;
			hydrate({ action: ActionEnum.DELETE, ids: data });
			pushAlert(createAlert("success", count === 1 ? `Επιτυχής διαγραφή εγγραφής: ${summary[0]}` : `Επιτυχής διαγραφή ${count} εγγραφών`));
		};
		return {
			inputs: {},
			onSubmit: submit,
			submitText: "Διαγραφή",
			headerText: count === 1 ? "Διαγραφή 1 εγγραφής" : `Διαγραφή ${count} εγγραφών`,
			summary,
			...deleteModal,
		};
	});
};
