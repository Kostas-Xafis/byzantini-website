import { createMemo } from "solid-js";
import type { HydrateByIdReturnType } from "../../../../../lib/hooks/useHydrateById.solid";
import { API, type APIResponse } from "../../../../../lib/routes/index.client";
import type { SimpleTeacher as Teachers } from "../../../../../types/entities";
import { createAlert, pushAlert } from "../../Alert.solid";
import { ActionEnum, ActionIcon, type EmptyAction } from "../../table/TableControlTypes";
import type { Action } from "../../table/TableControls.solid";
import { type APIHook } from "./helpers";

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
		const teachers = store[API.Teachers.get];
		if (!teachers || selectedItems.length < 1) return deleteModal;
		const submit = async function () {
			const ids = selectedItems.map((i) => (teachers.find((p) => p.id === i) as Teachers).id);
			const res = await apiHook(API.Teachers.delete, { RequestObject: ids });
			if (!res.data && !res.message) return;
			hydrate({ action: ActionEnum.DELETE, ids: ids });
			if (ids.length === 1) {
				pushAlert(createAlert("success", "Επιτυχής διαγραφή καθηγητή"));
				return;
			}
			pushAlert(createAlert("success", `Επιτυχής διαγραφή ${ids.length} καθηγητών`));
		};
		return {
			inputs: {},
			onSubmit: submit,
			submitText: "Διαγραφή",
			headerText: "Διαγραφή Καθηγητών",
			...deleteModal,
		};
	});
};
