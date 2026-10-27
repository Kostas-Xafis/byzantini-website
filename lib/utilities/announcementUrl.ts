/**
 * The one definition of an announcement's public URL: `/sxoli/anakoinoseis/<title without commas>/`.
 *
 * Commas are dropped (the hosting platform rejects an encoded `%2C` in a path before the app sees it) and the
 * slash is the site-wide trailing-slash policy (lib/utilities/trailingSlash.ts). The list pages, the detail page's
 * canonical/JSON-LD, the redirect from older URLs and the sitemap all build the path here, and
 * `Announcements.getByTitle` matches `REPLACE(title, ',', '')` against `announcementSlug`.
 */
export const ANNOUNCEMENTS_PATH = "/sxoli/anakoinoseis/";

/** The URL segment, decoded: the title without commas. */
export const announcementSlug = (title: string): string => title.replaceAll(",", "");

/** The canonical path of an announcement (percent-encoded, ends with a slash). */
export const announcementPath = (title: string): string => `${ANNOUNCEMENTS_PATH}${encodeURIComponent(announcementSlug(title))}/`;

/** The decoded last segment of a requested announcement path (a malformed escape keeps the raw segment). */
export function requestedAnnouncementSlug(pathname: string): string {
	const segment = pathname.replace(/\/+$/, "").split("/").pop() ?? "";
	try {
		return decodeURIComponent(segment);
	} catch {
		return segment;
	}
}

/** Whether the requested segment is not the announcement's canonical slug (e.g. an old URL that still has the commas). */
export const isLegacyAnnouncementSlug = (requestedSlug: string, title: string): boolean => requestedSlug !== announcementSlug(title);
