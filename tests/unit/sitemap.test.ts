import { describe, expect, test } from "bun:test";
import { CHILD_SITEMAPS, sitemapIndexXml, urlsetXml } from "@utilities/sitemap";

const origin = "https://musicschool-metamorfosi.gr";

describe("sitemap xml", () => {
	test("the index lists every child sitemap and no lastmod", () => {
		const xml = sitemapIndexXml(origin);
		for (const child of CHILD_SITEMAPS) expect(xml).toContain(`<loc>${origin}${child}</loc>`);
		expect(xml).not.toContain("lastmod");
	});

	test("a url gets lastmod only when it has a real date; no changefreq or priority", () => {
		const xml = urlsetXml(origin, [
			{ path: "/kathigites/" },
			{ path: "/sxoli/anakoinoseis/a/", lastmod: Date.UTC(2026, 5, 24) },
			{ path: "/x/", lastmod: NaN },
		]);
		expect(xml).toContain(`<url><loc>${origin}/kathigites/</loc></url>`);
		expect(xml).toContain("<lastmod>2026-06-24T00:00:00.000Z</lastmod>");
		expect(xml.match(/<lastmod>/g)).toHaveLength(1);
		expect(xml).not.toMatch(/changefreq|priority/);
	});

	test("locations are XML-escaped", () => {
		expect(urlsetXml(origin, [{ path: "/a/?x=1&y=<2>" }])).toContain("/a/?x=1&amp;y=&lt;2&gt;");
	});
});
