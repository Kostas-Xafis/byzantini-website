import type { Announcements } from "@_types/entities";
import { Bucket } from "@lib/bucket";
import { executeQuery } from "@lib/utils.server";
import type { APIContext } from "astro";

// Announcements sitemap — same format as the admin-maintained
// sitemap-announcements.xml, but generated from the database on request so it
// works in every environment (dev, Pages preview, production). Falls back to
// the admin-maintained bucket copy when the database is unreachable, and only
// then to a valid empty urlset (never a 404).
export const prerender = false;

const XML_HEADERS = {
	"Content-Type": "application/xml; charset=utf-8",
	"Cache-Control": "public, max-age=3600",
};

const xmlEscape = (s: string) =>
	s
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");

export async function GET(ctx: APIContext) {
	const origin = (ctx.site ?? new URL(ctx.request.url)).origin;
	let urlsXml = "";
	try {
		const announcements = await executeQuery<Announcements>(
			"SELECT id, title, date FROM announcements ORDER BY date DESC",
		);
		urlsXml = announcements
			.map((announcement) => {
				const loc = xmlEscape(
					`${origin}/sxoli/anakoinoseis/${announcement.title.replaceAll(" ", "%20")}`,
				);
				return `  <url><loc>${loc}</loc><lastmod>${new Date(announcement.date).toISOString()}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>`;
			})
			.join("\n");
	} catch (error) {
		console.error("sitemap-announcements: db query failed", error);
		try {
			// Secondary source: the admin-maintained bucket copy.
			const bucketSitemap = await Bucket.get(ctx, "sitemap-announcements.xml");
			if (bucketSitemap) {
				const body =
					"byteLength" in bucketSitemap
						? bucketSitemap
						: await bucketSitemap.arrayBuffer();
				return new Response(body, { headers: XML_HEADERS });
			}
		} catch (bucketError) {
			console.error("sitemap-announcements: bucket fallback failed", bucketError);
		}
		// Last resort: valid empty urlset, never a 404.
	}
	const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlsXml}\n</urlset>`;
	return new Response(xml, { headers: XML_HEADERS });
}
