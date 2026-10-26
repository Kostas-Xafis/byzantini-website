import type { Instruments, JoinedEnrollments, Teachers } from "@_types/entities";
import type { APIClient } from "@hooks/useAPIClient.solid";
import { createComponent } from "solid-js";
import { type Props as InputProps } from "../../../input/Input.solid";
import { EnrollmentPlacementFields } from "./EnrollmentFeeFields.solid";

export const PREFIX = "registrations";

export type APIHook = APIClient;

/**
 * The fields the enrollment editor manages: the enrollment plus the pupil's
 * identity — ΑΜ, επώνυμο, όνομα, πατρώνυμο — mirroring the pupil columns the
 * table shows. The rest of the pupil record (ΑΜΚΑ, phones, email, birth date,
 * address) belongs to the Μαθητολόγιο and is deliberately absent here, as are
 * the joined row's bookkeeping columns (`orphan_code`, `split_from_am`,
 * `needs_review`, `pupil_id`).
 */
export type EnrollmentEditFields = Omit<
	JoinedEnrollments,
	| "orphan_code"
	| "split_from_am"
	| "needs_review"
	| "pupil_id"
	| "amka"
	| "telephone"
	| "cellphone"
	| "email"
	| "birth_date"
	| "road"
	| "number"
	| "tk"
	| "region"
>;

export const RegistrationsInputs = (
	student: JoinedEnrollments,
	teachers: Teachers[],
	instruments: Instruments[],
): Record<keyof EnrollmentEditFields, InputProps> => {
	let sortTeachers = teachers
		.map((t) => t)
		.sort((a, b) => {
			if (a.fullname < b.fullname) return -1;
			if (a.fullname > b.fullname) return 1;
			return 0;
		});
	return {
		id: {
			name: "id",
			label: "Id",
			type: "number",
			icon: "hash",
		},
		am: {
			label: "Αριθμός Μητρώου",
			name: "am",
			type: "text",
			icon: "id-card",
		},
		last_name: {
			label: "Επώνυμο",
			name: "last_name",
			type: "text",
			icon: "user",
		},
		first_name: {
			label: "Όνομα",
			name: "first_name",
			type: "text",
			icon: "user",
		},
		fathers_name: {
			label: "Πατρώνυμο",
			name: "fathers_name",
			type: "text",
			icon: "user",
		},
		registration_year: {
			label: "Σχολικό Έτος",
			name: "registration_year",
			type: "text",
			icon: "calendar",
			value: "2023-2024",
		},
		class_id: {
			label: "Τύπος Μουσικής",
			name: "class_id",
			type: "select",
			selectList: ["Βυζαντινή Μουσική", "Παραδοσιακή Μουσική", "Ευρωπαϊκή Μουσική"],
			// The class-year list of «Κατάταξη & Δίδακτρα» follows this select (EnrollmentFeeFields listens to the form).
			icon: "graduation-cap",
		},
		teacher_id: {
			label: "Καθηγητής",
			name: "teacher_id",
			type: "select",
			selectList: sortTeachers.map((t) => t.fullname),
			valueList: sortTeachers.map((t) => t.id),
			icon: "user",
		},
		instrument_id: {
			label: "Όργανο",
			name: "instrument_id",
			type: "select",
			selectList: instruments.map((i) => i.name),
			valueList: instruments.map((i) => i.id),
			icon: "guitar",
		},
		// «Κατάταξη»: the evaluation checkbox and the class-year select (renders the class_year control).
		evaluation: {
			label: "Κατάταξη",
			name: "evaluation",
			type: "custom",
			render: () =>
				createComponent(EnrollmentPlacementFields, {
					classId: student.class_id,
					classYear: student.class_year,
					evaluation: !!student.evaluation,
				}),
		},
		class_year: { label: "Έτος Φοίτησης", name: "class_year", type: "hidden" },
		date: {
			label: "Ημερομηνία Εγγραφής",
			name: "date",
			type: "date",
			icon: "calendar",
		},
		// Fees and payments live in the «Δίδακτρα μαθητή» dialog (Μαθητολόγιο); the editor resends the stored values.
		payment_amount: { label: "Ποσό Πληρωμής", name: "payment_amount", type: "hidden" },
		total_payment: { label: "Σύνολο Πληρωμής", name: "total_payment", type: "hidden" },
		payment_date: { label: "Ημερομηνία Πληρωμής", name: "payment_date", type: "hidden" },
		pass: {
			label: "Προήχθη",
			name: "pass",
			type: "multiselect",
			icon: "check",
			multiselectOnce: true,
			multiselectList: [
				{ value: 1, label: "Ναι", selected: !!student?.pass },
				{ value: 0, label: "Όχι", selected: !student?.pass },
			],
		},
		// Server bookkeeping / the payment modal's fields.
		fee_manual: { label: "Ειδική τιμή", name: "fee_manual", type: "hidden" },
		fee_catalog_id: { label: "Κατάλογος", name: "fee_catalog_id", type: "hidden" },
		fee_base: { label: "Τιμή τμήματος", name: "fee_base", type: "hidden" },
		evaluation_fee: { label: "Τέλος κατάταξης", name: "evaluation_fee", type: "hidden" },
		registration_url: {
			label: "URL Εγγραφής",
			name: "registration_url",
			type: "hidden",
			icon: "link",
		},
	};
};

/** Stored payment values an enrollment editor resends unchanged (`Pupils.updateEnrollment` needs the full row). */
export const storedPaymentFields = (enrollment: {
	payment_amount: number;
	total_payment: number;
	payment_date?: number | null;
	fee_catalog_id: number | null;
	fee_manual: boolean;
}) => ({
	payment_amount: enrollment.payment_amount ?? 0,
	total_payment: enrollment.total_payment ?? 0,
	payment_date: enrollment.payment_date ?? null,
	// Explicit, so a resent total never flips «Ειδική τιμή»: a catalog price is recalculated, a manual one kept.
	fee_manual: enrollment.fee_catalog_id !== null ? !!enrollment.fee_manual : undefined,
});

/** The ids of an enrollment's pupil-year in the cached listing — a save recalculates all of their fees. */
export const pupilYearIds = (rows: JoinedEnrollments[], enrollment: Pick<JoinedEnrollments, "id" | "pupil_id" | "registration_year">) => {
	const ids = rows.filter((row) => row.pupil_id === enrollment.pupil_id && row.registration_year === enrollment.registration_year).map((row) => row.id);
	return ids.includes(enrollment.id) ? ids : [...ids, enrollment.id];
};
