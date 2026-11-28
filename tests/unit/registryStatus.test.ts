import { describe, expect, test } from "bun:test";
import { fullSchoolYear, isTransferNote, planStatus, readTransferRemark, type ExcelMarks, type StatusPupil } from "../../scripts/registry/status";

const pupil = (id: number, am: number | null, last_name: string, first_name: string, extra: Partial<StatusPupil> = {}): StatusPupil => ({
	id,
	am,
	last_name,
	first_name,
	amka: "",
	email: `p${id}@mail.gr`,
	review_note: "",
	needs_review: false,
	stopped_year: "",
	transfer_year: "",
	transfer_from: "",
	...extra,
});
const YEAR = "2026-2027";
const NO_MARKS: ExcelMarks = { stopped: [], transfers: [] };

describe("remarks", () => {
	test("a transfer names its school; a certificate counts only when it names a school", () => {
		expect(readTransferRemark("Μετεγγραφή από Σχολή Βυζ. Μουσικής Ιεράς Μητροπόλεως Θηβών")).toEqual({
			from: "Σχολή Βυζ. Μουσικής Ιεράς Μητροπόλεως Θηβών",
			year: null,
		});
		expect(readTransferRemark('ΒΕΒΑΙΩΣΗ "ΔΗΜΟΤΙΚΟ ΩΔΕΊΟ ΑΜΑΡΟΥΣΙΟΥ"')).toEqual({ from: "ΔΗΜΟΤΙΚΟ ΩΔΕΙΟ ΑΜΑΡΟΥΣΙΟΥ", year: null });
		expect(readTransferRemark("Μετεγγραφή\r\n - \r\n- 7 -  ΑΠΟ 2023-24")).toEqual({ from: "", year: "2023-2024" });
		expect(readTransferRemark("Μετεγγραφή\r\n - \r\n- 3 - ")).toEqual({ from: "", year: null });
		expect(readTransferRemark("ΒΕΒΑΙΩΣΗ 3")).toBeNull();
		expect(readTransferRemark("ΠΤΥΧΙΟ ΒΥΖ. ΜΟΥΣΙΚΗΣ Ι.Μ. ΜΕΣΟΓΑΙΑΣ")).toBeNull();
		expect(readTransferRemark("Νέα Εγγραφή\r\n - \r\n- 1 - ")).toBeNull();
	});
	test("school years and the secretariat's notes", () => {
		expect(fullSchoolYear("2023-24")).toBe("2023-2024");
		expect(fullSchoolYear("2023-2025")).toBeNull();
		for (const note of ["Μεταγραφή", "ΜΕΤΑΓΡΑΦΗ", "Μεταγραφή!", "Έκανε μεταγραφή", "Εκανε μεταγραφή"]) expect(isTransferNote(note)).toBe(true);
		expect(isTransferNote("Μεταγραφή από άλλη σχολή, ζητά κατάταξη")).toBe(false);
	});
});

