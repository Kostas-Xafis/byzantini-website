/**
 * Shared music-type and class-year definitions.
 *
 * Used by both the public registration form and the admin registration
 * editor, so the available class years stay in sync.
 */
export const MusicType = {
	Byzantine: "byz",
	Traditional: "par",
	European: "eur",
	None: "",
} as const;

export type MusicType = (typeof MusicType)[keyof typeof MusicType];

export const MusicTypeArr: MusicType[] = [MusicType.Byzantine, MusicType.Traditional, MusicType.European, MusicType.None];

export const classYearsByMusicType: Record<MusicType, string[]> = {
	[MusicType.None]: [""],
	[MusicType.Byzantine]: ["Υπό Κατάταξη", "Α' Έτος", "Β' Έτος", "Γ' Έτος", "Δ' Έτος", "Ε' Έτος", "Α' Έτος Διπλώματος", "Β' Έτος Διπλώματος"],
	[MusicType.Traditional]: [
		"Υπό Κατάταξη",
		"Α' Προκαταρκτική",
		"Α' Κατωτέρα",
		"Β' Κατωτέρα",
		"Α' Μέση",
		"Β' Μέση",
		"Γ' Μέση",
		"Α' Ανωτέρα",
		"Β' Ανωτέρα",
		"Α' Διπλώματος",
		"Β' Διπλώματος",
	],
	[MusicType.European]: [
		"Υπό Κατάταξη",
		"Α' Προκαταρκτική",
		"Α' Κατωτέρα",
		"Β' Κατωτέρα",
		"Α' Μέση",
		"Β' Μέση",
		"Γ' Μέση",
		"Α' Ανωτέρα",
		"Β' Ανωτέρα",
		"Α' Διπλώματος",
		"Β' Διπλώματος",
	],
};

/**
 * Class years appropriate for a registration's class_id
 * (0 = Byzantine, 1 = Traditional, 2 = European, 3 = None).
 */
export const classYearsForClassId = (classId: number): string[] => {
	return classYearsByMusicType[MusicTypeArr[classId] ?? MusicType.None];
};

/*
 * ---- «Υπό Κατάταξη»: a status, not a class year (docs/FEES.md §1) ----
 *
 * An enrollment awaiting (or placed after) the evaluation exam has `evaluation = 1`; while it awaits
 * placement its `class_year` is ''. The public form still offers the label in its class-year list (the lists
 * above keep it) and the server maps that choice to `evaluation = 1, class_year = ''`.
 */

/** The label shown for an enrollment awaiting placement (and offered by the public form). */
export const EVALUATION_LABEL = "Υπό Κατάταξη";

/** The badge shown next to a placed enrollment that went through the evaluation exam. */
export const EVALUATION_BADGE = "Κατάταξη";

/** Display value of an enrollment's class year: the class year if set, otherwise «Υπό Κατάταξη» for an evaluation row. */
export const classYearLabel = (classYear: string | null | undefined, evaluation?: boolean | number | null): string => {
	if (classYear) return classYear;
	return evaluation ? EVALUATION_LABEL : "";
};

/** Whether a submitted class year is the «Υπό Κατάταξη» choice of the public form. */
export const isEvaluationClassYear = (classYear: string | null | undefined): boolean => classYear === EVALUATION_LABEL;

/** The real class years of a department, WITHOUT «Υπό Κατάταξη» — for the admin selects (evaluation is a checkbox there). */
export const placementClassYearsByMusicType: Record<MusicType, string[]> = Object.fromEntries(
	Object.entries(classYearsByMusicType).map(([type, years]) => [type, years.filter((year) => year !== EVALUATION_LABEL)]),
) as Record<MusicType, string[]>;

/** `placementClassYearsByMusicType` by class_id (0 = Byzantine, 1 = Traditional, 2 = European, 3 = None). */
export const placementClassYearsForClassId = (classId: number): string[] => {
	return placementClassYearsByMusicType[MusicTypeArr[classId] ?? MusicType.None];
};
