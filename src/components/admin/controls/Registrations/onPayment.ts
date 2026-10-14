import type { JoinedEnrollments } from "@_types/entities";
import type { CacheMutationsReturnType } from "@hooks/useCacheMutations.solid";
import { API, type APIResponse } from "@routes/index.client";
import { type ExtendedFormData } from "@utilities/forms";
import { createComponent, createMemo } from "solid-js";
import type { Props as InputProps } from "../../../input/Input.solid";
import { toast } from "../../Alert.solid";
import { ActionEnum, ActionIcon, type EmptyAction } from "../../table/TableControlTypes";
import type { Action } from "../../table/TableControls.solid";
import { EnrollmentPaymentFields, readPaymentFields } from "./EnrollmentFeeFields.solid";
import { pupilYearIds, type APIHook } from "./helpers";

/** Inputs of the «Δίδακτρα & Πληρωμή» modal: one composite field. */
export const paymentInputs = (props: Parameters<typeof EnrollmentPaymentFields>[0]): Record<string, InputProps> => ({
	payment: {
		label: "Δίδακτρα & Πληρωμή",
		name: "payment",
		type: "custom",
		render: () => createComponent(EnrollmentPaymentFields, props),
	},
});

/** Success message of a payment save («Εξόφληση» or a plain save). */
export const paymentSavedMessage = (settle: boolean) => (settle ? "Η εγγραφή εξοφλήθηκε" : "Επιτυχής ενημέρωση πληρωμής");

/**
 * «Δίδακτρα & Πληρωμή» of one enrollment: fee breakdown, total («Ειδική τιμή»), payment and «Εξόφληση».
 * Saves through `Pupils.updateEnrollment` with the registration details resent unchanged.
 */
export const onPayment = function (hydrate: CacheMutationsReturnType, store: Partial<APIResponse>, selectedItems: number[], apiHook: APIHook) {
	return createMemo((): Action | EmptyAction => {
		const paymentModal = {
			type: ActionEnum.PAYMENT,
			icon: ActionIcon.PAYMENT,
		};
		const registrations = store[API.Pupils.getEnrollmentsByYear];
		const teachers = store[API.Teachers.getByFullnames];
		if (!registrations || !teachers || selectedItems.length !== 1) return paymentModal;
		const found = registrations.find((r) => r.id === selectedItems[0]);
		if (!found) return paymentModal;
		const registration = JSON.parse(JSON.stringify(found)) as JoinedEnrollments;

		const submit = async function (form: ExtendedFormData<any>) {
			const payment = readPaymentFields(form);
			await apiHook(API.Pupils.updateEnrollment, {
				RequestObject: {
					id: registration.id,
					pupil_id: registration.pupil_id,
					registration_year: registration.registration_year,
					class_id: registration.class_id as 0 | 1 | 2,
					class_year: registration.class_year,
					evaluation: registration.evaluation,
					teacher_id: registration.teacher_id,
					instrument_id: registration.instrument_id,
					date: registration.date,
					pass: registration.pass,
					total_payment: payment.total_payment,
					fee_manual: payment.fee_manual,
					payment_amount: payment.payment_amount,
					payment_date: payment.payment_date,
				},
			});
			// Refresh the row (paid colouring / ✓ cue) and its pupil-year (the fees are recalculated together).
			for (const id of pupilYearIds(registrations, registration)) hydrate({ action: ActionEnum.MODIFY, id, isMultiple: false });
			toast.success(paymentSavedMessage(payment.settle));
		};

		return {
			inputs: paymentInputs({
				enrollment: registration,
				summary: {
					name: `${registration.last_name} ${registration.first_name}`,
					am: registration.am,
					teacher: teachers.find((t) => t.id === registration.teacher_id)?.fullname ?? "",
				},
			}),
			onSubmit: submit,
			submitText: "Αποθήκευση",
			headerText: "Δίδακτρα & Πληρωμή",
			...paymentModal,
		};
	});
};
