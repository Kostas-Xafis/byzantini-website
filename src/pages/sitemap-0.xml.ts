import type { APIContext } from "astro";

// Sitemap of the static public pages. The Astro sitemap integration also
// emits dist/sitemap-0.xml, but Cloudflare Pages `_routes.json` includes
// "/*" (all requests hit the worker), so those static files are never served.
// This route guarantees a working sitemap in every environment (dev, Pages
// preview, production). Keep this list in sync with the site's public pages.
export const prerender = false;

const PUBLIC_PAGES = [
	"/",
	"/eggrafes/",
	"/kathigites/",
	"/spoudastiria/",
	"/subscriptions/",
	"/sxoli/anakoinoseis/",
	"/sxoli/dioikitiko-symvoulio/",
	"/sxoli/xorodia/",
] as const;

export async function GET(ctx: APIContext) {
	const origin = (ctx.site ?? new URL(ctx.request.url)).origin;
	const lastmod = new Date().toISOString();
	const urls = PUBLIC_PAGES.map(
		(page) => `  <url><loc>${origin}${page}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`,
	).join("\n");
	const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
	return new Response(xml, {
		headers: {
			"Content-Type": "application/xml; charset=utf-8",
			"Cache-Control": "public, max-age=3600",
		},
	});
}
