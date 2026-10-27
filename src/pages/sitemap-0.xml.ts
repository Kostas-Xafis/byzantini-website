import { COURSE_ORDER, coursePath, guidePath } from "@components/subpages/courseMeta";
import { API, useAPI } from "@hooks/useAPI.server";
import { draftPagesEnabled } from "@lib/content/drafts.server";
import { GUIDES } from "@lib/content/guides";
import { locationPath, locationSlugs, teacherPath, teacherSlugs } from "@utilities/slug";
import { urlsetXml, xmlResponse, type SitemapEntry } from "@utilities/sitemap";
import type { APIContext } from "astro";

// Sitemap of the public pages: the static ones, one page per visible teacher and one per study centre — served as
// a route so it works in dev too (it is the only sitemap mechanism, P7). No `lastmod`: these pages have no real
// modification date. The announcements have their own sitemap (sitemap-announcements.xml.ts).
export const prerender = false;

// Keep this list in sync with the site's public pages.
const PUBLIC_PAGES = [
	"/",
	"/eggrafes/",
	"/kathigites/",
	"/spoudastiria/",
	"/epikoinonia/",
	"/subscriptions/",
	"/sxoli/anakoinoseis/",
	"/sxoli/dioikitiko-symvoulio/",
	"/sxoli/xorodia/",
];

// The department pages and the guides (lib/content); a guide's `updated` is a real review date, so it is its lastmod.
// Listed only where they are served (preview only for now, lib/content/drafts.server.ts).
const COURSE_AND_GUIDE_PAGES: SitemapEntry[] = [
	{ path: "/mathimata/" },
	...COURSE_ORDER.map((slug) => ({ path: coursePath(slug) })),
	{ path: "/odigoi/" },
	...GUIDES.map((g) => ({ path: guidePath(g.slug), lastmod: Date.parse(g.updated) })),
];

export async function GET(ctx: APIContext) {
	const origin = (ctx.site ?? new URL(ctx.request.url)).origin;
	const entries: SitemapEntry[] = [...PUBLIC_PAGES.map((path) => ({ path })), ...(draftPagesEnabled() ? COURSE_AND_GUIDE_PAGES : [])];
	let complete = true;

	// The visible teachers, exactly as the directory pages number their slugs (src/components/subpages/directory.ts):
	// the teachers of the three departments (visible ones only), once each — so the `-<id>` suffix of a repeated name matches.
	try {
		const departments = await Promise.all(
			["byz", "par", "eur"].map((class_type) => useAPI(API.Teachers.getByPriorityClasses, { UrlArgs: { class_type } }, ctx)),
		);
		const unique = new Map<number, { id: number; fullname: string }>();
		for (const department of departments) for (const teacher of department.data || []) if (!unique.has(teacher.id)) unique.set(teacher.id, teacher);
		const slugs = teacherSlugs([...unique.values()]);
		for (const slug of slugs.values()) entries.push({ path: teacherPath(slug) });
	} catch (error) {
		complete = false;
		console.error("sitemap-0: teachers query failed", error);
	}

	// Every study centre the /spoudastiria page lists (all rows of Locations.getByPriority).
	try {
		const locations = (await useAPI(API.Locations.getByPriority, undefined, ctx)).data || [];
		for (const slug of locationSlugs(locations).values()) entries.push({ path: locationPath(slug) });
	} catch (error) {
		complete = false;
		console.error("sitemap-0: locations query failed", error);
	}

	// A partial answer (static pages only) is still useful, but must not be cached for an hour.
	return xmlResponse(urlsetXml(origin, entries), complete ? undefined : "no-store");
}
