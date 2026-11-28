/**
 * «Χωρίς μαθητές 3 έτη»: the hint on the admin teachers page that a current teacher may have left the school.
 * Only a hint — nobody is marked «Πρώην» automatically (a new teacher, or one who teaches without enrollments,
 * would otherwise vanish from the public site). Pure module, shared by the page and its unit test.
 */
import { currentSchoolYearStart, schoolYearOf } from "@lib/pupils/years";

/** How many school years, the current one included, a teacher may go without a pupil before the hint shows. */
export const IDLE_SCHOOL_YEARS = 3;

/** The oldest school year that still counts as recent: on 27/11/2026 → "2024-2025". */
export const idleCutoffYear = (now: Date = new Date()) => schoolYearOf(currentSchoolYearStart(now) - (IDLE_SCHOOL_YEARS - 1));

/** Whether a teacher whose latest pupil was in `lastYear` ("2021-2022", null = never) gets the hint. */
export const isIdleTeacher = (lastYear: string | null | undefined, now: Date = new Date()) => !lastYear || lastYear < idleCutoffYear(now);

/** "2021-2022" → "2021-22"; null → "—". */
export const shortSchoolYear = (year: string | null | undefined) => (year ? year.replace(/^(\d{4})-\d{2}(\d{2})$/, "$1-$2") : "-");
