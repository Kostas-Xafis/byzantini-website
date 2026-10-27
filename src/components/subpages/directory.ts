// Public teacher / study-centre directory shared by the sub-pages
// (/kathigites/<slug>/, /spoudastiria/<slug>/, /mathimata/<course>/): one set of
// in-process API reads, joined once, with the URL slugs attached.
import type { Instruments, Locations } from "@_types/entities";
import { API, useAPI } from "@hooks/useAPI.server";
import type { APIResponse } from "@routes/index.client";
import type { AstroGlobal } from "astro";
import { THUMB_WIDTHS } from "@lib/bucket/publicFiles";
import { draftPagesEnabled } from "@lib/content/drafts.server";
import { locationPath, locationSlugs, teacherPath, teacherSlugs } from "@utilities/slug";
import { teacherTitleByGender } from "@utilities/text";

export type ClassType = "byz" | "par" | "eur";
export const CLASS_TYPES: ClassType[] = ["byz", "par", "eur"];
export const CLASS_GENITIVE: Record<ClassType, string> = { byz: "Βυζαντινής", par: "Παραδοσιακής", eur: "Ευρωπαϊκής" };
export const CLASS_NAME: Record<ClassType, string> = { byz: "Βυζαντινή Μουσική", par: "Παραδοσιακή Μουσική", eur: "Ευρωπαϊκή Μουσική" };
export const COURSE_PATH: Record<ClassType, string> = {
	byz: "/mathimata/vyzantini-mousiki/",
	par: "/mathimata/paradosiaki-mousiki/",
	eur: "/mathimata/evropaiki-mousiki/",
};

// Where a department pill leads: its course page where those are served (preview only for now,
// lib/content/drafts.server.ts), otherwise that department's tab of the teachers list.
export const departmentHref = (type: ClassType) => (draftPagesEnabled() ? COURSE_PATH[type] : `/kathigites/#${encodeURIComponent(CLASS_NAME[type])}`);

type PublicTeacher = APIResponse["Teachers.getByPriorityClasses"][number];

export interface DirectoryTeacher extends PublicTeacher {
	slug: string;
	href: string;
	classes: ClassType[];
	/** «Καθηγητής Βυζαντινής και Παραδοσιακής Μουσικής» */
	role: string;
	instruments: Instruments[];
	locations: DirectoryLocation[];
}

export interface DirectoryLocation extends Locations {
	slug: string;
	href: string;
	teacherIds: number[];
}

// "Βυζαντινής και Παραδοσιακής Μουσικής"
export const classesPhrase = (classes: ClassType[]) => {
	const names = classes.map((c) => CLASS_GENITIVE[c]);
	if (names.length === 0) return "";
	const joined = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} και ${names.at(-1)}`;
	return `${joined} Μουσικής`;
};

const imgSrc = "/kathigites/picture/";
export const teacherPicture = (picture: string, width = 480) => `${imgSrc}${encodeURIComponent(picture)}?w=${width}`;
export const teacherPictureSrcset = (picture: string) => THUMB_WIDTHS.map((w) => `${teacherPicture(picture, w)} ${w}w`).join(", ");
export const teacherCvHref = (cv: string) => `/kathigites/cv/${encodeURIComponent(cv)}`;
export const locationImage = (image: string) => `/spoudastiria/${encodeURIComponent(image)}`;

// "Σωτήριος Αλεβιζάκης" -> "ΣΑ" (photo fallback)
export const monogram = (fullname: string) => {
	const words = fullname.split(/\s+/).filter((w) => /^\p{L}{2,}/u.test(w));
	if (!words.length) return "Σ";
	return words[0][0] + (words.length > 1 ? words[words.length - 1][0] : "");
};

export const formatAddress = (l: Locations) => `${l.address.trim()}, ${l.areacode > 0 ? `${l.areacode} – ` : ""}${l.municipality.trim()}`;
export const phonesOf = (l: Locations) =>
	l.telephones
		.split(",")
		.map((t) => t.trim())
		.filter(Boolean);
export const hasValidMap = (l: Locations) => l.map?.startsWith("http") && l.map.length > 50;
export const directionsHref = (l: Locations) =>
	`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${l.address.trim()}, ${l.areacode > 0 ? `${l.areacode} ` : ""}${l.municipality.trim()}`)}`;
export const locationBadge = (l: Locations) => (l.priority === 1 ? "Έδρα Σχολής" : l.partner ? "Συνεργαζόμενη Σχολή" : "Σπουδαστήριο Σχολής");

export async function loadDirectory(Astro: AstroGlobal) {
	const [byz, par, eur, teacherLocations, locationsRes, teacherInstruments, instrumentsRes] = await Promise.all([
		useAPI(API.Teachers.getByPriorityClasses, { UrlArgs: { class_type: "byz" } }, Astro),
		useAPI(API.Teachers.getByPriorityClasses, { UrlArgs: { class_type: "par" } }, Astro),
		useAPI(API.Teachers.getByPriorityClasses, { UrlArgs: { class_type: "eur" } }, Astro),
		useAPI(API.Teachers.getLocations, undefined, Astro),
		useAPI(API.Locations.getByPriority, undefined, Astro),
		useAPI(API.Teachers.getInstruments, undefined, Astro),
		useAPI(API.Instruments.get, undefined, Astro),
	]);
	const byType: Record<ClassType, PublicTeacher[]> = { byz: byz.data || [], par: par.data || [], eur: eur.data || [] };
	const instruments = instrumentsRes.data || [];
	const tLocations = teacherLocations.data || [];
	const tInstruments = teacherInstruments.data || [];
	const rawLocations = locationsRes.data || [];

	const locSlugs = locationSlugs(rawLocations);
	const locations: DirectoryLocation[] = rawLocations.map((l) => {
		const slug = locSlugs.get(l.id)!;
		return { ...l, slug, href: locationPath(slug), teacherIds: tLocations.filter((tl) => tl.location_id === l.id).map((tl) => tl.teacher_id) };
	});

	// One entry per teacher (a teacher may appear in more than one department), in priority order.
	const unique = new Map<number, PublicTeacher>();
	for (const type of CLASS_TYPES) for (const t of byType[type]) if (!unique.has(t.id)) unique.set(t.id, t);
	const tSlugs = teacherSlugs([...unique.values()]);
	const teachers: DirectoryTeacher[] = [...unique.values()].map((t) => {
		const classes = CLASS_TYPES.filter((type) => byType[type].some((x) => x.id === t.id));
		const slug = tSlugs.get(t.id)!;
		return {
			...t,
			slug,
			href: teacherPath(slug),
			classes,
			role: `${teacherTitleByGender(t.title, t.gender)} ${classesPhrase(classes)}`,
			instruments: tInstruments
				.filter((ti) => ti.teacher_id === t.id)
				.map((ti) => instruments.find((i) => i.id === ti.instrument_id))
				.filter((i): i is Instruments => !!i)
				.sort((a, b) => a.name.localeCompare(b.name, "el")),
			locations: locations.filter((l) => l.teacherIds.includes(t.id)),
		};
	});
	const byId = new Map(teachers.map((t) => [t.id, t]));
	const ofType = (type: ClassType) => byType[type].map((t) => byId.get(t.id)!).filter(Boolean);

	return { teachers, locations, instruments, ofType, byId };
}
