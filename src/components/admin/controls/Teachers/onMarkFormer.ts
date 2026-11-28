import type { CacheMutationsReturnType } from "@hooks/useCacheMutations.solid";
import { API, type APIResponse } from "@routes/index.client";
import { createMemo } from "solid-js";
import { createAlert, pushAlert } from "../../Alert.solid";
import { ActionEnum, ActionIcon, type EmptyAction } from "../../table/TableControlTypes";
import type { Action } from "../../table/TableControls.solid";
import { type APIHook } from "./helpers";

/**
 * «Ορισμός ως πρώην»: the selected current teachers stop working for the school (hidden, no classes — see
 * `Teachers.markFormer`). Disabled while nothing, or a former teacher, is selected.
 */
export const onMarkFormer = function (hydrate: CacheMutationsReturnType, store: Partial<APIResponse>, selectedItems: number[], apiHook: APIHook) {
	return createMemo((): Action | EmptyAction => {
		const markModal = {
			type: ActionEnum.CHECK,
			icon: ActionIcon.DELETE_USER,
			label: "Ορισμός ως πρώην",
		};
		const teachers = store[API.Teachers.get];
		if (!teachers || selectedItems.length < 1) return markModal;
		const selected = selectedItems.map((id) => teachers.find((t) => t.id === id));
		if (selected.some((t) => !t || t.former)) return markModal;
		const ids = selected.map((t) => t!.id);

		const submit = async function () {
			const res = await apiHook(API.Teachers.markFormer, { RequestObject: ids });
			if (!("data" in res ? res.data : res.message)) return;
			hydrate({ action: ActionEnum.MODIFY, ids: ids.slice(), isMultiple: true });
			pushAlert(createAlert("success", ids.length === 1 ? "Ο καθηγητής ορίστηκε ως πρώην" : `${ids.length} καθηγητές ορίστηκαν ως πρώην`));
		};
		return {
			inputs: {},
			onSubmit: submit,
			submitText: "Ορισμός ως πρώην",
			headerText: "Ορισμός ως πρώην διδάσκοντες",
			summary: [
				...selected.map((t) => t!.fullname),
				"Θα αποκρυφτούν από τον ιστότοπο και τις φόρμες εγγραφής και θα αφαιρεθούν τα τμήματά τους. Οι παλιές εγγραφές κρατούν το όνομά τους.",
			],
			...markModal,
		};
	});
};
