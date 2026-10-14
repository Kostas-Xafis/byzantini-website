/**
 * School-year tokens of the enrollment listing (`Pupils.getEnrollmentsByYear`).
 *
 * The `year` URL segment is either the START year of a school year ("2025" →
 * the `registration_year` value "2025-2026") or the literal `ALL_YEARS`
 * ("all"), which means "every school year": the listing then carries no year
 * constraint at all. The admin registrations table's year picker offers both
 * (see `src/components/admin/RegistrationsTable.solid.tsx`).
 *
 * Pure module (no DB, no env) so the client can share the token with the route.
 */

/** Year-picker / URL token for "all the school years" (no year constraint). */
export const ALL_YEARS = "all";

/** The stored `registration_year` value of the school year starting in `startYear` ("2025" → "2025-2026"). */
export const schoolYearOf = (startYear: string | number) => `${startYear}-${Number(startYear) + 1}`;

/*
 * ---- The current school year and the registration window ----
 *
 * One source of truth for every place that shows or submits "the school year we are registering for"
 * (the public form, the landing hero, the closing CTA, the admin enrollment modal) and for the official
 * registration period. Dates are read in Greek time (`SCHOOL_TIME_ZONE`), so a server running in UTC
 * (Cloudflare) and a browser in Greece agree at the day boundaries.
 */

/** The school's time zone: day/month boundaries below are evaluated in it. */
export const SCHOOL_TIME_ZONE = "Europe/Athens";

/**
 * Month (1–12) from which "the current school year" is the one starting this September. Registrations for
 * the coming year begin in summer, so from 1 July the site already registers for the next school year
 * (on 30 June 2027 → "2026-2027", on 1 July 2027 → "2027-2028").
 */
export const SCHOOL_YEAR_ROLLOVER_MONTH = 7;

/** The official registration period (inclusive), as month (1–12) / day. Display-only: the form stays open all year. */
export const REGISTRATION_WINDOW = {
	start: { month: 9, day: 1 },
	end: { month: 10, day: 30 },
} as const;

/** "1/9 έως 30/10" */
export const REGISTRATION_WINDOW_LABEL = `${REGISTRATION_WINDOW.start.day}/${REGISTRATION_WINDOW.start.month} έως ${REGISTRATION_WINDOW.end.day}/${REGISTRATION_WINDOW.end.month}`;

let schoolDateFormat: Intl.DateTimeFormat | undefined;
/** Calendar year / month (1–12) / day of `now` in the school's time zone. */
export function schoolDateParts(now: Date = new Date()): { year: number; month: number; day: number } {
	schoolDateFormat ??= new Intl.DateTimeFormat("en-US", { timeZone: SCHOOL_TIME_ZONE, year: "numeric", month: "numeric", day: "numeric" });
	const parts = schoolDateFormat.formatToParts(now);
	const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
	return { year: part("year"), month: part("month"), day: part("day") };
}

/** Start year of the school year being registered for on `now` (see `SCHOOL_YEAR_ROLLOVER_MONTH`). */
export function currentSchoolYearStart(now: Date = new Date()): number {
	const { year, month } = schoolDateParts(now);
	return month >= SCHOOL_YEAR_ROLLOVER_MONTH ? year : year - 1;
}

/** The stored `registration_year` value of the current school year: "2026-2027". */
export const currentSchoolYear = (now: Date = new Date()) => schoolYearOf(currentSchoolYearStart(now));

/** Short display form of the current school year: "2026-27". */
export function currentSchoolYearShort(now: Date = new Date()): string {
	const start = currentSchoolYearStart(now);
	return `${start}-${String(start + 1).slice(-2)}`;
}

/** Whether `now` falls inside the official registration period (`REGISTRATION_WINDOW`, both ends inclusive). */
export function isRegistrationWindowOpen(now: Date = new Date()): boolean {
	const { month, day } = schoolDateParts(now);
	const key = month * 100 + day;
	const { start, end } = REGISTRATION_WINDOW;
	return key >= start.month * 100 + start.day && key <= end.month * 100 + end.day;
}
