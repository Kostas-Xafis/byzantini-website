// Age checks on a birth date (ms since the epoch, as `pupils.birth_date` stores it). Client-safe.

/** Full years between `birth` and `on`, by calendar date (the birthday itself counts). */
export function ageOn(birth: number, on: number = Date.now()): number {
	const b = new Date(birth);
	const d = new Date(on);
	let age = d.getFullYear() - b.getFullYear();
	if (d.getMonth() < b.getMonth() || (d.getMonth() === b.getMonth() && d.getDate() < b.getDate())) age--;
	return age;
}

/**
 * Under 18 on `on`: the pupil is a minor, so the registration form asks the parent about photos and videos
 * (`pupils.media_consent`). A missing or impossible birth date is not a minor (nothing to ask about).
 */
export function isMinor(birth: number | null | undefined, on: number = Date.now()): boolean {
	if (!birth || !Number.isFinite(birth) || birth > on) return false;
	return ageOn(birth, on) < 18;
}
