/**
 * Sitemap XML for the dynamic routes `src/pages/sitemap-*.xml.ts` — the only sitemap mechanism (the build-time
 * `@astrojs/sitemap` integration and the R2 read-modify-write file are gone; docs/IMPROVEMENTS.md P7).
 *
 * Every URL is a canonical page URL (trailing slash, lib/utilities/trailingSlash.ts). `lastmod` is written only when
 * the page has a real date (an announcement's date); static pages omit it, since "now" on every request tells Google
 * nothing. `changefreq` / `priority` are ignored by Google and are not written.
 */

export type SitemapEntry = {
	/** Absolute path from the site root, already percent-encoded and slash-terminated. */
	path: string;
	/** A real modification date, or `undefined` to leave `<lastmod>` out. */
	lastmod?: Date | number;
};

export const SITEMAP_NAMESPACE = "http://www.sitemaps.org/schemas/sitemap/0.9";

/** The child sitemaps the index lists (paths on the site). Add a new sitemap route here. */
export const CHILD_SITEMAPS = ["/sitemap-0.xml", "/sitemap-announcements.xml"] as const;

export const xmlEscape = (s: string) =>
	s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");

function lastmodTag(lastmod: SitemapEntry["lastmod"]): string {
	if (lastmod === undefined) return "";
	const date = new Date(lastmod);
	return Number.isNaN(date.getTime()) ? "" : `<lastmod>${date.toISOString()}</lastmod>`;
}

export function urlsetXml(origin: string, entries: SitemapEntry[]): string {
	const urls = entries.map((e) => `  <url><loc>${xmlEscape(origin + e.path)}</loc>${lastmodTag(e.lastmod)}</url>`).join("\n");
	return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="${SITEMAP_NAMESPACE}">\n${urls}\n</urlset>`;
}

export function sitemapIndexXml(origin: string, paths: readonly string[] = CHILD_SITEMAPS): string {
	const sitemaps = paths.map((p) => `  <sitemap><loc>${xmlEscape(origin + p)}</loc></sitemap>`).join("\n");
	return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="${SITEMAP_NAMESPACE}">\n${sitemaps}\n</sitemapindex>`;
}

export const xmlResponse = (xml: string, cacheControl = "public, max-age=3600") =>
	new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": cacheControl } });
