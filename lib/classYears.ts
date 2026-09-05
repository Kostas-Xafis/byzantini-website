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
	[MusicType.Byzantine]: ["Υπό Κατάταξη", "Α' Ετος", "Β' Ετος", "Γ' Ετος", "Δ' Ετος", "Ε' Ετος", "Α' Ετος Διπλώματος", "Β' Ετος Διπλώματος"],
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