describe("plan", () => {
	test("«Διέκοψε» after the last enrollment year; the register's registration year when there is none; this year's enrollment is left", () => {
		const pupils = [pupil(1, 10, "Άλφα", "Άννα"), pupil(2, 11, "Βήτα", "Βασίλης"), pupil(3, 12, "Γάμμα", "Γιώργος"), pupil(4, 13, "Δέλτα", "Δήμος")];
		const enrollments = [
			{ pupil_id: 1, registration_year: "2016-2017" },
			{ pupil_id: 1, registration_year: "2017-2018" },
			{ pupil_id: 3, registration_year: YEAR },
		];
		const marks: ExcelMarks = {
			stopped: [
				{ am: 10, surname: "Άλφα", name: "Άννα", registeredYear: "2016-2017" },
				{ am: 11, surname: "Βήτα", name: "Βασίλειος", registeredYear: "2015-2016" },
				{ am: 12, surname: "Γάμμα", name: "Γεώργιος", registeredYear: null },
				{ am: 13, surname: "Ωμέγα", name: "Ώλγα", registeredYear: null },
			],
			transfers: [],
		};
		const plan = planStatus({ marks, pupils, enrollments, currentYear: YEAR });
		expect(plan.stopped).toEqual([
			{ pupilId: 2, year: "2015-2016" },
			{ pupilId: 1, year: "2017-2018" },
		]);
		expect(plan.skipped).toHaveLength(2);
	});

	test("a transfer: the earliest sheet year, by ΑΜ or by ΑΜΚΑ; the secretariat's note becomes the field and leaves the review list", () => {
		const pupils = [
			pupil(1, 10, "Άλφα", "Άννα"),
			pupil(2, 11, "Βήτα", "Βασίλης", { amka: "01017600000" }),
			pupil(3, 12, "Γάμμα", "Γιώργος", { review_note: "Μεταγραφή!", needs_review: true }),
			pupil(4, 13, "Δέλτα", "Δήμος", { review_note: "ΔΕΝ ΠΡΟΣΗΛΘΕ · Έκανε μεταγραφή", needs_review: true }),
		];
		const enrollments = [
			{ pupil_id: 1, registration_year: "2019-2020" },
			{ pupil_id: 2, registration_year: "2025-2026" },
			{ pupil_id: 3, registration_year: YEAR },
			{ pupil_id: 4, registration_year: YEAR },
		];
		const marks: ExcelMarks = {
			stopped: [],
			transfers: [
				{ am: 10, surname: "Άλφα", name: "Άννα", sheetYear: "2020-2021", from: "ΩΔΕΙΟ ΠΕΡΙΣΤΕΡΙΟΥ", year: null },
				{ am: 10, surname: "Άλφα", name: "Άννα", sheetYear: "2019-2020", from: "", year: null },
				{ amka: "01017600000", fullName: "ΒΗΤΑ ΒΑΣΙΛΗΣ", sheetYear: "2025-2026", from: "", year: "2023-2024" },
			],
		};
		const plan = planStatus({ marks, pupils, enrollments, currentYear: YEAR });
		expect(plan.transfers).toEqual([
			{ pupilId: 1, year: "2019-2020", from: "ΩΔΕΙΟ ΠΕΡΙΣΤΕΡΙΟΥ", source: "excel" },
			{ pupilId: 2, year: "2025-2026", from: "", source: "excel" },
			{ pupilId: 3, year: YEAR, from: "", source: "note" },
			{ pupilId: 4, year: YEAR, from: "", source: "note" },
		]);
		expect(plan.notes).toEqual([
			{ pupilId: 3, review_note: "", needs_review: false },
			{ pupilId: 4, review_note: "ΔΕΝ ΠΡΟΣΗΛΘΕ", needs_review: true },
		]);
	});

	test("idempotent, and never overwrites a different value", () => {
		const pupils = [pupil(1, 10, "Άλφα", "Άννα", { stopped_year: "2017-2018" }), pupil(2, 11, "Βήτα", "Βασίλης", { stopped_year: "2016-2017" })];
		const enrollments = [
			{ pupil_id: 1, registration_year: "2017-2018" },
			{ pupil_id: 2, registration_year: "2018-2019" },
		];
		const marks: ExcelMarks = {
			...NO_MARKS,
			stopped: [
				{ am: 10, surname: "Άλφα", name: "Άννα", registeredYear: null },
				{ am: 11, surname: "Βήτα", name: "Βασίλης", registeredYear: null },
			],
		};
		const plan = planStatus({ marks, pupils, enrollments, currentYear: YEAR });
		expect(plan.stopped).toEqual([]);
		expect(plan.done).toBe(1);
		expect(plan.skipped).toEqual(["Διέκοψε: ΑΜ 11 Βήτα Βασίλης έχει ήδη «διέκοψε μετά το 2016-2017» (το Excel λέει 2018-2019)"]);
	});
});
