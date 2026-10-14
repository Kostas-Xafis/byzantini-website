/** Unit tests for the school-year / registration-window helpers in lib/pupils/years.ts (pure, no server). */
import { describe, expect, test } from "bun:test";
import {
	currentSchoolYear,
	currentSchoolYearShort,
	currentSchoolYearStart,
	isRegistrationWindowOpen,
	REGISTRATION_WINDOW_LABEL,
	schoolDateParts,
} from "@lib/pupils/years";

/** A wall-clock time in Greece (EEST, UTC+3, from late March to late October; EET, UTC+2, otherwise). */
const athens = (isoLocal: string, offset: "+02:00" | "+03:00") => new Date(`${isoLocal}${offset}`);

describe("current school year", () => {
	test("30 June is still the running school year", () => {
		const d = athens("2027-06-30T23:59:00", "+03:00");
		expect(currentSchoolYearStart(d)).toBe(2026);
		expect(currentSchoolYear(d)).toBe("2026-2027");
		expect(currentSchoolYearShort(d)).toBe("2026-27");
	});

	test("1 July rolls over to the coming school year", () => {
		const d = athens("2027-07-01T00:00:00", "+03:00");
		expect(currentSchoolYear(d)).toBe("2027-2028");
		expect(currentSchoolYearShort(d)).toBe("2027-28");
	});

	test("the rollover follows Greek time, not UTC", () => {
		// 30 June 22:30 UTC is already 1 July 01:30 in Athens.
		const d = new Date("2027-06-30T22:30:00Z");
		expect(schoolDateParts(d)).toEqual({ year: 2027, month: 7, day: 1 });
		expect(currentSchoolYear(d)).toBe("2027-2028");
	});

	test("September–December belong to the school year that started that September", () => {
		expect(currentSchoolYear(athens("2026-09-01T10:00:00", "+03:00"))).toBe("2026-2027");
		expect(currentSchoolYear(athens("2026-12-31T23:00:00", "+02:00"))).toBe("2026-2027");
	});

	test("January belongs to the school year that started the previous September", () => {
		expect(currentSchoolYear(athens("2027-01-01T00:00:00", "+02:00"))).toBe("2026-2027");
		expect(currentSchoolYearShort(athens("2027-01-15T12:00:00", "+02:00"))).toBe("2026-27");
	});

	test("the short form pads across a century boundary", () => {
		expect(currentSchoolYearShort(athens("2099-09-01T12:00:00", "+03:00"))).toBe("2099-00");
	});
});

describe("registration window", () => {
	test("label", () => {
		expect(REGISTRATION_WINDOW_LABEL).toBe("1/9 έως 30/10");
	});

	test("31 August is before the window, 1 September opens it", () => {
		expect(isRegistrationWindowOpen(athens("2026-08-31T23:59:00", "+03:00"))).toBe(false);
		expect(isRegistrationWindowOpen(athens("2026-09-01T00:00:00", "+03:00"))).toBe(true);
	});

	test("30 October is the last day, 31 October is outside", () => {
		expect(isRegistrationWindowOpen(athens("2026-10-30T23:59:00", "+02:00"))).toBe(true);
		expect(isRegistrationWindowOpen(athens("2026-10-31T00:00:00", "+02:00"))).toBe(false);
	});

	test("January, June and July are outside the window", () => {
		expect(isRegistrationWindowOpen(athens("2027-01-10T12:00:00", "+02:00"))).toBe(false);
		expect(isRegistrationWindowOpen(athens("2027-06-30T12:00:00", "+03:00"))).toBe(false);
		expect(isRegistrationWindowOpen(athens("2027-07-01T12:00:00", "+03:00"))).toBe(false);
	});

	test("the window boundary follows Greek time, not UTC", () => {
		// 31 August 21:30 UTC is 1 September 00:30 in Athens.
		expect(isRegistrationWindowOpen(new Date("2026-08-31T21:30:00Z"))).toBe(true);
	});
});
