import { describe, expect, test } from "bun:test";
import { idleCutoffYear, isIdleTeacher, shortSchoolYear } from "@lib/teachers/activity";

// 27 November 2026, Greek time: the current school year is 2026-2027.
const NOW = new Date("2026-11-27T10:00:00Z");

describe("teacher activity hint", () => {
	test("the last three school years, the current one included, count as recent", () => {
		expect(idleCutoffYear(NOW)).toBe("2024-2025");
		expect(isIdleTeacher("2026-2027", NOW)).toBe(false);
		expect(isIdleTeacher("2024-2025", NOW)).toBe(false);
		expect(isIdleTeacher("2023-2024", NOW)).toBe(true);
	});

	test("a teacher who never had a pupil gets the hint", () => {
		expect(isIdleTeacher(null, NOW)).toBe(true);
		expect(isIdleTeacher(undefined, NOW)).toBe(true);
	});

	test("the window moves with the school year (1 July)", () => {
		expect(idleCutoffYear(new Date("2027-06-30T10:00:00Z"))).toBe("2024-2025");
		expect(idleCutoffYear(new Date("2027-07-01T10:00:00Z"))).toBe("2025-2026");
	});

	test("short year label", () => {
		expect(shortSchoolYear("2021-2022")).toBe("2021-22");
		expect(shortSchoolYear(null)).toBe("-");
	});
});
