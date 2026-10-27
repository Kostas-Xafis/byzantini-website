import { teacherPath, teacherSlugs } from "@utilities/slug";

/**
 * The teachers' CV PDFs (`kathigites/cv/<file>`) are served with a `Link: <page>; rel="canonical"` header that
 * points at the teacher's own page (/kathigites/<slug>/), so search engines credit the page, not the PDF. The
 * page is chosen by the `teachers.cv` file name; the slug is computed over every visible teacher exactly like the
 * page does (`teacherSlugs`), so a `-<id>` suffix on a duplicate name matches.
 */

export const CV_PREFIX = "kathigites/cv/";

export type CvTeacher = { id: number; fullname: string; cv: string | null };

/** The page path (`/kathigites/<slug>/`) of the visible teacher whose CV is bucket key `key`, or null. */
export function cvCanonicalPath(key: string, visibleTeachers: CvTeacher[]): string | null {
	if (!key.startsWith(CV_PREFIX)) return null;
	const file = key.slice(CV_PREFIX.length).normalize("NFC");
	if (!file) return null;
	const owner = visibleTeachers.find((t) => t.cv && t.cv.normalize("NFC") === file);
	if (!owner) return null;
	const slug = teacherSlugs(visibleTeachers).get(owner.id);
	return slug ? teacherPath(slug) : null;
}

/** The `Link` header value for a canonical page path on `origin` (percent-encoding is a no-op for the ASCII slugs). */
export function canonicalLinkHeader(path: string, origin: string): string {
	return `<${new URL(path, origin).href}>; rel="canonical"`;
}
