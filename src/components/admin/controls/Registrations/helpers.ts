import type { Instruments, Registrations, Teachers } from "@_types/entities";
import { useAPI } from "@lib/hooks/useAPI.solid";
import { type Props as InputProps } from "../../../input/Input.solid";

export const PREFIX = "registrations";

export type APIHook = ReturnType<typeof useAPI>;

export const RegistrationsInputs = (
	student: Registrations,
	teachers: Teachers[],
	instruments: Instruments[]
): Record<keyof Registrations, InputProps> => {
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
			iconClasses: "fa-solid fa-hashtag",
		},
		am: {
			label: "Αριθμός Μητρώου",
			name: "am",
			type: "text",
			iconClasses: "fa-solid fa-id-card",
		},
		amka: {
			label: "ΑΜΚΑ",
			name: "amka",
			type: "text",
			iconClasses: "fa-solid fa-id-card",
		},
		last_name: {
			label: "Επώνυμο",
			name: "last_name",
			type: "text",
			iconClasses: "fa-solid fa-user",
		},
		first_name: {
			label: "Όνομα",
			name: "first_name",
			type: "text",
			iconClasses: "fa-solid fa-user",
		},
		fathers_name: {
			label: "Πατρώνυμο",
			name: "fathers_name",
			type: "text",
			iconClasses: "fa-solid fa-user",
		},
		telephone: {
			label: "Τηλέφωνο",
			name: "telephone",
			type: "text",
			iconClasses: "fa-solid fa-phone",
		},
		cellphone: {
			label: "Κινητό",
			name: "cellphone",
			type: "text",
			iconClasses: "fa-solid fa-mobile-screen",
		},
		email: {
			label: "Email",
			name: "email",
			type: "email",
			iconClasses: "fa-solid fa-envelope",
		},
		birth_date: {
			label: "Ημερομηνία Γέννησης",
			name: "birth_date",
			type: "date",
			iconClasses: "fa-regular fa-calendar-days",
		},
		road: {
			label: "Οδός",
			name: "road",
			type: "text",
			iconClasses: "fa-solid fa-location-dot",
		},
		number: {
			label: "Αριθμός",
			name: "number",
			type: "number",
			iconClasses: "fa-solid fa-hashtag",
		},
		tk: {
			label: "Τ.Κ.",
			name: "tk",
			type: "number",
			iconClasses: "fa-solid fa-hashtag",
		},
		region: {
			label: "Δήμος/Περιοχή",
			name: "region",
			type: "text",
			iconClasses: "fa-solid fa-tree-city",
		},
		registration_year: {
			label: "Σχολικό Έτος",
			name: "registration_year",
			type: "text",
			iconClasses: "fa-solid fa-calendar-days",
			value: "2023-2024",
		},
		class_id: {
			label: "Τύπος Μουσικής",
			name: "class_id",
			type: "select",
			selectList: ["Βυζαντινή Μουσική", "Παραδοσιακή Μουσική", "Ευρωπαϊκή Μουσική"],
			iconClasses: "fa-solid fa-graduation-cap",
		},
		teacher_id: {
			label: "Καθηγητής",
			name: "teacher_id",
			type: "select",
			selectList: sortTeachers.map((t) => t.fullname),
			valueList: sortTeachers.map((t) => t.id),
			iconClasses: "fa-solid fa-user",
		},
		instrument_id: {
			label: "Όργανο",
			name: "instrument_id",
			type: "select",
			selectList: instruments.map((i) => i.name),
			valueList: instruments.map((i) => i.id),
			iconClasses: "fa-solid fa-guitar",
		},
		class_year: {
			label: "Τάξη",
			name: "class_year",
			type: "text",
			iconClasses: "fa-solid fa-graduation-cap",
		},
		date: {
			label: "Ημερομηνία Εγγραφής",
			name: "date",
			type: "date",
			iconClasses: "fa-regular fa-calendar-day",
		},
		payment_amount: {
			label: "Ποσό Πληρωμής",
			name: "payment_amount",
			type: "number",
			iconClasses: "fa-solid fa-money-bill",
		},
		total_payment: {
			label: "Σύνολο Πληρωμής",
			name: "total_payment",
			type: "number",
			iconClasses: "fa-solid fa-money-bill",
		},
		payment_date: {
			label: "Ημερομηνία Πληρωμής",
			name: "payment_date",
			type: "date",
			iconClasses: "fa-regular fa-calendar-days",
		},
		pass: {
			label: "Προάχθει",
			name: "pass",
			type: "multiselect",
			iconClasses: "fa-solid fa-check",
			multiselectOnce: true,
			multiselectList: [
				{ value: 1, label: "Ναί", selected: !!student?.pass },
				{ value: 0, label: "Όχι", selected: !student?.pass },
			],
		},
		registration_url: {
			label: "URL Εγγραφής",
			name: "registration_url",
			type: "hidden",
			iconClasses: "fa-solid fa-link",
		},
	};
};
