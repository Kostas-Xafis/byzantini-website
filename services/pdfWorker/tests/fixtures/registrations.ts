import type { PDFRegstration } from "../../src/types";

/**
 * Dummy registrations (no real pupil data) — one per template plus the edge cases of the layout code:
 * a long instrument name, a long teacher name, no teacher, an evaluation row awaiting placement.
 * Dates sit at midday UTC so the printed day/month is the same in any time zone.
 *
 * Changing a fixture changes its PDF: regenerate the golden hashes (`UPDATE_GOLDEN=1 bun run test`).
 */
const baseStudent: PDFRegstration["student"] = {
	id: 1,
	am: "706",
	amka: "01010012345",
	first_name: "Γεώργιος",
	last_name: "Παπαδόπουλος",
	fathers_name: "Νικόλαος",
	birth_date: Date.UTC(2005, 5, 15, 12),
	telephone: "2101234567",
	cellphone: "6912345678",
	email: "test.pupil@example.com",
	road: "Αγίου Νικολάου",
	number: 12,
	tk: 14452,
	region: "Μεταμόρφωση",
	registration_year: "2026-2027",
	class_year: "Α' Ανωτέρα",
	class_id: 0,
	teacher_id: 1,
	instrument_id: 0,
	date: Date.UTC(2026, 8, 14, 12),
	payment_amount: 0,
	total_payment: 0,
	payment_date: 0,
	pass: false,
};

export const TEMPLATES = ["/pdf_templates/byz_template.pdf", "/pdf_templates/par_template.pdf", "/pdf_templates/eur_template.pdf"];

export const registrationCases: Record<string, PDFRegstration> = {
	byzantine: {
		url: TEMPLATES[0],
		student: { ...baseStudent },
		teachersName: "Ιωάννης Δημητρίου",
		instrument: "",
	},
	traditional: {
		url: TEMPLATES[1],
		student: { ...baseStudent, class_id: 1, class_year: "Β' Μέση", first_name: "Μαρία", last_name: "Κωνσταντίνου" },
		teachersName: "Ελένη Γεωργίου",
		instrument: "Λαούτο",
	},
	european: {
		url: TEMPLATES[2],
		student: { ...baseStudent, class_id: 2, class_year: "Προκαταρκτική", first_name: "Νίκος", last_name: "Αλεξίου" },
		teachersName: "Αικατερίνη Παπαναστασίου",
		instrument: "Πιάνο",
	},
	longNames: {
		url: TEMPLATES[1],
		student: { ...baseStudent, class_id: 1, registration_year: "2025-2026" },
		teachersName: "Κωνσταντίνος-Παναγιώτης Χατζηαναστασίου",
		instrument: "Παραδοσιακά κρουστά (νταούλι)",
	},
	noTeacherAwaitingPlacement: {
		url: TEMPLATES[0],
		student: { ...baseStudent, class_year: "Υπό Κατάταξη" },
		teachersName: "",
		instrument: "",
	},
};
