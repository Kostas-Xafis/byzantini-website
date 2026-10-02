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
