import { describe, expect, test } from "bun:test";
import {
	amkaOfYear,
	cleanReviewNote,
	planReconcile,
	strictlySamePerson,
	type DbEnrollment,
	type DbPupil,
	type Decisions,
	type RegisterEntry,
} from "../../scripts/registry/reconcile";

const pupil = (id: number, am: number | null, last_name: string, first_name: string, extra: Partial<DbPupil> = {}): DbPupil => ({
	id,
	am,
	orphan_code: am === null ? `000-Ο${id}` : "",
	split_from_am: null,
	last_name,
	first_name,
	fathers_name: "Γεώργιος",
	born: 2000,
	amka: "",
	email: `p${id}@mail.gr`,
	review_note: am === null ? "χωρίς ΑΜ — νέα εγγραφή, εκκρεμεί απονομή ΑΜ" : "",
	needs_review: am === null,
	...extra,
});
const reg = (am: number, surname: string, name: string, extra: Partial<RegisterEntry> = {}): RegisterEntry => ({
	am,
	surname,
	name,
	father: "Γεώργιος",
	born: 2000,
	...extra,
});
let enrollmentId = 1;
const enr = (pupil_id: number, registration_year: string, date: string): DbEnrollment => ({
	id: enrollmentId++,
	pupil_id,
	registration_year,
	date: Date.parse(date),
});
const NONE: Decisions = { moves: [], replace: [], splits: [], merges: [], freed: [], registerFixes: [] };

describe("review notes", () => {
	test("the ΑΜ-pending parts go, the rest stays (and keeps the flag)", () => {
		expect(cleanReviewNote("χωρίς ΑΜ — νέα εγγραφή, εκκρεμεί απονομή ΑΜ", true)).toEqual({ note: "", needsReview: false });
		expect(cleanReviewNote("ΜΕΤΑΓΡΑΦΗ, χωρίς ΑΜ (νέα εγγραφή) — χρειάζεται ΑΜ", true)).toEqual({ note: "ΜΕΤΑΓΡΑΦΗ", needsReview: true });
		expect(cleanReviewNote("μη έγκυρο ΑΜ 'ΛΑΘΟΣ 1023-1257' — χρειάζεται έλεγχο · Στο Γενικό Μητρώο με ΑΜ 1023", true)).toEqual({
			note: "",
			needsReview: false,
		});
	});
	test("an inferred placement is information, never a reason to flag", () => {
		const note = "χωρίς ΑΜ — νέα εγγραφή, εκκρεμεί απονομή ΑΜ · Κατάταξη 2019-2020 (Ε' Έτος): εκτίμηση από το ιστορικό του Excel";
		expect(cleanReviewNote(note, true)).toEqual({ note: "Κατάταξη 2019-2020 (Ε' Έτος): εκτίμηση από το ιστορικό του Excel", needsReview: false });
	});
	test("an unflagged pupil stays unflagged", () => {
		expect(cleanReviewNote("ΔΕΝ ΠΡΟΣΗΛΘΕ", false)).toEqual({ note: "ΔΕΝ ΠΡΟΣΗΛΘΕ", needsReview: false });
	});
});

describe("matching", () => {
	test("strict: tolerant spelling, but the same father and birth year", () => {
		expect(
			strictlySamePerson(
				pupil(1, null, "Θηταΐτης", "Γιώργος", { fathers_name: "Χρήστος", born: 1989 }),
				reg(1085, "Θηταΐτης", "Γεώργιος", { father: "Χρήστος", born: 1989 }),
			),
		).toBe(true);
		// «Καππάς» and «Λάμδας» are close enough in spelling, not in father and birth year
		expect(
			strictlySamePerson(
				pupil(2, null, "Καππάς", "Χρήστος", { fathers_name: "Γεώργιος", born: 2013 }),
				reg(777, "Λάμδας", "Χρήστος", { father: "Παύλος", born: 1991 }),
			),
		).toBe(false);
	});
	test("an ΑΜΚΑ's birth year", () => {
		expect(amkaOfYear("01017600000", 1976)).toBe(true);
		expect(amkaOfYear("01017600000", 2015)).toBe(false);
	});
});

