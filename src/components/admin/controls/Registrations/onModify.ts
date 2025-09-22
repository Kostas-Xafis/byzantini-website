import { createMemo } from "solid-js";
import type { HydrateByIdReturnType } from "../../../../../lib/hooks/useHydrateById.solid";
import { API, type APIResponse } from "../../../../../lib/routes/index.client";
import { type ExtendedFormData } from "../../../../../lib/utils.client";
import type { Registrations } from "../../../../../types/entities";
import { InputFields, type Props as InputProps } from "../../../input/Input.solid";
import { createAlert, pushAlert } from "../../Alert.solid";
import { ActionEnum, ActionIcon, type EmptyAction } from "../../table/TableControlTypes";
import type { Action } from "../../table/TableControls.solid";
import {
	type APIHook,
	RegistrationsInputs,
} from "./helpers";

export const onModify = function (
	hydrate: HydrateByIdReturnType,
	store: Partial<APIResponse>,
	selectedItems: number[],
	apiHook: APIHook
) {
	return createMemo((): Action | EmptyAction => {
		const modifyModal = {
			type: ActionEnum.MODIFY,
			icon: ActionIcon.MODIFY,
		};
		const registrations = store[API.Registrations.get];
		const teachers = store[API.Teachers.getByFullnames];
		const instruments = store[API.Instruments.get];
		if (!teachers || !registrations || !instruments || selectedItems.length !== 1)
			return modifyModal;

		const registration = JSON.parse(
			JSON.stringify(registrations.find((r) => r.id === selectedItems[0]) as any)
		) as Registrations;
		const submit = async function (form: ExtendedFormData<Registrations>) {
			const class_id = form.number("class_id");
			const data: Registrations = {
				id: registration.id,
				am: form.string("am"),
				amka: form.string("amka", ""),
				last_name: form.string("last_name"),
				first_name: form.string("first_name"),
				fathers_name: form.string("fathers_name"),
				telephone: form.string("telephone", "-"),
				cellphone: form.string("cellphone"),
				email: form.string("email"),
				birth_date: form.date("birth_date").getTime(),
				road: form.string("road"),
				number: form.number("number"),
				tk: form.number("tk"),
				region: form.string("region"),
				registration_year: form.string("registration_year"),
				class_year: form.string("class_year"),
				class_id,
				teacher_id: form.number("teacher_id", 0),
				instrument_id: (class_id && form.number("instrument_id")) || 0,
				date: form.date("date").getTime(),
				payment_amount: form.number("payment_amount", 0),
				total_payment: form.number("total_payment", 0),
				payment_date: form.date("payment_date")?.getTime() || null,
				pass: form.multiSelect("pass", "boolean", { single: true }),
			};
			await apiHook(API.Registrations.update, {
				RequestObject: data,
			});
			hydrate({
				action: ActionEnum.MODIFY,
				id: data.id,
				isMultiple: false,
			});
			pushAlert(createAlert("success", "Επιτυχής ενημέρωση εγγραφής"));
		};

		const inputs = RegistrationsInputs(registration, teachers, instruments) as Record<
			keyof Registrations,
			InputProps
		>;
		let inputFields = new InputFields(inputs).fill((field, key) => {
			if (key === "instrument_id") {
				field.value = instruments.find((i) => i.id === registration.instrument_id)?.id || 0;
			} else {
				field.value = registration[key] as any;
			}
		});
		return {
			inputs: inputFields.getInputs(),
			onSubmit: submit,
			submitText: "Ενημέρωση",
			headerText: "Ενημέρωση Εγγραφής",
			...modifyModal,
		};
	});
};
