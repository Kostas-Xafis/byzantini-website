import type { APIContext } from "astro";

// Sitemap of the static public pages, served as a route so it works in dev too.
// Keep this list in sync with the site's public pages.
// Caveat: the @astrojs/sitemap integration (astro.config.mjs) also emits a
// static dist/client/sitemap-0.xml, and Workers Static Assets are matched
// before the worker, so in a deployed build that static file shadows this
// route. Picking one mechanism is tracked as P7 in docs/IMPROVEMENTS.md.
export const prerender = false;

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
] as const;

export async function GET(ctx: APIContext) {
	const origin = (ctx.site ?? new URL(ctx.request.url)).origin;
	const lastmod = new Date().toISOString();
	const urls = PUBLIC_PAGES.map(
		(page) => `  <url><loc>${origin}${page}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>1</priority></url>`,
	).join("\n");
	const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
	return new Response(xml, {
		headers: {
			"Content-Type": "application/xml; charset=utf-8",
			"Cache-Control": "public, max-age=3600",
		},
	});
}
