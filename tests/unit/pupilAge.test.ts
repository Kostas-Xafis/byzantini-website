import { describe, expect, test } from "bun:test";
import { ageOn, isMinor } from "../../lib/pupils/age";

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime();

describe("ageOn", () => {
	test("counts full years by calendar date", () => {
		expect(ageOn(day(2008, 11, 26), day(2026, 11, 26))).toBe(18);
		expect(ageOn(day(2008, 11, 27), day(2026, 11, 26))).toBe(17);
		expect(ageOn(day(2008, 12, 1), day(2026, 11, 26))).toBe(17);
	});
});

describe("isMinor", () => {
	const today = day(2026, 11, 26);
	test("under 18 is a minor, the 18th birthday is not", () => {
		expect(isMinor(day(2015, 3, 4), today)).toBe(true);
		expect(isMinor(day(2008, 11, 27), today)).toBe(true);
		expect(isMinor(day(2008, 11, 26), today)).toBe(false);
		expect(isMinor(day(1970, 1, 1), today)).toBe(false);
	});
	test("no birth date, or one in the future, asks nothing", () => {
		expect(isMinor(0, today)).toBe(false);
		expect(isMinor(null, today)).toBe(false);
		expect(isMinor(undefined, today)).toBe(false);
		expect(isMinor(day(2030, 1, 1), today)).toBe(false);
	});
});