describe("plan", () => {
	const YEAR = "2026-2027";
	const plan = (register: RegisterEntry[], pupils: DbPupil[], enrollments: DbEnrollment[], decisions: Decisions = NONE) =>
		planReconcile({ register, pupils, enrollments, currentYear: YEAR, isTestPupil: (p) => p.email.endsWith("@example.com"), decisions });

	test("a pupil without ΑΜ found in the register gets that ΑΜ; new pupils get the next ones in enrollment order", () => {
		const register = [reg(1, "Άλφα", "Άννα"), reg(2, "Βήτα", "Βασίλης")];
		const pupils = [
			pupil(10, 1, "Άλφα", "Άννα"),
			pupil(11, null, "Βήτα", "Βασίλειος"),
			pupil(12, null, "Γάμμα", "Γιώργος"),
			pupil(13, null, "Δέλτα", "Δήμος"),
		];
		const enrollments = [enr(11, YEAR, "2026-09-01"), enr(12, YEAR, "2026-10-05"), enr(13, YEAR, "2026-09-20")];
		const result = plan(register, pupils, enrollments);
		expect(result.assignments.map((a) => [a.pupilId, a.to])).toEqual([
			[11, 2],
			[13, 3],
			[12, 4],
		]);
		expect(result.nextAm).toBe(5);
		expect(result.cleanups.map((c) => c.pupilId).sort()).toEqual([11, 12, 13]);
	});

	test("a pupil on someone else's ΑΜ moves to their own, and the freed number goes to its register person", () => {
		const register = [reg(1, "Όμικρον", "Όλγα"), reg(2, "Πι", "Πέτρος")];
		// Όλγα sits on 2 (Πέτρος's in the register); Πέτρος is still without ΑΜ.
		const pupils = [pupil(40, 2, "Όμικρον", "Όλγα"), pupil(41, null, "Πι", "Πέτρος")];
		const result = plan(register, pupils, [enr(41, YEAR, "2026-09-01")]);
		expect(result.assignments.map((a) => [a.pupilId, a.from, a.to])).toEqual([
			[40, 2, 1],
			[41, null, 2],
		]);
	});

	test("test fixtures and pupils without enrollments get no number", () => {
		const result = plan(
			[reg(1, "Άλφα", "Άννα")],
			[pupil(20, null, "Μαθητής", "Δοκιμαστικός", { email: "pupils.test.x@example.com" }), pupil(21, null, "Ζήτα", "Ζωή")],
			[enr(20, YEAR, "2026-09-01")],
		);
		expect(result.assignments).toEqual([]);
		expect(result.skipped).toEqual([{ pupilId: 21, why: "χωρίς καμία εγγραφή" }]);
	});

	test("the principal's decisions: move, replace, split, merge, freed numbers to this year's first new pupils", () => {
		const register = [
			reg(1, "Αλφάκη", "Γεωργία"),
			reg(2, "Βητάκης", "Νικόλαος"),
			reg(3, "Γαμμάκης", "Νικόλαος"),
			reg(4, "Δελτάκη", "Μαρία", { born: 2015 }),
			reg(5, "Εψιλόπουλος", "Κωνσταντίνος"),
			reg(6, "Εψιλόπουλος", "Κων/νος"),
		];
		const pupils = [
			pupil(30, 2, "Αλφάκη", "Γεωργία"),
			pupil(31, null, "Βητάκης", "Νικόλαος", { split_from_am: 2 }),
			pupil(32, 3, "Γαμμάκη", "Ζωή"),
			pupil(33, 9998, "Γαμμάκης", "Νικόλαος"),
			pupil(34, 4, "Δελτάκης", "Γεώργιος", { born: 1976, amka: "01017600000" }),
			pupil(35, 5, "Εψιόπουλος", "Κωνσταντίνος"),
			pupil(36, 6, "Εψιλόπουλος", "Κων/νος"),
			pupil(37, null, "Νέος", "Πρώτος"),
		];
		const enrollments = [
			enr(32, "2025-2026", "2025-09-15"),
			enr(34, "2023-2024", "2023-11-06"),
			enr(34, YEAR, "2026-09-03"),
			enr(36, "2019-2020", "2019-10-25"),
			enr(37, YEAR, "2026-09-01"),
		];
		const decisions: Decisions = {
			moves: [{ from: 2, to: 1, surname: "Αλφάκη", name: "Γεωργία" }],
			replace: [{ am: 3, holder: { surname: "Γαμμάκη", name: "Ζωή" }, by: { am: 9998, surname: "Γαμμάκης", name: "Νικόλαος" } }],
			splits: [{ am: 4, holder: { surname: "Δελτάκης", name: "Γεώργιος" }, keepYears: ["2023-2024"] }],
			merges: [{ from: 6, into: 5, surname: "Εψιλόπουλος", name: "Κωνσταντίνος" }],
			freed: [6],
			registerFixes: [],
		};
		const result = plan(register, pupils, enrollments, decisions);
		expect(result.problems).toEqual([]);
		const to = Object.fromEntries(result.assignments.map((a) => [a.pupilId, a.to]));
		expect(to[30]).toBe(1); // moved to the register's number
		expect(to[31]).toBe(2); // Βητάκης: his register number, free once Αλφάκη moved
		expect(to[33]).toBe(3); // the register's person
		expect(to[32]).toBe(7); // Ζωή: a new number, first in enrollment order (2025)
		expect(to[37]).toBe(6); // freed number: the first new pupil of this year
		expect(result.splits).toEqual([
			{ pupilId: 34, childAm: 4, child: register[3], moveEnrollmentIds: [enrollments[2].id], parentAm: 8, amkaToParent: true },
		]);
		expect(result.merges).toEqual([{ fromId: 36, intoId: 35, surname: "Εψιλόπουλος", name: "Κωνσταντίνος", enrollmentIds: [enrollments[3].id] }]);
	});

	test("a register person missing from the database keeps their number; a number with no register entry is filled", () => {
		const register = [reg(1, "Άλφα", "Άννα"), reg(2, "Βήτα", "Βασίλης"), reg(4, "Δέλτα", "Δήμος")];
		const pupils = [
			pupil(50, 1, "Άλφα", "Άννα"),
			pupil(51, 4, "Δέλτα", "Δήμος"),
			pupil(52, 8888, "Ρο", "Ρένα"),
			pupil(53, null, "Νέα", "Νίκη"),
			pupil(54, null, "Νέος", "Νίκος"),
		];
		const result = plan(register, pupils, [enr(53, YEAR, "2026-09-01"), enr(54, YEAR, "2026-09-02")]);
		expect(result.assignments.map((a) => [a.pupilId, a.to])).toEqual([
			[53, 3],
			[54, 5],
		]);
		expect(result.nextAm).toBe(6);
		expect(result.problems).toEqual([
			"Το ΑΜ 2 του Γενικού Μητρώου (Βήτα Βασίλης) δεν το έχει κανείς μαθητής της βάσης",
			"Το ΑΜ 8888 είναι εκτός της σειράς (το επόμενο ελεύθερο είναι 6): ελέγξτε τον μαθητή",
		]);
	});

	test("a number the principal freed is never a match (a duplicate entry of the same person)", () => {
		const register = [reg(1, "Κάππα", "Κική"), reg(2, "Κάππα", "Κική")];
		const result = plan(
			register,
			[pupil(60, null, "Κάππα", "Κική"), pupil(61, null, "Νέα", "Νίκη")],
			[enr(60, "2020-2021", "2020-09-01"), enr(61, YEAR, "2026-09-01")],
			{
				...NONE,
				freed: [2],
			},
		);
		expect(result.assignments.map((a) => [a.pupilId, a.to])).toEqual([
			[60, 1],
			[61, 2],
		]);
		expect(result.skipped).toEqual([]);
	});

	test("a second run finds the decisions done", () => {
		const register = [reg(1, "Αλφάκη", "Γεωργία")];
		const result = plan(register, [pupil(30, 1, "Αλφάκη", "Γεωργία")], [], {
			...NONE,
			moves: [{ from: 2, to: 1, surname: "Αλφάκη", name: "Γεωργία" }],
		});
		expect(result.assignments).toEqual([]);
		expect(result.done).toEqual(["Αλφάκη Γεωργία: ΑΜ 1"]);
	});
});
