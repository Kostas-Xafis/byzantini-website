import type { APIContext } from "astro";
import { sitemapIndexXml, xmlResponse } from "@utilities/sitemap";

// Sitemap index: submit this single URL in Google Search Console. It lists every child sitemap
// (CHILD_SITEMAPS in lib/utilities/sitemap.ts). The sitemaps are all dynamic routes — there is no build-time
// sitemap file that could shadow them (P7 in docs/IMPROVEMENTS.md).
export const prerender = false;

export function GET(ctx: APIContext) {
	const origin = (ctx.site ?? new URL(ctx.request.url)).origin;
	return xmlResponse(sitemapIndexXml(origin));
}
