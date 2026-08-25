import type { APIContext } from "astro";

// Sitemap index pointing at both sitemaps of the site. Served as a real
// route (see sitemap-0.xml.ts for why) so it works in dev, Pages preview and
// production. Submit this single URL in Google Search Console.
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
