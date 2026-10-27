import type { Announcements } from "@_types/entities";
import { executeQuery } from "@lib/utils.server";
import { announcementPath } from "@utilities/announcementUrl";
import { urlsetXml, xmlResponse } from "@utilities/sitemap";
import type { APIContext } from "astro";

// One URL per announcement, generated from the database on request (the announcement's own date is its lastmod).
// If the database is unreachable the answer is a 503 — an empty urlset would tell Google every announcement is gone.
export const prerender = false;

export async function GET(ctx: APIContext) {
	const origin = (ctx.site ?? new URL(ctx.request.url)).origin;
	try {
		const announcements = await executeQuery<Pick<Announcements, "title" | "date">>("SELECT title, date FROM announcements ORDER BY date DESC");
		return xmlResponse(
			urlsetXml(
				origin,
				announcements.map((a) => ({ path: announcementPath(a.title), lastmod: a.date })),
			),
		);
	} catch (error) {
		console.error("sitemap-announcements: db query failed", error);
		return new Response("Service Unavailable", { status: 503, headers: { "Retry-After": "300", "Cache-Control": "no-store" } });
	}
}
