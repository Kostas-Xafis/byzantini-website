// Presentation details of the three departments that are not editorial copy:
// hero photo and icon (the copy itself is lib/content/courses.ts).
import type { IconName } from "@lib/icons";
import type { CourseSlug } from "@lib/content/types";

export const COURSE_ORDER: CourseSlug[] = ["vyzantini-mousiki", "paradosiaki-mousiki", "evropaiki-mousiki"];

export const COURSE_LOOK: Record<CourseSlug, { image: string; icon: IconName; short: string }> = {
	"vyzantini-mousiki": { image: "/byz3.jpg", icon: "church", short: "Βυζαντινή Μουσική" },
	"paradosiaki-mousiki": { image: "/par.jpg", icon: "guitar", short: "Παραδοσιακή Μουσική" },
	"evropaiki-mousiki": { image: "/eur.jpg", icon: "music", short: "Ευρωπαϊκή Μουσική" },
};

export const coursePath = (slug: CourseSlug) => `/mathimata/${slug}/`;
export const guidePath = (slug: string) => `/odigoi/${slug}/`;
