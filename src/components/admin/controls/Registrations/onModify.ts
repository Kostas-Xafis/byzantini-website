import type { JoinedEnrollments } from "@_types/entities";
import type { CacheMutationsReturnType } from "@hooks/useCacheMutations.solid";
import { API, type APIResponse } from "@routes/index.client";
import { type ExtendedFormData } from "@utilities/forms";
import { createMemo } from "solid-js";
import { InputFields, type Props as InputProps } from "../../../input/Input.solid";
import { createAlert, pushAlert } from "../../Alert.solid";
import { ActionEnum, ActionIcon, type EmptyAction } from "../../table/TableControlTypes";
import type { Action } from "../../table/TableControls.solid";
import { RegistrationsInputs, type EnrollmentEditFields, type APIHook } from "./helpers";

export const onModify = function (hydrate: CacheMutationsReturnType, store: Partial<APIResponse>, selectedItems: number[], apiHook: APIHook) {
	return createMemo((): Action | EmptyAction => {
		const modifyModal = {
			type: ActionEnum.MODIFY,
			icon: ActionIcon.MODIFY,
		};
		const registrations = store[API.Pupils.getEnrollmentsByYear];
		const teachers = store[API.Teachers.getByFullnames];
		const instruments = store[API.Instruments.get];
		if (!teachers || !registrations || !instruments || selectedItems.length !== 1) return modifyModal;

		const registration = JSON.parse(JSON.stringify(registrations.find((r) => r.id === selectedItems[0]) as any)) as JoinedEnrollments;
		const submit = async function (form: ExtendedFormData<EnrollmentEditFields>) {
			const class_id = form.number("class_id");
			const class_year = form.string("class_year");
			if (class_year === "undefined" || class_year === "") {
				throw new Error("Παρακαλώ επιλέξτε έτος φοίτησης");
			}
			// The editor writes to two tables: the pupil (identity only — ΑΜ,
			// επώνυμο, όνομα, πατρώνυμο) and this enrollment (class, teacher,
			// instrument, payments). The pupil's contact/address fields are not
			// in this modal, so they are omitted here: `Pupils.update` only
			// touches the keys it receives, leaving them as they are.
			await apiHook(API.Pupils.update, {
				RequestObject: {
					id: registration.pupil_id,
					// The form field is a string; the ΑΜ column is an integer
					// (0/empty means "no ΑΜ yet", which the server keeps as NULL).
					am: Number(form.string("am", "")) || null,
					last_name: form.string("last_name"),
					first_name: form.string("first_name"),
					fathers_name: form.string("fathers_name"),
				},
			});
			await apiHook(API.Pupils.updateEnrollment, {
				RequestObject: {
					id: registration.id,
					pupil_id: registration.pupil_id,
					registration_year: form.string("registration_year"),
					class_year,
					class_id: class_id as 0 | 1 | 2,
					teacher_id: form.number("teacher_id", 0),
					instrument_id: (class_id && form.number("instrument_id")) || 0,
					date: form.date("date").getTime(),
					payment_amount: form.number("payment_amount", 0),
					total_payment: form.number("total_payment", 0),
					payment_date: form.date("payment_date")?.getTime() || null,
					pass: form.multiSelect("pass", "boolean", { single: true }),
				},
			});
			hydrate({
				action: ActionEnum.MODIFY,
				id: registration.id,
				isMultiple: false,
			});
			pushAlert(createAlert("success", "Επιτυχής ενημέρωση εγγραφής"));
		};

		const inputs = RegistrationsInputs(registration, teachers, instruments) as Record<keyof EnrollmentEditFields, InputProps>;
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
