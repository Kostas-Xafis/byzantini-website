import type { APIContext } from "astro";

// Sitemap index pointing at both sitemaps of the site, served as a route.
// Submit this single URL in Google Search Console. In a deployed build the
// static sitemap-index.xml emitted by @astrojs/sitemap shadows this route
// (see sitemap-0.xml.ts and P7 in docs/IMPROVEMENTS.md).
export const prerender = false;

export async function GET(ctx: APIContext) {
	const origin = (ctx.site ?? new URL(ctx.request.url)).origin;
	const lastmod = new Date().toISOString();
	const sitemaps = [
		`  <sitemap><loc>${origin}/sitemap-0.xml</loc><lastmod>${lastmod}</lastmod></sitemap>`,
		`  <sitemap><loc>${origin}/sitemap-announcements.xml</loc><lastmod>${lastmod}</lastmod></sitemap>`,
	].join("\n");
	const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemaps}\n</sitemapindex>`;
	return new Response(xml, {
		headers: {
			"Content-Type": "application/xml; charset=utf-8",
			"Cache-Control": "public, max-age=3600",
		},
	});
}
