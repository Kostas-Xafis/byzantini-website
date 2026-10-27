import { describe, expect, test } from "bun:test";
import { formatDayMonthYear, parseDayMonthYear, parseFormDate, typedDate } from "@utilities/forms";

// The date field (src/components/input/DateInput.solid.tsx) always reads ηη/μμ/εεεε, whatever the browser's language.
describe("date fields", () => {
	test("typing digits fills in the slashes", () => {
		expect(typedDate("1")).toBe("1");
		expect(typedDate("15")).toBe("15/");
		expect(typedDate("15/03")).toBe("15/03/");
		expect(typedDate("15032015")).toBe("15/03/2015");
		expect(typedDate("15/03/20151")).toBe("15/03/2015"); // never more than a date
	});

	test("a day or month closed with a separator is padded", () => {
		expect(typedDate("5/")).toBe("05/");
		expect(typedDate("5/3/")).toBe("05/03/");
		expect(typedDate("5.3.2015")).toBe("05/03/2015");
		expect(typedDate("15/1")).toBe("15/1"); // still being typed (10, 11 or 12)
	});

	test("a day or month that can only be one digit is padded at once", () => {
		expect(typedDate("4")).toBe("04/");
		expect(typedDate("153")).toBe("15/03/");
		expect(typedDate("1532015")).toBe("15/03/2015");
		expect(typedDate("53")).toBe("05/03/");
		expect(typedDate("31")).toBe("31/"); // 3 can still start a day
		expect(typedDate("311")).toBe("31/1"); // and 1 a month
	});

	test("while deleting no slash comes back", () => {
		expect(typedDate("15/03", true)).toBe("15/03");
		expect(typedDate("15", true)).toBe("15");
	});

	test("only real calendar days parse", () => {
		expect(parseDayMonthYear("15/03/2015")?.getTime()).toBe(new Date(2015, 2, 15).getTime());
		expect(parseDayMonthYear("5/3/2015")?.getTime()).toBe(new Date(2015, 2, 5).getTime());
		expect(parseDayMonthYear("29/02/2024")).not.toBeNull();
		for (const bad of ["31/02/2015", "29/02/2023", "15/13/2015", "15/03/201", "", "2015-03-15", "00/03/2015"]) {
			expect(parseDayMonthYear(bad)).toBeNull();
		}
	});

	test("a stored timestamp shows as ηη/μμ/εεεε and reads back as that day", () => {
		for (const stamp of [new Date(1981, 0, 13).getTime(), new Date(2026, 9, 27, 18, 30).getTime()]) {
			const day = new Date(stamp);
			const text = formatDayMonthYear(stamp);
			expect(parseFormDate(text).getTime()).toBe(new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime());
		}
		expect(formatDayMonthYear(new Date(2015, 2, 5).getTime())).toBe("05/03/2015");
		expect(formatDayMonthYear(0)).toBe("");
		expect(formatDayMonthYear(undefined)).toBe("");
	});

	test("ExtendedFormData.date also reads an ISO date", () => {
		expect(parseFormDate("2015-03-15").getTime()).toBe(new Date(2015, 2, 15).getTime());
	});
});
