import { describe, expect, test } from "bun:test";
import { plainInline, renderInline } from "../../lib/content/inline";
import { REMOVAL_MAILTO } from "../../lib/content/privacy";
import { slugify, teacherSlugs } from "../../lib/utilities/slug";

describe("renderInline", () => {
	test("bold and site links", () => {
		const html = renderInline("Δείτε τις **εγγραφές** [εδώ](/eggrafes/).");
		expect(html).toContain("<strong");
		expect(html).toContain('href="/eggrafes/"');
		expect(html).not.toContain("target=");
	});
	test("external https links open in a new tab", () => {
		expect(renderInline("[Μητρόπολη](https://www.imkifissias.gr/)")).toContain('target="_blank" rel="noopener"');
	});
	test("escapes markup and drops unsafe links", () => {
		const html = renderInline("<img src=x onerror=alert(1)> [x](javascript:alert(1)) [y](http://evil)");
		expect(html).not.toContain("<img");
		expect(html).not.toContain("javascript:");
		expect(html).not.toContain('href="http://');
	});
	test("mailto links stay in the page", () => {
		const html = renderInline("[γράψτε μας](mailto:music@inmm.gr)");
		expect(html).toContain('href="mailto:music@inmm.gr"');
		expect(html).not.toContain("target=");
	});
	test("the photo removal email is one whole link", () => {
		const html = renderInline(`[στείλτε μας email](${REMOVAL_MAILTO}) στο σχολείο`);
		const href = html.match(/href="([^"]+)"/)?.[1].replaceAll("&amp;", "&") ?? "";
		expect(href).toBe(REMOVAL_MAILTO);
		const url = new URL(href);
		expect(url.searchParams.get("subject")).toBe("Αίτημα αφαίρεσης ή θόλωσης φωτογραφίας");
		expect(url.searchParams.get("body")).toContain("(π.χ. γονέας)");
	});
	test("plainInline strips the marks", () => {
		expect(plainInline("Η **Σχολή** στη [Μεταμόρφωση](/epikoinonia/)")).toBe("Η Σχολή στη Μεταμόρφωση");
	});
});

describe("slugify", () => {
	test("Greek names", () => {
		expect(slugify("Σωκράτης Χάρης")).toBe("sokratis-charis");
		expect(slugify("Ιωακείμ Ζουμπούλογλου")).toBe("ioakeim-zoumpouloglou");
		expect(slugify("π. Σωτήριος Αλεβιζάκης")).toBe("p-sotirios-alevizakis");
		expect(slugify("Ι. Ναός Αγίας Μαρίνας Εκάλης")).toBe("i-naos-agias-marinas-ekalis");
	});
	test("duplicate names get the id suffix, the first one keeps the bare slug", () => {
		const slugs = teacherSlugs([
			{ id: 9, fullname: "Γιώργος Χάρης" },
			{ id: 3, fullname: "Γιώργος Χάρης" },
		]);
		expect(slugs.get(3)).toBe("giorgos-charis");
		expect(slugs.get(9)).toBe("giorgos-charis-9");
	});
});
